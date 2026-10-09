import { useState } from 'react'
import { videoCatalog } from '../../data/videoCatalog'

const contentCategories = [...new Set(videoCatalog.map((video) => video.category))]

const initialGroups = [
  {
    id: 'family',
    name: 'Círculo da família',
    type: 'Família',
    description: 'Um espaço mais tranquilo para toda a família.',
    members: [
      { name: 'Victor Mendes', role: 'Responsável', initials: 'V' },
      { name: 'Lia Mendes', role: 'Criança', initials: 'L' },
      { name: 'Rafael Mendes', role: 'Criança', initials: 'R' },
    ],
    dailyLimit: 90,
    allowedCategories: ['Humor', 'Cute', 'Tips', 'Technology', 'Sports', 'Curiosities'],
    allowedVideos: videoCatalog.map((video) => video.id),
  },
  {
    id: 'friends',
    name: 'Amigos do fim de semana',
    type: 'Amigos',
    description: 'Descobertas compartilhadas para os seus amigos mais próximos.',
    members: [
      { name: 'Victor Mendes', role: 'Responsável', initials: 'V' },
      { name: 'Ana Costa', role: 'Integrante', initials: 'A' },
      { name: 'Bruno Lima', role: 'Integrante', initials: 'B' },
    ],
    dailyLimit: 120,
    allowedCategories: contentCategories,
    allowedVideos: videoCatalog.map((video) => video.id),
  },
]

const limitOptions = [30, 60, 90, 120, 180]

// Vírgula decimal e plural só a partir de duas horas: `90` vira `1,5 h`.
function groupLimitLabel(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${String(hours).replace('.', ',')} ${hours < 2 ? 'hora' : 'horas'}`
}

export default function GroupSettings({ onBack }) {
  const [groups, setGroups] = useState(initialGroups)
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroups[0].id)
  const [notice, setNotice] = useState('')
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)

  function updateSelectedGroup(changes) {
    setGroups((current) => current.map((group) => (
      group.id === selectedGroupId ? { ...group, ...changes } : group
    )))
    setNotice('')
  }

  function toggleCategory(category) {
    const allowedCategories = selectedGroup.allowedCategories.includes(category)
      ? selectedGroup.allowedCategories.filter((item) => item !== category)
      : [...selectedGroup.allowedCategories, category]
    updateSelectedGroup({ allowedCategories })
  }

  function toggleVideo(videoId) {
    const allowedVideos = selectedGroup.allowedVideos.includes(videoId)
      ? selectedGroup.allowedVideos.filter((id) => id !== videoId)
      : [...selectedGroup.allowedVideos, videoId]
    updateSelectedGroup({ allowedVideos })
  }

  function saveChanges() {
    setNotice(`Configurações de ${selectedGroup.name} salvas para esta sessão.`)
  }

  return (
    <div className="profile-subpage group-settings-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="group-settings-heading">
        <div>
          <p className="profile-eyebrow">ESPAÇO COMPARTILHADO</p>
          <h1>Configurações do grupo</h1>
          <p>Escolha o que o seu grupo pode assistir e defina um ritmo diário que funcione para todos.</p>
        </div>
        <button className="group-save-button" type="button" onClick={saveChanges}>Salvar alterações</button>
      </header>

      <div className="group-picker" role="tablist" aria-label="Escolher um grupo">
        {groups.map((group) => (
          <button
            className={selectedGroupId === group.id ? 'is-selected' : ''}
            key={group.id}
            type="button"
            role="tab"
            aria-selected={selectedGroupId === group.id}
            onClick={() => { setSelectedGroupId(group.id); setNotice('') }}
          >
            <span className="group-picker-icon" aria-hidden="true">{group.type === 'Família' ? '⌂' : '♧'}</span>
            <span><strong>{group.name}</strong><small>{group.type} · {group.members.length} integrantes</small></span>
          </button>
        ))}
        <button className="group-add-button" type="button" onClick={() => setNotice('A criação de novos grupos ficará disponível aqui.')}>+ Novo grupo</button>
      </div>

      <div className="group-settings-layout">
        <div className="group-settings-main">
          <section className="group-panel group-content-panel">
            <div className="group-panel-heading">
              <div><span className="group-panel-kicker">ACESSO AO CONTEÚDO</span><h2>O que {selectedGroup.name} pode assistir</h2><p>{selectedGroup.description}</p></div>
              <span className="group-count">{selectedGroup.allowedVideos.length}/{videoCatalog.length} vídeos</span>
            </div>

            <div className="group-category-grid">
              {contentCategories.map((category) => {
                const isAllowed = selectedGroup.allowedCategories.includes(category)
                const categoryCount = videoCatalog.filter((video) => video.category === category).length
                return (
                  <label className={`group-category-option${isAllowed ? ' is-selected' : ''}`} key={category}>
                    <input type="checkbox" checked={isAllowed} onChange={() => toggleCategory(category)} />
                    <span className="group-checkmark" aria-hidden="true">{isAllowed ? '✓' : ''}</span>
                    <span><strong>{category}</strong><small>{categoryCount} {categoryCount === 1 ? 'vídeo' : 'vídeos'}</small></span>
                  </label>
                )
              })}
            </div>

            <div className="group-video-heading"><h3>Conteúdo individual</h3><span>Ajuste o acesso deste grupo em detalhe</span></div>
            <div className="group-video-list">
              {videoCatalog.map((video) => {
                const isAllowed = selectedGroup.allowedVideos.includes(video.id)
                return (
                  <label className={`group-video-option${isAllowed ? ' is-selected' : ''}`} key={video.id}>
                    <input type="checkbox" checked={isAllowed} onChange={() => toggleVideo(video.id)} />
                    <span className="group-video-art" style={{ '--video-color': video.color }} aria-hidden="true">{video.artwork.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{video.title}</strong><small>{video.category} · {video.duration}</small></span>
                    <span className="group-video-state">{isAllowed ? 'Liberado' : 'Bloqueado'}</span>
                  </label>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="group-settings-side">
          <section className="group-panel group-time-panel">
            <span className="group-panel-kicker">LIMITES DE TEMPO</span>
            <h2>Tempo de tela diário</h2>
            <p>Defina o tempo máximo de uso para cada integrante deste grupo.</p>
            <div className="group-limit-options" role="group" aria-label="Limite diário de tempo de tela">
              {limitOptions.map((minutes) => <button className={selectedGroup.dailyLimit === minutes ? 'is-selected' : ''} key={minutes} type="button" aria-pressed={selectedGroup.dailyLimit === minutes} onClick={() => updateSelectedGroup({ dailyLimit: minutes })}>{groupLimitLabel(minutes)}</button>)}
            </div>
            <div className="group-limit-summary"><strong>{selectedGroup.dailyLimit} min</strong><span>por integrante, por dia</span></div>
          </section>

          <section className="group-panel group-members-panel">
            <div className="group-panel-heading"><div><span className="group-panel-kicker">PESSOAS</span><h2>Integrantes</h2></div><span className="group-count">{selectedGroup.members.length}</span></div>
            <div className="group-members-list">
              {selectedGroup.members.map((member) => <div className="group-member" key={member.name}><span className="group-member-avatar">{member.initials}</span><span><strong>{member.name}</strong><small>{member.role}</small></span><button type="button" aria-label={`Gerenciar ${member.name}`} onClick={() => setNotice(`Os controles de ${member.name} ficarão disponíveis aqui.`)}>›</button></div>)}
            </div>
            <button className="group-invite-button" type="button" onClick={() => setNotice('O fluxo de convite ficará disponível aqui.')}>+ Convidar integrante</button>
          </section>
        </aside>
      </div>

      <p className="group-notice" role="status">{notice}</p>
    </div>
  )
}
