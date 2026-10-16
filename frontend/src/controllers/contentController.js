// Controller de conteúdo. As telas leem comunidades, finds, histórico, catálogo
// de vídeos e categorias por aqui, sem importar data/, lib/ ou hooks/ (Model).
// Assim a View só conhece o Controller, como no modelo de referência
// (Telas -> Controlador -> Comunicação), e trocar o Model por uma API não
// mexe nas telas.
import { communities, findCommunity, partitionCommunities } from '../data/communities'
import { videoCatalog } from '../data/videoCatalog'
import { categoryDefinitions, categoryKey, resolveCategory } from '../lib/categories'
import { countByCommunity, hydrate, selectFinds } from '../lib/findsIndex'
import { buildUrl } from '../lib/navigation'
import { formatTime, groupHistory } from '../lib/usage'

export {
  categoryDefinitions,
  categoryKey,
  countByCommunity,
  findCommunity,
  formatTime,
  partitionCommunities,
  resolveCategory,
  selectFinds,
  videoCatalog,
}

export const communityCatalog = communities

// "Comunidades relacionadas" do Finds: as que não aparecem no feed atual,
// primeiro as da mesma categoria e, dentro disso, as maiores.
export function relatedCommunities(visibleFinds, { community = null, category = null } = {}) {
  const currentIds = new Set(visibleFinds.map((find) => find.communityId))
  const primaryCategory = community?.category ?? visibleFinds[0]?.category ?? category

  return communities
    .filter((candidate) => !currentIds.has(candidate.id))
    .sort((left, right) => {
      const leftRelated = left.category === primaryCategory ? 1 : 0
      const rightRelated = right.category === primaryCategory ? 1 : 0
      return rightRelated - leftRelated || right.memberCount - left.memberCount
    })
}

// Link absoluto que abre o Finds já posicionado neste vídeo (botão Compartilhar).
export function findShareUrl(find, origin = window.location.origin) {
  return origin + buildUrl({ screen: 'finds', communityId: find.communityId, findId: find.id })
}

// Histórico agrupado por dia, com o find e o nome da comunidade já anexados.
// Eventos cujo find saiu do catálogo são descartados por `hydrate`.
export function historyGroups(events, now) {
  return groupHistory(hydrate(events), now).map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      communityName: findCommunity(item.find.communityId)?.name ?? '',
    })),
  }))
}
