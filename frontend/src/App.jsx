import { useEffect, useMemo, useState } from 'react'
import ListsView from './pages/ListsView'
import SearchView from './pages/SearchView'
import Reels from './pages/Reels'
import useLists from './hooks/useLists'
import { videoCatalog } from './data/videoCatalog'
import { reels } from './data/reels'
import './App.css'

// Categorias que já têm tela de reels (ex.: 'sports', 'cute').
const reelCategories = new Set(reels.map((reel) => reel.category))

// A tela de reels também abre direto pela URL: ?tela=reels&categoria=sports
function getReelsCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('tela') === 'reels' ? params.get('categoria') ?? 'sports' : null
}

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
  count:
    videoCatalog.filter((video) => video.category === category.name).length +
    reels.filter((reel) => reel.category === category.name.toLowerCase()).length,
}))

const historyTimes = ['14:32', '12:18', '09:47', '21:06', '18:24']
const initialHistory = videoCatalog.slice(0, 5).map((video, index) => ({
  ...video,
  watchedAt: historyTimes[index],
  group: index < 3 ? 'Today' : 'Yesterday',
}))

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [reelsCategory, setReelsCategory] = useState(getReelsCategoryFromUrl)
  const [activeTab, setActiveTab] = useState('Home')
  const [searchTerm, setSearchTerm] = useState('')
  const [historyItems, setHistoryItems] = useState(initialHistory)
  const { lists, updateLists, storageError } = useLists()
  const [profileView, setProfileView] = useState('overview')
  const [usageLimit, setUsageLimit] = useState(60)
  const [reminders, setReminders] = useState({
    bedtime: true,
    screenTime: true,
    weekly: false,
  })

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

  // Mantém a tela certa ao usar o botão "voltar" do navegador.
  useEffect(() => {
    const handlePopState = () => setReelsCategory(getReelsCategoryFromUrl())

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const openReels = (category) => {
    window.history.pushState(null, '', `?tela=reels&categoria=${category}`)
    setReelsCategory(category)
  }

  const closeReels = () => {
    window.history.pushState(null, '', window.location.pathname)
    setReelsCategory(null)
    setActiveTab('Home')
  }

  const handleCategoryClick = (categoryName) => {
    const reelCategory = categoryName.toLowerCase()

    if (reelCategories.has(reelCategory)) {
      openReels(reelCategory)
      return
    }

    setSearchTerm(categoryName)
    setActiveTab('Search')
  }

  const handleNavigation = (tab) => {
    setActiveTab(tab)

    if (tab === 'Profile') {
      setProfileView('overview')
    }

    setSearchTerm('')
  }

  const toggleReminder = (key) => {
    setReminders((current) => ({
      ...current,
      [key]: !current[key],
    }))
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

  if (reelsCategory) {
    return <Reels category={reelsCategory} onGoHome={closeReels} />
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
            <ProfileAction
              icon="◷"
              label="My time"
              onClick={() => setProfileView('myTime')}
            />
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
        return profileView === 'myTime' ? (
          <MyTimeView
            usageLimit={usageLimit}
            onUsageLimitChange={setUsageLimit}
            reminders={reminders}
            onToggleReminder={toggleReminder}
            onBack={() => setProfileView('overview')}
          />
        ) : renderProfile()

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

function MyTimeView({
  usageLimit,
  onUsageLimitChange,
  reminders,
  onToggleReminder,
  onBack,
}) {
  const todayMinutes = 42
  const weekUsage = [
    { day: 'Mon', minutes: 35 },
    { day: 'Tue', minutes: 48 },
    { day: 'Wed', minutes: 42 },
    { day: 'Thu', minutes: 28 },
    { day: 'Fri', minutes: 55 },
    { day: 'Sat', minutes: 31 },
    { day: 'Sun', minutes: 42, current: true },
  ]
  const limitOptions = [
    { minutes: 30, label: '30 min' },
    { minutes: 45, label: '45 min' },
    { minutes: 60, label: '1 hour' },
    { minutes: 90, label: '1.5 hours' },
    { minutes: 120, label: '2 hours' },
  ]

  const dailyAverage = Math.round(
    weekUsage.reduce((total, day) => total + day.minutes, 0) / weekUsage.length,
  )
  const rawPercentage = Math.round((todayMinutes / usageLimit) * 100)
  const screenPercentage = Math.min(rawPercentage, 100)
  const remainingMinutes = Math.max(usageLimit - todayMinutes, 0)
  const isOverLimit = todayMinutes >= usageLimit
  const chartMax = Math.max(...weekUsage.map((day) => day.minutes), 60)

  return (
    <div className="my-time-view">
      <button className="my-time-back" type="button" onClick={onBack}>
        ← Back to Profile
      </button>

      <header className="my-time-heading">
        <h1>My Time</h1>
        <p>
          Track your active screen time, set boundaries, and manage digital
          health habits.
        </p>
      </header>

      <div className="my-time-layout">
        <div className="my-time-column my-time-column--main">
          <section className="time-card screen-time-card">
            <div className="time-card-title-row">
              <h2>Today&apos;s Screen Time</h2>
              <span
                className={`time-status${isOverLimit ? ' time-status--warning' : ''}`}
              >
                {isOverLimit ? 'Limit reached' : 'On Track'}
              </span>
            </div>

            <div className="screen-time-content">
              <div
                className="screen-time-ring"
                style={{ '--screen-progress': `${screenPercentage * 3.6}deg` }}
                aria-label={`${rawPercentage}% of daily limit used`}
              >
                <div className="screen-time-ring-inner">
                  <strong>{rawPercentage}%</strong>
                  <span>of limit</span>
                </div>
              </div>

              <div className="screen-time-summary">
                <div className="screen-time-number-row">
                  <strong>{todayMinutes} min</strong>
                  <span>{usageLimit} min limit</span>
                </div>

                <div className="time-progress" aria-hidden="true">
                  <span style={{ width: `${screenPercentage}%` }} />
                </div>

                <p>
                  {isOverLimit
                    ? `You have reached your daily limit of ${usageLimit} minutes.`
                    : `You have ${remainingMinutes} minutes remaining before your daily limit is reached.`}
                </p>
              </div>
            </div>
          </section>

          <section className="time-card usage-limit-card">
            <h2>Daily Usage Limit</h2>
            <p>
              Choose a daily screen time limit. We&apos;ll send you an alert when
              you reach this threshold.
            </p>

            <div className="usage-limit-options" aria-label="Daily usage limit">
              {limitOptions.map((option) => (
                <button
                  className={usageLimit === option.minutes ? 'is-selected' : ''}
                  key={option.minutes}
                  type="button"
                  onClick={() => onUsageLimitChange(option.minutes)}
                  aria-pressed={usageLimit === option.minutes}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="time-card reminder-card">
            <h2>Alert Preferences &amp; Reminders</h2>

            <ReminderRow
              title="Bedtime Reminder"
              description="Remind me to wind down 15 minutes before my set bedtime (10:30 PM)."
              enabled={reminders.bedtime}
              onToggle={() => onToggleReminder('bedtime')}
            />
            <ReminderRow
              title="Screen Time Alerts"
              description="Get an instant notification as soon as the daily usage limit is reached."
              enabled={reminders.screenTime}
              onToggle={() => onToggleReminder('screenTime')}
            />
            <ReminderRow
              title="Weekly Summary Report"
              description="Receive a weekly alert summarizing your screen time trends and accomplishments."
              enabled={reminders.weekly}
              onToggle={() => onToggleReminder('weekly')}
              isLast
            />
          </section>
        </div>

        <div className="my-time-column my-time-column--side">
          <section className="time-card weekly-card">
            <div className="weekly-heading">
              <div>
                <h2>Last 7 days</h2>
                <p>Activity trend this week</p>
              </div>

              <div className="weekly-average">
                <span>Daily average</span>
                <strong>{dailyAverage} min</strong>
              </div>
            </div>

            <div className="weekly-chart" aria-label="Screen time during the last 7 days">
              {weekUsage.map((day) => (
                <div className="weekly-bar-item" key={day.day}>
                  <span className={day.current ? 'weekly-value is-current' : 'weekly-value'}>
                    {day.minutes}
                  </span>
                  <div className="weekly-bar-track">
                    <span
                      className={day.current ? 'weekly-bar is-current' : 'weekly-bar'}
                      style={{ height: `${(day.minutes / chartMax) * 100}%` }}
                    />
                  </div>
                  <span className="weekly-day">{day.day}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="time-card rewards-card">
            <h2>Digital Wellness Rewards</h2>

            <div className="reward-content">
              <div className="reward-badge" aria-hidden="true">✦</div>
              <div>
                <strong>Balanced Scholar Badge</strong>
                <p>
                  You stayed under your limit for 5 out of the last 7 days.
                  Amazing work keeping focus!
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ReminderRow({ title, description, enabled, onToggle, isLast = false }) {
  return (
    <div className={`reminder-row${isLast ? ' reminder-row--last' : ''}`}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>

      <button
        className={`time-toggle${enabled ? ' is-enabled' : ''}`}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${title}: ${enabled ? 'enabled' : 'disabled'}`}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
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
