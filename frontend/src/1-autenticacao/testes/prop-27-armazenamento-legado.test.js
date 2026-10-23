// Teste de propriedade de limparArmazenamentoLegado (Property 27).
//
// Feature: autenticacao-conta, Property 27: Limpeza do armazenamento legado no carregamento
// **Validates: Requisitos 12.7**
//
// O oráculo é independente da implementação: cada conteúdo de `choosen.session`
// é gerado já com a resposta esperada (`fica`), decidida pela forma como foi
// construído, e não reinterpretando o JSON.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { limparArmazenamentoLegado } from '../modelo/session'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const ACCOUNTS_KEY = 'choosen.accounts'
// Chaves das outras partes do sistema, que a limpeza nunca pode tocar.
const CHAVES_DE_COLEGAS = ['choosen.lists.v1', 'choosen.communities.v1', 'choosen.communityNiches.v1', 'choosen.history.v1']

const ANO_MS = 365 * 24 * 60 * 60 * 1000
const MIN_AGORA = Date.parse('2000-01-01T00:00:00Z')
const MAX_AGORA = Date.parse('2090-01-01T00:00:00Z')

let stub = null
let restoreStorage = () => {}

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
})

afterEach(() => {
  restoreStorage()
})

// --- geradores -------------------------------------------------------------

function naoEJson(s) {
  try {
    JSON.parse(s)
    return false
  } catch {
    return true
  }
}

// Strings que não são JSON válido (o filtro só restringe o gerador).
const jsonInvalido = fc.oneof(
  fc.constantFrom('', '{', '{nao-e-json', "{'token':'x'}", 'undefined', 'NaN', '[1,', '{"token":"x",}'),
  fc.string().map((s) => `{${s}`).filter(naoEJson),
  fc.string().filter(naoEJson),
)

// JSON válido que não é um objeto simples (array, número, string, booleano, null).
const jsonNaoObjeto = fc
  .oneof(fc.array(fc.jsonValue(), { maxLength: 3 }), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.string(), fc.boolean(), fc.constant(null))
  .map((v) => JSON.stringify(v))

// token: `valido` só quando é string não vazia.
const token = fc.oneof(
  fc.string({ minLength: 1 }).map((t) => ({ presente: true, valor: t, valido: true })),
  fc.constant({ presente: true, valor: '', valido: false }),
  fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 2 })).map((v) => ({
    presente: true,
    valor: v,
    valido: false,
  })),
  fc.constant({ presente: false, valido: false }),
)

// expiresAt relativo a `agora`: `futuro` só quando a data é legível e > agora.
// Deslocamento 0 (igual a agora) conta como expirada.
function expiresAt(agora) {
  const futuro = fc.integer({ min: 1, max: 5 * ANO_MS })
  const passadoOuAgora = fc.integer({ min: 0, max: 5 * ANO_MS })
  return fc.oneof(
    futuro.map((d) => ({ presente: true, valor: new Date(agora + d).toISOString(), futuro: true })),
    futuro.map((d) => ({ presente: true, valor: agora + d, futuro: true })),
    passadoOuAgora.map((d) => ({ presente: true, valor: new Date(agora - d).toISOString(), futuro: false })),
    passadoOuAgora.map((d) => ({ presente: true, valor: agora - d, futuro: false })),
    fc.constantFrom('ontem', 'amanhã', '', 'nao-e-data', '2025-13-45T99:99:99Z').map((v) => ({ presente: true, valor: v, futuro: false })),
    fc.oneof(fc.boolean(), fc.constant(null), fc.constant({}), fc.constant([])).map((v) => ({ presente: true, valor: v, futuro: false })),
    fc.constant({ presente: false, futuro: false }),
  )
}

// Objeto de sessão com combinações de token / expiresAt e campos extras.
function sessaoObjeto(agora) {
  return fc
    .record({
      token,
      expiresAt: expiresAt(agora),
      user: fc.option(fc.record({ id: fc.string(), email: fc.string(), name: fc.string() }), { nil: undefined }),
      extra: fc.option(fc.jsonValue(), { nil: undefined }),
    })
    .map(({ token: t, expiresAt: e, user, extra }) => {
      const obj = {}
      if (t.presente) obj.token = t.valor
      if (e.presente) obj.expiresAt = e.valor
      if (user !== undefined) obj.user = user
      if (extra !== undefined) obj.password = extra
      return { raw: JSON.stringify(obj), fica: t.valido && e.futuro }
    })
}

// Conteúdo inicial de `choosen.session`: ausente, JSON inválido, JSON não-objeto ou objeto.
function sessaoInicial(agora) {
  return fc.oneof(
    fc.constant({ raw: null, fica: false }),
    jsonInvalido.map((raw) => ({ raw, fica: false })),
    jsonNaoObjeto.map((raw) => ({ raw, fica: false })),
    sessaoObjeto(agora),
  )
}

// Outras chaves do armazenamento (colegas + aleatórias), nunca as duas tratadas aqui.
const outrasChaves = fc
  .tuple(
    fc.subarray(CHAVES_DE_COLEGAS),
    fc.uniqueArray(fc.string({ minLength: 1 }).filter((k) => k !== SESSION_KEY && k !== ACCOUNTS_KEY && !CHAVES_DE_COLEGAS.includes(k)), {
      maxLength: 4,
    }),
  )
  .chain(([colegas, aleatorias]) => {
    const chaves = [...colegas, ...aleatorias]
    return fc.array(fc.string(), { minLength: chaves.length, maxLength: chaves.length }).map((valores) => chaves.map((k, i) => [k, valores[i]]))
  })

const cenario = fc.integer({ min: MIN_AGORA, max: MAX_AGORA }).chain((agora) =>
  fc.record({
    agora: fc.constant(agora),
    accounts: fc.option(fc.string(), { nil: null }),
    session: sessaoInicial(agora),
    outras: outrasChaves,
  }),
)

const ordenar = (entries) => [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

// --- propriedade -----------------------------------------------------------

describe('Property 27: limpeza do armazenamento legado no carregamento', () => {
  it('apaga choosen.accounts, mantém choosen.session só se tem token e expiresAt > agora, e não toca outras chaves', () => {
    fc.assert(
      fc.property(cenario, ({ agora, accounts, session, outras }) => {
        stub.reset()
        const inicial = Object.fromEntries(outras)
        if (accounts !== null) inicial[ACCOUNTS_KEY] = accounts
        if (session.raw !== null) inicial[SESSION_KEY] = session.raw
        stub.seed(inicial)

        limparArmazenamentoLegado(agora)

        const esperado = [...outras]
        if (session.fica) esperado.push([SESSION_KEY, session.raw])

        expect(stub.raw(ACCOUNTS_KEY)).toBeNull()
        expect(stub.raw(SESSION_KEY)).toBe(session.fica ? session.raw : null)
        expect(ordenar(Object.entries(stub.snapshot()))).toEqual(ordenar(esperado))
      }),
      { numRuns: 100 },
    )
  })
})
