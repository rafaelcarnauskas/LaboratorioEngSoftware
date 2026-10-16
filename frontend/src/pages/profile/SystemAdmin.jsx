import { useState } from 'react'
import { communityCatalog as communities } from '../../controllers/contentController'

const initialQueue = [
  { id: 1, type: 'Denúncia', title: 'Vídeo aguardando revisão', detail: 'Comunidade Poli USP · há 12 min', tone: 'warning' },
  { id: 2, type: 'Solicitação', title: 'Nova comunidade para aprovação', detail: 'Tecnologia Aberta · há 28 min', tone: 'info' },
  { id: 3, type: 'Denúncia', title: 'Comentário reportado', detail: 'Comunidade Judô Brasil · há 43 min', tone: 'warning' },
]

const systemServices = [
  { name: 'API principal', detail: 'Todas as regiões operacionais', status: 'Operacional' },
  { name: 'Processamento de vídeos', detail: 'Fila normal · 0 pendências críticas', status: 'Operacional' },
  { name: 'Notificações', detail: 'Entrega dentro do esperado', status: 'Operacional' },
  { name: 'Armazenamento', detail: 'Uso atual: 68%', status: 'Atenção' },
]

// Preferências globais da plataforma. Sem backend, valem só para esta sessão.
const settingOptions = [
  { id: 'openSignUp', label: 'Cadastro aberto', description: 'Novas pessoas podem criar conta no Choosen.' },
  { id: 'communityRequests', label: 'Pedidos de novas comunidades', description: 'Usuários podem sugerir comunidades para aprovação.' },
  { id: 'autoModeration', label: 'Moderação automática', description: 'Comentários denunciados três vezes saem do ar até a revisão.' },
  { id: 'whatsappAlerts', label: 'Alertas no WhatsApp', description: 'Permite que usuários recebam avisos por WhatsApp.' },
  { id: 'maintenanceMode', label: 'Modo manutenção', description: 'Mostra um aviso e bloqueia novas publicações.' },
]

const initialSettings = {
  openSignUp: true,
  communityRequests: true,
  autoModeration: false,
  whatsappAlerts: true,
  maintenanceMode: false,
}

export default function SystemAdmin({ onBack, onManageCommunity }) {
  const [queue, setQueue] = useState(initialQueue)
  const [activeSection, setActiveSection] = useState('visao-geral')
  const [notice, setNotice] = useState('')
  const [settings, setSettings] = useState(initialSettings)
  const [settingsNotice, setSettingsNotice] = useState('')

  function toggleSetting(id) {
    setSettings((current) => ({ ...current, [id]: !current[id] }))
    setSettingsNotice('')
  }

  function manageCommunity(community) {
    if (onManageCommunity) onManageCommunity(community.id)
    else setNotice(`A gestão de ${community.name} ficará disponível nesta área.`)
  }

  function resolveItem(id) {
    setQueue((current) => current.filter((item) => item.id !== id))
    setNotice('Item removido da fila de revisão.')
  }

  return (
    <div className="system-admin-page">
      <div className="system-admin-topbar">
        <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>
        <span className="system-admin-badge">ACESSO RESTRITO</span>
      </div>

      <header className="system-admin-header">
        <div>
          <p className="system-admin-eyebrow">CHOOSEN · ADMINISTRAÇÃO</p>
          <h1>Administrador do sistema</h1>
          <p>Monitore a plataforma, cuide da comunidade e acompanhe o funcionamento geral do Choosen.</p>
        </div>
        <div className="system-admin-user">
          <span className="system-admin-avatar">V</span>
          <span><strong>Victor Mendes</strong><small>Administrador principal</small></span>
        </div>
      </header>

      <div className="system-admin-layout">
        <nav className="system-admin-nav" aria-label="Navegação administrativa">
          <button className={activeSection === 'visao-geral' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('visao-geral')}>▦ <span>Visão geral</span></button>
          <button className={activeSection === 'moderacao' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('moderacao')}>◉ <span>Moderação</span>{queue.length > 0 && <b>{queue.length}</b>}</button>
          <button className={activeSection === 'comunidades' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('comunidades')}>⌂ <span>Comunidades</span></button>
          <button className={activeSection === 'configuracoes' ? 'is-active' : ''} type="button" onClick={() => setActiveSection('configuracoes')}>⚙ <span>Configurações</span></button>
        </nav>

        <main className="system-admin-content">
          {activeSection === 'visao-geral' && (
            <>
              <div className="system-admin-title-row">
                <div><span className="system-admin-kicker">RESUMO DA PLATAFORMA</span><h2>Visão geral</h2></div>
                <span className="system-admin-updated">Atualizado agora</span>
              </div>
              <div className="system-admin-metrics">
                <Metric label="Usuários ativos" value="8.429" change="+12,4%" positive />
                <Metric label="Comunidades" value={communities.length.toString()} change="+2 este mês" positive />
                <Metric label="Vídeos publicados" value="1.284" change="+8,1%" positive />
                <Metric label="Itens pendentes" value={queue.length.toString()} change={queue.length ? 'Requer atenção' : 'Tudo em dia'} positive={queue.length === 0} />
              </div>
              <div className="system-admin-grid">
                <section className="system-admin-panel">
                  <div className="system-admin-panel-heading"><div><span className="system-admin-kicker">SERVIÇOS</span><h3>Saúde do sistema</h3></div><span className="system-health-dot">● Todos estáveis</span></div>
                  <div className="system-services-list">
                    {systemServices.map((service) => <div className="system-service" key={service.name}><span className={`system-service-indicator${service.status === 'Atenção' ? ' is-warning' : ''}`} /><span><strong>{service.name}</strong><small>{service.detail}</small></span><em className={service.status === 'Atenção' ? 'is-warning' : ''}>{service.status}</em></div>)}
                  </div>
                </section>
                <ModerationPanel queue={queue} onResolve={resolveItem} onOpen={() => setActiveSection('moderacao')} />
              </div>
            </>
          )}

          {activeSection === 'moderacao' && (
            <section>
              <div className="system-admin-title-row"><div><span className="system-admin-kicker">SEGURANÇA E CONFIANÇA</span><h2>Fila de moderação</h2></div></div>
              <ModerationPanel queue={queue} onResolve={resolveItem} expanded />
              {notice && <p className="system-admin-notice" role="status">{notice}</p>}
            </section>
          )}

          {activeSection === 'comunidades' && (
            <section>
              <div className="system-admin-title-row"><div><span className="system-admin-kicker">ESTRUTURA DA PLATAFORMA</span><h2>Comunidades</h2></div></div>
              <div className="system-admin-community-grid">{communities.map((community) => <div className="system-admin-community-card" key={community.id}><span>{community.icon}</span><div><strong>{community.name}</strong><small>{community.memberCount.toLocaleString('pt-BR')} membros · ativa</small></div><button type="button" onClick={() => manageCommunity(community)} aria-label={`Gerenciar ${community.name}`}>Gerenciar</button></div>)}</div>
              {notice && <p className="system-admin-notice" role="status">{notice}</p>}
            </section>
          )}

          {activeSection === 'configuracoes' && (
            <section>
              <div className="system-admin-title-row">
                <div><span className="system-admin-kicker">PREFERÊNCIAS GLOBAIS</span><h2>Configurações do sistema</h2></div>
                <button className="manage-save-button" type="button" onClick={() => setSettingsNotice('Configurações salvas para esta sessão.')}>Salvar configurações</button>
              </div>
              <div className="system-settings-list">
                {settingOptions.map((option) => (
                  <div className="system-setting" key={option.id}>
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                    <button
                      className={`manage-toggle${settings[option.id] ? ' is-enabled' : ''}`}
                      type="button"
                      role="switch"
                      aria-checked={settings[option.id]}
                      aria-label={option.label}
                      onClick={() => toggleSetting(option.id)}
                    >
                      <span />
                    </button>
                  </div>
                ))}
              </div>
              {settingsNotice && <p className="system-admin-notice" role="status">{settingsNotice}</p>}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function Metric({ label, value, change, positive }) {
  return <div className="system-admin-metric"><span>{label}</span><strong>{value}</strong><small className={positive ? 'is-positive' : 'is-warning'}>{change}</small></div>
}

function ModerationPanel({ queue, onResolve, onOpen, expanded = false }) {
  return (
    <section className={`system-admin-panel moderation-panel${expanded ? ' moderation-panel--expanded' : ''}`}>
      <div className="system-admin-panel-heading"><div><span className="system-admin-kicker">AÇÃO NECESSÁRIA</span><h3>Fila de moderação</h3></div>{!expanded && <button type="button" onClick={onOpen}>Ver tudo →</button>}</div>
      {queue.length === 0 ? <p className="system-admin-empty">Nenhum item aguardando revisão.</p> : <div className="moderation-list">{queue.map((item) => <div className="moderation-item" key={item.id}><span className={`moderation-icon moderation-icon--${item.tone}`}>{item.tone === 'warning' ? '!' : 'i'}</span><span><strong>{item.title}</strong><small>{item.type} · {item.detail}</small></span><button type="button" onClick={() => onResolve(item.id)}>Resolver</button></div>)}</div>}
    </section>
  )
}
