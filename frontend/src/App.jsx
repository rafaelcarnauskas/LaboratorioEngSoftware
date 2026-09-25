import { useEffect, useMemo, useState } from 'react'
import ListsView from './ListsView'
import SearchView from './SearchView'
import useLists from './useLists'
import { videoCatalog } from './videoCatalog'
import './App.css'

const navigationItems = [
  { label: 'Home', icon: '⌂' },
  { label: 'Search', icon: '⌕' },
  { label: 'Lists', icon: '≡' },
  { label: 'History', icon: '◷' },
  { label: 'Profile', icon: '♙' },
]

const categories = [
  { name: 'Humor', icon: '😄', tone: 'gold' },
  { name: 'Cute', icon: '♥', tone: 'rose' },
  { name: 'Tips', icon: '💡', tone: 'green' },
  { name: 'Technology', icon: '▣', tone: 'blue' },
  { name: 'Sports', icon: '⚽', tone: 'teal' },
  { name: 'Curiosities', icon: '✣', tone: 'purple' },
].map((category) => ({
  ...category,
  count: videoCatalog.filter((video) => video.category === category.name).length,
}))

const historyTimes = ['14:32', '12:18', '09:47', '21:06', '18:24']
const initialHistory = videoCatalog.slice(0, 5).map((video, index) => ({
  ...video,
  watchedAt: historyTimes[index],
  group: index < 3 ? 'Today' : 'Yesterday',
}))

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Home')
  const [searchTerm, setSearchTerm] = useState('')
  const [historyItems, setHistoryItems] = useState(initialHistory)
  const { lists, updateLists, storageError } = useLists()

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      return categories
    }

    return categories.filter((category) =>
      category.name.toLowerCase().includes(normalizedSearch),
    )
  }, [searchTerm])

  useEffect(() => {
    const loadingTimer = setTimeout(() => {
      setIsLoading(false)
    }, 1500)

    return () => clearTimeout(loadingTimer)
  }, [])

  const handleCategoryClick = (categoryName) => {
    setSearchTerm(categoryName)
    setActiveTab('Search')
  }

  const handleNavigation = (tab) => {
    setActiveTab(tab)

    setSearchTerm('')
  }

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

  const renderHome = () => (
    <div className="home-main">
      <p className="home-eyebrow">HOME</p>

      <h1>
        Hi, Victor <span aria-hidden="true">👋</span>
      </h1>

      <p className="home-subtitle">What do you want to watch today?</p>

      <section className="category-section" aria-labelledby="category-title">
        <h2 id="category-title">Categories</h2>

        <div className="category-grid">
          {filteredCategories.map((category) => (
            <button
              className={`category-card category-card--${category.tone}`}
              key={category.name}
              type="button"
              onClick={() => handleCategoryClick(category.name)}
            >
              <span className="category-icon" aria-hidden="true">
                {category.icon}
              </span>

              <span className="category-copy">
                <strong>{category.name}</strong>
                <small>{category.count} {category.count === 1 ? 'video' : 'videos'}</small>
              </span>
            </button>
          ))}
        </div>

        {searchTerm && filteredCategories.length === 0 && (
          <p className="empty-search">
            No categories found for “{searchTerm}”.
          </p>
        )}
      </section>

      <section className="continue-section" aria-labelledby="continue-title">
        <h2 id="continue-title">Continue watching</h2>
        <p className="empty-state">
          Your recently watched videos will appear here.
        </p>
      </section>
    </div>
  )

  const renderProfile = () => (
    <div className="profile-main">
      <div className="profile-heading">
        <p className="profile-eyebrow">PROFILE</p>
        <h1>Profile Settings</h1>
        <p>
          Manage your personal information, subscription plan, and workspace
          preferences.
        </p>
      </div>

      <div className="profile-layout">
        <div className="profile-column">
          <section
            className="profile-card profile-user-card"
            aria-label="User profile"
          >
            <div className="profile-user">
              <div className="profile-avatar">V</div>

              <div>
                <strong>Victor Mendes</strong>
                <small>victor@email.com</small>
              </div>
            </div>

            <button className="admin-button" type="button">
              ▣ &nbsp; Admin Dashboard ↗
            </button>
          </section>

          <ProfileSection title="ACCOUNT">
            <ProfileAction icon="♙" label="Edit profile" />
            <ProfileAction icon="♙" label="Change password" />
          </ProfileSection>

          <ProfileSection title="SYSTEM">
            <ProfileAction
              className="profile-action--danger"
              icon="⇥"
              label="Sign Out"
            />
          </ProfileSection>
        </div>

        <div className="profile-column">
          <ProfileSection title="USAGE">
            <ProfileAction icon="◷" label="My time" />
            <ProfileAction
              icon="≡"
              label="History"
              onClick={() => handleNavigation('History')}
            />
          </ProfileSection>

          <ProfileSection title="PLAN">
            <ProfileAction icon="▣" label="My plan" />
            <ProfileAction icon="♧" label="Group settings" />
          </ProfileSection>

          <ProfileSection title="PREFERENCES">
            <ProfileAction icon="♧" label="Notifications" />
            <ProfileAction icon="◯" label="WhatsApp Alerts" />
          </ProfileSection>
        </div>
      </div>
    </div>
  )

  const renderActiveContent = () => {
    switch (activeTab) {
      case 'Home':
        return renderHome()

      case 'History':
        return (
          <HistoryView
            historyItems={historyItems}
            onClearHistory={() => setHistoryItems([])}
          />
        )

      case 'Profile':
        return renderProfile()

      case 'Search':
        return (
          <SearchView
            videos={videoCatalog}
            query={searchTerm}
            onQueryChange={setSearchTerm}
            lists={lists}
            onListsChange={updateLists}
            storageError={storageError}
          />
        )

      case 'Lists':
        return <ListsView lists={lists} onListsChange={updateLists} availableVideos={videoCatalog} storageError={storageError} />

      default:
        return renderHome()
    }
  }

  return (
    <main className="home-page" aria-label="Choosen application">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">CHOOSEN</div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button
              className={`sidebar-item${
                activeTab === item.label ? ' sidebar-item--active' : ''
              }`}
              key={item.label}
              type="button"
              onClick={() => handleNavigation(item.label)}
              aria-current={activeTab === item.label ? 'page' : undefined}
            >
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>

              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="home-content" aria-label={`${activeTab} content`}>
        <header className="top-bar">
          <div className="top-bar-brand">CHOOSEN</div>

          <form className="search-box" role="search" aria-label="Quick video search" onSubmit={(event) => { event.preventDefault(); setActiveTab('Search') }}>
            <span className="search-box-icon" aria-hidden="true">
              ⌕
            </span>

            <label className="visually-hidden" htmlFor="quick-video-search">Search videos</label>

            <input
              id="quick-video-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search videos..."
            />
          </form>

          <button
            className="notification-button"
            type="button"
            aria-label="Notifications"
          >
            ♧
          </button>
        </header>

        {renderActiveContent()}
      </section>
    </main>
  )
}

function HistoryView({ historyItems, onClearHistory }) {
  const groupedHistory = useMemo(() => {
    return historyItems.reduce((groups, item) => {
      if (!groups[item.group]) {
        groups[item.group] = []
      }

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
          <p>
            Videos you chose to watch, organized by when you watched them.
          </p>
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
          <div className="history-empty-icon" aria-hidden="true">
            ◷
          </div>

          <h2>No watch history yet</h2>
          <p>The videos you watch will appear here.</p>
        </div>
      ) : (
        <div className="history-groups">
          {Object.entries(groupedHistory).map(([group, items]) => (
            <section className="history-group" key={group}>
              <div className="history-group-heading">
                <h2>{group}</h2>

                <span>
                  {items.length} {items.length === 1 ? 'video' : 'videos'}
                </span>
              </div>

              <div className="history-list">
                {items.map((item) => (
                  <article className="history-card" key={item.id}>
                    <div
                      className={`history-thumbnail ${item.thumbnailClass}`}
                    >
                      <span className="history-play" aria-hidden="true">
                        ▶
                      </span>

                      <span className="history-duration">{item.duration}</span>
                    </div>

                    <div className="history-card-body">
                      <div className="history-card-copy">
                        <span className="history-category">
                          {item.category}
                        </span>

                        <h3>{item.title}</h3>
                        <p>{item.creator}</p>
                      </div>

                      <div className="history-card-meta">
                        <span>{item.watchedAt}</span>

                        <button
                          type="button"
                          aria-label={`More options for ${item.title}`}
                        >
                          •••
                        </button>
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

function ProfileSection({ title, children }) {
  const sectionId = `profile-${title.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <section className="profile-section" aria-labelledby={sectionId}>
      <h2 id={sectionId}>{title}</h2>
      <div className="profile-actions">{children}</div>
    </section>
  )
}

function ProfileAction({
  className = '',
  icon,
  label,
  onClick,
}) {
  return (
    <button
      className={`profile-action ${className}`.trim()}
      type="button"
      onClick={onClick}
    >
      <span className="profile-action-icon" aria-hidden="true">
        {icon}
      </span>

      <span>{label}</span>

      <span className="profile-action-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

export default App
