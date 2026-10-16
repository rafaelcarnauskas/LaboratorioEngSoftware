import { countByCommunity, partitionCommunities } from '../../app/contentController'
import './CommunityView.css'

function formatMembers(count) {
  return count.toLocaleString('pt-BR')
}

function CommunityCard({ community, isJoined, onJoin, onLeave, onOpen }) {
  const videoCount = countByCommunity(community.id)

  return (
    <article className={`community-card community-card--${community.tone}`}>
      <button
        className="community-card-open"
        type="button"
        onClick={() => onOpen(community)}
        aria-label={`Abrir ${community.name}`}
      >
        <span className="community-icon" aria-hidden="true">{community.icon}</span>
        <span className="community-copy">
          <strong>{community.name}</strong>
          <span className="community-description">{community.description}</span>
          <span className="community-meta">
            {formatMembers(community.memberCount)} membros
            <span aria-hidden="true"> · </span>
            {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
          </span>
        </span>
      </button>
      <div className="community-actions">
        {isJoined ? (
          <>
            <span className="community-badge">Participando</span>
            <button
              className="community-secondary-button"
              type="button"
              onClick={() => onLeave(community.id)}
              aria-label={`Sair de ${community.name}`}
            >
              Sair
            </button>
          </>
        ) : (
          <button
            className="community-primary-button"
            type="button"
            onClick={() => onJoin(community.id)}
            aria-label={`Participar de ${community.name}`}
          >
            Participar
          </button>
        )}
      </div>
    </article>
  )
}

function CommunityView({ memberships, onJoin, onLeave, onOpenCommunity, onOpenCategory, storageError }) {
  // A partição mora em data/communities.js: a Home usa a mesma função.
  // `suggested` é a seção "Descubra" desta tela.
  const { joined, suggested } = partitionCommunities(memberships)

  // O card abre a Tela_Comunidade. `onOpenCategory` é o contrato antigo
  // (abertura de finds por categoria) e fica como fallback enquanto App.jsx
  // não é religado.
  const openCommunity = (community) => {
    if (onOpenCommunity) {
      onOpenCommunity(community.id)
      return
    }
    if (onOpenCategory) onOpenCategory(community.category)
  }

  return (
    <div className="community-view">
      <p className="community-eyebrow">COMUNIDADES</p>
      <h1>Comunidades</h1>
      <p className="community-subtitle">
        Participe dos nichos por trás dos vídeos que você assiste.
      </p>

      {storageError && <p className="community-error" role="alert">{storageError}</p>}

      <section className="community-section" aria-labelledby="community-joined-title">
        <h2 id="community-joined-title">Suas comunidades</h2>
        {joined.length === 0 ? (
          <p className="community-empty">
            Você ainda não participa de nenhuma comunidade. Abra um vídeo e participe da comunidade por trás dele.
          </p>
        ) : (
          <div className="community-grid">
            {joined.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined
                onJoin={onJoin}
                onLeave={onLeave}
                onOpen={openCommunity}
              />
            ))}
          </div>
        )}
      </section>

      {suggested.length > 0 && (
        <section className="community-section" aria-labelledby="community-discover-title">
          <h2 id="community-discover-title">Descubra</h2>
          <div className="community-grid">
            {suggested.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
                isJoined={false}
                onJoin={onJoin}
                onLeave={onLeave}
                onOpen={openCommunity}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default CommunityView
