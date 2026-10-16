import { countByCommunity } from '../../3-videos/orquestrador'
import { formatTime } from '../../5-historico/orquestrador'

// Card de comunidade da Home: nome, ícone, descrição,
// membros e a contagem de finds da comunidade.
function CommunityTile({ community, onOpen }) {
  const videoCount = countByCommunity(community.id)

  return (
    <button
      className={`community-tile community-tile--${community.tone}`}
      type="button"
      onClick={() => onOpen(community.id)}
      aria-label={`Abrir ${community.name}`}
    >
      <span className="community-tile-icon" aria-hidden="true">{community.icon}</span>
      <span className="community-tile-copy">
        <strong>{community.name}</strong>
        <small className="community-tile-description">{community.description}</small>
        <small className="community-tile-meta">
          {community.memberCount.toLocaleString('pt-BR')} membros
          <span aria-hidden="true"> · </span>
          {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
        </small>
      </span>
    </button>
  )
}

function Home({ firstName, joined, suggested, recent, onOpenCommunity, onOpenFind }) {
  return (
    <div className="home-main">
      <p className="home-eyebrow">HOME</p>
      <h1>Olá, {firstName} <span aria-hidden="true">👋</span></h1>
      <p className="home-subtitle">O que você quer assistir hoje?</p>

      <section className="home-section" aria-labelledby="home-communities-title">
        <h2 id="home-communities-title">Suas comunidades</h2>
        {joined.length === 0 ? (
          <p className="empty-state">
            Você ainda não entrou em nenhuma comunidade. Escolha uma abaixo para começar.
          </p>
        ) : (
          <div className="community-tile-grid">
            {joined.map((community) => (
              <CommunityTile key={community.id} community={community} onOpen={onOpenCommunity} />
            ))}
          </div>
        )}
      </section>

      {suggested.length > 0 && (
        <section className="home-section" aria-labelledby="home-suggestions-title">
          <h2 id="home-suggestions-title">Talvez você goste dessas comunidades</h2>
          <div className="community-tile-grid">
            {suggested.map((community) => (
              <CommunityTile key={community.id} community={community} onOpen={onOpenCommunity} />
            ))}
          </div>
        </section>
      )}

      <section className="home-section" aria-labelledby="home-recent-title">
        <h2 id="home-recent-title">Assistidos recentemente</h2>
        {recent.length === 0 ? (
          <p className="empty-state">Os vídeos que você assistiu recentemente aparecerão aqui.</p>
        ) : (
          <div className="home-recent-grid">
            {recent.map(({ find, watchedAt }) => (
              <button
                className="home-recent-card"
                key={find.id}
                type="button"
                onClick={() => onOpenFind(find.communityId, find.id)}
              >
                <img className="home-recent-thumb" src={find.image} alt="" />
                <span className="home-recent-copy">
                  <strong>{find.title}</strong>
                  <small>@{find.author}</small>
                  <small className="home-recent-time">{formatTime(watchedAt)}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
