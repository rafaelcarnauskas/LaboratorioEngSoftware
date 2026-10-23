// Testes de exemplo do Orquestrador_Acesso (orquestrador.js).
// O repasse de dados, o conteúdo de `choosen.session` e o mapeamento de status
// em geral ficam nas Properties 23, 24 e 25; aqui ficam os exemplos concretos:
// exports e tipos de retorno (12.3), `isEmailTaken` com falha (4.13),
// restauração da sessão (10.6–10.8), aviso único de sessão expirada,
// `atualizarPerfil` atualizando a sessão salva e a varredura do 12.6.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { cwd } from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as comunicacao from '../modelo/comunicacao'
import * as orquestrador from '../orquestrador'
import {
  atualizarPerfil,
  changePassword,
  entrar,
  ErroConexao,
  ErroConflito,
  ErroRequisicao,
  ErroServidor,
  ErroSessaoInvalida,
  ErroValidacao,
  isEmailTaken,
  isValidEmail,
  loadProfile,
  logIn,
  logOut,
  MENSAGEM_EMAIL_INVALIDO,
  MENSAGEM_ERRO_CONEXAO,
  MENSAGEM_ERRO_SERVIDOR,
  mensagemDeErro,
  mensagemDoCampo,
  onSessionExpired,
  requestPasswordReset,
  resetPassword,
  restoreSession,
  signUp,
} from '../orquestrador'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const SESSION_KEY = 'choosen.session'
const ACCOUNTS_KEY = 'choosen.accounts'
const API = 'http://localhost:8000/api/v1'
const FUTURO = '2999-01-01T00:00:00Z'

const perfil = {
  id: 'u1',
  name: 'Victor Mendes',
  username: 'victor',
  email: 'victor@email.com',
  description: '',
  photo: '',
  isCommunityAdmin: false,
  isSystemAdmin: false,
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
}

function respostaJson(status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function respostaVazia(status) {
  return new Response(null, { status })
}

function respostaErro(status, code, message = 'Erro.', fields) {
  return respostaJson(status, { error: { code, message, ...(fields ? { fields } : {}) } })
}

function sessaoSalva() {
  const raw = stub.raw(SESSION_KEY)
  return raw === null ? null : JSON.parse(raw)
}

let stub = null
let restoreStorage = () => {}
let fetchMock = null

// Grava a sessão pelo caminho real (`logIn`), o que também zera a flag do
// aviso único de sessão expirada na Comunicacao_Frontend.
async function iniciarSessao(token = 'tok') {
  fetchMock.mockResolvedValueOnce(respostaJson(200, { token, expiresAt: FUTURO, user: perfil }))
  await logIn(perfil.email, 'choosen123')
  fetchMock.mockClear()
}

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  restoreStorage()
})

describe('exports e tipos de retorno (Requisito 12.3)', () => {
  it('exporta as operações usadas pelas telas, com `entrar` como alias de `logIn`', () => {
    for (const nome of [
      'isValidEmail',
      'logIn',
      'entrar',
      'signUp',
      'isEmailTaken',
      'requestPasswordReset',
      'resetPassword',
      'logOut',
      'restoreSession',
      'loadProfile',
      'atualizarPerfil',
      'changePassword',
      'onSessionExpired',
      'mensagemDeErro',
      'mensagemDoCampo',
    ]) {
      expect(typeof orquestrador[nome], nome).toBe('function')
    }
    expect(entrar).toBe(logIn)
  })

  it('reexporta as mesmas classes de erro da Comunicacao_Frontend', () => {
    for (const nome of [
      'ErroConexao',
      'ErroConflito',
      'ErroRequisicao',
      'ErroServidor',
      'ErroSessaoInvalida',
      'ErroValidacao',
    ]) {
      expect(orquestrador[nome], nome).toBe(comunicacao[nome])
    }
  })

  it('não expõe o mock antigo de contas', () => {
    expect(orquestrador).not.toHaveProperty('demoUser')
    expect(orquestrador).not.toHaveProperty('createAccount')
    expect(orquestrador).not.toHaveProperty('authenticate')
  })

  it('isValidEmail devolve booleano de forma síncrona', () => {
    expect(isValidEmail('victor@email.com')).toBe(true)
    expect(isValidEmail('  victor@email.com  ')).toBe(true)
    expect(isValidEmail('victor@email')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('as demais operações devolvem Promises', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const chamadas = {
      logIn: () => logIn('victor@email.com', 'choosen123'),
      signUp: () => signUp({ name: 'Victor', email: 'victor@email.com', password: 'choosen123' }),
      isEmailTaken: () => isEmailTaken('victor@email.com'),
      requestPasswordReset: () => requestPasswordReset('victor@email.com'),
      resetPassword: () => resetPassword('t', 'novaSenha123'),
      logOut: () => logOut(),
      restoreSession: () => restoreSession(),
      loadProfile: () => loadProfile(),
      atualizarPerfil: () => atualizarPerfil({ name: 'V', username: 'v', description: '', photo: '' }),
      changePassword: () => changePassword('choosen123', 'novaSenha123'),
    }

    for (const [nome, chamar] of Object.entries(chamadas)) {
      const resultado = chamar()
      expect(resultado, nome).toBeInstanceOf(Promise)
      await resultado.catch(() => {})
    }
  })

  it('onSessionExpired devolve a função de cancelamento', () => {
    const cancelar = onSessionExpired(() => {})
    expect(typeof cancelar).toBe('function')
    cancelar()
  })
})

describe('logIn e signUp', () => {
  it('logIn com sucesso resolve o Perfil_Publico com email e name e salva a sessão', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson(200, { token: 'tok', expiresAt: FUTURO, user: perfil }))

    const resultado = await logIn('victor@email.com', 'choosen123')

    expect(resultado).toMatchObject({ email: perfil.email, name: perfil.name })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/auth/login`)
    expect(sessaoSalva()).toEqual({ token: 'tok', expiresAt: FUTURO, user: perfil })
  })

  it.each([
    ['401', () => respostaErro(401, 'credenciais_invalidas', 'Incorrect email or password.')],
    ['422', () => respostaErro(422, 'dados_invalidos', 'Dados inválidos.', [])],
  ])('logIn com %s resolve null e não salva nada', async (_caso, resposta) => {
    fetchMock.mockResolvedValueOnce(resposta())

    await expect(logIn('victor@email.com', 'errada123')).resolves.toBeNull()
    expect(stub.snapshot()).toEqual({})
  })

  it('logIn com falha de rede rejeita com ErroConexao (mensagem do mapa)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const erro = await logIn('victor@email.com', 'choosen123').catch((e) => e)

    expect(erro).toBeInstanceOf(ErroConexao)
    expect(mensagemDeErro(erro)).toBe(MENSAGEM_ERRO_CONEXAO)
    expect(stub.snapshot()).toEqual({})
  })

  it('logIn com 500 rejeita com ErroServidor sem expor detalhes', async () => {
    fetchMock.mockResolvedValueOnce(respostaErro(500, 'erro_interno', 'Traceback: segredo'))

    const erro = await logIn('victor@email.com', 'choosen123').catch((e) => e)

    expect(erro).toBeInstanceOf(ErroServidor)
    expect(mensagemDeErro(erro)).toBe(MENSAGEM_ERRO_SERVIDOR)
  })

  it('signUp com 409 rejeita com ErroConflito e não salva nada', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaErro(409, 'email_em_uso', 'An account with this email already exists.'),
    )

    const erro = await signUp({ name: 'Victor', email: 'victor@email.com', password: 'choosen123' }).catch(
      (e) => e,
    )

    expect(erro).toBeInstanceOf(ErroConflito)
    expect(erro.code).toBe('email_em_uso')
    expect(mensagemDeErro(erro)).toBe('An account with this email already exists.')
    expect(stub.snapshot()).toEqual({})
  })

  it('signUp com 422 resolve null', async () => {
    fetchMock.mockResolvedValueOnce(respostaErro(422, 'dados_invalidos', 'Dados inválidos.', []))

    await expect(
      signUp({ name: 'Victor', email: 'victor@email.com', password: 'curta' }),
    ).resolves.toBeNull()
    expect(stub.snapshot()).toEqual({})
  })
})

describe('isEmailTaken (Requisitos 4.12 e 4.13)', () => {
  it.each([
    [true, { inUse: true }],
    [false, { inUse: false }],
  ])('resolve %s conforme o Backend', async (esperado, corpo) => {
    fetchMock.mockResolvedValueOnce(respostaJson(200, corpo))

    await expect(isEmailTaken('victor@email.com')).resolves.toBe(esperado)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/auth/email-em-uso?email=victor%40email.com`)
  })

  it('com falha de rede resolve false', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(isEmailTaken('victor@email.com')).resolves.toBe(false)
  })

  it('com erro do servidor resolve false', async () => {
    fetchMock.mockResolvedValueOnce(respostaErro(503, 'indisponivel'))

    await expect(isEmailTaken('victor@email.com')).resolves.toBe(false)
  })
})

describe('requestPasswordReset e resetPassword', () => {
  it.each(['', '   ', 'victor@email'])(
    'requestPasswordReset(%j) rejeita com ErroValidacao sem chamar a rede',
    async (email) => {
      const erro = await requestPasswordReset(email).catch((e) => e)

      expect(erro).toBeInstanceOf(ErroValidacao)
      expect(mensagemDoCampo(erro, 'email')).toBe(MENSAGEM_EMAIL_INVALIDO)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('requestPasswordReset aceito resolve sem valor', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson(202, { message: 'ok' }))

    await expect(requestPasswordReset('  victor@email.com ')).resolves.toBeUndefined()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'victor@email.com' })
  })

  it('requestPasswordReset com falha de rede rejeita', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(requestPasswordReset('victor@email.com')).rejects.toBeInstanceOf(ErroConexao)
  })

  it("resetPassword com 204 resolve 'ok' e limpa a sessão local", async () => {
    await iniciarSessao()
    fetchMock.mockResolvedValueOnce(respostaVazia(204))

    await expect(resetPassword('token-do-link', 'novaSenha123')).resolves.toBe('ok')
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(stub.raw(SESSION_KEY)).toBeNull()
  })

  it.each([
    ['400 token_invalido', 'token-invalido', () => respostaErro(400, 'token_invalido')],
    ['400 senha_invalida', 'senha-invalida', () => respostaErro(400, 'senha_invalida')],
    [
      '422 só no campo newPassword',
      'senha-invalida',
      () => respostaErro(422, 'dados_invalidos', 'x', [{ field: 'newPassword', message: 'curta' }]),
    ],
    [
      '422 no campo token',
      'token-invalido',
      () => respostaErro(422, 'dados_invalidos', 'x', [{ field: 'token', message: 'vazio' }]),
    ],
  ])('resetPassword com %s resolve %s', async (_caso, esperado, resposta) => {
    fetchMock.mockResolvedValueOnce(resposta())

    await expect(resetPassword('token-do-link', 'novaSenha123')).resolves.toBe(esperado)
  })

  it('resetPassword com falha de rede ou 500 rejeita', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(resetPassword('t', 'novaSenha123')).rejects.toBeInstanceOf(ErroConexao)

    fetchMock.mockResolvedValueOnce(respostaErro(500, 'erro_interno'))
    await expect(resetPassword('t', 'novaSenha123')).rejects.toBeInstanceOf(ErroServidor)
  })
})

describe('restoreSession no carregamento (Requisitos 10.6–10.8)', () => {
  it('sem token salvo resolve null sem requisição', async () => {
    await expect(restoreSession()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('com token chama GET /usuarios/me e atualiza o Perfil_Publico salvo', async () => {
    await iniciarSessao('tok-1')
    const atualizado = { ...perfil, name: 'Victor M.' }
    fetchMock.mockResolvedValueOnce(respostaJson(200, atualizado))

    await expect(restoreSession()).resolves.toEqual(atualizado)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/usuarios/me`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer tok-1')
    expect(sessaoSalva()).toEqual({ token: 'tok-1', expiresAt: FUTURO, user: atualizado })
  })

  it('com 401 resolve null e a sessão salva é removida', async () => {
    await iniciarSessao()
    fetchMock.mockResolvedValueOnce(respostaErro(401, 'sessao_invalida'))

    await expect(restoreSession()).resolves.toBeNull()
    expect(stub.raw(SESSION_KEY)).toBeNull()
  })

  it('com erro de conexão rejeita com ErroConexao e mantém a sessão', async () => {
    await iniciarSessao()
    const antes = stub.raw(SESSION_KEY)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(restoreSession()).rejects.toBeInstanceOf(ErroConexao)
    expect(stub.raw(SESSION_KEY)).toBe(antes)
  })

  it('com erro do servidor rejeita com ErroServidor e mantém a sessão', async () => {
    await iniciarSessao()
    const antes = stub.raw(SESSION_KEY)
    fetchMock.mockResolvedValueOnce(respostaErro(500, 'erro_interno'))

    await expect(restoreSession()).rejects.toBeInstanceOf(ErroServidor)
    expect(stub.raw(SESSION_KEY)).toBe(antes)
  })
})

describe('onSessionExpired (Requisitos 10.4 e 12.11)', () => {
  it('chama o callback uma única vez com várias respostas 401 simultâneas', async () => {
    await iniciarSessao()
    const callback = vi.fn()
    const cancelar = onSessionExpired(callback)
    fetchMock.mockImplementation(() => Promise.resolve(respostaErro(401, 'sessao_invalida')))

    const resultados = await Promise.allSettled([loadProfile(), loadProfile(), loadProfile()])
    cancelar()

    for (const { status, reason } of resultados) {
      expect(status).toBe('rejected')
      expect(reason).toBeInstanceOf(ErroSessaoInvalida)
    }
    expect(callback).toHaveBeenCalledTimes(1)
    expect(stub.raw(SESSION_KEY)).toBeNull()
  })

  it('volta a avisar depois de um novo login', async () => {
    const callback = vi.fn()
    const cancelar = onSessionExpired(callback)

    await iniciarSessao()
    fetchMock.mockResolvedValueOnce(respostaErro(401, 'sessao_invalida'))
    await loadProfile().catch(() => {})

    await iniciarSessao()
    fetchMock.mockResolvedValueOnce(respostaErro(401, 'sessao_invalida'))
    await loadProfile().catch(() => {})
    cancelar()

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('depois de cancelado o callback não é mais chamado', async () => {
    await iniciarSessao()
    const callback = vi.fn()
    onSessionExpired(callback)()
    fetchMock.mockResolvedValueOnce(respostaErro(401, 'sessao_invalida'))

    await expect(loadProfile()).rejects.toBeInstanceOf(ErroSessaoInvalida)
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('conta (endpoints protegidos)', () => {
  it('atualizarPerfil envia os quatro campos e troca o usuário salvo na sessão', async () => {
    await iniciarSessao('tok-2')
    const dados = { name: 'Victor Novo', username: 'victor.novo', description: 'Oi', photo: '' }
    const gravado = { ...perfil, ...dados, updatedAt: '2025-02-01T12:00:00Z' }
    fetchMock.mockResolvedValueOnce(respostaJson(200, gravado))

    await expect(atualizarPerfil({ ...dados, email: 'outro@email.com' })).resolves.toEqual(gravado)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/usuarios/me`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual(dados)
    expect(sessaoSalva()).toEqual({ token: 'tok-2', expiresAt: FUTURO, user: gravado })
  })

  it('atualizarPerfil com 409 rejeita com ErroConflito e mantém o usuário salvo', async () => {
    await iniciarSessao()
    const antes = stub.raw(SESSION_KEY)
    fetchMock.mockResolvedValueOnce(respostaErro(409, 'username_em_uso', 'Username já em uso.'))

    const erro = await atualizarPerfil({ name: 'V', username: 'outro', description: '', photo: '' }).catch(
      (e) => e,
    )

    expect(erro).toBeInstanceOf(ErroConflito)
    expect(erro.code).toBe('username_em_uso')
    expect(stub.raw(SESSION_KEY)).toBe(antes)
  })

  it('atualizarPerfil com 422 expõe a mensagem por campo', async () => {
    await iniciarSessao()
    fetchMock.mockResolvedValueOnce(
      respostaErro(422, 'dados_invalidos', 'Dados inválidos.', [
        { field: 'username', message: 'Username inválido.' },
      ]),
    )

    const erro = await atualizarPerfil({ name: 'V', username: '!!', description: '', photo: '' }).catch(
      (e) => e,
    )

    expect(erro).toBeInstanceOf(ErroValidacao)
    expect(mensagemDoCampo(erro, 'username')).toBe('Username inválido.')
    expect(mensagemDoCampo(erro, 'name')).toBeNull()
  })

  it('changePassword com 204 resolve sem valor e mantém a sessão', async () => {
    await iniciarSessao()
    const antes = stub.raw(SESSION_KEY)
    fetchMock.mockResolvedValueOnce(respostaVazia(204))

    await expect(changePassword('choosen123', 'novaSenha123')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    expect(stub.raw(SESSION_KEY)).toBe(antes)
  })

  it('changePassword com senha atual errada rejeita com ErroRequisicao e mantém a sessão', async () => {
    await iniciarSessao()
    const antes = stub.raw(SESSION_KEY)
    fetchMock.mockResolvedValueOnce(
      respostaErro(400, 'senha_atual_incorreta', 'Senha atual incorreta.'),
    )

    const erro = await changePassword('errada123', 'novaSenha123').catch((e) => e)

    expect(erro).toBeInstanceOf(ErroRequisicao)
    expect(erro.code).toBe('senha_atual_incorreta')
    expect(mensagemDeErro(erro)).toBe('Senha atual incorreta.')
    expect(stub.raw(SESSION_KEY)).toBe(antes)
  })

  it('logOut faz uma chamada e limpa a sessão mesmo com falha de rede', async () => {
    await iniciarSessao()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(logOut()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/auth/logout`)
    expect(stub.raw(SESSION_KEY)).toBeNull()
  })
})

describe('mensagens', () => {
  it('mensagemDeErro usa o mapa para conexão e servidor e a mensagem do Backend nos demais', () => {
    expect(mensagemDeErro(new ErroConexao('detalhe técnico'))).toBe(MENSAGEM_ERRO_CONEXAO)
    expect(mensagemDeErro(new ErroServidor('stack trace'))).toBe(MENSAGEM_ERRO_SERVIDOR)
    expect(mensagemDeErro(new ErroRequisicao('Senha atual incorreta.'))).toBe('Senha atual incorreta.')
    expect(mensagemDeErro(new Error(''), 'padrão')).toBe('padrão')
    expect(mensagemDeErro(null)).toBe(MENSAGEM_ERRO_SERVIDOR)
  })

  it('os textos do mapa são os dos Requisitos 12.9 e 12.10', () => {
    expect(MENSAGEM_ERRO_CONEXAO).toBe('Não foi possível conectar ao servidor. Tente novamente.')
    expect(MENSAGEM_ERRO_SERVIDOR).toBe('O servidor encontrou um problema. Tente novamente em instantes.')
  })

  it('mensagemDoCampo devolve null para erros que não são de validação', () => {
    expect(mensagemDoCampo(new ErroConflito('x'), 'email')).toBeNull()
    expect(mensagemDoCampo(new ErroValidacao('x', [{ field: 'email', message: 'm' }]), 'email')).toBe('m')
  })
})

describe('mock antigo removido do frontend (Requisito 12.6)', () => {
  // O Vitest roda com `frontend/` como diretório atual (no jsdom o
  // `import.meta.url` não é `file:`).
  const SRC = join(cwd(), 'src')

  // Código de produção: ignora as pastas e arquivos de teste, que citam as
  // chaves antigas justamente para conferir que foram removidas.
  function arquivosDeProducao(pasta) {
    const arquivos = []
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, entrada.name)
      if (entrada.isDirectory()) {
        if (entrada.name === 'tests' || entrada.name === 'testes') continue
        arquivos.push(...arquivosDeProducao(caminho))
      } else if (/\.(js|jsx|ts|tsx)$/.test(entrada.name) && !/\.test\.[jt]sx?$/.test(entrada.name)) {
        arquivos.push(caminho)
      }
    }
    return arquivos
  }

  const arquivos = arquivosDeProducao(SRC)

  it('encontra o código de produção de frontend/src', () => {
    const nomes = arquivos.map((arquivo) => relative(SRC, arquivo).replaceAll('\\', '/'))
    expect(nomes).toContain('1-autenticacao/orquestrador.js')
    expect(nomes).toContain('1-autenticacao/modelo/session.js')
  })

  it('nenhum arquivo cita demoUser', () => {
    const comDemoUser = arquivos.filter((arquivo) => readFileSync(arquivo, 'utf8').includes('demoUser'))
    expect(comDemoUser).toEqual([])
  })

  it('nenhum arquivo escreve em choosen.accounts', () => {
    const escritas = []
    for (const arquivo of arquivos) {
      const codigo = readFileSync(arquivo, 'utf8')
      if (!codigo.includes(ACCOUNTS_KEY)) continue
      // Constantes ligadas à chave (ex.: `const LEGACY_ACCOUNTS_KEY = 'choosen.accounts'`).
      const nomes = [...codigo.matchAll(/(\w+)\s*=\s*['"`]choosen\.accounts['"`]/g)].map((m) => m[1])
      const alvos = ["['\"`]choosen\\.accounts['\"`]", ...nomes.map((nome) => `\\b${nome}\\b`)]
      const escrita = new RegExp(`setItem\\(\\s*(${alvos.join('|')})`)
      if (escrita.test(codigo)) escritas.push(relative(SRC, arquivo))
    }
    expect(escritas).toEqual([])
  })

  it('as operações do orquestrador não gravam choosen.accounts no navegador', async () => {
    const setItem = vi.spyOn(stub, 'setItem')
    fetchMock.mockResolvedValueOnce(respostaJson(200, { token: 't', expiresAt: FUTURO, user: perfil }))
    await signUp({ name: 'Victor', email: 'victor@email.com', password: 'choosen123' })
    fetchMock.mockResolvedValueOnce(respostaJson(200, perfil))
    await restoreSession()
    fetchMock.mockResolvedValueOnce(respostaVazia(204))
    await logOut()

    expect(setItem.mock.calls.map(([chave]) => chave)).not.toContain(ACCOUNTS_KEY)
    expect(stub.raw(ACCOUNTS_KEY)).toBeNull()
  })
})
