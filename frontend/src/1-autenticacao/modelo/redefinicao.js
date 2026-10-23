// Leitura da URL de redefinição de senha (Requisitos 16.1 e 16.8).
//
// O link enviado pelo Backend tem a forma `?tela=redefinir-senha&token={token}`.
// `navigation.js` trataria essa `tela` como desconhecida e limparia a URL, então
// o App.jsx chama esta função antes de `parseUrl`.
//
// Módulo puro, sem React e sem acesso a `window`: recebe a query string e
// devolve apenas dados.

export const TELA_REDEFINIR_SENHA = 'redefinir-senha'

// '?tela=redefinir-senha&token=abc' → { token: 'abc' } (já decodificado)
// '?tela=redefinir-senha' ou '?tela=redefinir-senha&token=' → { token: null }
// qualquer outra `tela` (ou nenhuma) → null, deixando a URL para `parseUrl`
export function lerRedefinicaoDaUrl(search) {
  const params = new URLSearchParams(search ?? '')

  if (params.get('tela') !== TELA_REDEFINIR_SENHA) {
    return null
  }

  // URLSearchParams já decodifica o valor (inclusive sequências %XX).
  const token = params.get('token')

  return { token: token === null || token === '' ? null : token }
}

// ---------------------------------------------------------------------------
// Validação local do formulário da Tela_Redefinir_Senha (Requisito 16.4)
// ---------------------------------------------------------------------------

export const TAMANHO_MINIMO_SENHA = 8
export const TAMANHO_MAXIMO_SENHA = 128

export const MENSAGEM_TAMANHO_SENHA = `Password must be between ${TAMANHO_MINIMO_SENHA} and ${TAMANHO_MAXIMO_SENHA} characters.`
export const MENSAGEM_CONFIRMACAO_DIFERENTE = 'Passwords do not match.'

// Devolve só as regras violadas: `{ password?, confirmPassword? }`.
// Objeto vazio → o formulário pode ser enviado (8 ≤ nova.length ≤ 128 e
// confirmação idêntica). As mensagens nunca incluem os valores digitados (16.13).
export function validarRedefinicao(novaSenha, confirmacao) {
  const nova = typeof novaSenha === 'string' ? novaSenha : ''
  const confirma = typeof confirmacao === 'string' ? confirmacao : ''
  const erros = {}

  if (nova.length < TAMANHO_MINIMO_SENHA || nova.length > TAMANHO_MAXIMO_SENHA) {
    erros.password = MENSAGEM_TAMANHO_SENHA
  }
  if (confirma !== nova) {
    erros.confirmPassword = MENSAGEM_CONFIRMACAO_DIFERENTE
  }

  return erros
}
