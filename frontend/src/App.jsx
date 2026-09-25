import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Home')

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
      <section className="home-content" aria-label={`${activeTab} content`} />
    </main>
  )
}

export default App
