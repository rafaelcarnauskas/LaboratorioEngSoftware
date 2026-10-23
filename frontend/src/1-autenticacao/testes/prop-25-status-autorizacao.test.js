// Teste de propriedade do mapeamento de status e do cabeçalho de autorização (Property 25).
//
// Feature: autenticacao-conta, Property 25: Mapeamento de status e cabeçalho de autorização no frontend
// **Validates: Requisitos 9.2, 12.2, 16.5, 12.4, 12.10**
//
// Cada execução escolhe uma operação do Orquestrador_Acesso e uma resposta do
// Backend (status HTTP 2xx/4xx/5xx com corpo variado, falha de rede ou falha
// ao ler o corpo). O resultado esperado vem de uma tabela-oráculo própria
// deste arquivo (`TABELA`), escrita a partir dos requisitos, e não do código
// de produção.
//
// `fetch` é simulado com `vi.fn()` (via `vi.stubGlobal`) e o `localStorage` é o
// stub em memória. Como em `prop-26-sessao-invalida.test.js`, toda execução
// começa com um login simulado: a sessão é gravada pelo caminho real e a flag
// de aviso único de sessão inválida volta a `false`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import {
  ErroConexao,
  ErroConflito,
  ErroRequisicao,
  ErroServidor,
  ErroSessaoInvalida,
  ErroValidacao,
  MENSAGEM_ERRO_CONEXAO,
  MENSAGEM_ERRO_SERVIDOR,
  atualizarPerfil,
  changePassword,
  isEmailTaken,
  loadProfile,
  logIn,
  logOut,
  mensagemDeErro,
  onSessionExpired,
  requestPasswordReset,
  resetPassword,
  restoreSession,
  signUp,
} from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const DIA_MS = 24 * 60 * 60 * 1000
// Host com `/` final: a URL base deve ser o host sem a barra + `/api/v1` (12.1).
const HOST = 'https://api.choosen.teste/'
const BASE = 'https://api.choosen.teste/api/v1'

let stub = null
let restoreStorage = () => {}
let ouvinte = null
let removerOuvinte = () => {}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', HOST)
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
  ouvinte = vi.fn()
  removerOuvinte = onSessionExpired(ouvinte)
})

afterEach(() => {
  removerOuvinte()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  restoreStorage()
})

// ---------------------------------------------------------------------------
// Operações: requisição esperada e corpo de sucesso de cada uma
// ---------------------------------------------------------------------------

const PERFIL_EDITADO = { name: 'Nome Editado', username: 'nome.editado', description: 'bio', photo: '' }

const OPERACOES = {
  logIn: {
    protegida: false,
    metodo: 'POST',
    caminho: '/auth/login',
    chamar: () => logIn('pessoa@exemplo.com', 'senha-forte-123'),
  },
  signUp: {
    protegida: false,
    metodo: 'POST',
    caminho: '/auth/cadastro',
    chamar: () => signUp({ name: 'Pessoa', email: 'nova@exemplo.com', password: 'senha-forte-123' }),
  },
  isEmailTaken: {
    protegida: false,
    metodo: 'GET',
    caminho: '/auth/email-em-uso?email=alguem%40exemplo.com',
    chamar: () => isEmailTaken('alguem@exemplo.com'),
  },
  requestPasswordReset: {
    protegida: false,
    metodo: 'POST',
    caminho: '/auth/redefinicao-senha',
    chamar: () => requestPasswordReset('alguem@exemplo.com'),
  },
  resetPassword: {
    protegida: false,
    metodo: 'POST',
    caminho: '/auth/redefinicao-senha/confirmacao',
    chamar: () => resetPassword('token-de-redefinicao', 'senha-nova-123'),
  },
  logOut: {
    protegida: true,
    metodo: 'POST',
    caminho: '/auth/logout',
    chamar: () => logOut(),
  },
  restoreSession: {
    protegida: true,
    metodo: 'GET',
    caminho: '/usuarios/me',
    chamar: () => restoreSession(),
  },
  loadProfile: {
    protegida: true,
    metodo: 'GET',
    caminho: '/usuarios/me',
    chamar: () => loadProfile(),
  },
  atualizarPerfil: {
    protegida: true,
    metodo: 'PATCH',
    caminho: '/usuarios/me',
    chamar: () => atualizarPerfil(PERFIL_EDITADO),
  },
  changePassword: {
    protegida: true,
    metodo: 'PUT',
    caminho: '/usuarios/me/senha',
    chamar: () => changePassword('senha-atual-123', 'senha-nova-456'),
  },
}

const NOMES = Object.keys(OPERACOES)

// ---------------------------------------------------------------------------
// Oráculo
// ---------------------------------------------------------------------------

// Resultados esperados.
const resolve = (valor) => ({ resolve: valor })
const rejeita = (classe, props = {}) => ({ rejeita: classe, props })

// Classe da resposta do ponto de vista da Comunicacao_Frontend (12.10, 12.2).
// `dados` é o corpo de sucesso já interpretado (`null` em 204 ou corpo vazio).
function classificar(resp) {
  if (resp.tipo !== 'http') return { classe: 'conexao' }
  const { status, corpo } = resp
  if (status >= 200 && status <= 299) {
    if (status === 204 || corpo.tipo === 'vazio') return { classe: 'sucesso', dados: null }
    if (corpo.tipo === 'invalido') return { classe: 'servidor' }
    return { classe: 'sucesso', dados: corpo.valor }
  }
  if (status >= 500) return { classe: 'servidor' }
  const envelope = corpo.tipo === 'envelope' ? corpo : { code: null, fields: [] }
  const base = { status, code: envelope.code, fields: envelope.fields }
  if (status === 401) return { classe: '401', ...base }
  if (status === 422) return { classe: '422', ...base }
  if (status === 409) return { classe: '409', ...base }
  if (status === 400) return { classe: '400', ...base }
  return { classe: '4xx', ...base }
}

// Erro que a Comunicacao_Frontend rejeita para cada classe, sem tradução do Orquestrador.
function erroPadrao(op, c) {
  switch (c.classe) {
    case 'conexao':
      return rejeita(ErroConexao)
    case 'servidor':
      return rejeita(ErroServidor)
    case '401':
      return OPERACOES[op].protegida
        ? rejeita(ErroSessaoInvalida)
        : rejeita(ErroRequisicao, { status: 401, code: c.code })
    case '422':
      return rejeita(ErroValidacao, { fields: c.fields })
    case '409':
      return rejeita(ErroConflito, { code: c.code })
    default:
      return rejeita(ErroRequisicao, { status: c.status, code: c.code })
  }
}

const temCampo = (fields, nome) => fields.some((item) => item.field === nome)

// Login/cadastro só resolvem com o Perfil_Publico se a resposta traz a sessão.
function perfilDaSessao(dados) {
  return dados && typeof dados.token === 'string' && dados.token !== '' && dados.expiresAt != null
    ? resolve(dados.user)
    : rejeita(ErroServidor)
}

// Tabela-oráculo: para cada operação, o resultado por classe de resposta.
// Classes ausentes caem em `erroPadrao`.
const TABELA = {
  logIn: {
    sucesso: (c) => perfilDaSessao(c.dados),
    401: () => resolve(null),
    422: () => resolve(null),
  },
  signUp: {
    sucesso: (c) => perfilDaSessao(c.dados),
    422: () => resolve(null),
  },
  // Falha da consulta (rede, servidor, e-mail recusado) não marca o e-mail como
  // em uso (4.13). O 409 não é resposta do `GET /auth/email-em-uso` e não tem
  // regra nos requisitos: fica com o erro padrão (`ErroConflito`).
  isEmailTaken: {
    sucesso: (c) => resolve(c.dados?.inUse === true),
    conexao: () => resolve(false),
    servidor: () => resolve(false),
    401: () => resolve(false),
    422: () => resolve(false),
    400: () => resolve(false),
    '4xx': () => resolve(false),
  },
  requestPasswordReset: {
    sucesso: () => resolve(undefined),
  },
  resetPassword: {
    sucesso: () => resolve('ok'),
    400: (c) => resolve(c.code === 'senha_invalida' ? 'senha-invalida' : 'token-invalido'),
    422: (c) =>
      resolve(temCampo(c.fields, 'newPassword') && !temCampo(c.fields, 'token') ? 'senha-invalida' : 'token-invalido'),
  },
  logOut: {
    sucesso: () => resolve(undefined),
    conexao: () => resolve(undefined),
    servidor: () => resolve(undefined),
    401: () => resolve(undefined),
    422: () => resolve(undefined),
    409: () => resolve(undefined),
    400: () => resolve(undefined),
    '4xx': () => resolve(undefined),
  },
  restoreSession: {
    sucesso: (c) => resolve(c.dados),
    401: () => resolve(null),
  },
  loadProfile: {
    sucesso: (c) => resolve(c.dados),
  },
  atualizarPerfil: {
    sucesso: (c) => resolve(c.dados),
  },
  changePassword: {
    sucesso: () => resolve(undefined),
  },
}

function esperado(op, resp) {
  const c = classificar(resp)
  const linha = TABELA[op][c.classe]
  return linha ? linha(c) : erroPadrao(op, c)
}

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

const token = fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/)

const perfil = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }),
  username: fc.stringMatching(/^[A-Za-z0-9._]{1,30}$/),
  email: fc.constantFrom('pessoa@exemplo.com', 'outra@exemplo.com'),
  description: fc.string({ maxLength: 160 }),
  photo: fc.constantFrom('', 'data:image/png;base64,AAAA'),
  isCommunityAdmin: fc.boolean(),
  isSystemAdmin: fc.boolean(),
  createdAt: fc.constant('2024-01-01T00:00:00Z'),
  updatedAt: fc.constant('2024-01-02T00:00:00Z'),
})

const respostaSessao = fc.record({
  token,
  expiresAt: fc.constant(new Date(Date.now() + DIA_MS).toISOString()),
  user: perfil,
})

// Corpo JSON de sucesso coerente com a operação.
function corpoSucesso(op) {
  if (op === 'logIn' || op === 'signUp') return respostaSessao
  if (op === 'isEmailTaken') return fc.record({ inUse: fc.boolean() })
  if (op === 'requestPasswordReset') return fc.record({ message: fc.string() })
  if (op === 'restoreSession' || op === 'loadProfile' || op === 'atualizarPerfil') return perfil
  return fc.jsonValue().filter((v) => v !== null && typeof v === 'object')
}

const ilegivel = fc.constantFrom('{', 'nao-e-json', '<html>erro</html>', '{"error":')

const campoInvalido = fc.record({
  field: fc.constantFrom('newPassword', 'token', 'email', 'name', 'password', 'username'),
  message: fc.string({ minLength: 1 }),
})

// Corpo de erro: envelope do Backend, vazio, ilegível ou JSON sem envelope.
const corpoErro = fc.oneof(
  fc.record({
    tipo: fc.constant('envelope'),
    code: fc.option(
      fc.constantFrom(
        'senha_invalida',
        'token_invalido',
        'email_em_uso',
        'username_em_uso',
        'credenciais_invalidas',
        'senha_atual_incorreta',
        'sessao_invalida',
        'qualquer',
      ),
      { nil: null },
    ),
    message: fc.string(),
    fields: fc.array(campoInvalido, { maxLength: 3 }),
  }),
  fc.constant({ tipo: 'vazio' }),
  ilegivel.map((texto) => ({ tipo: 'invalido', texto })),
  fc.constant({ tipo: 'semEnvelope', valor: { detail: 'Not Found' } }),
)

const statusSucesso = fc.oneof(fc.constantFrom(200, 201, 202, 204), fc.integer({ min: 200, max: 299 }))
const statusErro = fc.oneof(
  fc.constantFrom(400, 401, 403, 404, 409, 422, 429, 500, 502, 503),
  fc.integer({ min: 400, max: 599 }),
)

function resposta(op) {
  const sucesso = fc.record({
    tipo: fc.constant('http'),
    status: statusSucesso,
    corpo: fc.oneof(
      { weight: 4, arbitrary: corpoSucesso(op).map((valor) => ({ tipo: 'json', valor })) },
      { weight: 1, arbitrary: fc.constant({ tipo: 'vazio' }) },
      { weight: 1, arbitrary: ilegivel.map((texto) => ({ tipo: 'invalido', texto })) },
    ),
  })
  const erro = fc.record({ tipo: fc.constant('http'), status: statusErro, corpo: corpoErro })
  return fc.oneof(
    { weight: 2, arbitrary: sucesso },
    { weight: 4, arbitrary: erro },
    { weight: 1, arbitrary: fc.constantFrom({ tipo: 'rede' }, { tipo: 'leitura' }) },
  )
}

// (operação, resposta, token da sessão, se há sessão salva). Operações
// protegidas sempre têm sessão; públicas, com ou sem.
const caso = fc
  .constantFrom(...NOMES)
  .chain((op) =>
    fc.record({
      op: fc.constant(op),
      resp: resposta(op),
      tk: token,
      comSessao: OPERACOES[op].protegida ? fc.constant(true) : fc.boolean(),
    }),
  )

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function textoDoCorpo(corpo) {
  if (corpo.tipo === 'vazio') return ''
  if (corpo.tipo === 'invalido') return corpo.texto
  if (corpo.tipo === 'envelope') {
    return JSON.stringify({ error: { code: corpo.code ?? undefined, message: corpo.message, fields: corpo.fields } })
  }
  return JSON.stringify(corpo.valor)
}

function responder(resp) {
  if (resp.tipo === 'rede') return Promise.reject(new TypeError('Failed to fetch'))
  if (resp.tipo === 'leitura') {
    return Promise.resolve({ status: 200, text: () => Promise.reject(new TypeError('body stream')) })
  }
  const texto = textoDoCorpo(resp.corpo)
  return Promise.resolve({ status: resp.status, text: async () => texto })
}

function temAuthorization(headers) {
  return Object.keys(headers ?? {}).some((chave) => chave.toLowerCase() === 'authorization')
}

// Grava uma sessão nova pelo login real (zera o aviso único), aplica o estado
// pedido, executa a operação e devolve o resultado e a única requisição feita.
async function executar({ op, resp, tk, comSessao }) {
  stub.reset()
  const sessao = {
    token: tk,
    expiresAt: new Date(Date.now() + DIA_MS).toISOString(),
    user: { id: 'u1', name: 'Pessoa Teste', email: 'pessoa@exemplo.com' },
  }
  const fetchSimulado = vi.fn(() => Promise.resolve({ status: 200, text: async () => JSON.stringify(sessao) }))
  vi.stubGlobal('fetch', fetchSimulado)
  await logIn('pessoa@exemplo.com', 'senha-forte-123')
  expect(JSON.parse(stub.raw(SESSION_KEY)).token).toBe(tk)
  if (!comSessao) stub.reset()

  fetchSimulado.mockReset()
  fetchSimulado.mockImplementation(() => responder(resp))
  ouvinte.mockClear()

  let resultado
  try {
    resultado = { resolve: await OPERACOES[op].chamar() }
  } catch (erro) {
    resultado = { erro }
  }

  expect(fetchSimulado).toHaveBeenCalledTimes(1)
  const [url, init] = fetchSimulado.mock.calls[0]
  return { resultado, url: String(url), init }
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('Property 25: mapeamento de status e cabeçalho de autorização no frontend', () => {
  it('operações protegidas levam Authorization: Bearer <token>; públicas nunca levam Authorization, com ou sem sessão', async () => {
    await fc.assert(
      fc.asyncProperty(caso, async (c) => {
        const { url, init } = await executar(c)
        const { protegida, metodo, caminho } = OPERACOES[c.op]

        expect(url).toBe(`${BASE}${caminho}`)
        expect(init.method).toBe(metodo)
        if (protegida) {
          expect(init.headers.Authorization).toBe(`Bearer ${c.tk}`)
        } else {
          expect(temAuthorization(init.headers)).toBe(false)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('cada (operação, resposta) resolve ou rejeita como a tabela-oráculo; 5xx e falhas de rede viram mensagens fixas', async () => {
    await fc.assert(
      fc.asyncProperty(caso, async (c) => {
        const { resultado } = await executar(c)
        const alvo = esperado(c.op, c.resp)

        if ('resolve' in alvo) {
          expect(resultado.erro).toBeUndefined()
          expect(resultado.resolve).toEqual(alvo.resolve)
        } else {
          expect(resultado.erro).toBeInstanceOf(alvo.rejeita)
          for (const [chave, valor] of Object.entries(alvo.props)) {
            expect(resultado.erro[chave]).toEqual(valor)
          }
          // Conexão e servidor sempre viram o texto fixo, sem detalhes técnicos (12.10).
          if (alvo.rejeita === ErroServidor) {
            expect(mensagemDeErro(resultado.erro)).toBe(MENSAGEM_ERRO_SERVIDOR)
          }
          if (alvo.rejeita === ErroConexao) {
            expect(mensagemDeErro(resultado.erro)).toBe(MENSAGEM_ERRO_CONEXAO)
          }
        }

        // 401 de Endpoint_Protegido (exceto logout) limpa a sessão e avisa uma vez;
        // 401 de endpoint público não é sessão inválida.
        const sessaoInvalida = OPERACOES[c.op].protegida && c.op !== 'logOut' && classificar(c.resp).classe === '401'
        if (sessaoInvalida) {
          expect(stub.raw(SESSION_KEY)).toBeNull()
          expect(ouvinte).toHaveBeenCalledTimes(1)
        } else {
          expect(ouvinte).not.toHaveBeenCalled()
        }
        if (c.op === 'logOut') expect(stub.raw(SESSION_KEY)).toBeNull()
      }),
      { numRuns: 300 },
    )
  })
})
