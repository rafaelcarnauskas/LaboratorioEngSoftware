// Teste de propriedade da sessão inválida e do logout (Property 26).
//
// Feature: autenticacao-conta, Property 26: Sessão inválida e logout sempre limpam o armazenamento, com aviso único
// **Validates: Requisitos 10.4, 12.11, 9.5**
//
// `fetch` é simulado com `vi.fn()` (via `vi.stubGlobal`) e o `localStorage` é o
// stub em memória dos testes de persistência.
//
// O aviso único depende da flag de módulo `sessaoExpiradaNotificada`, que só
// volta a `false` quando `login`/`cadastrar` grava uma nova sessão. Cada execução
// começa com um `login` simulado em vez de `vi.resetModules()` + import dinâmico:
// assim a sessão é gravada pelo caminho real do módulo, a flag é zerada pelo
// mesmo código que a zera em produção, e o registro de ouvintes e o `session.js`
// continuam sendo uma única instância durante todo o arquivo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import {
  ErroSessaoInvalida,
  alterarSenha,
  aoSessaoInvalida,
  atualizarPerfil,
  login,
  logout,
  obterPerfil,
} from '../modelo/comunicacao'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const DIA_MS = 24 * 60 * 60 * 1000

let stub = null
let restoreStorage = () => {}
let ouvinte = null
let removerOuvinte = () => {}

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
  ouvinte = vi.fn()
  removerOuvinte = aoSessaoInvalida(ouvinte)
})

afterEach(() => {
  removerOuvinte()
  vi.unstubAllGlobals()
  restoreStorage()
})

// --- auxiliares ------------------------------------------------------------

// Resposta mínima: a Comunicacao_Frontend só lê `status` e `text()`.
function resposta(status, texto) {
  return { status, text: async () => texto }
}

function cabecalhos(chamada) {
  return chamada[1]?.headers ?? {}
}

// Começa uma execução: grava uma sessão nova por `login` (zerando a flag do
// aviso único) e devolve o `fetch` simulado, que responde ao login e delega o
// resto para `responder`.
async function iniciarSessao(token, responder) {
  const sessao = {
    token,
    expiresAt: new Date(Date.now() + DIA_MS).toISOString(),
    user: { id: 'u1', name: 'Pessoa Teste', email: 'pessoa@exemplo.com' },
  }
  const fetchSimulado = vi.fn((url, init) => {
    if (String(url).endsWith('/auth/login')) return Promise.resolve(resposta(200, JSON.stringify(sessao)))
    return responder(url, init)
  })
  vi.stubGlobal('fetch', fetchSimulado)

  await login('pessoa@exemplo.com', 'senha-forte-123')
  expect(cabecalhos(fetchSimulado.mock.calls[0])).not.toHaveProperty('Authorization')
  expect(JSON.parse(stub.raw(SESSION_KEY)).token).toBe(token)

  fetchSimulado.mockClear()
  ouvinte.mockClear()
  return fetchSimulado
}

// --- geradores -------------------------------------------------------------

const token = fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/)

// As três operações protegidas que disparam o aviso global.
const OPERACOES = {
  obterPerfil: () => obterPerfil(),
  atualizarPerfil: () => atualizarPerfil({ name: 'Nome', username: 'nome', description: '', photo: null }),
  alterarSenha: () => alterarSenha('senha-atual-123', 'senha-nova-456'),
}
const operacao = fc.constantFrom(...Object.keys(OPERACOES))

// Corpo de um 401: envelope do Backend, vazio ou ilegível.
const corpo401 = fc.oneof(
  fc.string().map((message) => JSON.stringify({ error: { code: 'sessao_invalida', message } })),
  fc.constant(''),
  fc.constantFrom('{', 'nao-e-json', '<html>401</html>'),
)

// k ≥ 1 requisições protegidas simultâneas e a ordem em que os 401 chegam.
const lote401 = fc
  .array(fc.record({ op: operacao, corpo: corpo401 }), { minLength: 1, maxLength: 8 })
  .chain((reqs) => {
    const indices = reqs.map((_, i) => i)
    return fc.record({
      reqs: fc.constant(reqs),
      ordem: fc.shuffledSubarray(indices, { minLength: indices.length, maxLength: indices.length }),
    })
  })

// Estado da sessão quando o logout é chamado.
const estadoSessao = fc.constantFrom('valida', 'ausente', 'expirada', 'corrompida')

// Qualquer resultado do `POST /auth/logout`: status HTTP com corpo variado,
// falha de rede ou falha ao ler o corpo.
const resultadoLogout = fc.oneof(
  fc.record({
    tipo: fc.constant('http'),
    status: fc.oneof(fc.constantFrom(200, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503), fc.integer({ min: 200, max: 599 })),
    corpo: fc.oneof(
      fc.constant(''),
      fc.constantFrom('{', 'nao-e-json'),
      fc.string().map((message) => JSON.stringify({ error: { code: 'qualquer', message } })),
      fc.jsonValue().map((v) => JSON.stringify(v)),
    ),
  }),
  fc.constant({ tipo: 'rede' }),
  fc.constant({ tipo: 'corpo' }),
)

function responderLogout(resultado) {
  if (resultado.tipo === 'rede') return Promise.reject(new TypeError('Failed to fetch'))
  if (resultado.tipo === 'corpo') return Promise.resolve({ status: 200, text: () => Promise.reject(new TypeError('body stream')) })
  return Promise.resolve(resposta(resultado.status, resultado.corpo))
}

// --- propriedades ----------------------------------------------------------

describe('Property 26: sessão inválida e logout sempre limpam o armazenamento, com aviso único', () => {
  it('k requisições protegidas simultâneas com 401 limpam choosen.session e avisam o ouvinte exatamente uma vez', async () => {
    await fc.assert(
      fc.asyncProperty(token, lote401, async (tk, { reqs, ordem }) => {
        stub.reset()
        // Cada requisição protegida fica pendente até o teste liberar o 401.
        const pendentes = []
        const fetchSimulado = await iniciarSessao(
          tk,
          () => new Promise((resolve) => pendentes.push(resolve)),
        )

        const promessas = reqs.map(({ op }) => OPERACOES[op]())

        // Todas saíram com o token antes de qualquer 401 chegar (simultâneas).
        expect(pendentes).toHaveLength(reqs.length)
        for (const chamada of fetchSimulado.mock.calls) {
          expect(cabecalhos(chamada).Authorization).toBe(`Bearer ${tk}`)
        }

        for (const i of ordem) pendentes[i](resposta(401, reqs[i].corpo))
        const resultados = await Promise.allSettled(promessas)

        for (const r of resultados) {
          expect(r.status).toBe('rejected')
          expect(r.reason).toBeInstanceOf(ErroSessaoInvalida)
        }
        expect(stub.raw(SESSION_KEY)).toBeNull()
        expect(ouvinte).toHaveBeenCalledTimes(1)

        // Sem nova sessão gravada, outra chamada protegida não envia nada e não avisa de novo.
        await expect(OPERACOES[reqs[0].op]()).rejects.toBeInstanceOf(ErroSessaoInvalida)
        expect(fetchSimulado).toHaveBeenCalledTimes(reqs.length)
        expect(ouvinte).toHaveBeenCalledTimes(1)
        expect(stub.raw(SESSION_KEY)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('para qualquer resultado do logout, choosen.session fica ausente e a Promise resolve, sem aviso global', async () => {
    await fc.assert(
      fc.asyncProperty(token, estadoSessao, resultadoLogout, async (tk, estado, resultado) => {
        stub.reset()
        const fetchSimulado = await iniciarSessao(tk, () => responderLogout(resultado))

        if (estado === 'ausente') stub.reset()
        if (estado === 'expirada') {
          stub.seed({ [SESSION_KEY]: JSON.stringify({ token: tk, expiresAt: new Date(Date.now() - DIA_MS).toISOString(), user: {} }) })
        }
        if (estado === 'corrompida') stub.seed({ [SESSION_KEY]: '{nao-e-json' })

        await expect(logout()).resolves.toBeUndefined()

        expect(stub.raw(SESSION_KEY)).toBeNull()
        // O 401 do logout (e qualquer outro resultado) não dispara o aviso global.
        expect(ouvinte).not.toHaveBeenCalled()
        if (estado === 'valida') {
          expect(fetchSimulado).toHaveBeenCalledTimes(1)
          const [url, init] = fetchSimulado.mock.calls[0]
          expect(String(url).endsWith('/api/v1/auth/logout')).toBe(true)
          expect(init.method).toBe('POST')
          expect(init.headers.Authorization).toBe(`Bearer ${tk}`)
        } else {
          // Sem token válido, o logout não faz requisição.
          expect(fetchSimulado).not.toHaveBeenCalled()
        }
      }),
      { numRuns: 100 },
    )
  })
})
