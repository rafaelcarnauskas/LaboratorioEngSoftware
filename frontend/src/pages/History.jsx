import { useMemo } from 'react'
import '../App.css'

export default function History({ historyItems, onClearHistory }) {
  const groupedHistory = useMemo(() => historyItems.reduce((groups, item) => {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push(item)
    return groups
  }, {}), [historyItems])

  return (
    <div className="history-view">
      <header className="history-header">
        <div>
          <span className="history-eyebrow">YOUR ACTIVITY</span>
          <h1>History</h1>
          <p>Videos you chose to watch, organized by when you watched them.</p>
        </div>
        <button className="history-clear" type="button" onClick={onClearHistory} disabled={historyItems.length === 0}>Clear history</button>
      </header>

      {historyItems.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon" aria-hidden="true">◷</div>
          <h2>No watch history yet</h2>
          <p>The videos you watch will appear here.</p>
        </div>
      ) : (
        <div className="history-groups">
          {Object.entries(groupedHistory).map(([group, items]) => (
            <section className="history-group" key={group}>
              <div className="history-group-heading"><h2>{group}</h2><span>{items.length} {items.length === 1 ? 'video' : 'videos'}</span></div>
              <div className="history-list">
                {items.map((item) => (
                  <article className="history-card" key={item.id}>
                    <div className={`history-thumbnail ${item.thumbnailClass}`}><span className="history-play" aria-hidden="true">▶</span><span className="history-duration">{item.duration}</span></div>
                    <div className="history-card-body">
                      <div className="history-card-copy"><span className="history-category">{item.category}</span><h3>{item.title}</h3><p>{item.creator}</p></div>
                      <div className="history-card-meta"><span>{item.watchedAt}</span><button type="button" aria-label={`More options for ${item.title}`}>•••</button></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
