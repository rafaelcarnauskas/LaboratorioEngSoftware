// Índice e seleção de reels. Módulo puro, sem React: é consumido por
// pages/History.jsx, pela Home em App.jsx e por pages/CommunityDetail.jsx.
// Todas as funções aceitam o catálogo por parâmetro para permitir teste
// sem mock global.
import { reels } from '../data/reels'
import { categoryKey } from './categories'

export const reelsById = new Map(reels.map((reel) => [reel.id, reel]))

// Eventos cujo reel saiu do catálogo são descartados na exibição, mas
// permanecem no storage: o catálogo mock pode mudar entre sessões.
export function hydrate(events) {
  if (!Array.isArray(events)) return []

  return events
    .map((event) => ({ ...event, reel: reelsById.get(event.reelId) ?? null }))
    .filter((item) => item.reel !== null)
}

export function countByCommunity(communityId, reelList = reels) {
  return reelList.filter((reel) => reel.communityId === communityId).length
}

// Seletor único de Reels e de CommunityDetail.
// Os filtros são aplicados em conjunção; `niches` vazio significa "todos".
// A ordem do catálogo é preservada.
export function selectReels({ category = null, communityId = null, niches = [] } = {}, reelList = reels) {
  const wanted = new Set(niches)

  return reelList.filter((reel) => {
    if (communityId !== null && reel.communityId !== communityId) return false
    if (category !== null && categoryKey(reel.category) !== categoryKey(category)) return false
    if (wanted.size > 0 && !wanted.has(reel.nicheId)) return false
    return true
  })
}
