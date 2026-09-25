import { useLayoutEffect, useRef, useState } from 'react'
import './SearchView.css'

function SearchIcon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    bookmark: <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    orbit: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="11" ry="5" transform="rotate(-35 12 12)" /><path d="M6 4a9 9 0 0 1 12 16M6 20A9 9 0 0 1 6 4" /></>,
    code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
    coffee: <><path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M12 2v3M3 23h15" /></>,
    sun: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M7 14c2 5 8 5 10 0" /></>,
    heart: <path d="M12 21 3 12C-3 5 7-1 12 6c5-7 15-1 9 6Z" />,
    layers: <><path d="m12 2 10 6-10 6L2 8ZM2 12l10 6 10-6M2 16l10 6 10-6" /></>,
    activity: <path d="M2 12h4l3-9 6 18 3-9h4" />,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const seconds = (duration) => duration.split(':').reduce((total, part) => total * 60 + Number(part), 0)
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function SaveVideoDialog({ video, lists, onSave, onClose }) {
  const dialogRef = useRef(null)
  const nameRef = useRef(null)
  const [selectedIds, setSelectedIds] = useState(() => lists.filter((list) => list.videoIds.includes(video.id)).map((list) => list.id))
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(lists.length === 0)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  useLayoutEffect(() => {
    if (creating) nameRef.current?.focus()
  }, [creating])

  function submit(event) {
    event.preventDefault()
    if (creating && !newName.trim()) {
      setError('Give your new list a name.')
      nameRef.current?.focus()
      return
    }
    onSave(selectedIds, creating ? newName.trim() : '')
  }

  return (
    <dialog ref={dialogRef} className="search-save-dialog" aria-labelledby="search-save-title" aria-describedby="search-save-description" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <header className="search-dialog-heading">
        <h2 id="search-save-title">Save to lists</h2>
        <button className="search-icon-button" type="button" onClick={onClose} aria-label="Close save dialog"><SearchIcon name="close" /></button>
      </header>
      <p id="search-save-description">Choose where to keep <strong>{video.title}</strong>.</p>
      <form onSubmit={submit}>
        <div className="search-list-options">
          {lists.map((list) => (
            <label className="search-list-option" key={list.id}>
              <input type="checkbox" checked={selectedIds.includes(list.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, list.id] : current.filter((id) => id !== list.id))} />
              <span><strong>{list.name}</strong><small>{list.videoIds.length} {list.videoIds.length === 1 ? 'video' : 'videos'}</small></span>
              <SearchIcon name="bookmark" size={18} />
            </label>
          ))}
        </div>
        {creating ? (
          <label className="search-new-list-field">
            <span>New list name</span>
            <input ref={nameRef} value={newName} onChange={(event) => { setNewName(event.target.value); setError('') }} placeholder="e.g. Weekend discoveries" maxLength={60} required aria-invalid={!!error} aria-describedby={error ? 'search-list-error' : undefined} />
          </label>
        ) : (
          <button className="search-new-list-button" type="button" onClick={() => setCreating(true)}><SearchIcon name="plus" size={18} /> Create a new list</button>
        )}
        {creating && lists.length > 0 && <button className="search-text-button" type="button" onClick={() => { setCreating(false); setError('') }}>Cancel new list</button>}
        {error && <p className="search-error" id="search-list-error" role="alert">{error}</p>}
        <footer className="search-dialog-actions">
          <button className="search-secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="search-primary-button" type="submit">Save changes</button>
        </footer>
      </form>
    </dialog>
  )
}

export default function SearchView({ videos, query, onQueryChange, lists, onListsChange, storageError }) {
  const [category, setCategory] = useState('All')
  const [duration, setDuration] = useState('any')
  const [sort, setSort] = useState('featured')
  const [savingVideo, setSavingVideo] = useState(null)
  const [notice, setNotice] = useState('')
  const inputRef = useRef(null)
  const categories = ['All', ...new Set(videos.map((video) => video.category))]
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const hasFilters = terms.length > 0 || category !== 'All' || duration !== 'any'
  const results = videos.filter((video) => {
    const text = normalize(`${video.title} ${video.creator} ${video.category}`)
    return terms.every((term) => text.includes(term)) &&
      (category === 'All' || video.category === category) &&
      (duration === 'any' || (duration === 'short' ? seconds(video.duration) <= 60 : seconds(video.duration) > 60))
  }).sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'shortest') return seconds(a.duration) - seconds(b.duration)
    return 0
  })

  function resetFilters() {
    onQueryChange('')
    setCategory('All')
    setDuration('any')
    inputRef.current?.focus()
  }

  function saveVideo(selectedIds, newName) {
    const now = Date.now()
    const nextLists = lists.map((list) => {
      const hasVideo = list.videoIds.includes(savingVideo.id)
      const shouldInclude = selectedIds.includes(list.id)
      if (hasVideo === shouldInclude) return list
      return {
        ...list,
        videoIds: shouldInclude ? [...list.videoIds, savingVideo.id] : list.videoIds.filter((id) => id !== savingVideo.id),
        updatedAt: now,
      }
    })
    if (newName) nextLists.unshift({ id: crypto.randomUUID(), name: newName, description: '', tone: 'gold', videoIds: [savingVideo.id], updatedAt: now })
    onListsChange(nextLists)
    const count = selectedIds.length + (newName ? 1 : 0)
    setNotice(count ? `“${savingVideo.title}” saved in ${count} ${count === 1 ? 'list' : 'lists'}.` : `“${savingVideo.title}” removed from your lists.`)
    setSavingVideo(null)
  }

  return (
    <div className="search-view">
      <header className="search-heading">
        <p className="search-eyebrow">FOLLOW YOUR CURIOSITY</p>
        <h1>Search</h1>
        <p>Find something worth your time. Watch what you choose.</p>
      </header>

      <form className="search-discovery-form" role="search" aria-label="Explore videos" onSubmit={(event) => event.preventDefault()}>
        <SearchIcon name="search" size={24} />
        <label className="visually-hidden" htmlFor="discover-videos">Search titles, creators or categories</label>
        <input ref={inputRef} id="discover-videos" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Titles, creators, or a little curiosity..." />
        {query && <button className="search-icon-button" type="button" aria-label="Clear search text" onClick={() => { onQueryChange(''); inputRef.current?.focus() }}><SearchIcon name="close" size={18} /></button>}
      </form>

      <div className="search-categories" role="group" aria-label="Filter by category">
        {categories.map((item) => <button type="button" key={item} className={`search-category-chip${category === item ? ' is-selected' : ''}`} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === 'All' ? 'All videos' : item}</button>)}
      </div>

      <div className="search-results-toolbar">
        <div>
          <h2>{hasFilters ? 'Search results' : 'Explore videos'}</h2>
          <p role="status">{results.length} {results.length === 1 ? 'video' : 'videos'}{hasFilters ? ' found' : ' to spark an idea'} <span aria-hidden="true">·</span> Demo collection</p>
        </div>
        <div className="search-selects">
          <label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="any">Any length</option><option value="short">1 minute or less</option><option value="long">Over 1 minute</option></select></label>
          <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="shortest">Shortest first</option><option value="title">Title (A–Z)</option></select></label>
        </div>
      </div>

      {hasFilters && <div className="search-active-filters"><span>Refine your discovery with the search and filters above.</span><button className="search-text-button" type="button" onClick={resetFilters}>Clear all filters</button></div>}
      <p className="search-feedback" role="status">{notice}</p>
      {storageError && <p className="search-error" role="alert">{storageError}</p>}

      {results.length ? (
        <div className="search-results-grid">
          {results.map((video) => {
            const saved = lists.some((list) => list.videoIds.includes(video.id))
            return (
              <article className="search-video-card" key={video.id}>
                <div className="search-video-art" style={{ '--video-color': video.color }}>
                  <span className="search-art-orbit" aria-hidden="true" />
                  <SearchIcon name={video.artwork} size={56} />
                  <span className="search-video-duration">{video.duration}</span>
                </div>
                <div className="search-video-body">
                  <span className="search-video-category" style={{ '--video-color': video.color }}>{video.category}</span>
                  <h3>{video.title}</h3>
                  <p>{video.creator}</p>
                  <button type="button" className={`search-save-button${saved ? ' is-saved' : ''}`} aria-label={`${saved ? 'Manage lists for' : 'Save'} ${video.title}`} onClick={() => setSavingVideo(video)}><SearchIcon name={saved ? 'check' : 'bookmark'} size={17} />{saved ? 'Saved to lists' : 'Save to list'}<SearchIcon name="plus" size={15} /></button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="search-empty">
          <div className="search-empty-icon"><SearchIcon name="search" size={32} /></div>
          <h2>No discoveries just yet</h2>
          <p>{query.trim() ? `We couldn't find videos matching “${query.trim()}” with these filters.` : 'No videos match these filters.'} Try a different topic or broaden your search.</p>
          <button className="search-primary-button" type="button" onClick={resetFilters}>Clear all filters</button>
        </div>
      )}

      {savingVideo && <SaveVideoDialog video={savingVideo} lists={lists} onSave={saveVideo} onClose={() => setSavingVideo(null)} />}
    </div>
  )
}
