// Testes de exemplo de modelo/comunicacao.js (Comunicacao_Frontend).
// O comportamento geral de sessão inválida e logout fica na Property 26
// (prop-26-sessao-invalida.test.js); aqui só os exemplos concretos do 10.5.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aoSessaoInvalida,
  ErroConexao,
  login,
  logout,
  obterPerfil,
  TEMPO_LIMITE_MS,
} from '../modelo/comunicacao'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const FUTURO = '2999-01-01T00:00:00Z'
const PASSADO = '2000-01-01T00:00:00Z'

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

let stub = null
let restoreStorage = () => {}
let fetchMock = null

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  restoreStorage()
})

describe('logout sem token (Requisito 9.10)', () => {
  it('sem sessão salva, resolve sem chamar fetch', async () => {
    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('com sessão expirada, não chama fetch e limpa a sessão local', async () => {
    stub.seed({ [SESSION_KEY]: JSON.stringify({ token: 'tok', expiresAt: PASSADO, user: perfil }) })

    await expect(logout()).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(stub.raw(SESSION_KEY)).toBeNull()
  })
})

// Desvio consciente do texto do Requisito 12.1 (decisão do usuário):
// `VITE_API_URL` é só o HOST do Backend (padrão `http://localhost:8000`) e o
// módulo acrescenta `/api/v1`, com a `/` final do host removida.
describe('URL base do Backend (Requisito 12.1)', () => {
  const respostaLogin = () => respostaJson(200, { token: 'tok', expiresAt: FUTURO, user: perfil })

  it.each([
    ['ausente', undefined],
    ['vazia', ''],
  ])('VITE_API_URL %s usa http://localhost:8000/api/v1', async (_caso, valor) => {
    vi.stubEnv('VITE_API_URL', valor)
    fetchMock.mockResolvedValue(respostaLogin())

    await login('victor@email.com', 'choosen123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/auth/login')
  })

  it.each([
    ['https://api.choosen.app', 'https://api.choosen.app/api/v1/auth/login'],
    ['https://api.choosen.app/', 'https://api.choosen.app/api/v1/auth/login'],
  ])('VITE_API_URL=%s vira o host das requisições', async (host, esperado) => {
    vi.stubEnv('VITE_API_URL', host)
    fetchMock.mockResolvedValue(respostaLogin())

    await login('victor@email.com', 'choosen123')

    expect(fetchMock.mock.calls[0][0]).toBe(esperado)
  })
})

describe('tempo limite de 10 s (Requisito 12.8)', () => {
  // `fetch` que só termina quando o `signal` é abortado, como o navegador faz.
  function fetchQueSoTerminaNoAbort(_url, { signal }) {
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  it('o prazo é de 10 000 ms', () => {
    expect(TEMPO_LIMITE_MS).toBe(10_000)
  })

  it('sem resposta em 10 s, rejeita com ErroConexao e não altera a sessão', async () => {
    const valida = JSON.stringify({ token: 'tok', expiresAt: FUTURO, user: perfil })
    stub.seed({ [SESSION_KEY]: valida })
    const ouvinte = vi.fn()
    const remover = aoSessaoInvalida(ouvinte)
    fetchMock.mockImplementation(fetchQueSoTerminaNoAbort)

    let resultado = 'pendente'
    const promessa = obterPerfil().then(
      () => {
        resultado = 'resolvida'
      },
      (erro) => {
        resultado = erro
      },
    )

    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_MS - 1)
    expect(resultado).toBe('pendente')

    await vi.advanceTimersByTimeAsync(1)
    await promessa
    remover()

    expect(resultado).toBeInstanceOf(ErroConexao)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    expect(stub.snapshot()).toEqual({ [SESSION_KEY]: valida })
    expect(ouvinte).not.toHaveBeenCalled()
  })

  it('a leitura do corpo também conta no prazo: corpo travado rejeita com ErroConexao', async () => {
    fetchMock.mockImplementation((url, init) =>
      Promise.resolve({ status: 200, text: () => fetchQueSoTerminaNoAbort(url, init) }),
    )

    const promessa = login('victor@email.com', 'choosen123')
    const verificacao = expect(promessa).rejects.toBeInstanceOf(ErroConexao)

    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_MS)
    await verificacao

    expect(stub.snapshot()).toEqual({})
  })
})
