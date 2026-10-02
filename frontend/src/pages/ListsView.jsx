import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './ListsView.css'

const colors = [
  { tone: 'gold', name: 'Gold', value: '#f2b844' },
  { tone: 'blue', name: 'Blue', value: '#8cb9f0' },
  { tone: 'green', name: 'Green', value: '#8cc9ac' },
  { tone: 'purple', name: 'Purple', value: '#bea5e6' },
]
const colorFor = (tone) => colors.find((color) => color.tone === tone)?.value ?? colors[0].value
const videoCount = (count) => `${count} ${count === 1 ? 'video' : 'videos'}`

function Icon({ name, size = 20 }) {
  const paths = {
    list: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    edit: <><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="m10 5-7 7 7 7M3 12h18" />,
    video: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3Z" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Modal({ title, onClose, children }) {
  const dialogRef = useRef(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog className="lists-dialog" ref={dialogRef} aria-labelledby="lists-dialog-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className="lists-dialog-heading">
        <h2 id="lists-dialog-title">{title}</h2>
        <button className="lists-icon-button" type="button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
      </div>
      {children}
    </dialog>
  )
}

function ListForm({ list, onSave, onClose }) {
  const [name, setName] = useState(list?.name ?? '')
  const [description, setDescription] = useState(list?.description ?? '')
  const [tone, setTone] = useState(list?.tone ?? 'gold')
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  function submit(event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give your list a name to continue.')
      nameRef.current?.focus()
      return
    }
    onSave({ name: name.trim(), description: description.trim(), tone })
  }

  return (
    <Modal title={list ? 'Edit list' : 'Create a new list'} onClose={onClose}>
      <form className="lists-form" onSubmit={submit}>
        <label className="lists-field">
          <span>List name</span>
          <input ref={nameRef} value={name} onChange={(event) => { setName(event.target.value); setError('') }} maxLength={60} placeholder="e.g. Weekend discoveries" required aria-invalid={!!error} aria-describedby={error ? 'list-name-error' : undefined} />
        </label>
        {error && <p className="lists-form-error" id="list-name-error" role="alert">{error}</p>}
        <label className="lists-field">
          <span>Description <small>(optional)</small></span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} rows={3} placeholder="What belongs in this collection?" />
        </label>
        <fieldset className="lists-color-options">
          <legend>Cover color</legend>
          {colors.map((color) => (
            <label key={color.tone}>
              <input type="radio" name="list-color" value={color.tone} checked={tone === color.tone} onChange={() => setTone(color.tone)} />
              <span className="lists-color-swatch" style={{ '--list-color': color.value }} />
              <span className="visually-hidden">{color.name}</span>
            </label>
          ))}
        </fieldset>
        <div className="lists-dialog-actions">
          <button className="lists-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="lists-primary-button" type="submit">{list ? 'Save changes' : 'Create list'}</button>
        </div>
      </form>
    </Modal>
  )
}

function VideoPicker({ videos, onAdd, onClose }) {
  const [selected, setSelected] = useState([])
  return (
    <Modal title="Add videos" onClose={onClose}>
      <form className="lists-form" onSubmit={(event) => { event.preventDefault(); if (selected.length) onAdd(selected) }}>
        <p className="lists-hint">Choose from the demo video collection.</p>
        <div className="lists-video-picker">
          {videos.map((video) => (
            <label className="lists-picker-option" key={video.id}>
              <input type="checkbox" checked={selected.includes(video.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, video.id] : current.filter((id) => id !== video.id))} />
              <div><strong>{video.title}</strong><small>{video.creator} · {video.duration}</small></div>
            </label>
          ))}
        </div>
        {videos.length === 0 && <p className="lists-hint">All available videos are already in this list.</p>}
        <div className="lists-dialog-actions">
          <button className="lists-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="lists-primary-button" type="submit" disabled={!selected.length}>Add {selected.length ? videoCount(selected.length) : 'videos'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function ListsView({ lists, onListsChange, availableVideos, storageError }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [selectedId, setSelectedId] = useState(null)
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState('')
  const headingRef = useRef(null)
  const selectedList = lists.find((list) => list.id === selectedId)
  const videosFor = (list) => list.videoIds.map((id) => availableVideos.find((video) => video.id === id)).filter(Boolean)
  const savedCount = lists.reduce((count, list) => count + videosFor(list).length, 0)
  const matchingLists = lists.filter((list) => `${list.name} ${list.description}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'videos') return videosFor(b).length - videosFor(a).length
    return b.updatedAt - a.updatedAt
  })

  useEffect(() => { headingRef.current?.focus() }, [selectedId])

  function saveList(fields) {
    const editing = modal?.list
    const nextList = { ...fields, id: editing?.id ?? crypto.randomUUID(), videoIds: editing?.videoIds ?? [], updatedAt: Date.now() }
    onListsChange(editing ? lists.map((list) => list.id === editing.id ? nextList : list) : [nextList, ...lists])
    setNotice(editing ? `“${nextList.name}” updated.` : `“${nextList.name}” created. Open it to add videos.`)
    if (!editing) { setQuery(''); setSort('recent') }
    setModal(null)
  }

  function updateVideos(videoIds, message) {
    if (!modal) headingRef.current?.focus()
    onListsChange(lists.map((list) => list.id === selectedId ? { ...list, videoIds, updatedAt: Date.now() } : list))
    setNotice(message)
    setModal(null)
  }

  return (
    <div className="lists-view">
      {selectedList ? (
        <>
          <button className="lists-back-button" type="button" onClick={() => { setSelectedId(null); setNotice('') }}><Icon name="arrow" size={16} /> All lists</button>
          <header className="lists-detail-header">
            <div className="list-detail-icon" style={{ '--list-color': colorFor(selectedList.tone) }}><Icon name="list" size={30} /></div>
            <div>
              <p className="lists-eyebrow">YOUR COLLECTION</p>
              <h1 ref={headingRef} tabIndex={-1}>{selectedList.name}</h1>
              <p>{selectedList.description || 'A collection of videos, chosen by you.'}</p>
              <span className="lists-video-count">{videoCount(videosFor(selectedList).length)}</span>
            </div>
          </header>
          <div className="lists-detail-actions">
            <button className="lists-primary-button" type="button" onClick={() => setModal({ type: 'videos' })}><Icon name="plus" size={17} /> Add videos</button>
            <button className="lists-secondary-button" type="button" onClick={() => setModal({ type: 'edit', list: selectedList })}><Icon name="edit" size={17} /> Edit list</button>
            <button className="lists-danger-button" type="button" onClick={() => setModal({ type: 'delete' })}><Icon name="trash" size={17} /> Delete list</button>
          </div>
        </>
      ) : (
        <>
          <header className="lists-header">
            <div>
              <p className="lists-eyebrow">YOUR COLLECTIONS</p>
              <h1 ref={headingRef} tabIndex={-1}>Lists</h1>
              <p>A place for everything you want to watch.</p>
              <div className="lists-summary">{lists.length} {lists.length === 1 ? 'list' : 'lists'} <span aria-hidden="true">·</span> {videoCount(savedCount)} saved</div>
            </div>
            <button className="lists-primary-button" type="button" onClick={() => setModal({ type: 'create' })}><Icon name="plus" size={18} /> New list</button>
          </header>
          <div className="lists-toolbar">
            <label className="lists-search"><Icon name="search" size={18} /><span className="visually-hidden">Search lists</span><input type="search" placeholder="Search your lists..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="lists-sort"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently updated</option><option value="name">Name (A–Z)</option><option value="videos">Most videos</option></select></label>
          </div>
        </>
      )}

      <p className="lists-status" role="status">{notice}</p>
      {storageError && <p className="lists-form-error" role="alert">{storageError}</p>}

      {selectedList ? (
        videosFor(selectedList).length ? (
          <div className="lists-video-list">
            {videosFor(selectedList).map((video) => (
              <article className="lists-video-row" key={video.id}>
                <div className="lists-video-thumb" style={{ '--list-color': colorFor(selectedList.tone) }}><Icon name="video" size={30} /><span>{video.duration}</span></div>
                <div className="lists-video-copy"><small>{video.category}</small><h2>{video.title}</h2><p>{video.creator}</p></div>
                <button className="lists-icon-button" type="button" aria-label={`Remove ${video.title} from list`} onClick={() => updateVideos(selectedList.videoIds.filter((id) => id !== video.id), `“${video.title}” removed from this list.`)}><Icon name="close" size={18} /></button>
              </article>
            ))}
          </div>
        ) : (
          <div className="lists-empty"><Icon name="video" size={40} /><h2>A little room for discovery</h2><p>Add a few videos and make this list your own.</p><button className="lists-primary-button" type="button" onClick={() => setModal({ type: 'videos' })}><Icon name="plus" size={17} /> Add your first video</button></div>
        )
      ) : matchingLists.length ? (
        <div className="lists-grid">
          {matchingLists.map((list) => (
            <article className="list-card" key={list.id}>
              <button className="list-card-open" type="button" aria-label={`Open ${list.name}`} onClick={() => { setSelectedId(list.id); setNotice('') }}>
                <div className="list-cover" style={{ '--list-color': colorFor(list.tone) }}><Icon name="list" size={48} /><span className="list-cover-count"><Icon name="video" size={13} /> {videoCount(videosFor(list).length)}</span></div>
                <div className="list-card-copy"><h2>{list.name}</h2><p>{list.description || 'Your next discoveries start here.'}</p></div>
              </button>
              <div className="list-card-footer"><span>Personal collection</span><button className="lists-icon-button" type="button" aria-label={`Edit ${list.name}`} onClick={() => setModal({ type: 'edit', list })}><Icon name="edit" size={16} /></button></div>
            </article>
          ))}
          {!query.trim() && <button className="list-create-card" type="button" onClick={() => setModal({ type: 'create' })}><Icon name="plus" size={30} /><strong>Make room for more</strong><span>Create a new list</span></button>}
        </div>
      ) : (
        <div className="lists-empty"><Icon name={query.trim() ? 'search' : 'list'} size={40} /><h2>{query.trim() ? 'No lists found' : 'Your next collection starts here'}</h2><p>{query.trim() ? `No lists match “${query.trim()}”. Try another name.` : 'Keep your favorite discoveries together with your first list.'}</p><button className="lists-primary-button" type="button" onClick={() => query.trim() ? setQuery('') : setModal({ type: 'create' })}>{query.trim() ? 'Clear search' : 'Create your first list'}</button></div>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && <ListForm list={modal.list} onSave={saveList} onClose={() => setModal(null)} />}
      {modal?.type === 'videos' && selectedList && <VideoPicker videos={availableVideos.filter((video) => !selectedList.videoIds.includes(video.id))} onClose={() => setModal(null)} onAdd={(ids) => updateVideos([...selectedList.videoIds, ...ids], `${videoCount(ids.length)} added to “${selectedList.name}”.`)} />}
      {modal?.type === 'delete' && selectedList && (
        <Modal title="Delete this list?" onClose={() => setModal(null)}>
          <p className="lists-delete-copy">“{selectedList.name}” will be deleted. The videos will remain available to add to other lists.</p>
          <div className="lists-dialog-actions">
            <button className="lists-secondary-button" type="button" onClick={() => setModal(null)}>Cancel</button>
            <button className="lists-danger-button" type="button" onClick={() => { onListsChange(lists.filter((list) => list.id !== selectedId)); setSelectedId(null); setModal(null); setNotice(`“${selectedList.name}” deleted.`) }}>Delete list</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
