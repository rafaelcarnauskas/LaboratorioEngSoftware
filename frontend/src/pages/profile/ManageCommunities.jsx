import { useState } from 'react'
import { communities } from '../../data/communities'
import { countByCommunity } from '../../lib/reelsIndex'

function CommunityIcon({ community }) {
  return <span className={`manage-community-icon manage-community-icon--${community.tone}`} aria-hidden="true">{community.icon}</span>
}

export default function ManageCommunities({ onBack }) {
  const [selectedId, setSelectedId] = useState(communities[0]?.id ?? '')
  const [communityData, setCommunityData] = useState(() => (
    Object.fromEntries(communities.map((community) => [
      community.id,
      { name: community.name, description: community.description, acceptingMembers: true },
    ]))
  ))
  const [notice, setNotice] = useState('')
  const selectedCommunity = communities.find((community) => community.id === selectedId)
  const selectedData = selectedCommunity ? communityData[selectedCommunity.id] : null

  function updateSelected(changes) {
    setCommunityData((current) => ({
      ...current,
      [selectedId]: { ...current[selectedId], ...changes },
    }))
    setNotice('')
  }

  function saveChanges() {
    setNotice(`Alterações de ${selectedData.name} salvas para esta sessão.`)
  }

  if (!selectedCommunity || !selectedData) return null

  return (
    <div className="profile-subpage manage-communities-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="manage-communities-heading">
        <div>
          <p className="profile-eyebrow">ADMINISTRAÇÃO</p>
          <h1>Administrar comunidades</h1>
          <p>Gerencie as comunidades que você administra, seus conteúdos e a entrada de novos membros.</p>
        </div>
        <span className="manage-communities-count">{communities.length} comunidades</span>
      </header>

      <div className="manage-communities-layout">
        <aside className="manage-community-list" aria-label="Comunidades administradas">
          <div className="manage-community-list-heading">
            <span>SUAS COMUNIDADES</span>
            <small>{communities.length}</small>
          </div>
          {communities.map((community) => {
            const data = communityData[community.id]
            const isSelected = selectedId === community.id
            return (
              <button
                className={`manage-community-item${isSelected ? ' is-selected' : ''}`}
                type="button"
                key={community.id}
                aria-pressed={isSelected}
                onClick={() => { setSelectedId(community.id); setNotice('') }}
              >
                <CommunityIcon community={community} />
                <span>
                  <strong>{data.name}</strong>
                  <small>{community.memberCount.toLocaleString('pt-BR')} membros</small>
                </span>
                <span className="manage-community-arrow" aria-hidden="true">›</span>
              </button>
            )
          })}
        </aside>

        <main className="manage-community-content">
          <section className="manage-community-hero">
            <CommunityIcon community={selectedCommunity} />
            <div>
              <span className="manage-community-kicker">COMUNIDADE</span>
              <h2>{selectedData.name}</h2>
              <p>{selectedData.description}</p>
            </div>
            <span className={`manage-community-status${selectedData.acceptingMembers ? '' : ' is-paused'}`}>
              {selectedData.acceptingMembers ? 'Aberta' : 'Pausada'}
            </span>
          </section>

          <section className="manage-community-stats" aria-label="Resumo da comunidade">
            <div><strong>{selectedCommunity.memberCount.toLocaleString('pt-BR')}</strong><span>membros</span></div>
            <div><strong>{countByCommunity(selectedCommunity.id)}</strong><span>vídeos publicados</span></div>
            <div><strong>{selectedCommunity.niches.length}</strong><span>nichos ativos</span></div>
          </section>

          <section className="manage-community-panel" aria-labelledby="manage-community-info-title">
            <div className="manage-panel-heading">
              <div>
                <span className="manage-community-kicker">IDENTIDADE</span>
                <h3 id="manage-community-info-title">Informações da comunidade</h3>
              </div>
              <button className="manage-save-button" type="button" onClick={saveChanges}>Salvar alterações</button>
            </div>
            <label className="manage-field">
              <span>Nome da comunidade</span>
              <input type="text" value={selectedData.name} maxLength={60} onChange={(event) => updateSelected({ name: event.target.value })} />
            </label>
            <label className="manage-field">
              <span>Descrição</span>
              <textarea value={selectedData.description} maxLength={180} rows={3} onChange={(event) => updateSelected({ description: event.target.value })} />
            </label>
          </section>

          <section className="manage-community-panel" aria-labelledby="manage-community-access-title">
            <div className="manage-panel-heading">
              <div>
                <span className="manage-community-kicker">ACESSO</span>
                <h3 id="manage-community-access-title">Entrada de membros</h3>
              </div>
              <button
                className={`manage-toggle${selectedData.acceptingMembers ? ' is-enabled' : ''}`}
                type="button"
                role="switch"
                aria-checked={selectedData.acceptingMembers}
                aria-label="Permitir entrada de novos membros"
                onClick={() => updateSelected({ acceptingMembers: !selectedData.acceptingMembers })}
              >
                <span />
              </button>
            </div>
            <p className="manage-access-description">
              {selectedData.acceptingMembers
                ? 'Novas pessoas podem participar desta comunidade.'
                : 'A entrada de novos membros está pausada.'}
            </p>
          </section>

          {notice && <p className="manage-community-notice" role="status">{notice}</p>}
        </main>
      </div>
    </div>
  )
}
