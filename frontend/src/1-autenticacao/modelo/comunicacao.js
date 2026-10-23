// Comunicacao_Frontend: o único módulo da Parte 1 que chama `fetch`. Faz as
// requisições HTTP ao Backend, guarda a sessão no navegador (via `session.js`)
// e converte cada resposta de erro numa classe de erro própria, que o
// Orquestrador_Acesso traduz em mensagens para as telas.
//
// Toda resposta de erro do Backend vem como `{ error: { code, message, fields? } }`.
import { clearSession, getSession, getToken, saveSession } from './session.js'

const HOST_PADRAO = 'http://localhost:8000'
const PREFIXO_API = '/api/v1'

// URL base do Backend (Requisito 12.1). Desvio consciente do texto do 12.1
// (que põe `/api/v1` no padrão): `VITE_API_URL` é só o HOST do Backend, como
// em `2-comunidades/servico.js`, para que a variável tenha um único
// significado no frontend inteiro (no Render, aponta para o host do Backend).
// Este módulo acrescenta `/api/v1`. Ausente ou vazia → `http://localhost:8000`.
// Lida a cada requisição para que `vi.stubEnv` funcione nos testes mesmo
// depois de o módulo ser importado.
function obterApiUrl() {
  const host = (import.meta.env.VITE_API_URL?.trim() || HOST_PADRAO).replace(/\/+$/, '')
  return `${host}${PREFIXO_API}`
}

export const API_URL = obterApiUrl()
// Prazo para a resposta completa (envio + leitura do corpo) (Requisito 12.8).
export const TEMPO_LIMITE_MS = 10_000

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

// Erro de rede, CORS bloqueado ou tempo limite excedido (12.8).
export class ErroConexao extends Error {
  constructor(message = 'Não foi possível conectar ao servidor.') {
    super(message)
    this.name = 'ErroConexao'
  }
}

// Resposta 5xx (ou resposta de sucesso ilegível) (12.10).
export class ErroServidor extends Error {
  constructor(message = 'O servidor encontrou um problema.', status = 500) {
    super(message)
    this.name = 'ErroServidor'
    this.status = status
  }
}

// 401 de Endpoint_Protegido, ou Endpoint_Protegido chamado sem token válido (10.4, 10.5, 12.11).
export class ErroSessaoInvalida extends Error {
  constructor(message = 'Sessão inválida ou expirada.') {
    super(message)
    this.name = 'ErroSessaoInvalida'
    this.status = 401
    this.code = 'sessao_invalida'
  }
}

// 422: `fields` é o ARRAY do Backend, sem conversão:
// `[{ field: '<nomeCamelCase>', message: '<texto>' }, ...]`, um item por campo
// inválido (`[]` se o corpo não trouxer a lista).
export class ErroValidacao extends Error {
  constructor(message = 'Dados inválidos.', fields = []) {
    super(message)
    this.name = 'ErroValidacao'
    this.status = 422
    this.fields = fields
  }
}

// 409: `code` diz o que já está em uso (`email_em_uso`, `username_em_uso`).
export class ErroConflito extends Error {
  constructor(message = 'Conflito.', code = null) {
    super(message)
    this.name = 'ErroConflito'
    this.status = 409
    this.code = code
  }
}

// Demais 4xx (ex.: 401 do login, 400 da redefinição ou da troca de senha).
export class ErroRequisicao extends Error {
  constructor(message = 'Requisição recusada.', status = 400, code = null) {
    super(message)
    this.name = 'ErroRequisicao'
    this.status = status
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Aviso global de sessão inválida (Requisito 10.4)
// ---------------------------------------------------------------------------

const ouvintesSessaoInvalida = new Set()
// Garante um único aviso por sessão, mesmo com várias requisições pendentes
// recebendo 401 ao mesmo tempo. Só volta a `false` quando uma nova sessão é gravada.
let sessaoExpiradaNotificada = false

// Registra o ouvinte global (App.jsx). Devolve a função que o remove.
export function aoSessaoInvalida(callback) {
  ouvintesSessaoInvalida.add(callback)
  return () => {
    ouvintesSessaoInvalida.delete(callback)
  }
}

function notificarSessaoInvalida() {
  if (sessaoExpiradaNotificada) return
  sessaoExpiradaNotificada = true
  for (const ouvinte of [...ouvintesSessaoInvalida]) {
    try {
      ouvinte()
    } catch {
      // Um ouvinte com erro não impede os demais nem a rejeição da requisição.
    }
  }
}

function gravarNovaSessao({ token, expiresAt, user }) {
  saveSession({ token, expiresAt, user })
  sessaoExpiradaNotificada = false
}

// Limpa a sessão e avisa o ouvinte global. Se, enquanto a requisição estava
// pendente, outra sessão foi gravada (novo login), o 401 da sessão antiga não
// derruba a nova.
function tratarSessaoInvalida(tokenEnviado, avisar) {
  const atual = getSession()
  if (tokenEnviado !== null && atual !== null && atual.token !== tokenEnviado) return
  clearSession()
  if (avisar) notificarSessaoInvalida()
}

// ---------------------------------------------------------------------------
// Requisição base
// ---------------------------------------------------------------------------

function lerJson(texto) {
  if (texto === '') return null
  try {
    return JSON.parse(texto)
  } catch {
    return undefined
  }
}

// Mantém só os itens `{ field, message }` bem formados da lista `fields`.
function lerCampos(fields) {
  if (!Array.isArray(fields)) return []
  return fields
    .filter((item) => item && typeof item.field === 'string' && typeof item.message === 'string')
    .map(({ field, message }) => ({ field, message }))
}

function envelopeDeErro(corpo) {
  const erro = corpo && typeof corpo === 'object' ? corpo.error : null
  if (!erro || typeof erro !== 'object') return { code: null, message: undefined, fields: [] }
  return {
    code: typeof erro.code === 'string' ? erro.code : null,
    message: typeof erro.message === 'string' && erro.message !== '' ? erro.message : undefined,
    fields: lerCampos(erro.fields),
  }
}

/**
 * Faz uma requisição ao Backend.
 *
 * - `autenticado`: Endpoint_Protegido. Sem token válido não envia nada e
 *   trata como sessão inválida; com token envia `Authorization: Bearer <token>`.
 *   Endpoints públicos nunca enviam `Authorization` (16.5).
 * - `avisarSessaoInvalida`: se o 401 dispara o ouvinte global (o logout não dispara).
 *
 * Resolve com o corpo JSON (ou `null` em 204 / corpo vazio).
 */
async function requisitar(
  metodo,
  caminho,
  { corpo, autenticado = false, avisarSessaoInvalida = true } = {},
) {
  const headers = { Accept: 'application/json' }
  let token = null

  if (autenticado) {
    token = getToken()
    if (token === null) {
      tratarSessaoInvalida(null, avisarSessaoInvalida)
      throw new ErroSessaoInvalida()
    }
    headers.Authorization = `Bearer ${token}`
  }

  if (corpo !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const temporizador = setTimeout(() => controller.abort(), TEMPO_LIMITE_MS)

  let resposta
  let texto
  try {
    resposta = await fetch(`${obterApiUrl()}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: controller.signal,
    })
    // A leitura do corpo também fica dentro do prazo de 10 s.
    texto = resposta.status === 204 ? '' : await resposta.text()
  } catch {
    // Rede fora, CORS bloqueado ou `abort()` pelo tempo limite.
    throw new ErroConexao()
  } finally {
    clearTimeout(temporizador)
  }

  const dados = lerJson(texto)
  const { status } = resposta

  if (status >= 200 && status < 300) {
    if (status === 204) return null
    if (dados === undefined) throw new ErroServidor(undefined, status)
    return dados
  }

  if (status >= 500) throw new ErroServidor(undefined, status)

  const { code, message, fields } = envelopeDeErro(dados)

  if (status === 401 && autenticado) {
    tratarSessaoInvalida(token, avisarSessaoInvalida)
    throw new ErroSessaoInvalida(message)
  }
  if (status === 422) throw new ErroValidacao(message, fields)
  if (status === 409) throw new ErroConflito(message, code)
  throw new ErroRequisicao(message, status, code)
}

// Login e cadastro devolvem `{ token, expiresAt, user }`; sem token a resposta
// não serve e nada é gravado.
function gravarRespostaSessao(dados) {
  if (!dados || typeof dados.token !== 'string' || dados.token === '' || dados.expiresAt == null) {
    throw new ErroServidor('Resposta de sessão inválida.')
  }
  gravarNovaSessao(dados)
  return dados.user
}

// ---------------------------------------------------------------------------
// Operações públicas (sem `Authorization`)
// ---------------------------------------------------------------------------

// `POST /auth/login`. Grava a sessão antes de resolver com o Perfil_Publico (3.5).
export async function login(email, password) {
  const dados = await requisitar('POST', '/auth/login', { corpo: { email, password } })
  return gravarRespostaSessao(dados)
}

// `POST /auth/cadastro`. Só nome, e-mail e senha; grava a sessão antes de
// resolver com o Perfil_Publico (4.6).
export async function cadastrar({ name, email, password }) {
  const dados = await requisitar('POST', '/auth/cadastro', { corpo: { name, email, password } })
  return gravarRespostaSessao(dados)
}

// `GET /auth/email-em-uso?email=`. Resolve `true` ou `false`.
export async function emailEmUso(email) {
  const dados = await requisitar('GET', `/auth/email-em-uso?email=${encodeURIComponent(email)}`)
  return Boolean(dados?.inUse)
}

// `POST /auth/redefinicao-senha` (202). Resolve com `{ message }`.
export async function pedirRedefinicao(email) {
  return requisitar('POST', '/auth/redefinicao-senha', { corpo: { email } })
}

// `POST /auth/redefinicao-senha/confirmacao` (204). O Backend revoga todas as
// Sessoes do Usuario, então a sessão local também é limpa (16.6).
export async function confirmarRedefinicao(token, newPassword) {
  await requisitar('POST', '/auth/redefinicao-senha/confirmacao', {
    corpo: { token, newPassword },
  })
  clearSession()
}

// ---------------------------------------------------------------------------
// Operações protegidas (`Authorization: Bearer <token>`)
// ---------------------------------------------------------------------------

// `POST /auth/logout`. Só envia se há token; em qualquer resultado limpa a
// sessão e nunca rejeita (9.2, 9.5, 9.10). O 401 aqui não dispara o aviso
// global: o próprio fluxo de logout já leva à Tela_Login.
export async function logout() {
  try {
    if (getToken() === null) return
    await requisitar('POST', '/auth/logout', { autenticado: true, avisarSessaoInvalida: false })
  } catch {
    // Logout local acontece mesmo com erro de rede ou resposta inesperada.
  } finally {
    clearSession()
  }
}

// `GET /usuarios/me`. Resolve com o Perfil_Publico.
export async function obterPerfil() {
  return requisitar('GET', '/usuarios/me', { autenticado: true })
}

// `PATCH /usuarios/me` com os quatro campos editáveis. Resolve com o Perfil_Publico gravado.
export async function atualizarPerfil({ name, username, description, photo }) {
  return requisitar('PATCH', '/usuarios/me', {
    autenticado: true,
    corpo: { name, username, description, photo },
  })
}

// `PUT /usuarios/me/senha` (204). Senha atual errada chega como `ErroRequisicao`
// (400 `senha_atual_incorreta`), não como sessão inválida.
export async function alterarSenha(currentPassword, newPassword) {
  await requisitar('PUT', '/usuarios/me/senha', {
    autenticado: true,
    corpo: { currentPassword, newPassword },
  })
}
