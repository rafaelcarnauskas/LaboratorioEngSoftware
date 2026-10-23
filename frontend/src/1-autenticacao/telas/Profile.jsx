import { useEffect, useRef, useState } from 'react'
import { loadProfile, mensagemDeErro } from '../orquestrador'
import MyPlan from './MyPlan'
import GroupSettings from '../../5-historico/telas/GroupSettings'
import EditProfile, { ProfileAvatar } from './EditProfile'
import ChangePassword from './ChangePassword'
import Notifications from '../../5-historico/telas/Notifications'
import WhatsappAlerts from '../../5-historico/telas/WhatsappAlerts'
import ManageCommunities from '../../2-comunidades/telas/ManageCommunities'
import SystemAdmin from '../../2-comunidades/telas/SystemAdmin'
import MyTimeView from '../../5-historico/telas/MyTime'

const profileRoutes = {
  '/profile': { title: 'Configurações do perfil', description: 'Gerencie suas informações pessoais, seu plano de assinatura e as preferências do seu espaço.' },
  '/profile/admin': { title: 'Administrar comunidades' },
  '/profile/edit': { title: 'Editar perfil' },
  '/profile/password': { title: 'Alterar senha' },
  '/profile/plan': { title: 'Meu plano' },
  '/profile/group-settings': { title: 'Configurações do grupo' },
  '/profile/notifications': { title: 'Notificações' },
  '/profile/whatsapp-alerts': { title: 'Alertas no WhatsApp' },
  '/profile/system-admin': { title: 'Administrador do sistema' },
  '/profile/sign-out': { title: 'Sair' },
}

const MENSAGEM_PERFIL_NAO_CARREGADO = 'Não foi possível carregar o perfil.'

// O Perfil_Publico chega da API com strings e booleanos; a normalização só
// garante os tipos que `ProfileAvatar` e `EditProfile` usam (`.trim()`, `.length`).
function normalizarPerfil(perfil) {
  const texto = (valor) => (typeof valor === 'string' ? valor : '')
  return {
    ...perfil,
    name: texto(perfil?.name),
    username: texto(perfil?.username),
    email: texto(perfil?.email),
    description: texto(perfil?.description),
    photo: texto(perfil?.photo),
    isCommunityAdmin: perfil?.isCommunityAdmin === true,
    isSystemAdmin: perfil?.isSystemAdmin === true,
  }
}

// `clearHistory` também chega do App junto com `events` e `myTime`, mas
// nenhuma subtela do perfil o usa hoje (a limpeza fica na aba Histórico);
// por isso não é desestruturado.
function Profile({ path = '/profile', onNavigate, onSignOut, events = [], myTime }) {
  const route = profileRoutes[path] ?? profileRoutes['/profile']
  // Perfil_Publico vindo de `GET /usuarios/me`, sem dados fixos (6.3).
  // status: 'carregando' | 'erro' | 'pronto'.
  const [carga, setCarga] = useState({ status: 'carregando', perfil: null, erro: '' })
  // Comunidade escolhida em "Gerenciar" no Administrador do sistema: abre
  // Administrar comunidades já com ela selecionada.
  const [managedCommunityId, setManagedCommunityId] = useState(null)

  // Uma requisição por abertura de `/profile` (6.1). `/profile/edit` aberto
  // direto pela URL, sem perfil em memória, também carrega (o formulário
  // precisa dos dados). Cada passagem de `deveCarregar` para `true` é uma nova
  // abertura: o estado é ajustado durante o render (padrão do React para
  // derivar estado de props) e o efeito dispara a requisição.
  const deveCarregar = path === '/profile' || (path === '/profile/edit' && carga.perfil === null)
  const [carregavaAntes, setCarregavaAntes] = useState(false)
  const [abertura, setAbertura] = useState(0)
  if (deveCarregar !== carregavaAntes) {
    setCarregavaAntes(deveCarregar)
    if (deveCarregar) {
      setAbertura((atual) => atual + 1)
      // Indicador no lugar dos dados enquanto a resposta não chega (6.6).
      setCarga((atual) => ({ status: 'carregando', perfil: atual.perfil, erro: '' }))
    }
  }

  const montadoRef = useRef(false)
  // Última abertura já requisitada: o StrictMode repete o efeito na montagem
  // e isso não pode virar uma segunda requisição.
  const aberturaRequisitadaRef = useRef(0)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!deveCarregar || abertura === aberturaRequisitadaRef.current) return
    aberturaRequisitadaRef.current = abertura

    // A resposta só vale para a abertura mais recente; navegar para uma
    // subtela não descarta o pedido em andamento.
    loadProfile().then(
      (perfil) => {
        if (!montadoRef.current || aberturaRequisitadaRef.current !== abertura) return
        setCarga({ status: 'pronto', perfil: normalizarPerfil(perfil), erro: '' })
      },
      (erro) => {
        // Sessão inválida: o aviso global do App leva ao login. Rede/servidor:
        // mensagem do mapa único. Em nenhum caso a sessão salva é apagada aqui (6.7).
        if (!montadoRef.current || aberturaRequisitadaRef.current !== abertura) return
        setCarga((atual) => ({ status: 'erro', perfil: atual.perfil, erro: mensagemDeErro(erro) }))
      },
    )
  }, [deveCarregar, abertura])

  // Perfil devolvido pelo Backend após a edição: a Tela_Perfil passa a exibi-lo
  // sem recarregar a página (7.6).
  const handleProfileSaved = (perfil) => {
    setCarga({ status: 'pronto', perfil: normalizarPerfil(perfil), erro: '' })
  }

  if (path === '/profile/my-time') {
    return (
      <MyTimeView
        events={events}
        myTime={myTime}
        onBack={() => onNavigate('/profile')}
      />
    )
  }

  if (path === '/profile/plan') {
    return <MyPlan onBack={() => onNavigate('/profile')} />
  }

  if (path === '/profile/group-settings') {
    return <GroupSettings onBack={() => onNavigate('/profile')} />
  }

  if (path === '/profile/edit') {
    if (carga.perfil === null) {
      return (
        <div className="profile-subpage" aria-busy={carga.status === 'carregando'}>
          <button className="profile-back-button" type="button" onClick={() => onNavigate('/profile')}>← Voltar ao perfil</button>
          <p className="profile-eyebrow">PERFIL</p>
          <h1>{route.title}</h1>
          <ProfileLoadState carga={carga} />
        </div>
      )
    }
    // `onSaved` recebe o Perfil_Publico devolvido pelo Backend (7.6);
    // `onSave` mantém o contrato atual do EditProfile até ele chamar `onSaved`.
    return (
      <EditProfile
        profile={carga.perfil}
        onSaved={handleProfileSaved}
        onSave={handleProfileSaved}
        onBack={() => onNavigate('/profile')}
      />
    )
  }

  if (path === '/profile/password') {
    return <ChangePassword onBack={() => onNavigate('/profile')} />
  }

  if (path === '/profile/notifications') {
    return <Notifications onBack={() => onNavigate('/profile')} />
  }

  if (path === '/profile/whatsapp-alerts') {
    return <WhatsappAlerts onBack={() => onNavigate('/profile')} />
  }

  if (path === '/profile/admin') {
    return (
      <ManageCommunities
        key={managedCommunityId ?? 'default'}
        initialCommunityId={managedCommunityId}
        onBack={() => onNavigate('/profile')}
        onOpenSystemAdmin={() => onNavigate('/profile/system-admin')}
      />
    )
  }

  if (path === '/profile/system-admin') {
    return (
      <SystemAdmin
        onBack={() => onNavigate('/profile')}
        onManageCommunity={(communityId) => {
          setManagedCommunityId(communityId)
          onNavigate('/profile/admin')
        }}
      />
    )
  }

  if (path !== '/profile') {
    return <ProfilePlaceholder title={route.title} onBack={() => onNavigate('/profile')} />
  }

  return <ProfileOverview carga={carga} onNavigate={onNavigate} onSignOut={onSignOut} />
}

// Indicador de carregamento (6.6) ou mensagem de perfil não carregado (6.7).
function ProfileLoadState({ carga }) {
  if (carga.status === 'erro') {
    return (
      <div className="profile-load-error" role="alert" data-testid="perfil-erro">
        <strong>{MENSAGEM_PERFIL_NAO_CARREGADO}</strong>
        {carga.erro && <small>{carga.erro}</small>}
      </div>
    )
  }
  return (
    <p className="profile-loading" role="status" data-testid="perfil-carregando">
      Carregando perfil…
    </p>
  )
}

function ProfileOverview({ carga, onNavigate, onSignOut }) {
  // Dados e botões de administração só com o perfil carregado (6.3, 6.5–6.7).
  const profile = carga.status === 'pronto' ? carga.perfil : null

  // O Sair fica bloqueado enquanto o App conclui o logout: um acionamento,
  // uma chamada (9.1). A ref segura o segundo clique antes do re-render.
  const [saindo, setSaindo] = useState(false)
  const saindoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  async function handleSignOut() {
    if (!onSignOut) {
      onNavigate('/profile/sign-out')
      return
    }
    if (saindoRef.current) return
    saindoRef.current = true
    setSaindo(true)
    try {
      await onSignOut()
    } finally {
      // Normalmente o App já trocou de tela e este componente saiu da árvore.
      saindoRef.current = false
      if (montadoRef.current) setSaindo(false)
    }
  }

  return (
    <div className="profile-main">
      <div className="profile-heading">
        <p className="profile-eyebrow">PERFIL</p>
        <h1>Configurações do perfil</h1>
        <p>Gerencie suas informações pessoais, seu plano de assinatura e as preferências do seu espaço.</p>
      </div>

      <div className="profile-layout">
        <div className="profile-column">
          <section
            className="profile-card profile-user-card"
            aria-label="Perfil do usuário"
            aria-busy={carga.status === 'carregando'}
          >
            {profile ? (
              <>
                <div className="profile-user">
                  <ProfileAvatar profile={profile} />
                  <div>
                    <strong>{profile.name}</strong>
                    <small>@{profile.username}</small>
                    <small>{profile.email}</small>
                    {profile.description.length > 0 && <small className="profile-description">{profile.description}</small>}
                  </div>
                </div>
                {profile.isCommunityAdmin && (
                  <ProfileLink className="admin-button" label="▣  Administrar comunidades ↗" onClick={() => onNavigate('/profile/admin')} />
                )}
                {profile.isSystemAdmin && (
                  <ProfileLink className="admin-button profile-system-admin-button" label="⚙  Administração do sistema ↗" onClick={() => onNavigate('/profile/system-admin')} />
                )}
              </>
            ) : (
              <ProfileLoadState carga={carga} />
            )}
          </section>

          <ProfileSection id="profile-account" title="CONTA">
            <ProfileAction icon="♙" label="Editar perfil" onClick={() => onNavigate('/profile/edit')} />
            <ProfileAction icon="♙" label="Alterar senha" onClick={() => onNavigate('/profile/password')} />
          </ProfileSection>

          <ProfileSection id="profile-system" title="SISTEMA">
            <ProfileAction className="profile-action--danger" icon="⇥" label="Sair" onClick={handleSignOut} busy={saindo} />
          </ProfileSection>
        </div>

        <div className="profile-column">
          <ProfileSection id="profile-usage" title="USO">
            <ProfileAction icon="◷" label="Meu tempo" onClick={() => onNavigate('/profile/my-time')} />
          </ProfileSection>

          <ProfileSection id="profile-plan" title="PLANO">
            <ProfileAction icon="▣" label="Meu plano" onClick={() => onNavigate('/profile/plan')} />
            <ProfileAction icon="♧" label="Configurações do grupo" onClick={() => onNavigate('/profile/group-settings')} />
          </ProfileSection>

          <ProfileSection id="profile-preferences" title="PREFERÊNCIAS">
            <ProfileAction icon="♧" label="Notificações" onClick={() => onNavigate('/profile/notifications')} />
            <ProfileAction icon="◯" label="Alertas no WhatsApp" onClick={() => onNavigate('/profile/whatsapp-alerts')} />
          </ProfileSection>
        </div>
      </div>
    </div>
  )
}

function ProfileLink({ className, label, onClick }) {
  return <button className={className} type="button" onClick={onClick}>{label}</button>
}

function ProfilePlaceholder({ title, onBack }) {
  return (
    <div className="profile-subpage">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>
      <p className="profile-eyebrow">PERFIL</p>
      <h1>{title}</h1>
      <p>Esta página está pronta para receber a sua própria implementação.</p>
    </div>
  )
}

// O `id` do `aria-labelledby` é recebido por prop: títulos traduzidos têm
// acentos e não geram identificadores estáveis quando derivados do texto.
function ProfileSection({ id, title, children }) {
  const sectionId = id ?? `profile-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section className="profile-section" aria-labelledby={sectionId}>
      <h2 id={sectionId}>{title}</h2>
      <div className="profile-actions">{children}</div>
    </section>
  )
}

function ProfileAction({ className = '', icon, label, onClick, busy = false }) {
  return (
    <button
      className={`profile-action ${className}`.trim()}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
    >
      <span className="profile-action-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="profile-action-arrow" aria-hidden="true">›</span>
    </button>
  )
}

export default Profile
