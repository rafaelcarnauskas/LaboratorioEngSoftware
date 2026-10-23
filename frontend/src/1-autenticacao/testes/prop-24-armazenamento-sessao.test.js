// Teste de propriedade do conteúdo de `choosen.session` (Property 24).
//
// Feature: autenticacao-conta, Property 24: choosen.session só guarda token, expiração e Perfil_Publico, nunca senha
// **Validates: Requisitos 12.5, 3.5, 4.9**
//
// `fetch` é simulado com `vi.fn()` (via `vi.stubGlobal`) e devolve respostas no
// formato do Backend, mas com campos extras arbitrários, inclusive segredos
// (`password`, `hashSenha`, `token` dentro de `user`...). As asserções são
// feitas sobre o conteúdo CRU do `localStorage` (stub em memória), não sobre o
// que `getSession` devolve, para que nada que o módulo grave escape da checagem.
//
// Para a busca da senha como substring ser confiável, toda senha gerada contém
// o marcador `¤`, que nenhum outro valor gravado pode conter (token, datas e
// campos do Perfil_Publico usam só ASCII). A busca também procura a forma
// escapada pelo `JSON.stringify`, caso a senha tenha aspas ou barras.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { atualizarPerfil, logIn, restoreSession, signUp } from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const DIA_MS = 24 * 60 * 60 * 1000
const MARCADOR = '¤'

const PERFIL_PUBLICO_FIELDS = [
  'id',
  'name',
  'username',
  'email',
  'description',
  'photo',
  'isCommunityAdmin',
  'isSystemAdmin',
  'createdAt',
  'updatedAt',
]

// Chaves secretas que um Backend com defeito poderia vazar no `user`.
const CHAVES_SECRETAS = [
  'password',
  'senha',
  'hashSenha',
  'hash_senha',
  'passwordHash',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'token',
]

// Chaves de terceiros que já estão no navegador (outras partes do Choosen).
const OUTRAS_CHAVES = {
  'choosen.lists': JSON.stringify([{ id: 'l1', name: 'Favoritos' }]),
  'choosen.history': '[]',
}

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
function resposta(status, texto) {
  return { status, text: async () => texto }
}

function projetarPerfil(user) {
  const perfil = {}
  for (const campo of PERFIL_PUBLICO_FIELDS) {
    if (Object.hasOwn(user, campo)) perfil[campo] = user[campo]
  }
  return perfil
}

// Nenhuma chave nem valor do `localStorage` contém a senha, crua ou escapada.
function esperarSemSenha(senha) {
  const escapada = JSON.stringify(senha).slice(1, -1)
  for (const [chave, valor] of Object.entries(stub.snapshot())) {
    for (const texto of [chave, valor]) {
      expect(texto.includes(senha)).toBe(false)
      expect(texto.includes(escapada)).toBe(false)
    }
  }
}

// `choosen.session` cru tem exatamente `token`, `expiresAt` e `user`, e `user`
// é exatamente a projeção do Perfil_Publico recebido.
function esperarSessaoGravada({ token, expiresAt, user }) {
  const cru = stub.raw(SESSION_KEY)
  expect(cru).not.toBeNull()
  const salvo = JSON.parse(cru)
  expect(Object.keys(salvo).sort()).toEqual(['expiresAt', 'token', 'user'])
  expect(salvo.token).toBe(token)
  expect(salvo.expiresAt).toBe(expiresAt)
  for (const chave of Object.keys(salvo.user)) {
    expect(PERFIL_PUBLICO_FIELDS).toContain(chave)
  }
  expect(salvo.user).toEqual(projetarPerfil(user))
}

// --- geradores -------------------------------------------------------------

// Senha qualquer (8+ caracteres), sempre com o marcador em posição aleatória.
const senha = fc
  .tuple(fc.string({ unit: 'grapheme', maxLength: 60 }), fc.string({ unit: 'grapheme', minLength: 7, maxLength: 60 }))
  .map(([antes, depois]) => `${antes}${MARCADOR}${depois}`)

const token = fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/)

const dataIso = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString())

const expiraEmFuturo = fc
  .integer({ min: 60_000, max: 365 * DIA_MS })
  .map((ms) => new Date(Date.now() + ms).toISOString())

// Strings ASCII (sem o marcador) para os campos públicos.
const textoAscii = (minLength, maxLength) => fc.string({ unit: 'grapheme-ascii', minLength, maxLength })

const perfilPublico = fc.record(
  {
    id: fc.uuid(),
    name: textoAscii(1, 60),
    username: fc.stringMatching(/^[A-Za-z0-9._]{1,30}$/),
    email: fc.emailAddress(),
    description: fc.option(textoAscii(0, 160), { nil: null }),
    photo: fc.option(fc.webUrl(), { nil: null }),
    isCommunityAdmin: fc.boolean(),
    isSystemAdmin: fc.boolean(),
    createdAt: dataIso,
    updatedAt: dataIso,
  },
  { requiredKeys: ['id', 'name', 'username', 'email'] },
)

const chaveExtra = (proibidas) =>
  fc.string({ minLength: 1, maxLength: 20 }).filter((k) => k !== '__proto__' && !proibidas.includes(k))

// Campos extras arbitrários (descartáveis) e segredos que repetem a senha.
const extrasUser = fc.dictionary(chaveExtra([...PERFIL_PUBLICO_FIELDS, ...CHAVES_SECRETAS]), fc.jsonValue(), {
  maxKeys: 5,
})
const segredos = fc.subarray(CHAVES_SECRETAS)
const extrasTopo = fc.dictionary(chaveExtra(['token', 'expiresAt', 'user', 'password']), fc.jsonValue(), {
  maxKeys: 4,
})

// `user` vindo do Backend: Perfil_Publico + extras + segredos com a senha.
function montarUser(perfil, extras, chavesSecretas, pw) {
  const user = Object.assign({}, extras, perfil)
  for (const chave of chavesSecretas) {
    user[chave] = chave.toLowerCase().includes('hash') ? `$argon2id$${pw}` : pw
  }
  return user
}

const respostaSucesso = fc.record({
  token,
  expiresAt: expiraEmFuturo,
  perfil: perfilPublico,
  extras: extrasUser,
  segredos,
  topo: extrasTopo,
  senhaNoTopo: fc.boolean(),
  status: fc.constantFrom(200, 201),
})

const operacao = fc.constantFrom('logIn', 'signUp')

async function executar(op, email, pw) {
  if (op === 'logIn') return logIn(email, pw)
  return signUp({ name: 'Pessoa Teste', email, password: pw })
}

// Qualquer falha de login/cadastro: status 4xx/5xx com corpo variado (inclusive
// um corpo com cara de sessão), falha de rede ou falha ao ler o corpo.
const falha = fc.oneof(
  fc.record({
    tipo: fc.constant('http'),
    status: fc.oneof(fc.constantFrom(400, 401, 409, 422, 429, 500, 502, 503), fc.integer({ min: 400, max: 599 })),
    corpo: fc.oneof(
      fc.constant(''),
      fc.constantFrom('{', 'nao-e-json', '<html>erro</html>'),
      fc.string().map((message) => JSON.stringify({ error: { code: 'qualquer', message } })),
      fc
        .record({ token, expiresAt: expiraEmFuturo, user: perfilPublico })
        .map((corpo) => JSON.stringify(corpo)),
    ),
  }),
  fc.constant({ tipo: 'rede' }),
  fc.constant({ tipo: 'corpo' }),
)

function responderFalha(resultado) {
  if (resultado.tipo === 'rede') return Promise.reject(new TypeError('Failed to fetch'))
  if (resultado.tipo === 'corpo') {
    return Promise.resolve({ status: 200, text: () => Promise.reject(new TypeError('body stream')) })
  }
  return Promise.resolve(resposta(resultado.status, resultado.corpo))
}

// --- propriedades ----------------------------------------------------------

describe('Property 24: choosen.session só guarda token, expiração e Perfil_Publico, nunca senha', () => {
  it('após logIn/signUp com sucesso, choosen.session tem só token, expiresAt e o Perfil_Publico, e a senha não aparece no localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(
        operacao,
        fc.emailAddress(),
        senha,
        respostaSucesso,
        fc.boolean(),
        async (op, email, pw, r, comSessaoAnterior) => {
          stub.reset()
          stub.seed(OUTRAS_CHAVES)
          if (comSessaoAnterior) {
            stub.seed({
              [SESSION_KEY]: JSON.stringify({
                token: 'token-anterior-0000',
                expiresAt: new Date(Date.now() + DIA_MS).toISOString(),
                user: { id: 'antigo', name: 'Antigo', email: 'antigo@exemplo.com' },
              }),
            })
          }

          const user = montarUser(r.perfil, r.extras, r.segredos, pw)
          const corpo = Object.assign({}, r.topo, { token: r.token, expiresAt: r.expiresAt, user })
          if (r.senhaNoTopo) corpo.password = pw

          const fetchSimulado = vi.fn(() => Promise.resolve(resposta(r.status, JSON.stringify(corpo))))
          vi.stubGlobal('fetch', fetchSimulado)

          await executar(op, email, pw)

          expect(fetchSimulado).toHaveBeenCalledTimes(1)
          const [url, init] = fetchSimulado.mock.calls[0]
          const caminho = op === 'logIn' ? '/api/v1/auth/login' : '/api/v1/auth/cadastro'
          expect(String(url).endsWith(caminho)).toBe(true)
          // A senha foi de fato enviada ao Backend (só não pode ficar no navegador).
          expect(JSON.parse(init.body).password).toBe(pw)

          esperarSessaoGravada({ token: r.token, expiresAt: r.expiresAt, user })
          esperarSemSenha(pw)
        },
      ),
      { numRuns: 100 },
    )
  }, 30_000)

  it('após qualquer falha de logIn/signUp, choosen.session fica ausente e a senha não aparece no localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(operacao, fc.emailAddress(), senha, falha, async (op, email, pw, resultado) => {
        stub.reset()
        stub.seed(OUTRAS_CHAVES)

        const fetchSimulado = vi.fn(() => responderFalha(resultado))
        vi.stubGlobal('fetch', fetchSimulado)

        // 401/422 resolvem `null`; as demais falhas rejeitam. Aqui só importa o armazenamento.
        await executar(op, email, pw).catch(() => {})

        expect(fetchSimulado).toHaveBeenCalledTimes(1)
        expect(stub.raw(SESSION_KEY)).toBeNull()
        esperarSemSenha(pw)
      }),
      { numRuns: 100 },
    )
  }, 30_000)

  it('restoreSession e atualizarPerfil trocam só o Perfil_Publico, descartando segredos vindos do Backend', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('restoreSession', 'atualizarPerfil'),
        senha,
        token,
        expiraEmFuturo,
        perfilPublico,
        extrasUser,
        segredos,
        async (op, pw, tk, expiresAt, perfil, extras, chavesSecretas) => {
          stub.reset()
          stub.seed(OUTRAS_CHAVES)

          const userInicial = { id: 'u1', name: 'Pessoa Teste', email: 'pessoa@exemplo.com' }
          const userNovo = montarUser(perfil, extras, chavesSecretas, pw)
          const fetchSimulado = vi.fn((url) => {
            if (String(url).endsWith('/auth/login')) {
              return Promise.resolve(resposta(200, JSON.stringify({ token: tk, expiresAt, user: userInicial })))
            }
            return Promise.resolve(resposta(200, JSON.stringify(userNovo)))
          })
          vi.stubGlobal('fetch', fetchSimulado)

          await logIn('pessoa@exemplo.com', pw)
          esperarSessaoGravada({ token: tk, expiresAt, user: userInicial })

          if (op === 'restoreSession') {
            await restoreSession()
          } else {
            await atualizarPerfil({ name: perfil.name, username: perfil.username, description: '', photo: null })
          }

          expect(fetchSimulado).toHaveBeenCalledTimes(2)
          const [url, init] = fetchSimulado.mock.calls[1]
          expect(String(url).endsWith('/api/v1/usuarios/me')).toBe(true)
          expect(init.method).toBe(op === 'restoreSession' ? 'GET' : 'PATCH')

          esperarSessaoGravada({ token: tk, expiresAt, user: userNovo })
          esperarSemSenha(pw)
        },
      ),
      { numRuns: 100 },
    )
  }, 30_000)
})
