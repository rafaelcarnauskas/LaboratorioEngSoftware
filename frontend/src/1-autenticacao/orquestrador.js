// Controller de acesso. Login, Cadastro e Esqueci a senha falam só com este
// módulo; ele encaminha para o Model de sessão (modelo/session.js). Quando houver
// backend, só este arquivo e o Model mudam: as telas continuam iguais.
import { authenticate, createAccount, emailExists, isValidEmail, saveSession } from './modelo/session'

export { isValidEmail }

// Devolve o usuário logado (sessão já salva), ou `null` se e-mail/senha não conferem.
export function logIn(email, password) {
  const user = authenticate(email, password)
  if (user) saveSession(user)
  return user
}

export function isEmailTaken(email) {
  return emailExists(email)
}

// Devolve o usuário criado (sessão já salva), ou `null` se não foi possível salvar.
export function signUp(form) {
  const user = createAccount(form)
  if (user) saveSession(user)
  return user
}

// Sem backend não há envio de e-mail: o pedido é só aceito. A resposta é a mesma
// exista ou não a conta, para a tela não revelar quais e-mails estão cadastrados.
export function requestPasswordReset(email) {
  return isValidEmail(email)
}
