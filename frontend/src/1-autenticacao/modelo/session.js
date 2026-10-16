// Sessão de demonstração: o login fica salvo no navegador (localStorage) para
// que a tela de login só apareça na primeira vez, até o usuário sair (Sign Out).
// Quando houver backend, estas funções passam a falar com a API de autenticação.
const SESSION_KEY = 'choosen.session'

// Usuário de teste enquanto não há backend.
export const demoUser = {
  email: 'victor@email.com',
  password: 'choosen123',
  name: 'Victor Mendes',
}

export function getSession() {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export function saveSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  } catch {
    // Sem acesso ao localStorage (ex.: janela anônima restrita): o login vale só nesta aba.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nada a limpar.
  }
}

// Contas criadas na tela de cadastro. Sem backend, ficam no navegador — e a senha
// fica em texto puro, o que só é aceitável em demonstração. Quando a API existir,
// `createAccount` e `authenticate` passam a chamar o backend e esta lista some.
const ACCOUNTS_KEY = 'choosen.accounts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(email.trim())
}

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function getAccounts() {
  try {
    const saved = localStorage.getItem(ACCOUNTS_KEY)
    const accounts = saved ? JSON.parse(saved) : []
    return Array.isArray(accounts) ? accounts : []
  } catch {
    return []
  }
}

export function emailExists(email) {
  const normalized = normalizeEmail(email)
  return normalized === demoUser.email || getAccounts().some((account) => account.email === normalized)
}

// Devolve o usuário criado, ou `null` se não foi possível salvar a conta.
export function createAccount({ name, email, password }) {
  const account = { name: name.trim(), email: normalizeEmail(email), password }
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...getAccounts(), account]))
  } catch {
    return null
  }
  return { email: account.email, name: account.name }
}

export function authenticate(email, password) {
  const normalized = normalizeEmail(email)
  const account = [demoUser, ...getAccounts()].find((candidate) => candidate.email === normalized)
  return account && account.password === password ? { email: account.email, name: account.name } : null
}
