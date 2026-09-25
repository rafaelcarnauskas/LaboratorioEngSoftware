import { useEffect, useMemo, useState } from 'react'
import './App.css'

const initialHistory = [
  {
    id: 1,
    title: 'Why cats always land on their feet',
    creator: '@curiouslab',
    category: 'Curiosities',
    watchedAt: '14:32',
    group: 'Today',
    duration: '0:42',
    thumbnailClass: 'history-thumb--amber',
  },
  {
    id: 2,
    title: '3 shortcuts every developer should know',
    creator: '@codequick',
    category: 'Tips',
    watchedAt: '12:18',
    group: 'Today',
    duration: '0:58',
    thumbnailClass: 'history-thumb--blue',
  },
  {
    id: 3,
    title: 'A tiny kitchen with a clever layout',
    creator: '@smallspaces',
    category: 'Ideas',
    watchedAt: '09:47',
    group: 'Today',
    duration: '1:12',
    thumbnailClass: 'history-thumb--green',
  },
  {
    id: 4,
    title: 'The science behind a perfect espresso',
    creator: '@dailybrew',
    category: 'Curiosities',
    watchedAt: '21:06',
    group: 'Yesterday',
    duration: '0:51',
    thumbnailClass: 'history-thumb--brown',
  },
  {
    id: 5,
    title: 'One minute mobility routine',
    creator: '@movebetter',
    category: 'Wellness',
    watchedAt: '18:24',
    group: 'Yesterday',
    duration: '1:00',
    thumbnailClass: 'history-thumb--purple',
  },
]

function HistoryView({ historyItems, onClearHistory }) {
  const groupedHistory = useMemo(() => {
    return historyItems.reduce((groups, item) => {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group].push(item)
      return groups
    }, {})
  }, [historyItems])

  return (
    <div className="history-view">
      <header className="history-header">
        <div>
          <span className="history-eyebrow">YOUR ACTIVITY</span>
          <h1>History</h1>
          <p>Videos you chose to watch, organized by when you watched them.</p>
        </div>

        <button
          className="history-clear"
          type="button"
          onClick={onClearHistory}
          disabled={historyItems.length === 0}
        >
          Clear history
        </button>
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
              <div className="history-group-heading">
                <h2>{group}</h2>
                <span>{items.length} {items.length === 1 ? 'video' : 'videos'}</span>
              </div>

              <div className="history-list">
                {items.map((item) => (
                  <article className="history-card" key={item.id}>
                    <div className={`history-thumbnail ${item.thumbnailClass}`}>
                      <span className="history-play" aria-hidden="true">▶</span>
                      <span className="history-duration">{item.duration}</span>
                    </div>

                    <div className="history-card-body">
                      <div className="history-card-copy">
                        <span className="history-category">{item.category}</span>
                        <h3>{item.title}</h3>
                        <p>{item.creator}</p>
                      </div>

                      <div className="history-card-meta">
                        <span>{item.watchedAt}</span>
                        <button type="button" aria-label={`More options for ${item.title}`}>•••</button>
                      </div>
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

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Home')
  const [historyItems, setHistoryItems] = useState(initialHistory)

  useEffect(() => {
    const loadingTimer = setTimeout(() => {
      setIsLoading(false)
    }, 1500)

    return () => clearTimeout(loadingTimer)
  }, [])

  if (isLoading) {
    return (
      <main className="loading-page" aria-label="Loading Choosen">
        <div className="loading-content">
          <div className="loading-mark" aria-hidden="true">
            <span className="loading-dot" />
            <span className="loading-dot loading-dot--active" />
          </div>
          <h1>Choosen</h1>
          <p>Watch what you choose.</p>
        </div>
      </main>
    )
  }

  const navigationItems = [
    { label: 'Home', icon: '⌂' },
    { label: 'Search', icon: '⌕' },
    { label: 'Lists', icon: '≡' },
    { label: 'History', icon: '◷' },
    { label: 'Profile', icon: '♙' },
  ]

  return (
    <main className="home-page" aria-label="Choosen home page">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">CHOOSEN</div>
        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button
              className={`sidebar-item${activeTab === item.label ? ' sidebar-item--active' : ''}`}
              key={item.label}
              type="button"
              onClick={() => setActiveTab(item.label)}
              aria-current={activeTab === item.label ? 'page' : undefined}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="home-content" aria-label={`${activeTab} content`}>
        {activeTab === 'History' && (
          <HistoryView
            historyItems={historyItems}
            onClearHistory={() => setHistoryItems([])}
          />
        )}
      </section>
    </main>
  )
}

export default App
