// Testes de exemplo das telas de acesso: Login, SignUp e ForgotPassword.
// O `fetch` é simulado no nível global (`vi.stubGlobal`), então o
// Orquestrador_Acesso, a Comunicacao_Frontend e `session.js` reais rodam. Para
// controlar o estado "enviando", o `fetch` devolve uma Promise que o próprio
// teste resolve (`adiado()`).
// Requisitos: 3.6, 3.7, 3.9, 3.10, 3.11, 4.6, 4.10, 4.11, 5.8, 5.11, 15.1, 15.3, 15.4.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ForgotPassword from '../telas/ForgotPassword'
import Login from '../telas/Login'
import SignUp from '../telas/SignUp'
import { MENSAGEM_ERRO_CONEXAO, MENSAGEM_ERRO_SERVIDOR } from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const API = 'http://localhost:8000/api/v1'
const FUTURO = '2999-01-01T00:00:00Z'

const MSG_CREDENCIAIS = 'Incorrect email or password. Please try again.'
const MSG_OBRIGATORIOS = 'Email and password are required.'
const MSG_EMAIL_EM_USO = 'An account with this email already exists.'
const MSG_CAMPO_INVALIDO =
  'Some of the information is invalid. Please check your details and try again.'
const MSG_PEDIDO_NAO_ENVIADO = "We couldn't send your reset request."

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

function respostaErro(status, code, message = 'Erro.', fields) {
  return respostaJson(status, { error: { code, message, ...(fields ? { fields } : {}) } })
}

function respostaSessao(user = perfil) {
  return respostaJson(200, { token: 'tok-abc', expiresAt: FUTURO, user })
}

// Promise controlada pelo teste: o `fetch` fica pendente até `resolve`.
function adiado() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function falhaDeRede() {
  return Promise.reject(new TypeError('Failed to fetch'))
}

let fetchMock
let storage
let restoreStorage = () => {}

function sessaoSalva() {
  const raw = storage.raw(SESSION_KEY)
  return raw === null ? null : JSON.parse(raw)
}

function chamadas(caminho) {
  return fetchMock.mock.calls.filter(([url]) => String(url).startsWith(`${API}${caminho}`))
}

beforeEach(() => {
  ;({ storage, restore: restoreStorage } = installLocalStorageStub())
  // Sem VITE_API_URL a base é http://localhost:8000 + /api/v1.
  vi.stubEnv('VITE_API_URL', '')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  restoreStorage()
})

// ---------------------------------------------------------------------------
// Tela_Login
// ---------------------------------------------------------------------------

describe('Tela_Login', () => {
  function renderLogin() {
    const props = { onLogin: vi.fn(), onCreateAccount: vi.fn(), onForgotPassword: vi.fn() }
    render(<Login {...props} />)
    return props
  }

  async function preencher(user, email, senha) {
    if (email) await user.type(screen.getByLabelText('Email'), email)
    if (senha) await user.type(screen.getByLabelText('Password'), senha)
  }

  it('mantém ids, data-testids e rótulos associados (15.1)', async () => {
    const user = userEvent.setup()
    const props = renderLogin()

    const email = screen.getByLabelText('Email')
    const senha = screen.getByLabelText('Password')
    expect(email).toHaveProperty('id', 'login-email')
    expect(senha).toHaveProperty('id', 'login-password')
    expect(senha).toHaveProperty('type', 'password')
    expect(screen.getByTestId('login-entrar')).toHaveProperty('type', 'submit')

    await user.click(screen.getByTestId('ir-para-recuperar-senha'))
    await user.click(screen.getByTestId('ir-para-cadastro'))
    expect(props.onForgotPassword).toHaveBeenCalledTimes(1)
    expect(props.onCreateAccount).toHaveBeenCalledTimes(1)
  })

  it('no sucesso grava a sessão e devolve o Perfil_Publico para abrir a Home (3.6)', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(() => Promise.resolve(respostaSessao()))
    const { onLogin } = renderLogin()

    await preencher(user, 'victor@email.com', 'choosen123')
    await user.click(screen.getByTestId('login-entrar'))

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
    expect(onLogin).toHaveBeenCalledWith(perfil)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/auth/login`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'victor@email.com', password: 'choosen123' })
    expect(init.headers).not.toHaveProperty('Authorization')

    expect(sessaoSalva()).toEqual({ token: 'tok-abc', expiresAt: FUTURO, user: perfil })
    expect(screen.queryByTestId('login-erro')).toBeNull()
  })

  it.each([
    ['401', () => respostaErro(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.')],
    [
      '422',
      () =>
        respostaErro(422, 'validacao', 'Dados inválidos.', [
          { field: 'email', message: 'E-mail inválido.' },
        ]),
    ],
  ])(
    'com %s mostra a mensagem genérica, mantém o e-mail e limpa a senha (3.7, 15.3)',
    async (_status, resposta) => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(() => Promise.resolve(resposta()))
      const { onLogin } = renderLogin()

      await preencher(user, 'victor@email.com', 'senha-errada')
      await user.click(screen.getByTestId('login-entrar'))

      const erro = await screen.findByTestId('login-erro')
      expect(erro.textContent).toBe(MSG_CREDENCIAIS)
      expect(erro.getAttribute('role')).toBe('alert')
      expect(screen.getByLabelText('Email')).toHaveProperty('value', 'victor@email.com')
      expect(screen.getByLabelText('Password')).toHaveProperty('value', '')
      expect(onLogin).not.toHaveBeenCalled()
      expect(sessaoSalva()).toBeNull()
      expect(screen.getByTestId('login-entrar')).toHaveProperty('disabled', false)
    },
  )

  it('com campos vazios ou só espaços não faz requisição e marca os campos (3.9, 15.4)', async () => {
    const user = userEvent.setup()
    const { onLogin } = renderLogin()

    await user.click(screen.getByTestId('login-entrar'))

    const erro = screen.getByTestId('login-erro')
    expect(erro.textContent).toBe(MSG_OBRIGATORIOS)
    expect(erro.getAttribute('role')).toBe('alert')

    const email = screen.getByLabelText('Email')
    const senha = screen.getByLabelText('Password')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(senha.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe('login-email-error')
    expect(senha.getAttribute('aria-describedby')).toBe('login-password-error')

    const erroEmail = document.getElementById('login-email-error')
    const erroSenha = document.getElementById('login-password-error')
    expect(erroEmail.textContent).toBe('Email is required.')
    expect(erroEmail.getAttribute('role')).toBe('alert')
    expect(erroSenha.textContent).toBe('Password is required.')
    expect(erroSenha.getAttribute('role')).toBe('alert')

    // Senha só com espaços conta como vazia.
    await preencher(user, 'victor@email.com', '   ')
    await user.click(screen.getByTestId('login-entrar'))
    expect(screen.getByTestId('login-erro').textContent).toBe(MSG_OBRIGATORIOS)
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('com e-mail sem domínio completo mostra o erro do campo sem requisição (15.4)', async () => {
    const user = userEvent.setup()
    renderLogin()

    await preencher(user, 'victor@email', 'choosen123')
    await user.click(screen.getByTestId('login-entrar'))

    expect(document.getElementById('login-email-error').textContent).toBe(
      'Enter a valid email address.',
    )
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByTestId('login-erro')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['erro de rede', () => falhaDeRede(), MENSAGEM_ERRO_CONEXAO],
    ['5xx', () => Promise.resolve(respostaErro(503, 'indisponivel')), MENSAGEM_ERRO_SERVIDOR],
  ])(
    'com %s mostra a mensagem de serviço indisponível e mantém o e-mail (3.10)',
    async (_caso, resposta, mensagem) => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(resposta)
      const { onLogin } = renderLogin()

      await preencher(user, 'victor@email.com', 'choosen123')
      await user.click(screen.getByTestId('login-entrar'))

      const erro = await screen.findByTestId('login-erro')
      expect(erro.textContent).toBe(mensagem)
      expect(erro.textContent).not.toBe(MSG_CREDENCIAIS)
      expect(erro.getAttribute('role')).toBe('alert')
      expect(screen.getByLabelText('Email')).toHaveProperty('value', 'victor@email.com')
      expect(screen.getByLabelText('Password')).toHaveProperty('value', '')
      expect(onLogin).not.toHaveBeenCalled()
      expect(sessaoSalva()).toBeNull()
      expect(screen.getByTestId('login-entrar')).toHaveProperty('disabled', false)
    },
  )

  it('desabilita o botão durante o envio e bloqueia um segundo envio (3.11)', async () => {
    const user = userEvent.setup()
    const pendente = adiado()
    fetchMock.mockImplementation(() => pendente.promise)
    const { onLogin } = renderLogin()

    await preencher(user, 'victor@email.com', 'choosen123')
    await user.click(screen.getByTestId('login-entrar'))

    const botao = screen.getByTestId('login-entrar')
    await waitFor(() => expect(botao).toHaveProperty('disabled', true))
    expect(botao.getAttribute('aria-busy')).toBe('true')

    // Clique no botão desabilitado e submit direto do formulário: nenhum novo envio.
    await user.click(botao)
    fireEvent.submit(botao.closest('form'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    pendente.resolve(respostaSessao())
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
    expect(botao).toHaveProperty('disabled', false)
    expect(botao.getAttribute('aria-busy')).toBe('false')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tela_Cadastro
// ---------------------------------------------------------------------------

describe('Tela_Cadastro', () => {
  function renderSignUp() {
    const props = { onSignUp: vi.fn(), onGoToLogin: vi.fn() }
    render(<SignUp {...props} />)
    return props
  }

  // Responde `GET /auth/email-em-uso` e `POST /auth/cadastro` pela URL.
  function simularBackend({ emUso = false, cadastro }) {
    fetchMock.mockImplementation((url) => {
      if (String(url).startsWith(`${API}/auth/email-em-uso`)) {
        return Promise.resolve(respostaJson(200, { inUse: emUso }))
      }
      if (url === `${API}/auth/cadastro`) return cadastro()
      return Promise.reject(new Error(`URL inesperada: ${url}`))
    })
  }

  async function preencher(user, { name = 'Ana Souza', email = 'ana@email.com', senha = 'segredo123', confirmacao = senha } = {}) {
    if (name) await user.type(screen.getByLabelText('Name'), name)
    if (email) await user.type(screen.getByLabelText('Email'), email)
    if (senha) await user.type(screen.getByLabelText('Password'), senha)
    if (confirmacao) await user.type(screen.getByLabelText('Confirm password'), confirmacao)
  }

  function campos() {
    return {
      name: screen.getByLabelText('Name'),
      email: screen.getByLabelText('Email'),
      password: screen.getByLabelText('Password'),
      confirmPassword: screen.getByLabelText('Confirm password'),
    }
  }

  it('mantém ids, data-testids e rótulos associados (15.1)', async () => {
    const user = userEvent.setup()
    const { onGoToLogin } = renderSignUp()
    const { name, email, password, confirmPassword } = campos()

    expect(name).toHaveProperty('id', 'signup-name')
    expect(email).toHaveProperty('id', 'signup-email')
    expect(password).toHaveProperty('id', 'signup-password')
    expect(confirmPassword).toHaveProperty('id', 'signup-confirm-password')
    expect(password).toHaveProperty('type', 'password')
    expect(confirmPassword).toHaveProperty('type', 'password')
    expect(screen.getByTestId('cadastro-criar')).toHaveProperty('type', 'submit')

    await user.click(screen.getByTestId('ir-para-login'))
    expect(onGoToLogin).toHaveBeenCalledTimes(1)
  })

  it('com campos vazios ou inválidos mostra os textos do mock sem cadastrar (15.4)', async () => {
    const user = userEvent.setup()
    const { onSignUp } = renderSignUp()

    await user.click(screen.getByTestId('cadastro-criar'))

    const esperados = {
      'signup-name': 'Name is required.',
      'signup-email': 'Email is required.',
      'signup-password': 'Password is required.',
      'signup-confirm-password': 'Please confirm your password.',
    }
    for (const [id, texto] of Object.entries(esperados)) {
      const erro = await screen.findByText(texto)
      expect(erro.id).toBe(`${id}-error`)
      expect(erro.getAttribute('role')).toBe('alert')
      expect(document.getElementById(id).getAttribute('aria-invalid')).toBe('true')
    }

    await preencher(user, { email: 'ana@email', senha: 'curta', confirmacao: 'outra' })
    await user.click(screen.getByTestId('cadastro-criar'))

    expect((await screen.findByText('Enter a valid email address.')).id).toBe('signup-email-error')
    expect(screen.getByText('Password must be at least 8 characters.').id).toBe(
      'signup-password-error',
    )
    expect(screen.getByText('Passwords do not match.').id).toBe('signup-confirm-password-error')
    expect(campos().name.getAttribute('aria-invalid')).toBe('false')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSignUp).not.toHaveBeenCalled()
  })

  it('no sucesso grava a sessão e faz o login automático (4.6)', async () => {
    const user = userEvent.setup()
    const criado = { ...perfil, id: 'u2', name: 'Ana Souza', username: 'ana', email: 'ana@email.com' }
    simularBackend({ cadastro: () => Promise.resolve(respostaJson(201, { token: 'tok-abc', expiresAt: FUTURO, user: criado })) })
    const { onSignUp } = renderSignUp()

    await preencher(user)
    await user.click(screen.getByTestId('cadastro-criar'))

    await waitFor(() => expect(onSignUp).toHaveBeenCalledTimes(1))
    expect(onSignUp).toHaveBeenCalledWith(criado)

    const [cadastro] = chamadas('/auth/cadastro')
    expect(cadastro[1].method).toBe('POST')
    // Sem o campo de confirmação de senha.
    expect(JSON.parse(cadastro[1].body)).toEqual({
      name: 'Ana Souza',
      email: 'ana@email.com',
      password: 'segredo123',
    })
    expect(sessaoSalva()).toEqual({ token: 'tok-abc', expiresAt: FUTURO, user: criado })
    expect(screen.queryByTestId('cadastro-erro')).toBeNull()
  })

  it('com e-mail já em uso na validação não envia o cadastro (15.5)', async () => {
    const user = userEvent.setup()
    simularBackend({ emUso: true, cadastro: () => Promise.reject(new Error('não deveria cadastrar')) })
    const { onSignUp } = renderSignUp()

    await preencher(user)
    await user.click(screen.getByTestId('cadastro-criar'))

    const erro = await screen.findByText(MSG_EMAIL_EM_USO)
    expect(erro.id).toBe('signup-email-error')
    expect(campos().email.getAttribute('aria-invalid')).toBe('true')
    expect(chamadas('/auth/email-em-uso')).toHaveLength(1)
    expect(chamadas('/auth/cadastro')).toHaveLength(0)
    expect(onSignUp).not.toHaveBeenCalled()
  })

  it('com 409 mostra o e-mail em uso no campo e em cadastro-erro, preservando nome e e-mail (4.10)', async () => {
    const user = userEvent.setup()
    simularBackend({
      cadastro: () => Promise.resolve(respostaErro(409, 'email_em_uso', 'E-mail já cadastrado.')),
    })
    const { onSignUp } = renderSignUp()

    await preencher(user)
    await user.click(screen.getByTestId('cadastro-criar'))

    const banner = await screen.findByTestId('cadastro-erro')
    expect(banner.textContent).toBe(MSG_EMAIL_EM_USO)
    expect(banner.getAttribute('role')).toBe('alert')
    expect(document.getElementById('signup-email-error').textContent).toBe(MSG_EMAIL_EM_USO)
    expect(campos().email.getAttribute('aria-invalid')).toBe('true')
    expect(campos().name).toHaveProperty('value', 'Ana Souza')
    expect(campos().email).toHaveProperty('value', 'ana@email.com')
    expect(onSignUp).not.toHaveBeenCalled()
    expect(sessaoSalva()).toBeNull()
  })

  it('com 422 mostra a mensagem de campo inválido, preservando nome e e-mail (4.10)', async () => {
    const user = userEvent.setup()
    simularBackend({
      cadastro: () =>
        Promise.resolve(
          respostaErro(422, 'validacao', 'Dados inválidos.', [
            { field: 'name', message: 'Nome muito longo.' },
          ]),
        ),
    })
    const { onSignUp } = renderSignUp()

    await preencher(user)
    await user.click(screen.getByTestId('cadastro-criar'))

    const banner = await screen.findByTestId('cadastro-erro')
    expect(banner.textContent).toBe(MSG_CAMPO_INVALIDO)
    expect(banner.getAttribute('role')).toBe('alert')
    expect(campos().name).toHaveProperty('value', 'Ana Souza')
    expect(campos().email).toHaveProperty('value', 'ana@email.com')
    expect(onSignUp).not.toHaveBeenCalled()
    expect(sessaoSalva()).toBeNull()
    expect(screen.getByTestId('cadastro-criar')).toHaveProperty('disabled', false)
  })

  it('com erro de rede mostra a falha de conexão, limpa as senhas e permite reenviar (4.10, 4.11)', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(falhaDeRede)
    const { onSignUp } = renderSignUp()

    await preencher(user)
    await user.click(screen.getByTestId('cadastro-criar'))

    const banner = await screen.findByTestId('cadastro-erro')
    expect(banner.textContent).toBe(MENSAGEM_ERRO_CONEXAO)
    expect(banner.getAttribute('role')).toBe('alert')
    const { name, email, password, confirmPassword } = campos()
    expect(name).toHaveProperty('value', 'Ana Souza')
    expect(email).toHaveProperty('value', 'ana@email.com')
    expect(password).toHaveProperty('value', '')
    expect(confirmPassword).toHaveProperty('value', '')
    expect(sessaoSalva()).toBeNull()
    expect(onSignUp).not.toHaveBeenCalled()

    // Novo envio possível: a consulta de e-mail falhou (resolve `false`), o cadastro foi tentado.
    expect(chamadas('/auth/cadastro')).toHaveLength(1)
    expect(screen.getByTestId('cadastro-criar')).toHaveProperty('disabled', false)

    const criado = { ...perfil, name: 'Ana Souza', email: 'ana@email.com' }
    simularBackend({ cadastro: () => Promise.resolve(respostaJson(201, { token: 'tok-abc', expiresAt: FUTURO, user: criado })) })
    await user.type(password, 'segredo123')
    await user.type(confirmPassword, 'segredo123')
    await user.click(screen.getByTestId('cadastro-criar'))
    await waitFor(() => expect(onSignUp).toHaveBeenCalledWith(criado))
  })

  it('desabilita o botão durante o envio', async () => {
    const user = userEvent.setup()
    const pendente = adiado()
    simularBackend({ cadastro: () => pendente.promise })
    const { onSignUp } = renderSignUp()

    await preencher(user)
    await user.click(screen.getByTestId('cadastro-criar'))

    const botao = screen.getByTestId('cadastro-criar')
    await waitFor(() => expect(chamadas('/auth/cadastro')).toHaveLength(1))
    expect(botao).toHaveProperty('disabled', true)
    expect(botao.getAttribute('aria-busy')).toBe('true')
    fireEvent.submit(botao.closest('form'))

    pendente.resolve(respostaJson(201, { token: 'tok-abc', expiresAt: FUTURO, user: perfil }))
    await waitFor(() => expect(onSignUp).toHaveBeenCalledTimes(1))
    expect(chamadas('/auth/cadastro')).toHaveLength(1)
    expect(chamadas('/auth/email-em-uso')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Tela_Esqueci_Senha
// ---------------------------------------------------------------------------

describe('Tela_Esqueci_Senha', () => {
  function renderForgot() {
    const props = { onGoToLogin: vi.fn() }
    render(<ForgotPassword {...props} />)
    return props
  }

  it('mantém id, data-testids e rótulo associado (15.1)', async () => {
    const user = userEvent.setup()
    const { onGoToLogin } = renderForgot()

    expect(screen.getByLabelText('Email')).toHaveProperty('id', 'forgot-email')
    expect(screen.getByTestId('recuperar-enviar')).toHaveProperty('type', 'submit')
    await user.click(screen.getByTestId('voltar-para-login'))
    expect(onGoToLogin).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['vazio', '', 'Email is required.'],
    ['inválido', 'ana@email', 'Enter a valid email address.'],
  ])('com e-mail %s mostra o erro do campo sem requisição', async (_caso, valor, mensagem) => {
    const user = userEvent.setup()
    renderForgot()

    const campo = screen.getByLabelText('Email')
    if (valor) await user.type(campo, valor)
    await user.click(screen.getByTestId('recuperar-enviar'))

    const erro = screen.getByText(mensagem)
    expect(erro.id).toBe('forgot-email-error')
    expect(erro.getAttribute('role')).toBe('alert')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(campo.getAttribute('aria-describedby')).toBe('forgot-email-error')
    expect(campo).toHaveProperty('value', valor)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('recuperar-sucesso')).toBeNull()
  })

  it('no 202 oculta o formulário e mostra recuperar-sucesso com o e-mail (5.8)', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(() =>
      Promise.resolve(respostaJson(202, { message: 'Se houver conta, enviaremos instruções.' })),
    )
    renderForgot()

    await user.type(screen.getByLabelText('Email'), '  ana@email.com  ')
    await user.click(screen.getByTestId('recuperar-enviar'))

    const sucesso = await screen.findByTestId('recuperar-sucesso')
    expect(sucesso.getAttribute('role')).toBe('status')
    expect(sucesso.textContent).toContain('ana@email.com')
    expect(sucesso.textContent).not.toContain('  ana@email.com')
    expect(document.getElementById('forgot-email')).toBeNull()
    expect(screen.queryByTestId('recuperar-enviar')).toBeNull()
    expect(screen.getByTestId('voltar-para-login')).toBeTruthy()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/auth/redefinicao-senha`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@email.com' })
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  it.each([
    ['erro de rede', () => falhaDeRede(), MENSAGEM_ERRO_CONEXAO],
    ['5xx', () => Promise.resolve(respostaErro(500, 'erro_interno')), MENSAGEM_ERRO_SERVIDOR],
  ])(
    'com %s mostra a falha no envio, mantém o e-mail e não mostra recuperar-sucesso (5.11)',
    async (_caso, resposta, detalhe) => {
      const user = userEvent.setup()
      fetchMock.mockImplementation(resposta)
      renderForgot()

      await user.type(screen.getByLabelText('Email'), 'ana@email.com')
      await user.click(screen.getByTestId('recuperar-enviar'))

      const alerta = await screen.findByText(`${MSG_PEDIDO_NAO_ENVIADO} ${detalhe}`)
      expect(alerta.getAttribute('role')).toBe('alert')
      expect(screen.queryByTestId('recuperar-sucesso')).toBeNull()
      expect(screen.getByLabelText('Email')).toHaveProperty('value', 'ana@email.com')
      expect(screen.getByTestId('recuperar-enviar')).toHaveProperty('disabled', false)
    },
  )

  it('desabilita o botão durante o envio', async () => {
    const user = userEvent.setup()
    const pendente = adiado()
    fetchMock.mockImplementation(() => pendente.promise)
    renderForgot()

    await user.type(screen.getByLabelText('Email'), 'ana@email.com')
    await user.click(screen.getByTestId('recuperar-enviar'))

    const botao = screen.getByTestId('recuperar-enviar')
    await waitFor(() => expect(botao).toHaveProperty('disabled', true))
    expect(botao.getAttribute('aria-busy')).toBe('true')
    fireEvent.submit(botao.closest('form'))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    pendente.resolve(respostaJson(202, { message: 'ok' }))
    expect(await screen.findByTestId('recuperar-sucesso')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
