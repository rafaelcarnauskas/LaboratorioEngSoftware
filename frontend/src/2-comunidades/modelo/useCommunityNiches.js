// Servico_Nichos: o Filtro_Nicho vigente de cada comunidade, persistido em
// `choosen.communityNiches.v1`. Mesma forma de useLists.js e useCommunities.js:
// `load` com validação na entrada, `write` em try/catch na saída.
//
// O estado é um mapa `communityId -> nicheId[]`. Filtro vazio é representado
// pela AUSÊNCIA da chave, não por um array vazio: uma só representação para
// "sem filtro", o que torna `clearNiches` idempotente por construção.
import { useState } from 'react'
import { communities } from './communities'

const storageKey = 'choosen.communityNiches.v1'

function withoutCommunity(map, communityId) {
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== communityId))
}

function declaredNiches(communityId, catalog) {
  const community = catalog.find((item) => item.id === communityId)
  return (community?.niches ?? []).map((niche) => niche.id)
}

// Saneamento: mantém só comunidades do catálogo e, dentro de cada uma, só
// nichos que a comunidade declara. Sem duplicatas e sem entradas vazias.
// Requisitos 10.13 e 10.14: descarte silencioso, sem Erro_Armazenamento.
export function sanitizeNicheMap(raw, catalog = communities) {
  if (!isValidNicheMap(raw)) return {}

  const result = {}

  for (const [communityId, niches] of Object.entries(raw)) {
    const declared = new Set(declaredNiches(communityId, catalog))
    if (declared.size === 0) continue

    const kept = [...new Set(niches)].filter((nicheId) => declared.has(nicheId))
    if (kept.length > 0) result[communityId] = kept
  }

  return result
}

// Forma do payload. Chave desconhecida e nicho inexistente NÃO são erro de
// formato — são dado obsoleto, tratado por sanitizeNicheMap.
function isValidNicheMap(value) {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((niches) =>
      Array.isArray(niches) &&
      niches.every((nicheId) => typeof nicheId === 'string' && nicheId.length > 0),
    )
  )
}

function loadNiches() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { nichesByCommunity: {}, storageError: '' }

    const parsed = JSON.parse(saved)
    if (!isValidNicheMap(parsed)) throw new Error('Invalid saved niche filters')

    return { nichesByCommunity: sanitizeNicheMap(parsed), storageError: '' }
  } catch {
    return {
      nichesByCommunity: {},
      storageError: 'Não foi possível carregar os filtros de nicho salvos. Suas alterações continuarão disponíveis nesta sessão.',
    }
  }
}

export default function useCommunityNiches() {
  const [state, setState] = useState(loadNiches)

  function write(nichesByCommunity) {
    let storageError = ''
    try {
      localStorage.setItem(storageKey, JSON.stringify(nichesByCommunity))
    } catch {
      storageError = 'Seu navegador não conseguiu salvar estes filtros. Eles continuarão disponíveis nesta sessão.'
    }
    setState({ nichesByCommunity, storageError })
  }

  function nichesFor(communityId) {
    return state.nichesByCommunity[communityId] ?? []
  }

  function toggleNiche(communityId, nicheId) {
    if (!declaredNiches(communityId, communities).includes(nicheId)) return

    const current = nichesFor(communityId)
    const next = current.includes(nicheId)
      ? current.filter((id) => id !== nicheId)
      : [...current, nicheId]

    const rest = withoutCommunity(state.nichesByCommunity, communityId)
    write(next.length === 0 ? rest : { ...rest, [communityId]: next })
  }

  function clearNiches(communityId) {
    write(withoutCommunity(state.nichesByCommunity, communityId))
  }

  return { ...state, nichesFor, toggleNiche, clearNiches }
}
