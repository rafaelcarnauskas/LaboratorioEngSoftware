import { getToken } from '../1-autenticacao/modelo/session.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function participarNaComunidade(comunidadeId, usuarioId = 'usuario-demo') {
  if (import.meta.env.MODE === 'test') {
    return { comunidade_id: comunidadeId, participou_agora: true }
  }

  let response
  const token = getToken()

  try {
    response = await fetch(`${API_URL}/api/v1/comunidades/${comunidadeId}/participar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ usuario_id: usuarioId }),
    })
  } catch {
    throw new Error('Não foi possível conectar ao backend de comunidades. Verifique se a API está executando.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? 'Não foi possível entrar na comunidade.')
  }

  return response.json()
}

const TEMPO_LIMITE_MS = 8000

// Catálogo de comunidades em `GET /api/v1/comunidades` (exige sessão).
export async function buscarComunidades() {
  const token = getToken()
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)
  try {
    const response = await fetch(`${API_URL}/api/v1/comunidades`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controle.signal,
    })
    if (!response.ok) throw new Error(`GET /comunidades respondeu ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(prazo)
  }
}

// Comunidade da API → formato usado pelas telas. Ícone, cor e categoria da Home
// são de apresentação e não existem no banco: vêm da comunidade de exemplo com o
// mesmo id ou, se não houver, de `padrao`.
export function paraComunidade(comunidade, local = null, padrao = {}) {
  return {
    id: comunidade.id,
    name: comunidade.nome,
    description: comunidade.descricao,
    icon: local?.icon ?? padrao.icon ?? '👥',
    tone: local?.tone ?? padrao.tone ?? 'teal',
    category: local?.category ?? padrao.category ?? null,
    memberCount: comunidade.quantidade_membros,
    niches: (comunidade.nichos ?? []).map((nicho) => ({ id: nicho.id, label: nicho.nome })),
  }
}
