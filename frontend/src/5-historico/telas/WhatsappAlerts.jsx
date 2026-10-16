import { useState } from 'react'
import { notificationTypes } from './Notifications'

const initialAlerts = Object.fromEntries(notificationTypes.map(({ key }) => [key, true]))

function WhatsappSwitch({ checked, label, onChange }) {
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

export default function WhatsappAlerts({ onBack }) {
  const [phone, setPhone] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [quietHours, setQuietHours] = useState(true)
  const [alerts, setAlerts] = useState(initialAlerts)
  const [notice, setNotice] = useState('')

  function toggleAlert(key) {
    setAlerts((current) => ({ ...current, [key]: !current[key] }))
    setNotice('')
  }

  function handleConnect(event) {
    event.preventDefault()
    if (phone.replace(/\D/g, '').length < 10) {
      setNotice('Informe um número de WhatsApp válido com DDD.')
      return
    }

    setEnabled(true)
    setNotice('WhatsApp configurado para esta sessão.')
  }

  return (
    <div className="profile-subpage whatsapp-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="whatsapp-heading">
        <p className="profile-eyebrow">PREFERÊNCIAS</p>
        <h1>Alertas no WhatsApp</h1>
        <p>Receba os avisos mais importantes do Choosen diretamente na sua conversa.</p>
      </header>

      <div className={`whatsapp-status${enabled ? ' whatsapp-status--active' : ''}`}>
        <span className="whatsapp-status-icon" aria-hidden="true">◉</span>
        <div>
          <strong>{enabled ? 'WhatsApp conectado' : 'Conecte seu WhatsApp'}</strong>
          <p>{enabled ? `Os alertas serão enviados para ${phone}.` : 'Adicione um número para começar a receber alertas.'}</p>
        </div>
        <span className="whatsapp-status-label">{enabled ? 'ATIVO' : 'INATIVO'}</span>
      </div>

      <form className="whatsapp-form" onSubmit={handleConnect}>
        <section className="notification-panel whatsapp-panel" aria-labelledby="whatsapp-number-title">
          <div className="notification-panel-heading">
            <span className="notification-kicker">DESTINO</span>
            <h2 id="whatsapp-number-title">Número do WhatsApp</h2>
          </div>
          <label className="whatsapp-phone-field">
            <span>Número com DDD</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => { setPhone(event.target.value); setNotice('') }}
              placeholder="+55 (11) 99999-9999"
              autoComplete="tel"
              required
            />
            <small>Usaremos este número apenas para enviar os alertas escolhidos por você.</small>
          </label>
        </section>

        <section className="notification-panel whatsapp-panel" aria-labelledby="whatsapp-events-title">
          <div className="notification-panel-heading">
            <span className="notification-kicker">ALERTAS</span>
            <h2 id="whatsapp-events-title">O que enviar no WhatsApp</h2>
          </div>
          {notificationTypes.map((notification, index) => (
            <div className={`notification-option${index === notificationTypes.length - 1 ? ' notification-option--last' : ''}`} key={notification.key}>
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.description}</p>
              </div>
              <WhatsappSwitch
                checked={alerts[notification.key]}
                label={`${notification.title} no WhatsApp: ${alerts[notification.key] ? 'ativado' : 'desativado'}`}
                onChange={() => toggleAlert(notification.key)}
              />
            </div>
          ))}
        </section>

        <section className="notification-panel whatsapp-panel" aria-labelledby="whatsapp-schedule-title">
          <div className="notification-panel-heading">
            <span className="notification-kicker">HORÁRIO</span>
            <h2 id="whatsapp-schedule-title">Respeitar horário de silêncio</h2>
          </div>
          <div className="notification-option notification-option--last">
            <div>
              <strong>Não enviar alertas entre 22h e 8h</strong>
              <p>As notificações serão entregues no dia seguinte, sem interromper seu descanso.</p>
            </div>
            <WhatsappSwitch checked={quietHours} label={`Horário de silêncio: ${quietHours ? 'ativado' : 'desativado'}`} onChange={() => setQuietHours((current) => !current)} />
          </div>
        </section>

        {notice && <p className={`whatsapp-notice${enabled ? ' whatsapp-notice--success' : ''}`} role={enabled ? 'status' : 'alert'}>{notice}</p>}
        <div className="edit-profile-actions">
          <button className="edit-profile-cancel" type="button" onClick={onBack}>Cancelar</button>
          <button className="edit-profile-save" type="submit">{enabled ? 'Atualizar WhatsApp' : 'Ativar alertas'}</button>
        </div>
      </form>
    </div>
  )
}
