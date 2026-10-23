// Testes de exemplo do App.jsx: confirmação da sessão salva no carregamento
// (10.5–10.8), aviso global de sessão inválida (10.4, 12.11), Sair (9.1, 9.6) e
// a entrada pela Tela_Login/Tela_Cadastro. A precedência do link de redefinição
// e a limpeza do token da URL (16.1, 16.10) ficam em `redefinir-senha.test.jsx`.
//
// O `fetch` é simulado por rota (`MÉTODO /caminho`), então o Orquestrador_Acesso
// e a Comunicacao_Frontend reais rodam por baixo do App. O `localStorage` é o
// stub em memória: as features vizinhas (comunidades, histórico, finds) leem
// dele sem tocar na rede. Os timers são reais: o splash de 1500 ms é esperado
// com `findBy*` e um prazo maior que ele.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { MENSAGEM_ERRO_CONEXAO, MENSAGEM_ERRO_SERVIDOR } from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'
import { perfilPadrao, semearSessao } from '../../tests/helpers/sessaoValida'

const SESSION_KEY = 'choosen.session'
const PREFIXO = '/api/v1'
const API = `http://localhost:8000${PREFIXO}`
// Token gravado por `semearSessao`.
const TOKEN_SEMEADO = 'token-de-teste'
const FUTURO = '2999-01-01T00:00:00Z'
// Prazo dos `findBy*` que atravessam o splash de 1500 ms.
const ESPERA = { timeout: 4000 }

const perfilAna = { ...perfilPadrao, id: 2, name: 'Ana Souza', username: 'ana', email: 'ana@exemplo.com' }

function respostaJson(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function respostaErro(status, code, message) {
  return respostaJson(status, { error: { code, message } })
}

// Promise controlada pelo teste, para segurar uma resposta pendente.
function adiado() {
  let resolve
  const promise = new Promise((res) => {
    resolve = res
  })
  return { promise, resolve }
}

let storage = null
let restoreStorage = () => {}
let fetchMock = null
// Requisições sem rota simulada: falham o teste no `afterEach`.
let naoSimuladas = []

/**
 * Instala o `fetch` simulado. `rotas` mapeia `'MÉTODO /caminho'` (sem o
 * prefixo `/api/v1` nem a query string) para uma função que recebe o `init`
 * e devolve a `Response` (ou uma Promise dela, ou lança para simular rede fora).
 */
function simularRotas(rotas) {
  fetchMock = vi.fn(async (url, init = {}) => {
    const metodo = (init.method ?? 'GET').toUpperCase()
    const caminho = new URL(url).pathname.replace(PREFIXO, '')
    const rota = rotas[`${metodo} ${caminho}`]
    if (!rota) {
      naoSimuladas.push(`${metodo} ${caminho}`)
      throw new TypeError('Failed to fetch')
    }
    return rota(init)
  })
  vi.stubGlobal('fetch', fetchMock)
}

// Chamadas feitas a uma rota, com método e cabeçalhos.
function chamadasPara(metodo, caminho) {
  return fetchMock.mock.calls.filter(
    ([url, init = {}]) => (init.method ?? 'GET') === metodo && new URL(url).pathname === `${PREFIXO}${caminho}`,
  )
}

const splash = () => screen.queryByRole('main', { name: 'Carregando Choosen' })
const telaLogin = () => screen.findByRole('heading', { name: 'Welcome back' }, ESPERA)
const saudacao = (primeiroNome) => screen.findByRole('heading', { name: new RegExp(`^Olá, ${primeiroNome}`) }, ESPERA)

function sessaoSalva() {
  const bruto = storage.raw(SESSION_KEY)
  return bruto === null ? null : JSON.parse(bruto)
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', '')
  ;({ storage, restore: restoreStorage } = installLocalStorageStub())
  naoSimuladas = []
  simularRotas({})
})

afterEach(() => {
  expect(naoSimuladas).toEqual([])
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  restoreStorage()
})

describe('App.jsx: confirmação da sessão salva no carregamento', { timeout: 15_000 }, () => {
  it('sem token mostra o splash e depois a Tela_Login, sem nenhuma requisição', async () => {
    render(<App />)

    expect(splash()).toBeTruthy()
    expect(await telaLogin()).toBeTruthy()
    expect(splash()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: /^Olá,/ })).toBeNull()
  })

  it('com token mantém o splash até GET /usuarios/me responder e abre a Home com o perfil devolvido', async () => {
    semearSessao(storage)
    const pendente = adiado()
    simularRotas({ 'GET /usuarios/me': () => pendente.promise })
    render(<App />)

    // Passado o tempo mínimo do splash, ele continua enquanto a resposta não chega.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1700)))
    expect(splash()).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Olá,/ })).toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/usuarios/me`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN_SEMEADO}`)

    pendente.resolve(respostaJson(200, perfilAna))

    // A saudação usa o Perfil_Publico confirmado, que também atualiza a sessão salva.
    expect(await saudacao('Ana')).toBeTruthy()
    expect(splash()).toBeNull()
    expect(sessaoSalva().token).toBe(TOKEN_SEMEADO)
    expect(sessaoSalva().user.name).toBe('Ana Souza')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401 na confirmação abre a Tela_Login e remove choosen.session', async () => {
    semearSessao(storage)
    simularRotas({ 'GET /usuarios/me': () => respostaErro(401, 'sessao_invalida', 'Sessão inválida.') })
    render(<App />)

    expect(await telaLogin()).toBeTruthy()
    expect(sessaoSalva()).toBeNull()
    expect(screen.queryByTestId('sessao-falha')).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Olá,/ })).toBeNull()
  })

  it('erro de rede mostra a tela de falha mantendo a sessão; "Tentar novamente" confirma de novo e abre a Home', async () => {
    semearSessao(storage)
    const salvaAntes = storage.raw(SESSION_KEY)
    const segunda = adiado()
    let chamadas = 0
    simularRotas({
      'GET /usuarios/me': () => {
        chamadas += 1
        if (chamadas === 1) throw new TypeError('Failed to fetch')
        return segunda.promise
      },
    })
    const user = userEvent.setup()
    render(<App />)

    const falha = await screen.findByTestId('sessao-falha', {}, ESPERA)
    expect(falha.getAttribute('role')).toBe('alert')
    expect(falha.textContent).toBe(MENSAGEM_ERRO_CONEXAO)
    expect(storage.raw(SESSION_KEY)).toBe(salvaAntes)
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^Olá,/ })).toBeNull()

    const tentar = screen.getByTestId('sessao-tentar-novamente')
    expect(tentar.textContent).toBe('Tentar novamente')
    await user.click(tentar)

    // Nova confirmação em andamento: volta o splash.
    expect(splash()).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    segunda.resolve(respostaJson(200, perfilPadrao))

    expect(await saudacao('Victor')).toBeTruthy()
    expect(screen.queryByTestId('sessao-falha')).toBeNull()
    expect(sessaoSalva().token).toBe(TOKEN_SEMEADO)
  })

  it('erro 500 mostra a mensagem de servidor na tela de falha e mantém a sessão', async () => {
    semearSessao(storage)
    const salvaAntes = storage.raw(SESSION_KEY)
    simularRotas({ 'GET /usuarios/me': () => respostaErro(500, 'erro_interno', 'Traceback interno') })
    render(<App />)

    const falha = await screen.findByTestId('sessao-falha', {}, ESPERA)
    expect(falha.textContent).toBe(MENSAGEM_ERRO_SERVIDOR)
    expect(document.body.textContent).not.toContain('Traceback')
    expect(storage.raw(SESSION_KEY)).toBe(salvaAntes)
    expect(screen.getByTestId('sessao-tentar-novamente')).toBeTruthy()
  })
})

describe('App.jsx: entrada, sessão inválida e saída', { timeout: 15_000 }, () => {
  const respostaSessao = (perfil, token = 'token-novo') => respostaJson(200, { token, expiresAt: FUTURO, user: perfil })

  it('Login com sucesso abre a Home com o nome devolvido pelo Backend', async () => {
    simularRotas({ 'POST /auth/login': () => respostaSessao(perfilAna) })
    const user = userEvent.setup()
    render(<App />)

    await telaLogin()
    await user.type(document.getElementById('login-email'), 'ana@exemplo.com')
    await user.type(document.getElementById('login-password'), 'senha12345')
    await user.click(screen.getByTestId('login-entrar'))

    expect(await saudacao('Ana')).toBeTruthy()
    expect(sessaoSalva().token).toBe('token-novo')
    expect(chamadasPara('POST', '/auth/login')).toHaveLength(1)
  })

  it('Cadastro com sucesso faz o login automático e abre a Home com o nome devolvido', async () => {
    simularRotas({
      'GET /auth/email-em-uso': () => respostaJson(200, { inUse: false }),
      'POST /auth/cadastro': () => respostaJson(201, { token: 'token-cadastro', expiresAt: FUTURO, user: perfilAna }),
    })
    const user = userEvent.setup()
    render(<App />)

    await telaLogin()
    await user.click(screen.getByTestId('ir-para-cadastro'))
    await user.type(document.getElementById('signup-name'), 'Ana Souza')
    await user.type(document.getElementById('signup-email'), 'ana@exemplo.com')
    await user.type(document.getElementById('signup-password'), 'senha12345')
    await user.type(document.getElementById('signup-confirm-password'), 'senha12345')
    await user.click(screen.getByTestId('cadastro-criar'))

    expect(await saudacao('Ana')).toBeTruthy()
    expect(sessaoSalva().token).toBe('token-cadastro')
    expect(chamadasPara('POST', '/auth/cadastro')).toHaveLength(1)
  })

  it('401 de um Endpoint_Protegido depois do login leva de volta à Tela_Login', async () => {
    // O login grava uma sessão nova, o que rearma o aviso único de sessão inválida.
    simularRotas({
      'POST /auth/login': () => respostaSessao(perfilAna),
      'GET /usuarios/me': () => respostaErro(401, 'sessao_invalida', 'Sessão inválida.'),
    })
    const user = userEvent.setup()
    render(<App />)

    await telaLogin()
    await user.type(document.getElementById('login-email'), 'ana@exemplo.com')
    await user.type(document.getElementById('login-password'), 'senha12345')
    await user.click(screen.getByTestId('login-entrar'))
    await saudacao('Ana')

    // A Tela_Perfil chama GET /usuarios/me, que responde 401.
    await user.click(screen.getByRole('button', { name: 'Perfil' }))

    expect(await telaLogin()).toBeTruthy()
    expect(sessaoSalva()).toBeNull()
    expect(chamadasPara('GET', '/usuarios/me')).toHaveLength(1)
    // Tela_Login nova, sem a mensagem de erro do login.
    expect(document.getElementById('login-email').value).toBe('')
    expect(screen.queryByTestId('login-erro')).toBeNull()
  })

  it('Sair chama POST /auth/logout uma única vez mesmo com clique duplo, limpa a sessão e abre a Tela_Login', async () => {
    semearSessao(storage)
    const logout = adiado()
    simularRotas({
      'GET /usuarios/me': () => respostaJson(200, perfilPadrao),
      'POST /auth/logout': () => logout.promise,
    })
    const user = userEvent.setup()
    render(<App />)

    await saudacao('Victor')
    await user.click(screen.getByRole('button', { name: 'Perfil' }))
    expect(await screen.findByText('@victor')).toBeTruthy()

    const sair = screen.getByRole('button', { name: 'Sair' })
    await user.dblClick(sair)

    // Enquanto o logout está pendente, o Sair fica bloqueado.
    expect(sair.disabled).toBe(true)
    const chamadasLogout = chamadasPara('POST', '/auth/logout')
    expect(chamadasLogout).toHaveLength(1)
    expect(chamadasLogout[0][1].headers.Authorization).toBe(`Bearer ${TOKEN_SEMEADO}`)

    logout.resolve(new Response(null, { status: 204 }))

    expect(await telaLogin()).toBeTruthy()
    expect(sessaoSalva()).toBeNull()
    expect(window.location.pathname).toBe('/')
    expect(chamadasPara('POST', '/auth/logout')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: /^Olá,/ })).toBeNull()
  })

  it('editar o perfil atualiza a saudação da Home', async () => {
    semearSessao(storage)
    const perfilEditado = { ...perfilPadrao, name: 'Bruno Lima', updatedAt: '2026-02-01T00:00:00Z' }
    simularRotas({
      'GET /usuarios/me': () => respostaJson(200, perfilPadrao),
      'PATCH /usuarios/me': () => respostaJson(200, perfilEditado),
    })
    const user = userEvent.setup()
    render(<App />)

    await saudacao('Victor')
    await user.click(screen.getByRole('button', { name: 'Perfil' }))
    await screen.findByText('@victor')
    await user.click(screen.getByRole('button', { name: 'Editar perfil' }))

    const nome = document.getElementById('edit-profile-name')
    await user.clear(nome)
    await user.type(nome, 'Bruno Lima')
    await user.click(screen.getByTestId('editar-perfil-enviar'))
    await screen.findByTestId('editar-perfil-sucesso')

    await user.click(screen.getByRole('button', { name: 'Início' }))

    expect(await saudacao('Bruno')).toBeTruthy()
    await waitFor(() => expect(sessaoSalva().user.name).toBe('Bruno Lima'))
    expect(chamadasPara('PATCH', '/usuarios/me')).toHaveLength(1)
  })
})
