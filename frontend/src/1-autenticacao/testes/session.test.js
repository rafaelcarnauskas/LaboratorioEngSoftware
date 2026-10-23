// Testes de exemplo de modelo/session.js (sessão no navegador).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as session from '../modelo/session'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

const {
  clearSession,
  getSession,
  getToken,
  isValidEmail,
  limparArmazenamentoLegado,
  saveSession,
  updateSessionUser,
} = session

const AGORA = Date.parse('2025-01-05T12:00:00Z')
const FUTURO = '2025-01-08T12:00:00Z'
const PASSADO = '2025-01-01T12:00:00Z'

const perfil = {
  id: 'u1',
  name: 'Victor Mendes',
  username: 'victor',
  email: 'victor@email.com',
  description: '',
  photo: '',
  isCommunityAdmin: true,
  isSystemAdmin: true,
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
}

let stub = null
let restoreStorage = () => {}

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
})

afterEach(() => {
  restoreStorage()
})

// Faz qualquer acesso a `localStorage` lançar, como um navegador que bloqueia o armazenamento.
function makeStorageUnavailable() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError')
    },
  })
}

describe('exports', () => {
  it('não expõe mais o mock de contas e senhas', () => {
    expect(session).not.toHaveProperty('demoUser')
    expect(session).not.toHaveProperty('createAccount')
    expect(session).not.toHaveProperty('authenticate')
    expect(session).not.toHaveProperty('emailExists')
  })

  it('isValidEmail continua síncrono e com o mesmo padrão', () => {
    expect(isValidEmail('  victor@email.com ')).toBe(true)
    expect(isValidEmail('victor@email')).toBe(false)
    expect(isValidEmail('vic tor@email.com')).toBe(false)
  })
})

describe('saveSession / getSession', () => {
  it('grava só token, expiresAt e o Perfil_Publico, descartando senha e campos extras', () => {
    saveSession({
      token: 'tok',
      expiresAt: FUTURO,
      user: { ...perfil, password: 'choosen123', hashSenha: 'x' },
      password: 'choosen123',
    })

    const saved = JSON.parse(stub.raw('choosen.session'))
    expect(Object.keys(saved).sort()).toEqual(['expiresAt', 'token', 'user'])
    expect(saved.user).toEqual(perfil)
    expect(stub.raw('choosen.session')).not.toContain('choosen123')
    expect(getSession()).toEqual({ token: 'tok', expiresAt: FUTURO, user: perfil })
  })

  it('sem sessão, JSON inválido ou formato antigo sem token devolve null', () => {
    expect(getSession()).toBeNull()
    stub.seed({ 'choosen.session': '{nao-e-json' })
    expect(getSession()).toBeNull()
    stub.seed({ 'choosen.session': JSON.stringify({ email: 'victor@email.com', name: 'Victor Mendes' }) })
    expect(getSession()).toBeNull()
  })

  it('localStorage indisponível é tratado como sem sessão e não lança', () => {
    makeStorageUnavailable()
    expect(getSession()).toBeNull()
    expect(getToken(AGORA)).toBeNull()
    expect(() => saveSession({ token: 'tok', expiresAt: FUTURO, user: perfil })).not.toThrow()
    expect(() => clearSession()).not.toThrow()
    expect(() => updateSessionUser(perfil)).not.toThrow()
    expect(() => limparArmazenamentoLegado(AGORA)).not.toThrow()
  })
})

describe('getToken', () => {
  it('devolve o token só enquanto expiresAt é posterior a agora', () => {
    saveSession({ token: 'tok', expiresAt: FUTURO, user: perfil })
    expect(getToken(AGORA)).toBe('tok')
    expect(getToken(Date.parse(FUTURO))).toBeNull()
    expect(getToken(Date.parse(FUTURO) + 1)).toBeNull()
  })

  it('sessão expirada ou com data ilegível não tem token', () => {
    saveSession({ token: 'tok', expiresAt: PASSADO, user: perfil })
    expect(getToken(AGORA)).toBeNull()
    saveSession({ token: 'tok', expiresAt: 'ontem', user: perfil })
    expect(getToken(AGORA)).toBeNull()
  })
})

describe('updateSessionUser / clearSession', () => {
  it('troca só o Perfil_Publico, mantendo token e expiração', () => {
    saveSession({ token: 'tok', expiresAt: FUTURO, user: perfil })
    updateSessionUser({ ...perfil, name: 'Victor G. Mendes', password: 'segredo' })

    expect(getSession()).toEqual({ token: 'tok', expiresAt: FUTURO, user: { ...perfil, name: 'Victor G. Mendes' } })
    expect(stub.raw('choosen.session')).not.toContain('segredo')
  })

  it('sem sessão salva, updateSessionUser não cria uma', () => {
    updateSessionUser(perfil)
    expect(stub.raw('choosen.session')).toBeNull()
  })

  it('clearSession remove a chave', () => {
    saveSession({ token: 'tok', expiresAt: FUTURO, user: perfil })
    clearSession()
    expect(stub.raw('choosen.session')).toBeNull()
  })
})

describe('limparArmazenamentoLegado', () => {
  it('remove choosen.accounts e mantém sessão válida e chaves de outras partes', () => {
    const valida = JSON.stringify({ token: 'tok', expiresAt: FUTURO, user: perfil })
    stub.seed({
      'choosen.accounts': JSON.stringify([{ email: 'a@b.co', password: '12345678' }]),
      'choosen.session': valida,
      'choosen.lists.v1': '[]',
      'choosen.history.v1': '[]',
    })

    limparArmazenamentoLegado(AGORA)

    expect(stub.snapshot()).toEqual({
      'choosen.session': valida,
      'choosen.lists.v1': '[]',
      'choosen.history.v1': '[]',
    })
  })

  it.each([
    ['JSON inválido', '{nao-e-json'],
    ['formato antigo sem token', JSON.stringify({ email: 'victor@email.com', name: 'Victor Mendes' })],
    ['sem expiresAt', JSON.stringify({ token: 'tok', user: perfil })],
    ['expirada', JSON.stringify({ token: 'tok', expiresAt: PASSADO, user: perfil })],
  ])('remove choosen.session %s', (_caso, valor) => {
    stub.seed({ 'choosen.session': valor, 'choosen.accounts': 'qualquer coisa' })
    limparArmazenamentoLegado(AGORA)
    expect(stub.raw('choosen.session')).toBeNull()
    expect(stub.raw('choosen.accounts')).toBeNull()
  })
})
