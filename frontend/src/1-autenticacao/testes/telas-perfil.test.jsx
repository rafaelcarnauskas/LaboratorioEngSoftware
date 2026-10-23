// Testes de exemplo das telas de conta: Profile (6.1, 6.6, 6.7), EditProfile
// (7.6, 7.7, 7.10) e ChangePassword (8.1, 8.2, 8.3, 8.9, 8.10).
//
// O `fetch` é simulado com `vi.stubGlobal`, então o Orquestrador_Acesso e a
// Comunicacao_Frontend reais rodam por baixo das telas: as requisições levam o
// Token_Sessao semeado em `choosen.session`. A exibição dos dados do perfil
// para qualquer Perfil_Publico fica na Property 30 (12.11); aqui ficam as
// interações.
import { StrictMode, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Profile from '../telas/Profile'
import EditProfile from '../telas/EditProfile'
import ChangePassword from '../telas/ChangePassword'
import { MENSAGEM_ERRO_CONEXAO, MENSAGEM_ERRO_SERVIDOR } from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const API = 'http://localhost:8000/api/v1'
const TOKEN = 'token-de-teste-perfil'

const PERFIL = {
  id: 'u-ana',
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@exemplo.com',
  description: 'Gosto de documentários.',
  photo: '',
  isCommunityAdmin: true,
  isSystemAdmin: true,
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
}

const SESSAO = { token: TOKEN, expiresAt: '2999-01-01T00:00:00Z', user: PERFIL }

function respostaJson(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function respostaErro(status, code, message, fields) {
  return respostaJson(status, { error: { code, message, ...(fields ? { fields } : {}) } })
}

function erroDeRede() {
  return new TypeError('Failed to fetch')
}

// Promise controlada pelo teste, para segurar a resposta pendente.
function adiado() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function chamada(indice) {
  const [url, init = {}] = fetchMock.mock.calls[indice]
  return {
    url,
    method: init.method,
    headers: init.headers ?? {},
    body: init.body === undefined ? undefined : JSON.parse(init.body),
  }
}

// Profile com o roteamento por `path` que o App faz.
function ProfileComRotas({ inicial = '/profile' }) {
  const [path, setPath] = useState(inicial)
  return <Profile path={path} onNavigate={setPath} onSignOut={async () => {}} />
}

const botaoAdminComunidades = () => screen.queryByRole('button', { name: /Administrar comunidades/ })
const botaoAdminSistema = () => screen.queryByRole('button', { name: /Administração do sistema/ })

let fetchMock
let storage
let restoreStorage = () => {}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', '')
  ;({ storage, restore: restoreStorage } = installLocalStorageStub({
    [SESSION_KEY]: JSON.stringify(SESSAO),
  }))
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  restoreStorage()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

describe('Profile', () => {
  it('faz uma requisição GET /usuarios/me autenticada por abertura de /profile', async () => {
    fetchMock.mockImplementation(async () => respostaJson(200, PERFIL))
    const user = userEvent.setup()
    render(
      <StrictMode>
        <ProfileComRotas />
      </StrictMode>,
    )

    expect(await screen.findByText('@ana.souza')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const primeira = chamada(0)
    expect(primeira.url).toBe(`${API}/usuarios/me`)
    expect(primeira.method).toBe('GET')
    expect(primeira.headers.Authorization).toBe(`Bearer ${TOKEN}`)

    // Ir para uma subtela não carrega de novo; voltar a /profile é uma nova abertura.
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }))
    expect(screen.getByRole('heading', { name: 'Alterar senha' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /Voltar ao perfil/ }))
    expect(await screen.findByText('@ana.souza')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(chamada(1).url).toBe(`${API}/usuarios/me`)
  })

  it('mostra o indicador de carregamento sem botões de administração enquanto a resposta não chega', async () => {
    const pendente = adiado()
    fetchMock.mockReturnValueOnce(pendente.promise)
    render(<ProfileComRotas />)

    expect(screen.getByTestId('perfil-carregando')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Carregando perfil')
    expect(botaoAdminComunidades()).toBeNull()
    expect(botaoAdminSistema()).toBeNull()
    expect(screen.queryByText('@ana.souza')).toBeNull()
    expect(screen.getByRole('region', { name: 'Perfil do usuário' }).getAttribute('aria-busy')).toBe('true')

    pendente.resolve(respostaJson(200, PERFIL))

    expect(await screen.findByText('@ana.souza')).toBeTruthy()
    expect(screen.queryByTestId('perfil-carregando')).toBeNull()
    expect(botaoAdminComunidades()).toBeTruthy()
    expect(botaoAdminSistema()).toBeTruthy()
  })

  it('em erro de rede mostra a mensagem, mantém choosen.session e não mostra dados fixos nem botões de administração', async () => {
    fetchMock.mockRejectedValueOnce(erroDeRede())
    const salvaAntes = storage.raw(SESSION_KEY)
    render(<ProfileComRotas />)

    const erro = await screen.findByTestId('perfil-erro')
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toContain('Não foi possível carregar o perfil.')
    expect(erro.textContent).toContain(MENSAGEM_ERRO_CONEXAO)

    expect(storage.raw(SESSION_KEY)).toBe(salvaAntes)
    expect(botaoAdminComunidades()).toBeNull()
    expect(botaoAdminSistema()).toBeNull()
    for (const fixo of ['Victor Mendes', '@victor', 'victor@email.com', 'Compartilhando o que escolho assistir.']) {
      expect(screen.queryByText(fixo)).toBeNull()
    }
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.queryByTestId('perfil-carregando')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// EditProfile
// ---------------------------------------------------------------------------

describe('EditProfile', () => {
  const campo = (id) => document.getElementById(id)

  function renderEditar(onSaved = vi.fn()) {
    const onBack = vi.fn()
    render(<EditProfile profile={PERFIL} onSaved={onSaved} onBack={onBack} />)
    return { onSaved, onBack }
  }

  it('salva os quatro campos, mostra a confirmação e entrega o perfil devolvido a onSaved', async () => {
    const devolvido = {
      ...PERFIL,
      name: 'Ana Lima',
      username: 'ana_lima',
      description: 'Séries e filmes.',
      photo: 'data:image/png;base64,YWJj',
      updatedAt: '2025-02-01T12:00:00Z',
    }
    fetchMock.mockResolvedValueOnce(respostaJson(200, devolvido))
    const user = userEvent.setup()
    const { onSaved } = renderEditar()

    expect(screen.getByLabelText('Nome')).toBe(campo('edit-profile-name'))
    await user.clear(campo('edit-profile-name'))
    await user.type(campo('edit-profile-name'), '  Ana Lima  ')
    await user.clear(campo('edit-profile-username'))
    await user.type(campo('edit-profile-username'), 'ana_lima')
    await user.clear(campo('edit-profile-description'))
    await user.type(campo('edit-profile-description'), 'Séries e filmes.')
    await user.upload(campo('edit-profile-photo'), new File(['abc'], 'foto.png', { type: 'image/png' }))
    await waitFor(() => {
      expect(screen.getByRole('img', { name: /Foto de perfil de/ }).getAttribute('src')).toBe(
        'data:image/png;base64,YWJj',
      )
    })

    await user.click(screen.getByTestId('editar-perfil-enviar'))

    const sucesso = await screen.findByTestId('editar-perfil-sucesso')
    expect(sucesso.textContent).toBe('Perfil atualizado com sucesso.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const patch = chamada(0)
    expect(patch.url).toBe(`${API}/usuarios/me`)
    expect(patch.method).toBe('PATCH')
    expect(patch.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(patch.body).toEqual({
      name: 'Ana Lima',
      username: 'ana_lima',
      description: 'Séries e filmes.',
      photo: 'data:image/png;base64,YWJj',
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(devolvido)
    expect(campo('edit-profile-name').value).toBe('Ana Lima')
    expect(screen.queryByTestId('editar-perfil-erro')).toBeNull()
  })

  it('envia também os campos não alterados', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson(200, { ...PERFIL, name: 'Ana S.' }))
    const user = userEvent.setup()
    renderEditar()

    await user.clear(campo('edit-profile-name'))
    await user.type(campo('edit-profile-name'), 'Ana S.')
    await user.click(screen.getByTestId('editar-perfil-enviar'))

    await screen.findByTestId('editar-perfil-sucesso')
    expect(chamada(0).body).toEqual({
      name: 'Ana S.',
      username: PERFIL.username,
      description: PERFIL.description,
      photo: PERFIL.photo,
    })
  })

  it('a Tela_Perfil passa a exibir o perfil salvo sem recarregar a página', async () => {
    const devolvido = { ...PERFIL, name: 'Ana Lima', username: 'ana_lima', description: 'Novo texto.' }
    fetchMock
      .mockResolvedValueOnce(respostaJson(200, PERFIL))
      .mockResolvedValueOnce(respostaJson(200, devolvido))
      .mockResolvedValueOnce(respostaJson(200, devolvido))
    const user = userEvent.setup()
    render(<ProfileComRotas />)

    await screen.findByText('@ana.souza')
    await user.click(screen.getByRole('button', { name: 'Editar perfil' }))

    // O formulário abre com o perfil já carregado, sem outra requisição.
    expect(campo('edit-profile-name').value).toBe('Ana Souza')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.clear(campo('edit-profile-name'))
    await user.type(campo('edit-profile-name'), 'Ana Lima')
    await user.clear(campo('edit-profile-username'))
    await user.type(campo('edit-profile-username'), 'ana_lima')
    await user.clear(campo('edit-profile-description'))
    await user.type(campo('edit-profile-description'), 'Novo texto.')
    await user.click(screen.getByTestId('editar-perfil-enviar'))
    await screen.findByTestId('editar-perfil-sucesso')

    // A saudação da Home lê o Perfil_Publico da sessão salva.
    expect(JSON.parse(storage.raw(SESSION_KEY)).user.name).toBe('Ana Lima')

    await user.click(screen.getByRole('button', { name: /Voltar ao perfil/ }))
    expect(await screen.findByText('@ana_lima')).toBeTruthy()
    expect(screen.getByText('Ana Lima')).toBeTruthy()
    expect(screen.getByText('Novo texto.')).toBeTruthy()
    expect(screen.queryByText('@ana.souza')).toBeNull()
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'PATCH', 'GET'])
  })

  it('409 username_em_uso mostra a mensagem no campo e mantém os valores digitados', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaErro(409, 'username_em_uso', 'Este nome de usuário já está em uso.'),
    )
    const user = userEvent.setup()
    const { onSaved } = renderEditar()

    await user.clear(campo('edit-profile-name'))
    await user.type(campo('edit-profile-name'), 'Ana Lima')
    await user.clear(campo('edit-profile-username'))
    await user.type(campo('edit-profile-username'), 'outro.usuario')
    await user.click(screen.getByTestId('editar-perfil-enviar'))

    const erroCampo = await waitFor(() => {
      const elemento = campo('edit-profile-username-error')
      expect(elemento).toBeTruthy()
      return elemento
    })
    expect(erroCampo.textContent).toBe('Este nome de usuário já está em uso.')
    expect(campo('edit-profile-username').getAttribute('aria-invalid')).toBe('true')
    expect(campo('edit-profile-username').value).toBe('outro.usuario')
    expect(campo('edit-profile-name').value).toBe('Ana Lima')
    expect(screen.queryByTestId('editar-perfil-sucesso')).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('422 mostra a mensagem do Backend em cada campo e mantém os valores digitados', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaErro(422, 'validacao', 'Dados inválidos.', [
        { field: 'name', message: 'Nome recusado pelo servidor.' },
        { field: 'description', message: 'Descrição recusada pelo servidor.' },
      ]),
    )
    const user = userEvent.setup()
    const { onSaved } = renderEditar()

    await user.clear(campo('edit-profile-description'))
    await user.type(campo('edit-profile-description'), 'Outra descrição')
    await user.click(screen.getByTestId('editar-perfil-enviar'))

    await waitFor(() => expect(campo('edit-profile-name-error')).toBeTruthy())
    expect(campo('edit-profile-name-error').textContent).toBe('Nome recusado pelo servidor.')
    expect(campo('edit-profile-description-error').textContent).toBe('Descrição recusada pelo servidor.')
    expect(campo('edit-profile-name').getAttribute('aria-invalid')).toBe('true')
    expect(campo('edit-profile-description').getAttribute('aria-invalid')).toBe('true')
    expect(campo('edit-profile-username').getAttribute('aria-invalid')).toBe('false')
    expect(campo('edit-profile-description').value).toBe('Outra descrição')
    expect(campo('edit-profile-name').value).toBe('Ana Souza')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it.each([
    ['erro de rede', () => fetchMock.mockRejectedValueOnce(erroDeRede()), MENSAGEM_ERRO_CONEXAO],
    [
      'erro 500',
      () => fetchMock.mockResolvedValueOnce(respostaErro(500, 'erro_interno', 'Traceback interno')),
      MENSAGEM_ERRO_SERVIDOR,
    ],
  ])('%s mostra a mensagem de falha e mantém os valores digitados', async (_nome, simular, mensagem) => {
    simular()
    const user = userEvent.setup()
    const { onSaved } = renderEditar()

    await user.clear(campo('edit-profile-name'))
    await user.type(campo('edit-profile-name'), 'Ana Lima')
    await user.clear(campo('edit-profile-username'))
    await user.type(campo('edit-profile-username'), 'ana_lima')
    await user.click(screen.getByTestId('editar-perfil-enviar'))

    const erro = await screen.findByTestId('editar-perfil-erro')
    expect(erro.id).toBe('edit-profile-error')
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toBe(mensagem)
    expect(campo('edit-profile-name').value).toBe('Ana Lima')
    expect(campo('edit-profile-username').value).toBe('ana_lima')
    expect(campo('edit-profile-description').value).toBe(PERFIL.description)
    expect(screen.queryByTestId('editar-perfil-sucesso')).toBeNull()
    expect(screen.getByTestId('editar-perfil-enviar').disabled).toBe(false)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('mantém Salvar desabilitado enquanto a requisição está pendente e envia no máximo uma', async () => {
    const pendente = adiado()
    fetchMock.mockReturnValueOnce(pendente.promise)
    const user = userEvent.setup()
    renderEditar()

    const salvar = screen.getByTestId('editar-perfil-enviar')
    await user.click(salvar)

    expect(salvar.disabled).toBe(true)
    expect(salvar.getAttribute('aria-busy')).toBe('true')
    await user.click(salvar)
    await user.type(campo('edit-profile-name'), '{Enter}')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    pendente.resolve(respostaJson(200, PERFIL))

    await screen.findByTestId('editar-perfil-sucesso')
    expect(salvar.disabled).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('validação local recusa nome vazio e username inválido sem requisição', async () => {
    const user = userEvent.setup()
    renderEditar()

    await user.clear(campo('edit-profile-name'))
    await user.click(screen.getByTestId('editar-perfil-enviar'))
    expect(screen.getByTestId('editar-perfil-erro').textContent).toBe('Preencha o nome e o nome de usuário.')
    expect(campo('edit-profile-name').getAttribute('aria-invalid')).toBe('true')

    await user.type(campo('edit-profile-name'), 'Ana')
    await user.clear(campo('edit-profile-username'))
    await user.type(campo('edit-profile-username'), 'ana souza')
    await user.click(screen.getByTestId('editar-perfil-enviar'))
    expect(campo('edit-profile-username-error').textContent).toBe(
      'Use de 1 a 30 caracteres: letras, números, ponto (.) ou sublinhado (_).',
    )
    expect(campo('edit-profile-username').value).toBe('ana souza')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ChangePassword
// ---------------------------------------------------------------------------

describe('ChangePassword', () => {
  const atual = () => document.getElementById('change-current-password')
  const nova = () => document.getElementById('change-new-password')
  const confirmacao = () => document.getElementById('change-confirm-password')
  const enviar = () => screen.getByTestId('alterar-senha-enviar')

  function renderSenha() {
    const onBack = vi.fn()
    render(<ChangePassword onBack={onBack} />)
    return { onBack }
  }

  async function preencher(user, { senhaAtual = 'senhaAntiga1', novaSenha = 'novaSenha123', conf = novaSenha } = {}) {
    if (senhaAtual) await user.type(atual(), senhaAtual)
    if (novaSenha) await user.type(nova(), novaSenha)
    if (conf) await user.type(confirmacao(), conf)
  }

  it('exibe os três campos mascarados com rótulo', () => {
    renderSenha()

    expect(screen.getByLabelText('Senha atual')).toBe(atual())
    expect(screen.getByLabelText('Nova senha')).toBe(nova())
    expect(screen.getByLabelText('Confirmar nova senha')).toBe(confirmacao())
    for (const input of [atual(), nova(), confirmacao()]) {
      expect(input.getAttribute('type')).toBe('password')
    }
  })

  it('nova senha com menos de 8 caracteres mostra a mensagem sem requisição', async () => {
    const user = userEvent.setup()
    renderSenha()

    await preencher(user, { novaSenha: 'curta12' })
    await user.click(enviar())

    expect(document.getElementById('change-new-password-error').textContent).toBe(
      'A nova senha deve ter pelo menos 8 caracteres.',
    )
    expect(nova().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirmação diferente (só na caixa) mostra a mensagem sem requisição', async () => {
    const user = userEvent.setup()
    renderSenha()

    await preencher(user, { novaSenha: 'novaSenha123', conf: 'NovaSenha123' })
    await user.click(enviar())

    expect(document.getElementById('change-confirm-password-error').textContent).toBe(
      'A confirmação da senha não confere.',
    )
    expect(confirmacao().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('senha atual vazia mostra a mensagem sem requisição', async () => {
    const user = userEvent.setup()
    renderSenha()

    await preencher(user, { senhaAtual: '' })
    await user.click(enviar())

    expect(document.getElementById('change-current-password-error').textContent).toBe('Informe a senha atual.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('204 mostra a mensagem de sucesso, limpa os três campos e mantém a sessão', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const salvaAntes = storage.raw(SESSION_KEY)
    const user = userEvent.setup()
    const { onBack } = renderSenha()

    await preencher(user)
    await user.click(enviar())

    const sucesso = await screen.findByTestId('alterar-senha-sucesso')
    expect(sucesso.textContent).toBe('Senha alterada com sucesso.')
    expect(atual().value).toBe('')
    expect(nova().value).toBe('')
    expect(confirmacao().value).toBe('')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const put = chamada(0)
    expect(put.url).toBe(`${API}/usuarios/me/senha`)
    expect(put.method).toBe('PUT')
    expect(put.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(put.body).toEqual({ currentPassword: 'senhaAntiga1', newPassword: 'novaSenha123' })
    expect(storage.raw(SESSION_KEY)).toBe(salvaAntes)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('400 senha_atual_incorreta mostra a mensagem recebida no campo, limpa a senha atual e mantém a sessão', async () => {
    fetchMock.mockResolvedValueOnce(respostaErro(400, 'senha_atual_incorreta', 'Senha atual incorreta.'))
    const salvaAntes = storage.raw(SESSION_KEY)
    const user = userEvent.setup()
    const { onBack } = renderSenha()

    await preencher(user)
    await user.click(enviar())

    await waitFor(() => expect(document.getElementById('change-current-password-error')).toBeTruthy())
    expect(document.getElementById('change-current-password-error').textContent).toBe('Senha atual incorreta.')
    expect(atual().getAttribute('aria-invalid')).toBe('true')
    expect(atual().value).toBe('')
    expect(nova().value).toBe('novaSenha123')
    expect(screen.queryByTestId('alterar-senha-sucesso')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Alterar senha' })).toBeTruthy()
    expect(storage.raw(SESSION_KEY)).toBe(salvaAntes)
    expect(onBack).not.toHaveBeenCalled()
    expect(enviar().disabled).toBe(false)
  })

  it('422 mostra a mensagem recebida no campo nova senha e mantém a sessão', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaErro(422, 'validacao', 'Dados inválidos.', [
        { field: 'newPassword', message: 'Nova senha recusada pelo servidor.' },
      ]),
    )
    const salvaAntes = storage.raw(SESSION_KEY)
    const user = userEvent.setup()
    const { onBack } = renderSenha()

    await preencher(user)
    await user.click(enviar())

    await waitFor(() => expect(document.getElementById('change-new-password-error')).toBeTruthy())
    expect(document.getElementById('change-new-password-error').textContent).toBe(
      'Nova senha recusada pelo servidor.',
    )
    expect(nova().getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByTestId('alterar-senha-sucesso')).toBeNull()
    expect(storage.raw(SESSION_KEY)).toBe(salvaAntes)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('erro de rede mostra a mensagem de conexão e limpa os três campos', async () => {
    fetchMock.mockRejectedValueOnce(erroDeRede())
    const user = userEvent.setup()
    renderSenha()

    await preencher(user)
    await user.click(enviar())

    const erro = await screen.findByTestId('alterar-senha-erro')
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toBe(MENSAGEM_ERRO_CONEXAO)
    expect(atual().value).toBe('')
    expect(nova().value).toBe('')
    expect(confirmacao().value).toBe('')
    expect(screen.queryByTestId('alterar-senha-sucesso')).toBeNull()
  })
})
