import { useState } from 'react'
import { videoCatalog } from '../../data/videoCatalog'

const contentCategories = [...new Set(videoCatalog.map((video) => video.category))]

const initialGroups = [
  {
    id: 'family',
    name: 'Family circle',
    type: 'Family',
    description: 'A calmer space for the whole family.',
    members: [
      { name: 'Victor Mendes', role: 'Owner', initials: 'V' },
      { name: 'Lia Mendes', role: 'Child', initials: 'L' },
      { name: 'Rafael Mendes', role: 'Child', initials: 'R' },
    ],
    dailyLimit: 90,
    allowedCategories: ['Humor', 'Cute', 'Tips', 'Technology', 'Sports', 'Curiosities'],
    allowedVideos: videoCatalog.map((video) => video.id),
  },
  {
    id: 'friends',
    name: 'Weekend friends',
    type: 'Friends',
    description: 'Shared discoveries for your close friends.',
    members: [
      { name: 'Victor Mendes', role: 'Owner', initials: 'V' },
      { name: 'Ana Costa', role: 'Member', initials: 'A' },
      { name: 'Bruno Lima', role: 'Member', initials: 'B' },
    ],
    dailyLimit: 120,
    allowedCategories: contentCategories,
    allowedVideos: videoCatalog.map((video) => video.id),
  },
]

const limitOptions = [30, 60, 90, 120, 180]

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
    setNotice(`${selectedGroup.name} settings saved for this session.`)
  }

  return (
    <div className="profile-subpage group-settings-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Back to Profile</button>

      <header className="group-settings-heading">
        <div>
          <p className="profile-eyebrow">SHARED SPACE</p>
          <h1>Group settings</h1>
          <p>Choose what your group can watch and set a daily rhythm that works for everyone.</p>
        </div>
        <button className="group-save-button" type="button" onClick={saveChanges}>Save changes</button>
      </header>

      <div className="group-picker" role="tablist" aria-label="Choose a group">
        {groups.map((group) => (
          <button
            className={selectedGroupId === group.id ? 'is-selected' : ''}
            key={group.id}
            type="button"
            role="tab"
            aria-selected={selectedGroupId === group.id}
            onClick={() => { setSelectedGroupId(group.id); setNotice('') }}
          >
            <span className="group-picker-icon" aria-hidden="true">{group.type === 'Family' ? '⌂' : '♧'}</span>
            <span><strong>{group.name}</strong><small>{group.type} · {group.members.length} members</small></span>
          </button>
        ))}
        <button className="group-add-button" type="button" onClick={() => setNotice('New group creation will be available here.')}>+ New group</button>
      </div>

      <div className="group-settings-layout">
        <div className="group-settings-main">
          <section className="group-panel group-content-panel">
            <div className="group-panel-heading">
              <div><span className="group-panel-kicker">CONTENT ACCESS</span><h2>What {selectedGroup.name} can watch</h2><p>{selectedGroup.description}</p></div>
              <span className="group-count">{selectedGroup.allowedVideos.length}/{videoCatalog.length} videos</span>
            </div>

            <div className="group-category-grid">
              {contentCategories.map((category) => {
                const isAllowed = selectedGroup.allowedCategories.includes(category)
                const categoryCount = videoCatalog.filter((video) => video.category === category).length
                return (
                  <label className={`group-category-option${isAllowed ? ' is-selected' : ''}`} key={category}>
                    <input type="checkbox" checked={isAllowed} onChange={() => toggleCategory(category)} />
                    <span className="group-checkmark" aria-hidden="true">{isAllowed ? '✓' : ''}</span>
                    <span><strong>{category}</strong><small>{categoryCount} {categoryCount === 1 ? 'video' : 'videos'}</small></span>
                  </label>
                )
              })}
            </div>

            <div className="group-video-heading"><h3>Individual content</h3><span>Fine-tune access for this group</span></div>
            <div className="group-video-list">
              {videoCatalog.map((video) => {
                const isAllowed = selectedGroup.allowedVideos.includes(video.id)
                return (
                  <label className={`group-video-option${isAllowed ? ' is-selected' : ''}`} key={video.id}>
                    <input type="checkbox" checked={isAllowed} onChange={() => toggleVideo(video.id)} />
                    <span className="group-video-art" style={{ '--video-color': video.color }} aria-hidden="true">{video.artwork.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{video.title}</strong><small>{video.category} · {video.duration}</small></span>
                    <span className="group-video-state">{isAllowed ? 'Allowed' : 'Blocked'}</span>
                  </label>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="group-settings-side">
          <section className="group-panel group-time-panel">
            <span className="group-panel-kicker">TIME BOUNDARIES</span>
            <h2>Daily screen time</h2>
            <p>Set the maximum watch time for each member of this group.</p>
            <div className="group-limit-options" role="group" aria-label="Daily screen time limit">
              {limitOptions.map((minutes) => <button className={selectedGroup.dailyLimit === minutes ? 'is-selected' : ''} key={minutes} type="button" aria-pressed={selectedGroup.dailyLimit === minutes} onClick={() => updateSelectedGroup({ dailyLimit: minutes })}>{minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`}</button>)}
            </div>
            <div className="group-limit-summary"><strong>{selectedGroup.dailyLimit} min</strong><span>per member, per day</span></div>
          </section>

          <section className="group-panel group-members-panel">
            <div className="group-panel-heading"><div><span className="group-panel-kicker">PEOPLE</span><h2>Members</h2></div><span className="group-count">{selectedGroup.members.length}</span></div>
            <div className="group-members-list">
              {selectedGroup.members.map((member) => <div className="group-member" key={member.name}><span className="group-member-avatar">{member.initials}</span><span><strong>{member.name}</strong><small>{member.role}</small></span><button type="button" aria-label={`Manage ${member.name}`} onClick={() => setNotice(`Member controls for ${member.name} will be available here.`)}>›</button></div>)}
            </div>
            <button className="group-invite-button" type="button" onClick={() => setNotice('Invite flow will be available here.')}>+ Invite member</button>
          </section>
        </aside>
      </div>

      <p className="group-notice" role="status">{notice}</p>
    </div>
  )
}
