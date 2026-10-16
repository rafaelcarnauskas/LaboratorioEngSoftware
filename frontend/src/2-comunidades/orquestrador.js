// Orquestrador de Comunidades. As telas de comunidade leem o catálogo por aqui,
// sem importar o modelo direto.
import { communities, findCommunity, partitionCommunities } from './modelo/communities'

export { findCommunity, partitionCommunities }

export const communityCatalog = communities
