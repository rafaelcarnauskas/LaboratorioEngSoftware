import { useState } from 'react'
import { notificationTypes } from './notificationTypes'

const initialPreferences = {
  push: true,
  email: false,
  sound: true,
  vibration: true,
  newVideos: true,
  likes: true,
  comments: true,
}

function PreferenceSwitch({ checked, label, onChange }) {
  return (
    <button
      className={`notification-switch${checked ? ' is-enabled' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  )
}

export default function Notifications({ onBack }) {
  const [preferences, setPreferences] = useState(initialPreferences)

  function toggle(key) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <div className="profile-subpage notifications-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="notifications-heading">
        <p className="profile-eyebrow">PREFERÊNCIAS</p>
        <h1>Notificações</h1>
        <p>Escolha quais novidades você quer receber e como deseja ser avisado.</p>
      </header>

      <div className="notifications-sections">
        <section className="notification-panel" aria-labelledby="notification-channels-title">
          <div className="notification-panel-heading">
            <div>
              <span className="notification-kicker">CANAIS</span>
              <h2 id="notification-channels-title">Onde receber notificações</h2>
            </div>
          </div>
          <NotificationOption title="Notificações no dispositivo" description="Receba alertas enquanto usa o aplicativo." checked={preferences.push} onChange={() => toggle('push')} />
          <NotificationOption title="E-mail" description="Receba um resumo das novidades na sua caixa de entrada." checked={preferences.email} onChange={() => toggle('email')} isLast />
        </section>

        <section className="notification-panel" aria-labelledby="notification-behavior-title">
          <div className="notification-panel-heading">
            <div>
              <span className="notification-kicker">COMPORTAMENTO</span>
              <h2 id="notification-behavior-title">Som e vibração</h2>
            </div>
          </div>
          <NotificationOption title="Sons de notificação" description="Reproduzir um som quando uma notificação chegar." checked={preferences.sound} onChange={() => toggle('sound')} />
          <NotificationOption title="Vibração" description="Vibrar o dispositivo ao receber uma notificação." checked={preferences.vibration} onChange={() => toggle('vibration')} isLast />
        </section>

        <section className="notification-panel" aria-labelledby="notification-events-title">
          <div className="notification-panel-heading">
            <div>
              <span className="notification-kicker">ATIVIDADE</span>
              <h2 id="notification-events-title">O que você quer acompanhar</h2>
            </div>
          </div>
          {notificationTypes.map((notification, index) => (
            <NotificationOption
              key={notification.key}
              title={notification.title}
              description={notification.description}
              checked={preferences[notification.key]}
              onChange={() => toggle(notification.key)}
              isLast={index === notificationTypes.length - 1}
            />
          ))}
        </section>
      </div>
    </div>
  )
}

function NotificationOption({ title, description, checked, onChange, isLast = false }) {
  return (
    <div className={`notification-option${isLast ? ' notification-option--last' : ''}`}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <PreferenceSwitch checked={checked} label={`${title}: ${checked ? 'ativado' : 'desativado'}`} onChange={onChange} />
    </div>
  )
}
