import { useEffect, useMemo, useState } from 'react'
import './App.css'

const navigationItems = [
  { label: 'Home', icon: '⌂' },
  { label: 'Search', icon: '⌕' },
  { label: 'Lists', icon: '≡' },
  { label: 'History', icon: '◷' },
  { label: 'Profile', icon: '♙' },
]

const categories = [
  { name: 'Humor', count: 32, icon: '😄', tone: 'gold' },
  { name: 'Cute', count: 24, icon: '♥', tone: 'rose' },
  { name: 'Tips', count: 18, icon: '💡', tone: 'green' },
  { name: 'Technology', count: 27, icon: '▣', tone: 'blue' },
  { name: 'Sports', count: 15, icon: '⚽', tone: 'teal' },
  { name: 'Curiosities', count: 21, icon: '✣', tone: 'purple' },
]

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Home')
  const [searchTerm, setSearchTerm] = useState('')
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

  const handleCategoryClick = (categoryName) => {
    setSearchTerm(categoryName)
  }

  const renderProfile = () => (
    <div className="profile-main">
      <div className="profile-heading">
        <p className="profile-eyebrow">PROFILE</p>
        <h1>Profile Settings</h1>
        <p>Manage your personal information, subscription plan, and workspace preferences.</p>
      </div>

      <div className="profile-layout">
        <div className="profile-column">
          <section className="profile-card profile-user-card" aria-label="User profile">
            <div className="profile-user">
              <div className="profile-avatar">V</div>
              <div>
                <strong>Victor Mendes</strong>
                <small>victor@email.com</small>
              </div>
            </div>
            <button className="admin-button" type="button">▣ &nbsp; Admin Dashboard ↗</button>
          </section>

          <ProfileSection title="ACCOUNT">
            <ProfileAction icon="♙" label="Edit profile" />
            <ProfileAction icon="♙" label="Change password" />
          </ProfileSection>

          <ProfileSection title="SYSTEM">
            <ProfileAction className="profile-action--danger" icon="⇥" label="Sign Out" />
          </ProfileSection>
        </div>

        <div className="profile-column">
          <ProfileSection title="USAGE">
            <ProfileAction icon="◷" label="My time" />
            <ProfileAction icon="≡" label="History" />
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

  const renderHome = () => (
    <div className="home-main">
      <p className="home-eyebrow">HOME</p>
      <h1>Hi, Victor <span aria-hidden="true">👋</span></h1>
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
              <span className="category-icon" aria-hidden="true">{category.icon}</span>
              <span className="category-copy">
                <strong>{category.name}</strong>
                <small>{category.count} videos</small>
              </span>
            </button>
          ))}
        </div>
        {searchTerm && filteredCategories.length === 0 && (
          <p className="empty-search">No categories found for “{searchTerm}”.</p>
        )}
      </section>

      <section className="continue-section" aria-labelledby="continue-title">
        <h2 id="continue-title">Continue watching</h2>
        <p className="empty-state">Your recently watched videos will appear here.</p>
      </section>
    </div>
  )

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
        <header className="top-bar">
          <div className="top-bar-brand">CHOOSEN</div>
          <label className="search-box">
            <span className="search-box-icon" aria-hidden="true">⌕</span>
            <span className="visually-hidden">Search videos</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search videos..."
            />
          </label>
          <button className="notification-button" type="button" aria-label="Notifications">
            ♧
          </button>
        </header>

        {activeTab === 'Profile' ? renderProfile() : renderHome()}
      </section>
    </main>
  )
}

function ProfileSection({ title, children }) {
  return (
    <section className="profile-section" aria-labelledby={`profile-${title.toLowerCase()}`}>
      <h2 id={`profile-${title.toLowerCase()}`}>{title}</h2>
      <div className="profile-actions">{children}</div>
    </section>
  )
}

function ProfileAction({ className = '', icon, label }) {
  return (
    <button className={`profile-action ${className}`} type="button">
      <span className="profile-action-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="profile-action-arrow" aria-hidden="true">›</span>
    </button>
  )
}

export default App
