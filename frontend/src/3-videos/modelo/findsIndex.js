// Índice e seleção de finds. Módulo puro, sem React: é consumido por
// pages/History.jsx, pela Home em App.jsx e por pages/CommunityDetail.jsx.
// Todas as funções aceitam o catálogo por parâmetro para permitir teste
// sem mock global.
import { finds } from './finds'
import { categoryKey } from '../../4-busca-listas/modelo/categories'

export const findsById = new Map(finds.map((find) => [find.id, find]))

// Eventos cujo find saiu do catálogo são descartados na exibição, mas
// permanecem no storage: o catálogo mock pode mudar entre sessões.
export function hydrate(events) {
  if (!Array.isArray(events)) return []

  return events
    .map((event) => ({ ...event, find: findsById.get(event.findId) ?? null }))
    .filter((item) => item.find !== null)
}

export function countByCommunity(communityId, findList = finds) {
  return findList.filter((find) => find.communityId === communityId).length
}

// Seletor único de Finds e de CommunityDetail.
// Os filtros são aplicados em conjunção; `niches` vazio significa "todos".
// A ordem do catálogo é preservada.
export function selectFinds({ category = null, communityId = null, niches = [] } = {}, findList = finds) {
  const wanted = new Set(niches)

  return findList.filter((find) => {
    if (communityId !== null && find.communityId !== communityId) return false
    if (category !== null && categoryKey(find.category) !== categoryKey(category)) return false
    if (wanted.size > 0 && !wanted.has(find.nicheId)) return false
    return true
  })
}
