// Tela_Comunidade: uma comunidade só, com os Filtros_Nicho e a lista de
// vídeos dela. Não confundir com CommunityView, que é a Tela_Communities
// (descoberta e adesão). Componente sem estado persistido próprio: tudo
// chega por props de App.jsx.
import { countByCommunity, selectFinds } from '../../3-videos/orquestrador'
import './CommunityDetail.css'

export default function CommunityDetail({
  community,          // item de Catalogo_Comunidades, já validado por App.jsx
  selectedNiches,     // string[] — Filtro_Nicho vigente desta comunidade
  onToggleNiche,      // (nicheId) => void
  onClearNiches,      // () => void
  onOpenFind,         // (findId) => void
  onBack,             // () => void — Requisito 11.8, sem history.back()
  isJoined,           // boolean — adesão persistida da comunidade
  onJoin,             // (communityId) => void
  onLeave,            // (communityId) => void
  storageError,       // string — Erro_Armazenamento do Servico_Nichos
}) {
  const videos = selectFinds({ communityId: community.id, niches: selectedNiches })
  const selected = new Set(selectedNiches)

  return (
    <div className="community-detail">
      <button className="community-detail-back" type="button" onClick={onBack}>
        ← Voltar
      </button>

      <header className="community-detail-header">
        <span className="community-detail-icon" aria-hidden="true">{community.icon}</span>
        <div>
          <h1>{community.name}</h1>
          <p className="community-detail-description">{community.description}</p>
          <p className="community-detail-meta">
            {community.memberCount.toLocaleString('pt-BR')} membros
            <span aria-hidden="true"> · </span>
            {countByCommunity(community.id)} vídeos
          </p>
        </div>
        <div className="community-detail-membership">
          {isJoined ? (
            <>
              <span className="community-detail-badge">Participando</span>
              <button
                className="community-detail-leave"
                type="button"
                onClick={() => onLeave(community.id)}
                aria-label={`Sair de ${community.name}`}
              >
                Sair
              </button>
            </>
          ) : (
            <button
              className="community-detail-join"
              type="button"
              onClick={() => onJoin(community.id)}
              aria-label={`Participar de ${community.name}`}
            >
              Participar
            </button>
          )}
        </div>
      </header>

      {storageError && <p className="community-detail-error" role="alert">{storageError}</p>}

      <div className="community-niches" role="group" aria-label={`Filtrar ${community.name} por nicho`}>
        {community.niches.map((niche) => (
          <button
            className={`community-niche-chip${selected.has(niche.id) ? ' is-selected' : ''}`}
            key={niche.id}
            type="button"
            aria-pressed={selected.has(niche.id)}
            onClick={() => onToggleNiche(niche.id)}
          >
            {niche.label}
          </button>
        ))}
        {selectedNiches.length > 0 && (
          <button className="community-niche-clear" type="button" onClick={onClearNiches}>
            Limpar filtros
          </button>
        )}
      </div>

      <p className="community-detail-count" role="status">
        {videos.length} {videos.length === 1 ? 'vídeo' : 'vídeos'}
      </p>

      {/* Estado vazio por nicho: a mensagem aparece, mas o filtro continua
          como está — nada é limpo automaticamente (Requisito 10.9). */}
      {videos.length === 0 ? (
        <p className="community-detail-empty">
          Nenhum vídeo nos nichos que você selecionou. Limpe os filtros para ver tudo.
        </p>
      ) : (
        <ul className="community-video-list">
          {videos.map((find) => (
            <li key={find.id}>
              <button
                className="community-video-card"
                type="button"
                onClick={() => onOpenFind(find.id)}
                data-find-id={find.id}
              >
                <img className="community-video-thumb" src={find.image} alt="" />
                <span className="community-video-copy">
                  <strong>{find.title}</strong>
                  <small>@{find.author}</small>
                  <small className="community-video-niche">
                    {community.niches.find((niche) => niche.id === find.nicheId)?.label}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
