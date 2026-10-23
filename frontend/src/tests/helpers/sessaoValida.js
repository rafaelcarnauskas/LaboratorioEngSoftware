// Sessão válida para os testes que montam o `App` já logado.
//
// O `App` só abre a Tela_Inicio com `choosen.session` no formato
// `{ token, expiresAt, user }` (token ainda válido) e depois de confirmar o
// token com `GET /api/v1/usuarios/me`. Este módulo semeia essa sessão no stub de
// `localStorage` e simula o `fetch` só para essa rota, devolvendo o
// Perfil_Publico. Chame `vi.unstubAllGlobals()` no `afterEach`.
import { vi } from 'vitest'

/** Perfil_Publico padrão dos testes de UI. */
export const perfilPadrao = Object.freeze({
  id: 1,
  name: 'Victor Mendes',
  username: 'victor',
  email: 'victor@email.com',
  description: '',
  photo: null,
  isCommunityAdmin: false,
  isSystemAdmin: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

const UM_DIA_MS = 24 * 60 * 60 * 1000

/**
 * Grava em `choosen.session` uma sessão com token e expiração no futuro.
 *
 * @param {{ seed: (entries: Record<string, string>) => unknown }} stub stub de `localStorage`
 * @param {object} [perfil] Perfil_Publico salvo em `user`
 */
export function semearSessao(stub, perfil = perfilPadrao) {
  stub.seed({
    'choosen.session': JSON.stringify({
      token: 'token-de-teste',
      expiresAt: new Date(Date.now() + UM_DIA_MS).toISOString(),
      user: perfil,
    }),
  })
}

/**
 * Simula o `fetch` global: `GET .../api/v1/usuarios/me` responde 200 com o
 * Perfil_Publico; qualquer outra requisição segue para o `fetch` original.
 *
 * @param {object} [perfil]
 * @returns o mock instalado, para inspeção das chamadas
 */
export function mockarFetchPerfil(perfil = perfilPadrao) {
  const fetchOriginal = globalThis.fetch
  const mock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input)
    const metodo = (init.method ?? input?.method ?? 'GET').toUpperCase()
    if (metodo === 'GET' && new URL(url).pathname === '/api/v1/usuarios/me') {
      // Resposta mínima em vez de `Response`: o corpo sai só por promessas, sem
      // depender de streams internos sob os timers falsos dos testes.
      const corpo = JSON.stringify(perfil)
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => corpo,
        json: async () => JSON.parse(corpo),
      }
    }
    return fetchOriginal(input, init)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
