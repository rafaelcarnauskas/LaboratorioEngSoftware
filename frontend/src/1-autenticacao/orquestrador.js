// Orquestrador_Acesso (Controller da Parte 1). As telas de acesso e de conta
// falam só com este módulo; ele chama a Comunicacao_Frontend
// (`modelo/comunicacao.js`, que faz o `fetch` e grava a sessão via
// `modelo/session.js`) e traduz as respostas para o que cada tela precisa.
//
// Todas as operações devolvem Promises, exceto `isValidEmail` (síncrona) e
// `onSessionExpired` (devolve a função de cancelamento) (Requisito 12.3).
// Erros de conexão e de servidor sempre chegam às telas como rejeição com
// `ErroConexao`/`ErroServidor`; o texto exibido vem de `mensagemDeErro`.
import {
  ErroConexao,
  ErroConflito,
  ErroRequisicao,
  ErroServidor,
  ErroSessaoInvalida,
  ErroValidacao,
  aoSessaoInvalida,
  alterarSenha,
  atualizarPerfil as atualizarPerfilNoBackend,
  cadastrar,
  confirmarRedefinicao,
  emailEmUso,
  login,
  logout,
  obterPerfil,
  pedirRedefinicao,
} from './modelo/comunicacao.js'
import { getToken, isValidEmail, updateSessionUser } from './modelo/session.js'

export { isValidEmail }

// As telas importam as classes de erro daqui, sem tocar na Comunicacao_Frontend.
export {
  ErroConexao,
  ErroConflito,
  ErroRequisicao,
  ErroServidor,
  ErroSessaoInvalida,
  ErroValidacao,
}

// ---------------------------------------------------------------------------
// Mapa único de mensagens (Requisitos 12.9 e 12.10)
// ---------------------------------------------------------------------------

export const MENSAGEM_ERRO_CONEXAO = 'Não foi possível conectar ao servidor. Tente novamente.'
export const MENSAGEM_ERRO_SERVIDOR = 'O servidor encontrou um problema. Tente novamente em instantes.'
export const MENSAGEM_EMAIL_INVALIDO = 'Enter a valid email address.'

/**
 * Texto para a tela exibir a partir de um erro rejeitado por este módulo.
 * Conexão e servidor usam o mapa acima (nunca detalhes técnicos da resposta);
 * os demais erros usam a mensagem do Backend (`error.message`), ou `padrao`
 * se não houver mensagem.
 */
export function mensagemDeErro(erro, padrao = MENSAGEM_ERRO_SERVIDOR) {
  if (erro instanceof ErroConexao) return MENSAGEM_ERRO_CONEXAO
  if (erro instanceof ErroServidor) return MENSAGEM_ERRO_SERVIDOR
  if (erro instanceof Error && typeof erro.message === 'string' && erro.message !== '') {
    return erro.message
  }
  return padrao
}

/**
 * Mensagem do Backend para um campo de um `ErroValidacao` (422), ou `null`.
 * `campo` é o nome camelCase usado pela API (`name`, `username`, `email`,
 * `description`, `photo`, `password`, `newPassword`...).
 */
export function mensagemDoCampo(erro, campo) {
  if (!(erro instanceof ErroValidacao) || !Array.isArray(erro.fields)) return null
  return erro.fields.find((item) => item.field === campo)?.message ?? null
}

// ---------------------------------------------------------------------------
// Acesso (endpoints públicos)
// ---------------------------------------------------------------------------

/**
 * Login (`entrar(email, senha)` no PDF). Uma chamada a `login` com os valores
 * exatamente como digitados (3.1). Resolve com o Perfil_Publico, já com a
 * sessão salva (3.6, 12.4); resolve `null` quando o Backend recusa as
 * credenciais (401) ou os dados (422), sem salvar nada (3.7). Rejeita com
 * `ErroConexao`/`ErroServidor` (3.10, 12.8, 12.10).
 */
export async function logIn(email, password) {
  try {
    return await login(email, password)
  } catch (erro) {
    if (erro instanceof ErroValidacao) return null
    if (erro instanceof ErroRequisicao && erro.status === 401) return null
    throw erro
  }
}

export { logIn as entrar }

/**
 * Cadastro. Envia só `name`, `email` e `password`, sem a confirmação (4.1).
 * Resolve com o Perfil_Publico (login automático, sessão já salva) (4.6);
 * resolve `null` em 422 (12.4). Rejeita com `ErroConflito` em 409 (e-mail já em
 * uso) e com `ErroConexao`/`ErroServidor`. Em qualquer falha nada é salvo (4.9).
 */
export async function signUp({ name, email, password }) {
  try {
    return await cadastrar({ name, email, password })
  } catch (erro) {
    if (erro instanceof ErroValidacao) return null
    throw erro
  }
}

/**
 * Consulta no Backend se o e-mail já pertence a um Usuario (4.12). Se a
 * consulta falha (rede, servidor ou e-mail recusado), resolve `false`: a
 * decisão final fica com a resposta do cadastro (4.13).
 */
export async function isEmailTaken(email) {
  try {
    return await emailEmUso(email)
  } catch (erro) {
    if (
      erro instanceof ErroConexao ||
      erro instanceof ErroServidor ||
      erro instanceof ErroValidacao ||
      erro instanceof ErroRequisicao
    ) {
      return false
    }
    throw erro
  }
}

/**
 * Pedido de redefinição de senha. E-mail vazio ou inválido → rejeita com
 * `ErroValidacao` sem chamar a rede (5.9). Senão, uma chamada com
 * `email.trim()` (5.1). Resolve sem valor quando o pedido é aceito; rejeita
 * em qualquer falha (rede, servidor, outro status) (5.11).
 */
export async function requestPasswordReset(email) {
  if (typeof email !== 'string' || !isValidEmail(email)) {
    throw new ErroValidacao(MENSAGEM_EMAIL_INVALIDO, [
      { field: 'email', message: MENSAGEM_EMAIL_INVALIDO },
    ])
  }
  await pedirRedefinicao(email.trim())
}

/**
 * Confirmação da redefinição pelo endpoint público, sem `Authorization` (16.5).
 * Resolve:
 * - `'ok'`: senha trocada; a sessão local foi limpa (16.6);
 * - `'token-invalido'`: link desconhecido, usado ou expirado (400
 *   `token_invalido`), ou qualquer outra recusa 400/422 que não seja da senha (16.7);
 * - `'senha-invalida'`: nova senha fora de 8 a 128 caracteres (400 `senha_invalida`).
 * Rejeita com `ErroConexao`/`ErroServidor` (16.9, 16.12).
 */
export async function resetPassword(token, newPassword) {
  try {
    await confirmarRedefinicao(token, newPassword)
    return 'ok'
  } catch (erro) {
    if (erro instanceof ErroRequisicao && erro.status === 400) {
      return erro.code === 'senha_invalida' ? 'senha-invalida' : 'token-invalido'
    }
    if (erro instanceof ErroValidacao) {
      const soSenha =
        mensagemDoCampo(erro, 'newPassword') !== null && mensagemDoCampo(erro, 'token') === null
      return soSenha ? 'senha-invalida' : 'token-invalido'
    }
    throw erro
  }
}

// ---------------------------------------------------------------------------
// Sessão e conta (endpoints protegidos)
// ---------------------------------------------------------------------------

/**
 * Sair. Uma chamada a `logout` por acionamento (9.1). Nunca rejeita: a
 * Comunicacao_Frontend limpa `choosen.session` em qualquer resultado (9.5).
 */
export async function logOut() {
  await logout()
}

/**
 * Confirma a sessão salva no carregamento (10.6). Sem token válido resolve
 * `null` sem requisição; com token chama `GET /usuarios/me` e resolve com o
 * Perfil_Publico (10.7), atualizado também na sessão salva. Em 401 resolve
 * `null` (a sessão já foi limpa). Rejeita com `ErroConexao`/`ErroServidor`,
 * mantendo `choosen.session` (10.8).
 */
export async function restoreSession() {
  if (getToken() === null) return null
  try {
    const perfil = await obterPerfil()
    updateSessionUser(perfil)
    return perfil
  } catch (erro) {
    if (erro instanceof ErroSessaoInvalida) return null
    throw erro
  }
}

/** Perfil do usuário logado (`GET /usuarios/me`) (6.1). */
export async function loadProfile() {
  return obterPerfil()
}

/**
 * `atualizarPerfil(dados)` do PDF. Envia exatamente `name`, `username`,
 * `description` e `photo` (7.1). No sucesso troca o Perfil_Publico da sessão
 * salva (a saudação da Home acompanha o novo nome) e resolve com ele.
 * Rejeita com `ErroValidacao` (422, `fields` por campo), `ErroConflito`
 * (`username_em_uso`), `ErroSessaoInvalida` ou conexão/servidor.
 */
export async function atualizarPerfil({ name, username, description, photo }) {
  const perfil = await atualizarPerfilNoBackend({ name, username, description, photo })
  updateSessionUser(perfil)
  return perfil
}

/**
 * Troca de senha (`PUT /usuarios/me/senha`). Resolve sem valor (204).
 * Senha atual errada → `ErroRequisicao` (400 `senha_atual_incorreta`); nova
 * senha inválida → `ErroRequisicao`/`ErroValidacao`; a sessão é mantida (8.10).
 */
export async function changePassword(currentPassword, newPassword) {
  await alterarSenha(currentPassword, newPassword)
}

/**
 * Registra o aviso global de sessão inválida (10.4, 12.11): chamado no máximo
 * uma vez por sessão quando um Endpoint_Protegido responde 401. Devolve a
 * função que cancela o registro.
 */
export function onSessionExpired(callback) {
  return aoSessaoInvalida(callback)
}
