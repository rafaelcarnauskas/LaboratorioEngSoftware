import { useState } from 'react'
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

function Profile({ path = '/profile', onNavigate, onSignOut, events = [], clearHistory, myTime }) {
  const route = profileRoutes[path] ?? profileRoutes['/profile']
  const [profile, setProfile] = useState({
    name: 'Victor Mendes',
    username: 'victor',
    email: 'victor@email.com',
    description: 'Compartilhando o que escolho assistir.',
    photo: '',
    isCommunityAdmin: true,
    isSystemAdmin: true,
  })
  // Comunidade escolhida em "Gerenciar" no Administrador do sistema: abre
  // Administrar comunidades já com ela selecionada.
  const [managedCommunityId, setManagedCommunityId] = useState(null)

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
    return (
      <EditProfile
        profile={profile}
        onSave={(nextProfile) => setProfile(nextProfile)}
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

  return <ProfileOverview profile={profile} onNavigate={onNavigate} onSignOut={onSignOut} />
}

function ProfileOverview({ profile, onNavigate, onSignOut }) {
  return (
    <div className="profile-main">
      <div className="profile-heading">
        <p className="profile-eyebrow">PERFIL</p>
        <h1>Configurações do perfil</h1>
        <p>Gerencie suas informações pessoais, seu plano de assinatura e as preferências do seu espaço.</p>
      </div>

      <div className="profile-layout">
        <div className="profile-column">
          <section className="profile-card profile-user-card" aria-label="Perfil do usuário">
            <div className="profile-user">
              <ProfileAvatar profile={profile} />
              <div>
                <strong>{profile.name}</strong>
                <small>@{profile.username}</small>
                <small>{profile.email}</small>
                {profile.description && <small className="profile-description">{profile.description}</small>}
              </div>
            </div>
            {profile.isCommunityAdmin && (
              <ProfileLink className="admin-button" label="▣  Administrar comunidades ↗" onClick={() => onNavigate('/profile/admin')} />
            )}
            {profile.isSystemAdmin && (
              <ProfileLink className="admin-button profile-system-admin-button" label="⚙  Administração do sistema ↗" onClick={() => onNavigate('/profile/system-admin')} />
            )}
          </section>

          <ProfileSection id="profile-account" title="CONTA">
            <ProfileAction icon="♙" label="Editar perfil" onClick={() => onNavigate('/profile/edit')} />
            <ProfileAction icon="♙" label="Alterar senha" onClick={() => onNavigate('/profile/password')} />
          </ProfileSection>

          <ProfileSection id="profile-system" title="SISTEMA">
            <ProfileAction className="profile-action--danger" icon="⇥" label="Sair" onClick={onSignOut ?? (() => onNavigate('/profile/sign-out'))} />
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

function ProfileAction({ className = '', icon, label, onClick }) {
  return (
    <button className={`profile-action ${className}`.trim()} type="button" onClick={onClick}>
      <span className="profile-action-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <span className="profile-action-arrow" aria-hidden="true">›</span>
    </button>
  )
}

export default Profile
