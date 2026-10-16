import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ListsView from './pages/ListsView'
import SearchView from './pages/SearchView'
import Finds from './pages/Finds'
import CommunityView from './pages/CommunityView'
import CommunityDetail from './pages/CommunityDetail'
import useLists from './hooks/useLists'
import useCommunities from './hooks/useCommunities'
import useCommunityNiches from './hooks/useCommunityNiches'
import useHistory from './hooks/useHistory'
import useMyTime from './hooks/useMyTime'
import { videoCatalog } from './data/videoCatalog'
import Profile from './pages/profile/Profile'
import History from './pages/History'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import { clearSession, getSession } from './hooks/session'
import { findCommunity, partitionCommunities } from './data/communities'
import { countByCommunity, hydrate } from './lib/findsIndex'
import { formatTime, recentlyWatched } from './lib/usage'
import { buildUrl, homeState, parseUrl } from './lib/navigation'
import './App.css'

function getProfilePathFromUrl() {
  return window.location.pathname.startsWith('/profile') ? window.location.pathname : null
}

// `id` é o identificador estável da aba: é o valor de `activeTab`, do
// `communityOrigin` e dos casos do switch de `renderActiveContent`. `label` é
// apenas o rótulo exibido, livre para ser traduzido sem afetar a navegação.
const navigationItems = [
  { id: 'Home', label: 'Início', icon: '⌂' },
  { id: 'Search', label: 'Buscar', icon: '⌕' },
  { id: 'Community', label: 'Comunidades', icon: '◉' },
  { id: 'Lists', label: 'Listas', icon: '≡' },
  { id: 'History', label: 'Histórico', icon: '◷' },
  { id: 'Profile', label: 'Perfil', icon: '♙' },
]

function tabLabel(tabId) {
  return navigationItems.find((item) => item.id === tabId)?.label ?? tabId
}

// Card de comunidade da Home: nome, ícone, descrição,
// membros e a contagem de finds da comunidade.
function CommunityTile({ community, onOpen }) {
  const videoCount = countByCommunity(community.id)

  return (
    <button
      className={`community-tile community-tile--${community.tone}`}
      type="button"
      onClick={() => onOpen(community.id)}
      aria-label={`Abrir ${community.name}`}
    >
      <span className="community-tile-icon" aria-hidden="true">{community.icon}</span>
      <span className="community-tile-copy">
        <strong>{community.name}</strong>
        <small className="community-tile-description">{community.description}</small>
        <small className="community-tile-meta">
          {community.memberCount.toLocaleString('pt-BR')} membros
          <span aria-hidden="true"> · </span>
          {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
        </small>
      </span>
    </button>
  )
}

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const [session, setSession] = useState(getSession)
  // Sem sessão, qual tela de acesso mostrar: 'login', 'signup' (cadastro) ou
  // 'forgot' (esqueci a senha).
  const [authScreen, setAuthScreen] = useState('login')
  const [nav, setNav] = useState(() => parseUrl(window.location.search))
  const [profilePath, setProfilePath] = useState(() => getProfilePathFromUrl() ?? '/profile')
  const [activeTab, setActiveTab] = useState(() => getProfilePathFromUrl() ? 'Profile' : 'Home')
  // Aba de onde a Tela_Comunidade foi aberta: o controle de retorno
  // volta para ela sem tocar no histórico do navegador.
  const [communityOrigin, setCommunityOrigin] = useState('Home')
  const { lists, updateLists, storageError } = useLists()
  const {
    memberships,
    joinCommunity,
    leaveCommunity,
    storageError: communityStorageError,
  } = useCommunities()
  const {
    nichesFor,
    toggleNiche,
    clearNiches,
    storageError: nicheStorageError,
  } = useCommunityNiches()
  const {
    events,
    recordView,
    clearHistory,
    storageError: historyStorageError,
  } = useHistory()
  const myTime = useMyTime()
  // Perfis seguidos e finds salvos no Finds. Por enquanto só em memória: a
  // persistência entra quando o Model tiver um serviço para isso.
  const [followedAuthors, setFollowedAuthors] = useState([])
  const [savedFindIds, setSavedFindIds] = useState([])
  const toggleIn = (setter) => (value) =>
    setter((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
  const toggleFollow = toggleIn(setFollowedAuthors)
  const toggleSave = toggleIn(setSavedFindIds)

  // `useWatchTracking` em Finds guarda `onFindWatched` nas dependências dos
  // próprios efeitos: uma identidade nova a cada render contabilizaria a mesma
  // visualização mais de uma vez. O ref mantém a identidade estável.
  const recordViewRef = useRef(recordView)
  useEffect(() => {
    recordViewRef.current = recordView
  })
  const handleFindWatched = useCallback((findId, seconds) => {
    recordViewRef.current(findId, seconds)
  }, [])

  // Aderidas (mais recentes primeiro) e sugeridas (ordem do catálogo).
  const { joined, suggested } = useMemo(() => partitionCommunities(memberships), [memberships])

  // Requisito 7.1: os quatro eventos mais recentes, já com o find anexado.
  const recent = useMemo(() => hydrate(recentlyWatched(events, 4)), [events])

  useEffect(() => {
    const loadingTimer = setTimeout(() => setIsLoading(false), 1500)
    return () => clearTimeout(loadingTimer)
  }, [])

  // A URL suja é trocada sem criar entrada nova no histórico.
  useEffect(() => {
    if (nav.sanitized) window.history.replaceState(null, '', buildUrl(nav))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.sanitized])

  // Precedência de URL: o pathname decide primeiro. Sob `/profile` a tela é
  // Profile e a query string é ignorada; fora dela, `parseUrl` decide a visão.
  useEffect(() => {
    const handlePopState = () => {
      const nextProfilePath = getProfilePathFromUrl()
      if (nextProfilePath) {
        setNav(homeState)
        setProfilePath(nextProfilePath)
        setActiveTab('Profile')
        return
      }
      const next = parseUrl(window.location.search)
      setNav(next)
      if (next.screen !== 'home') setActiveTab('Home')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (next) => {
    window.history.pushState(null, '', buildUrl(next))
    setNav(next)
  }

  const openCommunity = (communityId) => {
    setCommunityOrigin(activeTab)
    navigate({ screen: 'comunidade', communityId, findId: null })
  }

  // retorno próprio da Tela_Comunidade, sem history.back().
  const leaveCommunityDetail = () => {
    navigate(homeState)
    setActiveTab(communityOrigin)
  }

  const openFinds = (communityId, findId = null) => {
    navigate({ screen: 'finds', communityId, findId })
  }

  const goHome = () => {
    navigate(homeState)
    setActiveTab('Home')
  }

  const navigateProfile = (path) => {
    window.history.pushState(null, '', path)
    setProfilePath(path)
    setActiveTab('Profile')
  }

  // Sair apaga a sessão salva: na próxima abertura o login aparece de novo.
  const handleSignOut = () => {
    clearSession()
    window.history.pushState(null, '', '/')
    setNav(homeState)
    setProfilePath('/profile')
    setActiveTab('Home')
    setAuthScreen('login')
    setSession(null)
  }

  const handleNavigation = (tab) => {
    if (tab === 'Profile') {
      navigateProfile('/profile')
      return
    }
    // Sair da Profile ou de uma visão de comunidade limpa a URL: o menu lateral
    // sempre leva a uma visão de Home.
    if (getProfilePathFromUrl() || nav.screen !== 'home') {
      window.history.pushState(null, '', '/')
      setNav(homeState)
    }
    setActiveTab(tab)
  }

  if (isLoading) {
    return (
      <main className="loading-page" aria-label="Carregando Choosen">
        <div className="loading-content"><div className="loading-mark" aria-hidden="true"><span className="loading-dot" /><span className="loading-dot loading-dot--active" /></div><h1>Choosen</h1><p>Escolha o que você assiste.</p></div>
      </main>
    )
  }

  // Login só na primeira vez: com sessão salva, o app abre direto (inclusive pelos links de Finds).
  if (!session) {
    const goToLogin = () => setAuthScreen('login')
    if (authScreen === 'signup') return <SignUp onSignUp={setSession} onGoToLogin={goToLogin} />
    if (authScreen === 'forgot') return <ForgotPassword onGoToLogin={goToLogin} />
    return (
      <Login
        onLogin={setSession}
        onCreateAccount={() => setAuthScreen('signup')}
        onForgotPassword={() => setAuthScreen('forgot')}
      />
    )
  }

  // Primeiro nome de quem entrou, para a saudação da Home.
  const firstName = session.name?.trim().split(/\s+/)[0] || 'você'

  if (nav.screen === 'finds') {
    return (
      <Finds
        category={nav.category ?? null}
        communityId={nav.communityId}
        niches={nav.communityId ? nichesFor(nav.communityId) : []}
        initialFindId={nav.findId}
        onFindWatched={handleFindWatched}
        onGoHome={goHome}
        memberships={memberships}
        onJoinCommunity={joinCommunity}
        onLeaveCommunity={leaveCommunity}
        followedAuthors={followedAuthors}
        onToggleFollow={toggleFollow}
        savedFindIds={savedFindIds}
        onToggleSave={toggleSave}
      />
    )
  }

  const renderHome = () => (
    <div className="home-main">
      <p className="home-eyebrow">HOME</p>
      <h1>Olá, {firstName} <span aria-hidden="true">👋</span></h1>
      <p className="home-subtitle">O que você quer assistir hoje?</p>

      <section className="home-section" aria-labelledby="home-communities-title">
        <h2 id="home-communities-title">Suas comunidades</h2>
        {joined.length === 0 ? (
          <p className="empty-state">
            Você ainda não entrou em nenhuma comunidade. Escolha uma abaixo para começar.
          </p>
        ) : (
          <div className="community-tile-grid">
            {joined.map((community) => (
              <CommunityTile key={community.id} community={community} onOpen={openCommunity} />
            ))}
          </div>
        )}
      </section>

      {suggested.length > 0 && (
        <section className="home-section" aria-labelledby="home-suggestions-title">
          <h2 id="home-suggestions-title">Talvez você goste dessas comunidades</h2>
          <div className="community-tile-grid">
            {suggested.map((community) => (
              <CommunityTile key={community.id} community={community} onOpen={openCommunity} />
            ))}
          </div>
        </section>
      )}

      <section className="home-section" aria-labelledby="home-recent-title">
        <h2 id="home-recent-title">Assistidos recentemente</h2>
        {recent.length === 0 ? (
          <p className="empty-state">Os vídeos que você assistiu recentemente aparecerão aqui.</p>
        ) : (
          <div className="home-recent-grid">
            {recent.map(({ find, watchedAt }) => (
              <button
                className="home-recent-card"
                key={find.id}
                type="button"
                onClick={() => openFinds(find.communityId, find.id)}
              >
                <img className="home-recent-thumb" src={find.image} alt="" />
                <span className="home-recent-copy">
                  <strong>{find.title}</strong>
                  <small>@{find.author}</small>
                  <small className="home-recent-time">{formatTime(watchedAt)}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  // A Tela_Comunidade mora na URL, não na aba: quando `nav` aponta para ela,
  // ela tem precedência sobre `activeTab` dentro do mesmo shell.
  const activeCommunity = nav.screen === 'comunidade' ? findCommunity(nav.communityId) : null

  const renderActiveContent = () => {
    if (activeCommunity) {
      return (
        <CommunityDetail
          community={activeCommunity}
          selectedNiches={nichesFor(activeCommunity.id)}
          onToggleNiche={(nicheId) => toggleNiche(activeCommunity.id, nicheId)}
          onClearNiches={() => clearNiches(activeCommunity.id)}
          onOpenFind={(findId) => openFinds(activeCommunity.id, findId)}
          onBack={leaveCommunityDetail}
          isJoined={memberships.some((membership) => membership.id === activeCommunity.id)}
          onJoin={joinCommunity}
          onLeave={leaveCommunity}
          storageError={nicheStorageError}
        />
      )
    }

    switch (activeTab) {
      case 'Home': return renderHome()
      case 'History': return <History events={events} onClearHistory={clearHistory} onOpenFind={openFinds} onOpenCommunity={openCommunity} />
      case 'Profile': return <Profile path={profilePath} onNavigate={navigateProfile} onSignOut={handleSignOut} events={events} clearHistory={clearHistory} myTime={myTime} />
      case 'Search': return <SearchView videos={videoCatalog} lists={lists} onListsChange={updateLists} storageError={storageError} />
      case 'Community': return <CommunityView memberships={memberships} onJoin={joinCommunity} onLeave={leaveCommunity} onOpenCommunity={(communityId) => openCommunity(communityId)} storageError={communityStorageError} />
      case 'Lists': return <ListsView lists={lists} onListsChange={updateLists} availableVideos={videoCatalog} storageError={storageError} />
      default: return renderHome()
    }
  }

  return (
    <main className="home-page" aria-label="Aplicativo Choosen">
      <aside className="sidebar" aria-label="Navegação principal"><div className="sidebar-brand">CHOOSEN</div><nav className="sidebar-nav">{navigationItems.map((item) => <button className={`sidebar-item${activeTab === item.id ? ' sidebar-item--active' : ''}`} key={item.id} type="button" onClick={() => handleNavigation(item.id)} aria-current={activeTab === item.id ? 'page' : undefined}><span className="sidebar-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</nav></aside>
      <section className="home-content" aria-label={`Conteúdo de ${tabLabel(activeTab)}`}>
        <header className="top-bar"><div className="top-bar-brand">CHOOSEN</div><button className="notification-button" type="button" aria-label="Notificações">♧</button></header>
        {/* Histórico e preferências de tempo não têm tela dona do próprio erro,
            então as falhas de armazenamento aparecem aqui, no mesmo padrão
            visual do erro de listas. */}
        {historyStorageError && <p className="shell-storage-error" role="alert">{historyStorageError}</p>}
        {myTime.storageError && <p className="shell-storage-error" role="alert">{myTime.storageError}</p>}
        {renderActiveContent()}
      </section>
    </main>
  )
}

export default App
