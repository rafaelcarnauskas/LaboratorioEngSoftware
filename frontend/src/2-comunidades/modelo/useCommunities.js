import { useState } from 'react'
import { isKnownCommunity } from './communities'

const storageKey = 'choosen.communities.v1'

// A pessoa começa sem nenhuma comunidade: ingressar é sempre uma ação dela,
// feita a partir de um vídeo ou da tela Community.
function createInitialMemberships() {
  return []
}

function loadMemberships() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { memberships: createInitialMemberships(), storageError: '' }

    const memberships = JSON.parse(saved)
    if (!Array.isArray(memberships) || !memberships.every((membership) =>
      membership && typeof membership.id === 'string' && membership.id.length > 0 &&
      Number.isFinite(membership.joinedAt),
    ) || new Set(memberships.map((membership) => membership.id)).size !== memberships.length) {
      throw new Error('Invalid saved communities')
    }

    // Comunidade removida do catálogo é descartada em silêncio: o dado salvo
    // é válido, só não existe mais. Não é motivo para avisar a pessoa.
    return { memberships: memberships.filter((m) => isKnownCommunity(m.id)), storageError: '' }
  } catch {
    return {
      memberships: createInitialMemberships(),
      storageError: 'Não foi possível carregar suas comunidades salvas. Suas alterações continuarão disponíveis nesta sessão.',
    }
  }
}

export default function useCommunities() {
  const [state, setState] = useState(loadMemberships)

  function updateMemberships(memberships) {
    let storageError = ''
    try {
      localStorage.setItem(storageKey, JSON.stringify(memberships))
    } catch {
      storageError = 'Seu navegador não conseguiu salvar estas alterações. Elas continuarão disponíveis nesta sessão.'
    }
    setState({ memberships, storageError })
  }

  function joinCommunity(communityId) {
    if (!isKnownCommunity(communityId)) return
    if (state.memberships.some((membership) => membership.id === communityId)) return
    updateMemberships([...state.memberships, { id: communityId, joinedAt: Date.now() }])
  }

  function leaveCommunity(communityId) {
    updateMemberships(state.memberships.filter((membership) => membership.id !== communityId))
  }

  return { ...state, joinCommunity, leaveCommunity }
}
