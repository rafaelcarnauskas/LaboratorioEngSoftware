// Orquestrador de Reprodução: feed de finds, contagens por comunidade e links.
import { communities } from '../2-comunidades/modelo/communities'
import { buildUrl } from '../app/navigation'
import { countByCommunity, selectFinds } from './modelo/findsIndex'

export { countByCommunity, selectFinds }

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
