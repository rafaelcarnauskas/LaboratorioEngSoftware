// Testes de exemplo da Tela_Redefinir_Senha (ResetPassword.jsx) e da limpeza
// do token na URL feita pelo App.jsx (Requisito 16).
//
// O `fetch` é simulado no nível global: a tela passa pelo Orquestrador_Acesso e
// pela Comunicacao_Frontend reais, então os testes também conferem a requisição
// que sai (endpoint público, sem `Authorization`) e a limpeza de `choosen.session`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResetPassword from '../telas/ResetPassword'
import App from '../../app/App'
import { MENSAGEM_ERRO_CONEXAO, MENSAGEM_ERRO_SERVIDOR } from '../orquestrador'
import { MENSAGEM_CONFIRMACAO_DIFERENTE, MENSAGEM_TAMANHO_SENHA } from '../modelo/redefinicao'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const URL_CONFIRMACAO = 'http://localhost:8000/api/v1/auth/redefinicao-senha/confirmacao'
const TOKEN = 'tok-redefinicao-abc123'
const NOVA_SENHA = 'novaSenha123'
const FUTURO = '2999-01-01T00:00:00Z'

const perfil = {
  id: 'u1',
  name: 'Victor Mendes',
  username: 'victor',
  email: 'victor@email.com',
  description: '',
  photo: '',
  isCommunityAdmin: false,
  isSystemAdmin: false,
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
}

function respostaJson(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function respostaErro(status, code, message) {
  return respostaJson(status, { error: { code, message } })
}

// Promise controlada pelo teste, para segurar a resposta do `fetch`.
function adiado() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

let stub = null
let restoreStorage = () => {}
let fetchMock = null

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // URL base padrão (`http://localhost:8000` + `/api/v1`), independente do `.env`.
  vi.stubEnv('VITE_API_URL', '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  restoreStorage()
})

function renderTela(props = {}) {
  const onGoToLogin = vi.fn()
  const onGoToForgot = vi.fn()
  const user = userEvent.setup()
  render(
    <ResetPassword token={TOKEN} onGoToLogin={onGoToLogin} onGoToForgot={onGoToForgot} {...props} />,
  )
  return { user, onGoToLogin, onGoToForgot }
}

async function preencher(user, senha = NOVA_SENHA, confirmacao = senha) {
  if (senha !== '') await user.type(screen.getByLabelText('New password'), senha)
  if (confirmacao !== '') await user.type(screen.getByLabelText('Confirm new password'), confirmacao)
}

describe('formulário (Requisito 16.3)', () => {
  it('mostra os dois campos mascarados com rótulo e o botão redefinir-enviar', () => {
    renderTela()

    const nova = screen.getByLabelText('New password')
    const confirmacao = screen.getByLabelText('Confirm new password')
    expect(nova).toHaveProperty('id', 'reset-password')
    expect(nova).toHaveProperty('type', 'password')
    expect(confirmacao).toHaveProperty('id', 'reset-confirm-password')
    expect(confirmacao).toHaveProperty('type', 'password')

    const enviar = screen.getByTestId('redefinir-enviar')
    expect(enviar).toHaveProperty('type', 'submit')
    expect(enviar).toHaveProperty('disabled', false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('redefinir-cancelar chama onGoToLogin', async () => {
    const { user, onGoToLogin } = renderTela()
    await user.click(screen.getByTestId('redefinir-cancelar'))
    expect(onGoToLogin).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('validação local (Requisito 16.4)', () => {
  it('senha curta: erro abaixo do campo, sem requisição e com os valores mantidos', async () => {
    const { user } = renderTela()
    await preencher(user, 'curta', 'curta')
    await user.click(screen.getByTestId('redefinir-enviar'))

    const nova = screen.getByLabelText('New password')
    const erro = document.getElementById('reset-password-error')
    expect(erro).not.toBeNull()
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toBe(MENSAGEM_TAMANHO_SENHA)
    expect(nova.getAttribute('aria-invalid')).toBe('true')
    expect(nova.value).toBe('curta')
    expect(screen.getByLabelText('Confirm new password').value).toBe('curta')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirmação diferente: erro abaixo da confirmação, sem requisição', async () => {
    const { user } = renderTela()
    await preencher(user, NOVA_SENHA, 'outraSenha123')
    await user.click(screen.getByTestId('redefinir-enviar'))

    const erro = document.getElementById('reset-confirm-password-error')
    expect(erro).not.toBeNull()
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toBe(MENSAGEM_CONFIRMACAO_DIFERENTE)
    expect(document.getElementById('reset-password-error')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sucesso (Requisitos 16.5 e 16.6)', () => {
  it('envia ao endpoint público sem Authorization, mostra redefinir-sucesso e remove choosen.session', async () => {
    stub.seed({
      [SESSION_KEY]: JSON.stringify({ token: 'sessao-antiga', expiresAt: FUTURO, user: perfil }),
    })
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { user, onGoToLogin } = renderTela()

    await preencher(user)
    await user.click(screen.getByTestId('redefinir-enviar'))

    const sucesso = await screen.findByTestId('redefinir-sucesso')
    expect(sucesso.getAttribute('role')).toBe('status')
    // Formulário oculto.
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.queryByTestId('redefinir-enviar')).toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(URL_CONFIRMACAO)
    expect(init.method).toBe('POST')
    expect(init.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, newPassword: NOVA_SENHA })

    // Sessão local removida, sem nova sessão criada.
    expect(stub.raw(SESSION_KEY)).toBeNull()
    expect(stub.snapshot()).toEqual({})

    // A mensagem não mostra o token nem a senha (16.13).
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(document.body.textContent).not.toContain(NOVA_SENHA)

    await user.click(screen.getByTestId('voltar-para-login'))
    expect(onGoToLogin).toHaveBeenCalledTimes(1)
  })
})

describe('link inválido (Requisitos 16.7 e 16.8)', () => {
  it('400 token_invalido: oculta o formulário e oferece ir-para-esqueci-senha', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaErro(400, 'token_invalido', 'Link de redefinição inválido ou expirado.'),
    )
    const { user, onGoToForgot } = renderTela()

    await preencher(user)
    await user.click(screen.getByTestId('redefinir-enviar'))

    expect(await screen.findByTestId('redefinir-token-invalido')).toBeTruthy()
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.queryByTestId('redefinir-sucesso')).toBeNull()

    await user.click(screen.getByTestId('ir-para-esqueci-senha'))
    expect(onGoToForgot).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sem token: só o aviso de link inválido, sem formulário e sem requisição', async () => {
    const { user, onGoToForgot } = renderTela({ token: null })

    expect(screen.getByTestId('redefinir-token-invalido')).toBeTruthy()
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.queryByTestId('redefinir-enviar')).toBeNull()

    await user.click(screen.getByTestId('ir-para-esqueci-senha'))
    expect(onGoToForgot).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('400 senha_invalida: mensagem de tamanho no campo nova senha, formulário mantido', async () => {
    fetchMock.mockResolvedValueOnce(respostaErro(400, 'senha_invalida', 'Senha inválida.'))
    const { user } = renderTela()

    await preencher(user)
    await user.click(screen.getByTestId('redefinir-enviar'))

    await waitFor(() => {
      expect(document.getElementById('reset-password-error')?.textContent).toBe(
        MENSAGEM_TAMANHO_SENHA,
      )
    })
    expect(screen.queryByTestId('redefinir-token-invalido')).toBeNull()
    expect(screen.getByLabelText('New password').value).toBe(NOVA_SENHA)
  })
})

describe('falhas de conexão e de servidor (Requisitos 16.9 e 16.12)', () => {
  it('erro de rede: mensagem de conexão, valores mantidos e botão reabilitado', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { user } = renderTela()

    await preencher(user)
    await user.click(screen.getByTestId('redefinir-enviar'))

    const erro = await screen.findByTestId('redefinir-erro')
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toBe(MENSAGEM_ERRO_CONEXAO)
    expect(screen.getByLabelText('New password').value).toBe(NOVA_SENHA)
    expect(screen.getByLabelText('Confirm new password').value).toBe(NOVA_SENHA)
    expect(screen.getByTestId('redefinir-enviar')).toHaveProperty('disabled', false)
    expect(document.body.textContent).not.toContain(TOKEN)
    expect(document.body.textContent).not.toContain(NOVA_SENHA)
  })

  it('5xx: mensagem genérica do servidor, e um novo envio usa o mesmo token', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaErro(500, 'erro_interno', 'Traceback interno'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { user } = renderTela()

    await preencher(user)
    await user.click(screen.getByTestId('redefinir-enviar'))

    const erro = await screen.findByTestId('redefinir-erro')
    expect(erro.textContent).toBe(MENSAGEM_ERRO_SERVIDOR)
    expect(document.body.textContent).not.toContain('Traceback')
    expect(screen.getByLabelText('New password').value).toBe(NOVA_SENHA)
    const enviar = screen.getByTestId('redefinir-enviar')
    expect(enviar).toHaveProperty('disabled', false)

    // Token mantido em memória: o reenvio funciona sem recarregar a tela.
    await user.click(enviar)
    expect(await screen.findByTestId('redefinir-sucesso')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      token: TOKEN,
      newPassword: NOVA_SENHA,
    })
  })
})

describe('envio em andamento (Requisito 16.11)', () => {
  it('desabilita o botão com aria-busy e não envia uma segunda requisição', async () => {
    const pendente = adiado()
    fetchMock.mockReturnValueOnce(pendente.promise)
    const { user } = renderTela()

    await preencher(user)
    const enviar = screen.getByTestId('redefinir-enviar')
    await user.click(enviar)

    await waitFor(() => expect(enviar).toHaveProperty('disabled', true))
    expect(enviar.getAttribute('aria-busy')).toBe('true')

    // Clique no botão desabilitado e submit direto do formulário: nada novo sai.
    await user.click(enviar)
    fireEvent.submit(enviar.closest('form'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    pendente.resolve(new Response(null, { status: 204 }))
    expect(await screen.findByTestId('redefinir-sucesso')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('App.jsx: token removido da URL (Requisito 16.10)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('abre a redefinição e troca a URL por ?tela=redefinir-senha com replaceState', async () => {
    window.history.replaceState(null, '', `/?tela=redefinir-senha&token=${TOKEN}`)
    const tamanhoHistorico = window.history.length
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const pushSpy = vi.spyOn(window.history, 'pushState')

    render(<App />)

    // Splash de 1500 ms antes da tela.
    expect(
      await screen.findByLabelText('New password', {}, { timeout: 4000 }),
    ).toBeTruthy()

    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/?tela=redefinir-senha')
    for (const [, , url] of replaceSpy.mock.calls) {
      expect(String(url)).not.toContain('token')
    }
    expect(pushSpy).not.toHaveBeenCalled()
    expect(window.history.length).toBe(tamanhoHistorico)
    expect(window.location.search).toBe('?tela=redefinir-senha')
    // Sem sessão salva: nenhuma requisição protegida para abrir a tela.
    expect(fetchMock).not.toHaveBeenCalled()
  }, 10000)
})
