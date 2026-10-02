import { useEffect, useMemo, useState } from 'react'
import ListsView from './pages/ListsView'
import SearchView from './pages/SearchView'
import Reels from './pages/Reels'
import useLists from './hooks/useLists'
import { videoCatalog } from './data/videoCatalog'
import Profile from './pages/profile/Profile'
import History from './pages/History'
import { reels } from './data/reels'
import './App.css'

const reelCategories = new Set(reels.map((reel) => reel.category))

function getReelsCategoryFromUrl() {
  const params = new URLSearchParams(window.location.search)
  return params.get('tela') === 'reels' ? params.get('categoria') ?? 'sports' : null
}

function getProfilePathFromUrl() {
  return window.location.pathname.startsWith('/profile') ? window.location.pathname : null
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
  count: videoCatalog.filter((video) => video.category === category.name).length +
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
  const [profilePath, setProfilePath] = useState(() => getProfilePathFromUrl() ?? '/profile')
  const [activeTab, setActiveTab] = useState(() => getProfilePathFromUrl() ? 'Profile' : 'Home')
  const [searchTerm, setSearchTerm] = useState('')
  const [historyItems, setHistoryItems] = useState(initialHistory)
  const { lists, updateLists, storageError } = useLists()

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return normalizedSearch
      ? categories.filter((category) => category.name.toLowerCase().includes(normalizedSearch))
      : categories
  }, [searchTerm])

  useEffect(() => {
    const loadingTimer = setTimeout(() => setIsLoading(false), 1500)
    return () => clearTimeout(loadingTimer)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const nextProfilePath = getProfilePathFromUrl()
      setReelsCategory(getReelsCategoryFromUrl())
      setProfilePath(nextProfilePath ?? '/profile')
      setActiveTab(nextProfilePath ? 'Profile' : 'Home')
    }
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

  const navigateProfile = (path) => {
    window.history.pushState(null, '', path)
    setProfilePath(path)
    setActiveTab('Profile')
    setSearchTerm('')
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
    if (tab === 'Profile') {
      navigateProfile('/profile')
      return
    }
    if (getProfilePathFromUrl()) window.history.pushState(null, '', '/')
    setActiveTab(tab)
    setSearchTerm('')
  }

  if (isLoading) {
    return (
      <main className="loading-page" aria-label="Loading Choosen">
        <div className="loading-content"><div className="loading-mark" aria-hidden="true"><span className="loading-dot" /><span className="loading-dot loading-dot--active" /></div><h1>Choosen</h1><p>Watch what you choose.</p></div>
      </main>
    )
  }

  if (reelsCategory) return <Reels category={reelsCategory} onGoHome={closeReels} />

  const renderHome = () => (
    <div className="home-main">
      <p className="home-eyebrow">HOME</p>
      <h1>Hi, Victor <span aria-hidden="true">👋</span></h1>
      <p className="home-subtitle">What do you want to watch today?</p>
      <section className="category-section" aria-labelledby="category-title">
        <h2 id="category-title">Categories</h2>
        <div className="category-grid">
          {filteredCategories.map((category) => <button className={`category-card category-card--${category.tone}`} key={category.name} type="button" onClick={() => handleCategoryClick(category.name)}><span className="category-icon" aria-hidden="true">{category.icon}</span><span className="category-copy"><strong>{category.name}</strong><small>{category.count} {category.count === 1 ? 'video' : 'videos'}</small></span></button>)}
        </div>
        {searchTerm && filteredCategories.length === 0 && <p className="empty-search">No categories found for “{searchTerm}”.</p>}
      </section>
      <section className="continue-section" aria-labelledby="continue-title"><h2 id="continue-title">Continue watching</h2><p className="empty-state">Your recently watched videos will appear here.</p></section>
    </div>
  )

  const renderActiveContent = () => {
    switch (activeTab) {
      case 'Home': return renderHome()
      case 'History': return <History historyItems={historyItems} onClearHistory={() => setHistoryItems([])} />
      case 'Profile': return <Profile path={profilePath} onNavigate={navigateProfile} />
      case 'Search': return <SearchView videos={videoCatalog} query={searchTerm} onQueryChange={setSearchTerm} lists={lists} onListsChange={updateLists} storageError={storageError} />
      case 'Lists': return <ListsView lists={lists} onListsChange={updateLists} availableVideos={videoCatalog} storageError={storageError} />
      default: return renderHome()
    }
  }

  return (
    <main className="home-page" aria-label="Choosen application">
      <aside className="sidebar" aria-label="Main navigation"><div className="sidebar-brand">CHOOSEN</div><nav className="sidebar-nav">{navigationItems.map((item) => <button className={`sidebar-item${activeTab === item.label ? ' sidebar-item--active' : ''}`} key={item.label} type="button" onClick={() => handleNavigation(item.label)} aria-current={activeTab === item.label ? 'page' : undefined}><span className="sidebar-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</nav></aside>
      <section className="home-content" aria-label={`${activeTab} content`}>
        <header className="top-bar"><div className="top-bar-brand">CHOOSEN</div><form className="search-box" role="search" aria-label="Quick video search" onSubmit={(event) => { event.preventDefault(); setActiveTab('Search') }}><span className="search-box-icon" aria-hidden="true">⌕</span><label className="visually-hidden" htmlFor="quick-video-search">Search videos</label><input id="quick-video-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search videos..." /></form><button className="notification-button" type="button" aria-label="Notifications">♧</button></header>
        {renderActiveContent()}
      </section>
    </main>
  )
}

export default App
