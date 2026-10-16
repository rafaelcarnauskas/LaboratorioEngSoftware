// Comunidades de nicho. Cada vídeo em data/finds.js aponta para uma delas
// pelo campo `communityId`. Quando houver backend, esta lista passa a vir da
// API (ex.: fetch('/api/communities')).
//
// `category` indica em qual categoria da Home a comunidade aparece, e usa a
// mesma grafia minúscula dos finds ('sports', 'cute').
//
// `niches` declara os nichos filtráveis da comunidade. Nichos sem find
// correspondente são intencionais: exercitam o estado vazio por nicho.
export const communities = [
  {
    id: 'poli-usp',
    name: 'Poli USP',
    description: 'Esportes e vida acadêmica da Escola Politécnica da USP.',
    icon: '🏛️',
    tone: 'teal',
    category: 'sports',
    memberCount: 1284,
    niches: [
      { id: 'basquete', label: 'Basquete' },
      { id: 'atletismo', label: 'Atletismo' },
      { id: 'vida-academica', label: 'Vida acadêmica' },
    ],
  },
  {
    id: 'judo-brasil',
    name: 'Judô Brasil',
    description: 'Treinos, campeonatos e técnica para judocas.',
    icon: '🥋',
    tone: 'blue',
    category: 'sports',
    memberCount: 642,
    niches: [
      { id: 'treino', label: 'Treino' },
      { id: 'competicao', label: 'Competição' },
      { id: 'tecnica', label: 'Técnica' },
    ],
  },
  {
    id: 'vida-de-pet',
    name: 'Vida de Pet',
    description: 'O dia a dia de quem divide a casa com um bichinho.',
    icon: '🐾',
    tone: 'rose',
    category: 'cute',
    memberCount: 3907,
    niches: [
      { id: 'rotina', label: 'Rotina' },
      { id: 'festas', label: 'Festas' },
      { id: 'cuidados', label: 'Cuidados' },
    ],
  },
]

const communitiesById = new Map(communities.map((community) => [community.id, community]))

export function findCommunity(communityId) {
  return communitiesById.get(communityId) ?? null
}

export function isKnownCommunity(communityId) {
  return communitiesById.has(communityId)
}

// Divide o catálogo entre as comunidades que a pessoa aderiu e as sugeridas.
// `joined` sai em ordem decrescente de `joinedAt` (adesão mais recente
// primeiro) e `suggested` preserva a ordem de declaração do catálogo.
//
// Adesão cuja comunidade não existe no catálogo é descartada em silêncio — o
// dado salvo é válido, só aponta para algo que saiu do ar. Como `suggested` é
// derivado apenas das adesões que resolveram, as duas listas são disjuntas e a
// união cobre o catálogo inteiro.
export function partitionCommunities(memberships, catalog = communities) {
  const catalogById = new Map(catalog.map((community) => [community.id, community]))

  const joined = [...memberships]
    .sort((a, b) => b.joinedAt - a.joinedAt)
    .map((membership) => catalogById.get(membership.id))
    .filter(Boolean)

  const joinedIds = new Set(joined.map((community) => community.id))
  const suggested = catalog.filter((community) => !joinedIds.has(community.id))

  return { joined, suggested }
}
