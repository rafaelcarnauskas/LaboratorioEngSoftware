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

export function authenticate(email, password) {
  const isValid = email.trim().toLowerCase() === demoUser.email && password === demoUser.password
  return isValid ? { email: demoUser.email, name: demoUser.name } : null
}
