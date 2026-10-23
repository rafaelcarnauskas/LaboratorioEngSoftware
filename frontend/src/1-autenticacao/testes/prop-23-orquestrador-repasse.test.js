// Teste de propriedade do repasse de dados pelo Orquestrador_Acesso (Property 23).
//
// Feature: autenticacao-conta, Property 23: Orquestrador repassa os dados ao Backend sem alterar
// **Validates: Requisitos 3.1, 4.1, 5.1, 5.9, 7.1**
//
// O teste passa pelo caminho real Orquestrador → Comunicacao_Frontend → `fetch`:
// só o `fetch` é simulado (via `vi.stubGlobal`) e as asserções são feitas sobre a
// requisição que sairia para o Backend (URL, método e corpo JSON). A propriedade
// fala do que chega ao Backend ("faz exatamente uma requisição com corpo..."), e
// uma requisição com o corpo certo só existe se o Orquestrador chamou a
// Comunicacao_Frontend uma vez com os valores certos, então a mesma asserção
// cobre os dois lados. O `localStorage` é o stub em memória dos testes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import {
  ErroValidacao,
  atualizarPerfil,
  isValidEmail,
  logIn,
  requestPasswordReset,
  signUp,
} from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const DIA_MS = 24 * 60 * 60 * 1000

let stub = null
let restoreStorage = () => {}

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
})

afterEach(() => {
  vi.unstubAllGlobals()
  restoreStorage()
})

// --- auxiliares ------------------------------------------------------------

// Resposta mínima: a Comunicacao_Frontend só lê `status` e `text()`.
function resposta(status, corpo) {
  return { status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) }
}

const PERFIL = { id: 'u1', name: 'Pessoa Teste', username: 'pessoa', email: 'pessoa@exemplo.com' }

function respostaSessao(status = 200) {
  return resposta(status, {
    token: 'token-de-teste-1234567890',
    expiresAt: new Date(Date.now() + DIA_MS).toISOString(),
    user: PERFIL,
  })
}

function instalarFetch(responder) {
  const fetchSimulado = vi.fn(() => Promise.resolve(responder()))
  vi.stubGlobal('fetch', fetchSimulado)
  return fetchSimulado
}

// Única requisição feita: devolve URL, init e o corpo JSON já decodificado.
function unicaRequisicao(fetchSimulado) {
  expect(fetchSimulado).toHaveBeenCalledTimes(1)
  const [url, init] = fetchSimulado.mock.calls[0]
  return { url: String(url), init, corpo: JSON.parse(init.body) }
}

// --- geradores -------------------------------------------------------------

// Qualquer texto, inclusive vazio, com espaços nas pontas, maiúsculas e Unicode.
const espacos = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), { maxLength: 4 })
  .map((partes) => partes.join(''))
const texto = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.tuple(espacos, fc.string(), espacos).map(([a, meio, b]) => `${a}${meio}${b}`),
)

// E-mail que `isValidEmail` aceita, sem espaços: local@dominio.tld.
const parteEmail = fc.stringMatching(/^[A-Za-z0-9._+-]{1,12}$/)
const emailValido = fc
  .tuple(parteEmail, parteEmail, fc.stringMatching(/^[A-Za-z]{2,6}$/))
  .map(([local, dominio, tld]) => `${local}@${dominio}.${tld}`)

// Strings que `isValidEmail` recusa (vazia, só espaços, sem @, sem ponto no domínio...).
const emailInvalido = fc
  .oneof(
    fc.constantFrom('', ' ', '   ', '\t\n', 'pessoa', 'pessoa@', '@exemplo.com', 'a@b', 'a b@c.d', 'a@b@c.d', 'a@b.'),
    fc.string(),
    fc.tuple(parteEmail, parteEmail).map(([a, b]) => `${a}@${b.replace(/\./g, '')}`),
  )
  .filter((email) => !isValidEmail(email))

// Campos a mais que uma tela poderia ter no objeto do formulário.
const extras = fc.record(
  {
    confirmPassword: texto,
    isSystemAdmin: fc.boolean(),
    isCommunityAdmin: fc.boolean(),
    id: texto,
    token: texto,
  },
  { requiredKeys: [] },
)

const formularioCadastro = fc
  .tuple(fc.record({ name: texto, email: texto, password: texto, confirmPassword: texto }), extras)
  .map(([form, mais]) => ({ ...mais, ...form }))

const fotoEditada = fc.oneof(
  fc.constant(null),
  fc.constant(''),
  fc.base64String({ maxLength: 64 }).map((b64) => `data:image/png;base64,${b64}`),
  texto,
)

const perfilEditado = fc
  .tuple(
    fc.record({ name: texto, username: texto, description: texto, photo: fotoEditada }),
    fc.record({ email: texto, password: texto, isSystemAdmin: fc.boolean() }, { requiredKeys: [] }),
  )
  .map(([perfil, mais]) => ({ ...mais, ...perfil }))

// --- propriedades ----------------------------------------------------------

describe('Property 23: Orquestrador repassa os dados ao Backend sem alterar', () => {
  it('logIn(email, senha) faz exatamente uma requisição com {email, password} iguais ao digitado', async () => {
    await fc.assert(
      fc.asyncProperty(texto, texto, fc.constantFrom(200, 401, 422), async (email, password, status) => {
        stub.reset()
        const fetchSimulado = instalarFetch(() =>
          status === 200 ? respostaSessao() : resposta(status, { error: { code: 'x', message: 'recusado' } }),
        )

        await logIn(email, password)

        const { url, init, corpo } = unicaRequisicao(fetchSimulado)
        expect(url.endsWith('/api/v1/auth/login')).toBe(true)
        expect(init.method).toBe('POST')
        expect(Object.keys(corpo).sort()).toEqual(['email', 'password'])
        expect(corpo.email).toBe(email)
        expect(corpo.password).toBe(password)
      }),
      { numRuns: 100 },
    )
  })

  it('signUp(formulário) envia exatamente name, email e password, sem a confirmação', async () => {
    await fc.assert(
      fc.asyncProperty(formularioCadastro, async (form) => {
        stub.reset()
        const fetchSimulado = instalarFetch(() => respostaSessao(201))

        await signUp(form)

        const { url, init, corpo } = unicaRequisicao(fetchSimulado)
        expect(url.endsWith('/api/v1/auth/cadastro')).toBe(true)
        expect(init.method).toBe('POST')
        expect(Object.keys(corpo).sort()).toEqual(['email', 'name', 'password'])
        expect(corpo).toEqual({ name: form.name, email: form.email, password: form.password })
      }),
      { numRuns: 100 },
    )
  })

  it('requestPasswordReset(e-mail válido com espaços nas pontas) envia uma requisição com email.trim()', async () => {
    await fc.assert(
      fc.asyncProperty(espacos, emailValido, espacos, async (antes, email, depois) => {
        stub.reset()
        const fetchSimulado = instalarFetch(() => resposta(202, { message: 'ok' }))
        const digitado = `${antes}${email}${depois}`

        await expect(requestPasswordReset(digitado)).resolves.toBeUndefined()

        const { url, init, corpo } = unicaRequisicao(fetchSimulado)
        expect(url.endsWith('/api/v1/auth/redefinicao-senha')).toBe(true)
        expect(init.method).toBe('POST')
        expect(corpo).toEqual({ email: digitado.trim() })
        expect(corpo.email).toBe(email)
      }),
      { numRuns: 100 },
    )
  })

  it('requestPasswordReset(string inválida) rejeita com ErroValidacao sem nenhuma requisição', async () => {
    await fc.assert(
      fc.asyncProperty(emailInvalido, async (email) => {
        stub.reset()
        const fetchSimulado = instalarFetch(() => resposta(202, { message: 'ok' }))

        await expect(requestPasswordReset(email)).rejects.toBeInstanceOf(ErroValidacao)

        expect(fetchSimulado).not.toHaveBeenCalled()
      }),
      { numRuns: 100 },
    )
  })

  it('atualizarPerfil(perfil editado) envia exatamente name, username, description e photo', async () => {
    await fc.assert(
      fc.asyncProperty(perfilEditado, async (perfil) => {
        stub.reset()
        stub.seed({
          [SESSION_KEY]: JSON.stringify({
            token: 'token-de-teste-1234567890',
            expiresAt: new Date(Date.now() + DIA_MS).toISOString(),
            user: PERFIL,
          }),
        })
        const fetchSimulado = instalarFetch(() => resposta(200, PERFIL))

        await atualizarPerfil(perfil)

        const { url, init, corpo } = unicaRequisicao(fetchSimulado)
        expect(url.endsWith('/api/v1/usuarios/me')).toBe(true)
        expect(init.method).toBe('PATCH')
        expect(init.headers.Authorization).toBe('Bearer token-de-teste-1234567890')
        expect(Object.keys(corpo).sort()).toEqual(['description', 'name', 'photo', 'username'])
        expect(corpo).toEqual({
          name: perfil.name,
          username: perfil.username,
          description: perfil.description,
          photo: perfil.photo,
        })
      }),
      { numRuns: 100 },
    )
  })
})
