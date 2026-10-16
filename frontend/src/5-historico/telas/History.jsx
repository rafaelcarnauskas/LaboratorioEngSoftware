import { useMemo, useState } from 'react'
import { formatTime, historyGroups } from '../orquestrador'
import '../../app/App.css'

export default function History({ events = [], onClearHistory, onBack, onOpenFind, onOpenCommunity }) {
  // O relógio é lido uma única vez, na montagem: os rótulos "Hoje" e
  // "Ontem" ficam estáveis entre re-renderizações da tela.
  const [now] = useState(() => Date.now())
  // Find cujo menu "Mais opções" está aberto (só um por vez).
  const [openMenuId, setOpenMenuId] = useState(null)

  // O Controller anexa o find e o nome da comunidade a cada evento e agrupa
  // por dia, em ordem decrescente de instante.
  const groups = useMemo(() => historyGroups(events, now), [events, now])

  const itemCount = groups.reduce((total, group) => total + group.items.length, 0)

  function chooseOption(action) {
    setOpenMenuId(null)
    action()
  }

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
                  const isMenuOpen = openMenuId === item.findId
                  const menuId = `history-menu-${item.findId}`

                  return (
                    <article className="history-card" key={item.findId}>
                      <div className="history-thumbnail" style={{ backgroundImage: `url(${item.find.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}><span className="history-play" aria-hidden="true">▶</span></div>
                      <div className="history-card-body">
                        <div className="history-card-copy"><span className="history-category">{item.communityName}</span><h3>{item.find.title}</h3><p>{item.find.author}</p></div>
                        <div className="history-card-meta">
                          <span>{formatTime(item.watchedAt)}</span>
                          <button
                            type="button"
                            aria-label={`Mais opções de ${item.find.title}`}
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            aria-controls={isMenuOpen ? menuId : undefined}
                            onClick={() => setOpenMenuId(isMenuOpen ? null : item.findId)}
                          >
                            •••
                          </button>
                          {isMenuOpen && (
                            <div
                              className="history-menu"
                              id={menuId}
                              role="menu"
                              aria-label={`Opções de ${item.find.title}`}
                              onKeyDown={(event) => event.key === 'Escape' && setOpenMenuId(null)}
                            >
                              {onOpenFind && (
                                <button type="button" role="menuitem" onClick={() => chooseOption(() => onOpenFind(item.find.communityId, item.find.id))}>
                                  ▶ Assistir novamente
                                </button>
                              )}
                              {onOpenCommunity && item.communityName && (
                                <button type="button" role="menuitem" onClick={() => chooseOption(() => onOpenCommunity(item.find.communityId))}>
                                  ◉ Ver comunidade {item.communityName}
                                </button>
                              )}
                              <button type="button" role="menuitem" onClick={() => setOpenMenuId(null)}>
                                Fechar
                              </button>
                            </div>
                          )}
                        </div>
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
