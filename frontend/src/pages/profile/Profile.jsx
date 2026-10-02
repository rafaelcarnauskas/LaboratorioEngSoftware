import { useState } from 'react'
import MyPlan from './MyPlan'

const profileRoutes = {
  '/profile': { title: 'Profile Settings', description: 'Manage your personal information, subscription plan, and workspace preferences.' },
  '/profile/admin': { title: 'Admin Dashboard' },
  '/profile/edit': { title: 'Edit profile' },
  '/profile/password': { title: 'Change password' },
  '/profile/history': { title: 'Profile history' },
  '/profile/plan': { title: 'My plan' },
  '/profile/group-settings': { title: 'Group settings' },
  '/profile/notifications': { title: 'Notifications' },
  '/profile/whatsapp-alerts': { title: 'WhatsApp Alerts' },
  '/profile/sign-out': { title: 'Sign Out' },
}

function Profile({ path = '/profile', onNavigate }) {
  const [usageLimit, setUsageLimit] = useState(60)
  const [reminders, setReminders] = useState({ bedtime: true, screenTime: true, weekly: false })
  const route = profileRoutes[path] ?? profileRoutes['/profile']

  function toggleReminder(key) {
    setReminders((current) => ({ ...current, [key]: !current[key] }))
  }

  if (path === '/profile/my-time') {
    return (
      <MyTimeView
        usageLimit={usageLimit}
        onUsageLimitChange={setUsageLimit}
        reminders={reminders}
        onToggleReminder={toggleReminder}
        onBack={() => onNavigate('/profile')}
      />
    )
  }

  if (path === '/profile/plan') {
    return <MyPlan onBack={() => onNavigate('/profile')} />
  }

  if (path !== '/profile') {
    return <ProfilePlaceholder title={route.title} onBack={() => onNavigate('/profile')} />
  }

  return <ProfileOverview onNavigate={onNavigate} />
}

function ProfileOverview({ onNavigate }) {
  return (
    <div className="profile-main">
      <div className="profile-heading">
        <p className="profile-eyebrow">PROFILE</p>
        <h1>Profile Settings</h1>
        <p>Manage your personal information, subscription plan, and workspace preferences.</p>
      </div>

      <div className="profile-layout">
        <div className="profile-column">
          <section className="profile-card profile-user-card" aria-label="User profile">
            <div className="profile-user">
              <div className="profile-avatar">V</div>
              <div>
                <strong>Victor Mendes</strong>
                <small>victor@email.com</small>
              </div>
            </div>
            <ProfileLink className="admin-button" label="▣  Admin Dashboard ↗" onClick={() => onNavigate('/profile/admin')} />
          </section>

          <ProfileSection title="ACCOUNT">
            <ProfileAction icon="♙" label="Edit profile" onClick={() => onNavigate('/profile/edit')} />
            <ProfileAction icon="♙" label="Change password" onClick={() => onNavigate('/profile/password')} />
          </ProfileSection>

          <ProfileSection title="SYSTEM">
            <ProfileAction className="profile-action--danger" icon="⇥" label="Sign Out" onClick={() => onNavigate('/profile/sign-out')} />
          </ProfileSection>
        </div>

        <div className="profile-column">
          <ProfileSection title="USAGE">
            <ProfileAction icon="◷" label="My time" onClick={() => onNavigate('/profile/my-time')} />
            <ProfileAction icon="≡" label="History" onClick={() => onNavigate('/profile/history')} />
          </ProfileSection>

          <ProfileSection title="PLAN">
            <ProfileAction icon="▣" label="My plan" onClick={() => onNavigate('/profile/plan')} />
            <ProfileAction icon="♧" label="Group settings" onClick={() => onNavigate('/profile/group-settings')} />
          </ProfileSection>

          <ProfileSection title="PREFERENCES">
            <ProfileAction icon="♧" label="Notifications" onClick={() => onNavigate('/profile/notifications')} />
            <ProfileAction icon="◯" label="WhatsApp Alerts" onClick={() => onNavigate('/profile/whatsapp-alerts')} />
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
      <button className="profile-back-button" type="button" onClick={onBack}>← Back to Profile</button>
      <p className="profile-eyebrow">PROFILE</p>
      <h1>{title}</h1>
      <p>This page is ready for its own implementation.</p>
    </div>
  )
}

function ProfileSection({ title, children }) {
  const sectionId = `profile-${title.toLowerCase().replace(/\s+/g, '-')}`
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

function MyTimeView({ usageLimit, onUsageLimitChange, reminders, onToggleReminder, onBack }) {
  const todayMinutes = 42
  const weekUsage = [
    { day: 'Mon', minutes: 35 }, { day: 'Tue', minutes: 48 }, { day: 'Wed', minutes: 42 },
    { day: 'Thu', minutes: 28 }, { day: 'Fri', minutes: 55 }, { day: 'Sat', minutes: 31 },
    { day: 'Sun', minutes: 42, current: true },
  ]
  const limitOptions = [
    { minutes: 30, label: '30 min' }, { minutes: 45, label: '45 min' }, { minutes: 60, label: '1 hour' },
    { minutes: 90, label: '1.5 hours' }, { minutes: 120, label: '2 hours' },
  ]
  const dailyAverage = Math.round(weekUsage.reduce((total, day) => total + day.minutes, 0) / weekUsage.length)
  const rawPercentage = Math.round((todayMinutes / usageLimit) * 100)
  const screenPercentage = Math.min(rawPercentage, 100)
  const remainingMinutes = Math.max(usageLimit - todayMinutes, 0)
  const isOverLimit = todayMinutes >= usageLimit
  const chartMax = Math.max(...weekUsage.map((day) => day.minutes), 60)

  return (
    <div className="my-time-view">
      <button className="my-time-back" type="button" onClick={onBack}>← Back to Profile</button>
      <header className="my-time-heading">
        <h1>My Time</h1>
        <p>Track your active screen time, set boundaries, and manage digital health habits.</p>
      </header>
      <div className="my-time-layout">
        <div className="my-time-column my-time-column--main">
          <section className="time-card screen-time-card">
            <div className="time-card-title-row">
              <h2>Today&apos;s Screen Time</h2>
              <span className={`time-status${isOverLimit ? ' time-status--warning' : ''}`}>{isOverLimit ? 'Limit reached' : 'On Track'}</span>
            </div>
            <div className="screen-time-content">
              <div className="screen-time-ring" style={{ '--screen-progress': `${screenPercentage * 3.6}deg` }} aria-label={`${rawPercentage}% of daily limit used`}>
                <div className="screen-time-ring-inner"><strong>{rawPercentage}%</strong><span>of limit</span></div>
              </div>
              <div className="screen-time-summary">
                <div className="screen-time-number-row"><strong>{todayMinutes} min</strong><span>{usageLimit} min limit</span></div>
                <div className="time-progress" aria-hidden="true"><span style={{ width: `${screenPercentage}%` }} /></div>
                <p>{isOverLimit ? `You have reached your daily limit of ${usageLimit} minutes.` : `You have ${remainingMinutes} minutes remaining before your daily limit is reached.`}</p>
              </div>
            </div>
          </section>
          <section className="time-card usage-limit-card">
            <h2>Daily Usage Limit</h2>
            <p>Choose a daily screen time limit. We&apos;ll send you an alert when you reach this threshold.</p>
            <div className="usage-limit-options" aria-label="Daily usage limit">
              {limitOptions.map((option) => <button className={usageLimit === option.minutes ? 'is-selected' : ''} key={option.minutes} type="button" onClick={() => onUsageLimitChange(option.minutes)} aria-pressed={usageLimit === option.minutes}>{option.label}</button>)}
            </div>
          </section>
          <section className="time-card reminder-card">
            <h2>Alert Preferences &amp; Reminders</h2>
            <ReminderRow title="Bedtime Reminder" description="Remind me to wind down 15 minutes before my set bedtime (10:30 PM)." enabled={reminders.bedtime} onToggle={() => onToggleReminder('bedtime')} />
            <ReminderRow title="Screen Time Alerts" description="Get an instant notification as soon as the daily usage limit is reached." enabled={reminders.screenTime} onToggle={() => onToggleReminder('screenTime')} />
            <ReminderRow title="Weekly Summary Report" description="Receive a weekly alert summarizing your screen time trends and accomplishments." enabled={reminders.weekly} onToggle={() => onToggleReminder('weekly')} isLast />
          </section>
        </div>
        <div className="my-time-column my-time-column--side">
          <section className="time-card weekly-card">
            <div className="weekly-heading"><div><h2>Last 7 days</h2><p>Activity trend this week</p></div><div className="weekly-average"><span>Daily average</span><strong>{dailyAverage} min</strong></div></div>
            <div className="weekly-chart" aria-label="Screen time during the last 7 days">
              {weekUsage.map((day) => <div className="weekly-bar-item" key={day.day}><span className={day.current ? 'weekly-value is-current' : 'weekly-value'}>{day.minutes}</span><div className="weekly-bar-track"><span className={day.current ? 'weekly-bar is-current' : 'weekly-bar'} style={{ height: `${(day.minutes / chartMax) * 100}%` }} /></div><span className="weekly-day">{day.day}</span></div>)}
            </div>
          </section>
          <section className="time-card rewards-card"><h2>Digital Wellness Rewards</h2><div className="reward-content"><div className="reward-badge" aria-hidden="true">✦</div><div><strong>Balanced Scholar Badge</strong><p>You stayed under your limit for 5 out of the last 7 days. Amazing work keeping focus!</p></div></div></section>
        </div>
      </div>
    </div>
  )
}

function ReminderRow({ title, description, enabled, onToggle, isLast = false }) {
  return (
    <div className={`reminder-row${isLast ? ' reminder-row--last' : ''}`}>
      <div><strong>{title}</strong><p>{description}</p></div>
      <button className={`time-toggle${enabled ? ' is-enabled' : ''}`} type="button" role="switch" aria-checked={enabled} aria-label={`${title}: ${enabled ? 'enabled' : 'disabled'}`} onClick={onToggle}><span /></button>
    </div>
  )
}

export default Profile
