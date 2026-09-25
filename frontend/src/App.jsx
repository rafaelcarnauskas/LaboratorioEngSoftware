import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [isLoading, setIsLoading] = useState(true)

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

  return <main className="home-page" aria-label="Choosen home page" />
}

export default App
