import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ListsView from '../4-busca-listas/telas/ListsView'
import SearchView from '../4-busca-listas/telas/SearchView'
import Finds from '../3-videos/telas/Finds'
import CommunityView from '../2-comunidades/telas/CommunityView'
import CommunityDetail from '../2-comunidades/telas/CommunityDetail'
import Home from '../2-comunidades/telas/Home'
import { useLists, useVideoCatalog } from '../4-busca-listas/orquestrador'
import useCommunities from '../2-comunidades/modelo/useCommunities'
import useCommunityNiches from '../2-comunidades/modelo/useCommunityNiches'
import useHistory from '../5-historico/modelo/useHistory'
import useMyTime from '../5-historico/modelo/useMyTime'
import Profile from '../1-autenticacao/telas/Profile'
import History from '../5-historico/telas/History'
import Login from '../1-autenticacao/telas/Login'
import SignUp from '../1-autenticacao/telas/SignUp'
import ForgotPassword from '../1-autenticacao/telas/ForgotPassword'
import ResetPassword from '../1-autenticacao/telas/ResetPassword'
import '../1-autenticacao/telas/Login.css'
import { getSession, getToken } from '../1-autenticacao/modelo/session'
import { lerRedefinicaoDaUrl } from '../1-autenticacao/modelo/redefinicao'
import {
  MENSAGEM_ERRO_CONEXAO,
  logOut,
  mensagemDeErro,
  onSessionExpired,
  restoreSession,
} from '../1-autenticacao/orquestrador'
import { findCommunity, partitionCommunities } from '../2-comunidades/modelo/communities'
import { participarNaComunidade } from '../2-comunidades/servico'
import { hydrate } from '../3-videos/modelo/findsIndex'
import { recentlyWatched } from '../5-historico/modelo/usage'
import { buildUrl, homeState, parseUrl } from './navigation'
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

// Usuário salvo em `choosen.session`, só se o token ainda vale. Ele é
// confirmado por `restoreSession()` antes de qualquer tela logada (10.6).
function savedUser() {
  return getToken() !== null ? getSession()?.user ?? null : null
}

function App() {
  const session = getSession()
  const [isLoading, setIsLoading] = useState(true)
  // Link de redefinição (`?tela=redefinir-senha&token=...`), lido antes de
  // `parseUrl`, que descartaria essa `tela` desconhecida (16.1). O token fica só
  // em memória.
  const [redefinicao, setRedefinicao] = useState(() => lerRedefinicaoDaUrl(window.location.search))
  // Perfil_Publico de quem está logado, ou `null`.
  const [user, setUser] = useState(savedUser)
  // 'verificando' (confirmando o token salvo), 'autenticado', 'anonimo' ou
  // 'falha' (rede/servidor na confirmação; a sessão salva é mantida) (10.6–10.8).
  const [authStatus, setAuthStatus] = useState(() => (getToken() !== null ? 'verificando' : 'anonimo'))
  const [authFailure, setAuthFailure] = useState('')
  // Sem sessão, qual tela de acesso mostrar: 'login', 'signup' (cadastro) ou
  // 'forgot' (esqueci a senha).
  const [authScreen, setAuthScreen] = useState('login')
  const [nav, setNav] = useState(() =>
    // Com o link de redefinição, nada é "sanitizado": a URL é tratada abaixo.
    lerRedefinicaoDaUrl(window.location.search) !== null ? homeState : parseUrl(window.location.search),
  )
  const [profilePath, setProfilePath] = useState(() => getProfilePathFromUrl() ?? '/profile')
  const [activeTab, setActiveTab] = useState(() => getProfilePathFromUrl() ? 'Profile' : 'Home')
  // Aba de onde a Tela_Comunidade foi aberta: o controle de retorno
  // volta para ela sem tocar no histórico do navegador.
  const [communityOrigin, setCommunityOrigin] = useState('Home')
  const [communityApiError, setCommunityApiError] = useState('')
  const { lists, updateLists, storageError } = useLists(session?.user?.email)
  const { videos: videoCatalog } = useVideoCatalog()
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
  } = useHistory(session?.user?.email)
  const myTime = useMyTime(session?.user?.email)
  // Perfis seguidos e finds salvos no Finds. Por enquanto só em memória: a
  // persistência entra quando o Model tiver um serviço para isso.
  const [followedAuthors, setFollowedAuthors] = useState([])
  const [savedFindIds, setSavedFindIds] = useState([])
  const toggleIn = (setter) => (value) =>
    setter((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
  const toggleFollow = toggleIn(setFollowedAuthors)
  const toggleSave = toggleIn(setSavedFindIds)

  const handleJoinCommunity = async (communityId) => {
    try {
      await participarNaComunidade(communityId)
      setCommunityApiError('')
      // A resposta do backend confirma a entrada; o hook atualiza a visão local.
      joinCommunity(communityId)
    } catch (error) {
      setCommunityApiError(error.message)
      // O modo local continua disponível para desenvolvimento quando a API
      // ainda não foi iniciada; o erro permanece visível na tela.
      joinCommunity(communityId)
    }
  }

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

  // Confirmação da sessão salva por `GET /usuarios/me` (10.6–10.8). O resultado
  // só é aplicado com o App montado.
  const montadoRef = useRef(false)
  const confirmarSessao = useCallback(async () => {
    try {
      const perfil = await restoreSession()
      if (!montadoRef.current) return
      if (perfil) {
        setUser(perfil)
        setAuthStatus('autenticado')
      } else {
        // Sem token ou 401: a sessão já foi limpa; volta ao Login.
        setUser(null)
        setAuthStatus('anonimo')
        setAuthScreen('login')
      }
    } catch (erro) {
      // Rede, timeout ou 5xx: `choosen.session` é mantida e a Tela_Inicio não abre.
      if (!montadoRef.current) return
      setAuthFailure(mensagemDeErro(erro, MENSAGEM_ERRO_CONEXAO))
      setAuthStatus('falha')
    }
  }, [])

  // A confirmação roda uma única vez por carregamento, mesmo com o efeito
  // executado duas vezes pelo StrictMode (o ref sobrevive à remontagem simulada).
  const deveConfirmarRef = useRef(authStatus === 'verificando')
  useEffect(() => {
    montadoRef.current = true
    // Aviso global de sessão inválida: um 401 de Endpoint_Protegido leva ao
    // Login uma única vez (o próprio módulo garante o aviso único) (10.4, 12.11).
    const cancelarAviso = onSessionExpired(() => {
      setUser(null)
      setAuthStatus('anonimo')
      setAuthScreen('login')
    })
    if (deveConfirmarRef.current) {
      deveConfirmarRef.current = false
      confirmarSessao()
    }
    return () => {
      montadoRef.current = false
      cancelarAviso()
    }
  }, [confirmarSessao])

  const tentarConfirmarDeNovo = () => {
    setAuthStatus('verificando')
    confirmarSessao()
  }

  // O token de redefinição sai da barra de endereço sem criar entrada nova no
  // histórico (16.10).
  useEffect(() => {
    if (redefinicao !== null) window.history.replaceState(null, '', '/?tela=redefinir-senha')
  }, [redefinicao])

  // Sair da Tela_Redefinir_Senha limpa a URL e escolhe a tela de acesso. Se a
  // redefinição concluiu, a sessão salva já foi removida (16.6): o App volta
  // ao fluxo sem login; senão, segue com a sessão que existir.
  const sairDaRedefinicao = (tela) => {
    setRedefinicao(null)
    window.history.replaceState(null, '', '/')
    setAuthScreen(tela)
    if (getToken() === null) {
      setUser(null)
      setAuthStatus('anonimo')
    }
  }

  const entrar = (perfil) => {
    setUser(perfil)
    setAuthStatus('autenticado')
  }

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

  // Sair: uma chamada a `logOut()` por acionamento (a Profile aguarda esta
  // Promise e bloqueia o clique duplo). `logOut()` nunca rejeita e sempre
  // limpa `choosen.session`; depois disso o App abre a Tela_Login (9.1, 9.6).
  const handleSignOut = async () => {
    await logOut()
    window.history.pushState(null, '', '/')
    setNav(homeState)
    setProfilePath('/profile')
    setActiveTab('Home')
    setAuthScreen('login')
    setUser(null)
    setAuthStatus('anonimo')
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

  // Splash enquanto o tempo mínimo corre ou a sessão salva é confirmada: nem a
  // Tela_Inicio nem a Tela_Login aparecem antes da resposta (10.6). O limite de
  // 10 s fica com a Comunicacao_Frontend.
  if (isLoading || authStatus === 'verificando') {
    return (
      <main className="loading-page" aria-label="Carregando Choosen">
        <div className="loading-content"><div className="loading-mark" aria-hidden="true"><span className="loading-dot" /><span className="loading-dot loading-dot--active" /></div><h1>Choosen</h1><p>Escolha o que você assiste.</p></div>
      </main>
    )
  }

  // A Tela_Redefinir_Senha não exige login: tem precedência sobre a sessão (16.1, 10.5).
  if (redefinicao !== null) {
    return (
      <ResetPassword
        key={redefinicao.token ?? ''}
        token={redefinicao.token}
        onGoToLogin={() => sairDaRedefinicao('login')}
        onGoToForgot={() => sairDaRedefinicao('forgot')}
      />
    )
  }

  // Falha de rede/servidor ao confirmar a sessão: a sessão salva continua e o
  // usuário pode tentar de novo (10.8).
  if (authStatus === 'falha') {
    return (
      <main className="login-page" aria-label="Falha ao confirmar a sessão">
        <section className="login-card" aria-labelledby="sessao-falha-titulo">
          <header className="login-header">
            <h1 id="sessao-falha-titulo">Não foi possível confirmar sua sessão</h1>
          </header>
          <p className="login-banner" role="alert" data-testid="sessao-falha">{authFailure}</p>
          <button className="login-submit" type="button" onClick={tentarConfirmarDeNovo} data-testid="sessao-tentar-novamente">
            Tentar novamente
          </button>
        </section>
      </main>
    )
  }

  // Sem sessão válida, só as telas de acesso (10.5). Com sessão confirmada, o
  // app abre direto (inclusive pelos links de Finds).
  if (!user) {
    const goToLogin = () => setAuthScreen('login')
    if (authScreen === 'signup') return <SignUp onSignUp={entrar} onGoToLogin={goToLogin} />
    if (authScreen === 'forgot') return <ForgotPassword onGoToLogin={goToLogin} />
    return (
      <Login
        onLogin={entrar}
        onCreateAccount={() => setAuthScreen('signup')}
        onForgotPassword={() => setAuthScreen('forgot')}
      />
    )
  }

  // Primeiro nome de quem entrou (Perfil_Publico de Login/SignUp ou o restaurado
  // por `GET /usuarios/me`), para a saudação da Home.
  // A sessão salva é lida a cada render para acompanhar a edição do perfil, que
  // troca o Perfil_Publico salvo (`atualizarPerfil`).
  const displayName = getSession()?.user?.name ?? user.name
  const firstName = displayName?.trim().split(/\s+/)[0] || 'você'

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
        onJoinCommunity={handleJoinCommunity}
        onLeaveCommunity={leaveCommunity}
        followedAuthors={followedAuthors}
        onToggleFollow={toggleFollow}
        savedFindIds={savedFindIds}
        onToggleSave={toggleSave}
      />
    )
  }

  const renderHome = () => (
    <Home
      firstName={firstName}
      joined={joined}
      suggested={suggested}
      recent={recent}
      onOpenCommunity={openCommunity}
      onOpenFind={openFinds}
    />
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
          onJoin={handleJoinCommunity}
          onLeave={leaveCommunity}
          storageError={communityApiError || nicheStorageError}
        />
      )
    }

    switch (activeTab) {
      case 'Home': return renderHome()
      case 'History': return <History events={events} onClearHistory={clearHistory} onOpenFind={openFinds} onOpenCommunity={openCommunity} />
      case 'Profile': return <Profile path={profilePath} onNavigate={navigateProfile} onSignOut={handleSignOut} events={events} clearHistory={clearHistory} myTime={myTime} />
      case 'Search': return <SearchView videos={videoCatalog} lists={lists} onListsChange={updateLists} storageError={storageError} />
      case 'Community': return <CommunityView memberships={memberships} onJoin={handleJoinCommunity} onLeave={leaveCommunity} onOpenCommunity={(communityId) => openCommunity(communityId)} storageError={communityApiError || communityStorageError} />
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
