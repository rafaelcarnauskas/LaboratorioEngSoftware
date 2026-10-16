import { useMemo, useState } from 'react'
import { limitOptions, myTimeSummary } from '../orquestrador'

// Fallback para qualquer montagem sem as props (`App.jsx` repassa o `useMyTime`):
// a tela renderiza com os padrões do Servico_Tempo_Uso e os controles ficam
// inertes, sem quebrar em runtime.
const noop = () => {}
const fallbackMyTime = {
  settings: { dailyLimit: 60, reminders: { bedtime: true, screenTime: true, weekly: false } },
  storageError: '',
  setDailyLimit: noop,
  toggleReminder: noop,
}

function limitLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  if (minutes === 60) return '1 hora'
  // Vírgula decimal e plural só a partir de duas horas: `90` vira `1,5 hora`.
  const hours = minutes / 60
  return `${String(hours).replace('.', ',')} ${hours < 2 ? 'hora' : 'horas'}`
}

function MyTimeView({ events = [], myTime = fallbackMyTime, onBack }) {
  const settings = myTime?.settings ?? fallbackMyTime.settings
  const usageLimit = settings.dailyLimit
  const reminders = settings.reminders ?? fallbackMyTime.settings.reminders
  const onUsageLimitChange = myTime?.setDailyLimit ?? noop
  const onToggleReminder = myTime?.toggleReminder ?? noop

  // O relógio é lido uma única vez, na montagem: o resumo recebe `now` como
  // argumento e o gráfico fica estável entre re-renderizações.
  const [now] = useState(() => Date.now())

  const {
    todayMinutes, weekUsage, averageMinutes, balancedDays,
    rawPercentage, clampedPercentage, remainingMinutes, isOverLimit, status,
  } = useMemo(() => myTimeSummary(events, now, usageLimit), [events, now, usageLimit])
  const chartMax = Math.max(...weekUsage.map((day) => day.minutes), 60)

  return (
    <div className="my-time-view">
      <button className="my-time-back" type="button" onClick={onBack}>← Voltar ao perfil</button>
      <header className="my-time-heading">
        <h1>Meu tempo</h1>
        <p>Acompanhe seu tempo de tela ativo, defina limites e cuide dos seus hábitos de saúde digital.</p>
      </header>
      <div className="my-time-layout">
        <div className="my-time-column my-time-column--main">
          <section className="time-card screen-time-card">
            <div className="time-card-title-row">
              <h2>Tempo de tela hoje</h2>
              <span className={`time-status${isOverLimit ? ' time-status--warning' : ''}`}>{status}</span>
            </div>
            <div className="screen-time-content">
              <div className="screen-time-ring" style={{ '--screen-progress': `${clampedPercentage * 3.6}deg` }} aria-label={`${rawPercentage}% do limite diário utilizado`}>
                <div className="screen-time-ring-inner"><strong>{rawPercentage}%</strong><span>do limite</span></div>
              </div>
              <div className="screen-time-summary">
                <div className="screen-time-number-row"><strong>{todayMinutes} min</strong><span>{usageLimit} min de limite</span></div>
                <div className="time-progress" aria-hidden="true"><span style={{ width: `${clampedPercentage}%` }} /></div>
                <p>{isOverLimit ? `Você atingiu seu limite diário de ${usageLimit} minutos.` : `Você tem ${remainingMinutes} minutos restantes antes de atingir seu limite diário.`}</p>
              </div>
            </div>
          </section>
          <section className="time-card usage-limit-card">
            <h2>Limite diário de uso</h2>
            <p>Escolha um limite diário de tempo de tela. Enviaremos um alerta quando você alcançar esse valor.</p>
            <div className="usage-limit-options" aria-label="Limite diário de uso">
              {limitOptions.map((minutes) => <button className={usageLimit === minutes ? 'is-selected' : ''} key={minutes} type="button" onClick={() => onUsageLimitChange(minutes)} aria-pressed={usageLimit === minutes}>{limitLabel(minutes)}</button>)}
            </div>
          </section>
          <section className="time-card reminder-card">
            <h2>Preferências de alerta e lembretes</h2>
            <ReminderRow title="Lembrete de hora de dormir" description="Lembre-me de desacelerar 15 minutos antes da hora de dormir definida (22:30)." enabled={reminders.bedtime} onToggle={() => onToggleReminder('bedtime')} />
            <ReminderRow title="Alertas de tempo de tela" description="Receba uma notificação na hora em que o limite diário de uso for atingido." enabled={reminders.screenTime} onToggle={() => onToggleReminder('screenTime')} />
            <ReminderRow title="Relatório semanal de resumo" description="Receba um alerta semanal com suas tendências de tempo de tela e suas conquistas." enabled={reminders.weekly} onToggle={() => onToggleReminder('weekly')} isLast />
          </section>
        </div>
        <div className="my-time-column my-time-column--side">
          <section className="time-card weekly-card">
            <div className="weekly-heading"><div><h2>Últimos 7 dias</h2><p>Tendência de atividade desta semana</p></div><div className="weekly-average"><span>Média diária</span><strong>{averageMinutes} min</strong></div></div>
            <div className="weekly-chart" aria-label="Tempo de tela nos últimos 7 dias">
              {weekUsage.map((day) => <div className="weekly-bar-item" key={day.dayKey}><span className={day.current ? 'weekly-value is-current' : 'weekly-value'}>{day.minutes}</span><div className="weekly-bar-track"><span className={day.current ? 'weekly-bar is-current' : 'weekly-bar'} style={{ height: `${(day.minutes / chartMax) * 100}%` }} /></div><span className="weekly-day">{day.day}</span></div>)}
            </div>
          </section>
          <section className="time-card rewards-card"><h2>Recompensas de bem-estar digital</h2><div className="reward-content"><div className="reward-badge" aria-hidden="true">✦</div><div><strong>Selo Equilíbrio nos Estudos</strong><p>Você ficou dentro do seu limite em {balancedDays} dos últimos 7 dias. Excelente trabalho mantendo o foco!</p></div></div></section>
        </div>
      </div>
    </div>
  )
}

function ReminderRow({ title, description, enabled, onToggle, isLast = false }) {
  return (
    <div className={`reminder-row${isLast ? ' reminder-row--last' : ''}`}>
      <div><strong>{title}</strong><p>{description}</p></div>
      <button className={`time-toggle${enabled ? ' is-enabled' : ''}`} type="button" role="switch" aria-checked={enabled} aria-label={`${title}: ${enabled ? 'ativado' : 'desativado'}`} onClick={onToggle}><span /></button>
    </div>
  )
}

export default MyTimeView
