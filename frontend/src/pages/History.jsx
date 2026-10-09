import { useMemo, useState } from 'react'
import { groupHistory, formatTime } from '../lib/usage'
import { hydrate } from '../lib/reelsIndex'
import { findCommunity } from '../data/communities'
import '../App.css'

export default function History({ events = [], onClearHistory, onBack }) {
  // O relógio é lido uma única vez, na montagem: os rótulos "Hoje" e
  // "Ontem" ficam estáveis entre re-renderizações da tela.
  const [now] = useState(() => Date.now())

  // `hydrate` anexa o reel de cada evento e descarta os eventos cujo reel saiu
  // do catálogo; `groupHistory` ordena por instante decrescente e agrupa por dia.
  const groups = useMemo(() => groupHistory(hydrate(events), now), [events, now])

  const itemCount = groups.reduce((total, group) => total + group.items.length, 0)

  return (
    <div className="history-view">
      {onBack && <button className="profile-back-button history-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>}
      <header className="history-header">
        <div>
          <span className="history-eyebrow">SUA ATIVIDADE</span>
          <h1>Histórico</h1>
          <p>Os vídeos que você escolheu assistir, organizados por quando você assistiu.</p>
        </div>
        <button className="history-clear" type="button" onClick={onClearHistory} disabled={itemCount === 0}>Limpar histórico</button>
      </header>

      {itemCount === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon" aria-hidden="true">◷</div>
          <h2>Nenhum vídeo assistido ainda</h2>
          <p>Os vídeos que você assistir vão aparecer aqui.</p>
        </div>
      ) : (
        <div className="history-groups">
          {groups.map((group) => (
            <section className="history-group" key={group.label}>
              <div className="history-group-heading"><h2>{group.label}</h2><span>{group.items.length} {group.items.length === 1 ? 'vídeo' : 'vídeos'}</span></div>
              <div className="history-list">
                {group.items.map((item) => {
                  const community = findCommunity(item.reel.communityId)

                  return (
                    <article className="history-card" key={item.reelId}>
                      <div className="history-thumbnail" style={{ backgroundImage: `url(${item.reel.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}><span className="history-play" aria-hidden="true">▶</span></div>
                      <div className="history-card-body">
                        <div className="history-card-copy"><span className="history-category">{community?.name ?? ''}</span><h3>{item.reel.title}</h3><p>{item.reel.author}</p></div>
                        <div className="history-card-meta"><span>{formatTime(item.watchedAt)}</span><button type="button" aria-label={`Mais opções de ${item.reel.title}`}>•••</button></div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
