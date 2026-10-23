// Sessão no navegador (parte da Comunicacao_Frontend). Em `choosen.session` fica
// somente o Token_Sessao, a data de expiração e o Perfil_Publico devolvido pelo
// Backend: nenhuma senha passa por aqui (Requisitos 12.5 e 12.6). A autenticação
// em si é feita pelo Backend; este módulo só guarda, lê e limpa a sessão.
const SESSION_KEY = 'choosen.session'
// Chave do mock antigo (contas com senha em texto puro). Só é lida para ser apagada.
const LEGACY_ACCOUNTS_KEY = 'choosen.accounts'

// Campos do Perfil_Publico (formato camelCase da API). `saveSession` e
// `updateSessionUser` descartam qualquer outro campo, inclusive senhas.
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(email.trim())
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toPerfilPublico(user) {
  const perfil = {}
  if (!isPlainObject(user)) return perfil
  for (const field of PERFIL_PUBLICO_FIELDS) {
    if (Object.hasOwn(user, field)) perfil[field] = user[field]
  }
  return perfil
}

// `expiresAt` vem da API como data ISO 8601; números (ms) também são aceitos.
// Data ilegível conta como expirada.
function expiresAtMs(expiresAt) {
  if (typeof expiresAt === 'number') return expiresAt
  if (typeof expiresAt === 'string') return Date.parse(expiresAt)
  return Number.NaN
}

function hasTokenAndExpiry(value) {
  return (
    isPlainObject(value) &&
    typeof value.token === 'string' &&
    value.token !== '' &&
    value.expiresAt !== undefined &&
    value.expiresAt !== null
  )
}

function isExpired(session, agora) {
  const expiry = expiresAtMs(session.expiresAt)
  return !(expiry > agora)
}

function readRaw() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    // `localStorage` indisponível: tratado como sem sessão.
    return null
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Sem acesso ao localStorage (ex.: janela anônima restrita): o login vale só nesta aba.
  }
}

// `{ token, expiresAt, user }` salvo, ou `null` se não há sessão com token e
// expiração. A validade no tempo é conferida por `getToken`.
export function getSession() {
  const saved = readRaw()
  if (saved === null) return null
  try {
    const session = JSON.parse(saved)
    if (!hasTokenAndExpiry(session)) return null
    return { token: session.token, expiresAt: session.expiresAt, user: toPerfilPublico(session.user) }
  } catch {
    return null
  }
}

// Token salvo se a expiração é posterior a `agora`; senão `null`.
export function getToken(agora = Date.now()) {
  const session = getSession()
  if (!session || isExpired(session, agora)) return null
  return session.token
}

// Grava exatamente `token`, `expiresAt` e `user`, com `user` reduzido ao Perfil_Publico.
export function saveSession({ token, expiresAt, user }) {
  writeSession({ token, expiresAt, user: toPerfilPublico(user) })
}

// Troca só o Perfil_Publico da sessão salva (ex.: depois de editar o perfil).
export function updateSessionUser(user) {
  const session = getSession()
  if (!session) return
  writeSession({ token: session.token, expiresAt: session.expiresAt, user: toPerfilPublico(user) })
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nada a limpar.
  }
}

// Chamada no carregamento, antes de qualquer requisição (Requisito 12.7): apaga
// `choosen.accounts` (qualquer valor) e apaga `choosen.session` quando o JSON é
// inválido, falta `token` ou `expiresAt`, ou a expiração já passou.
export function limparArmazenamentoLegado(agora = Date.now()) {
  try {
    localStorage.removeItem(LEGACY_ACCOUNTS_KEY)
  } catch {
    // `localStorage` indisponível: não há o que limpar.
    return
  }

  const saved = readRaw()
  if (saved === null) return

  let session
  try {
    session = JSON.parse(saved)
  } catch {
    clearSession()
    return
  }

  if (!hasTokenAndExpiry(session) || isExpired(session, agora)) clearSession()
}
