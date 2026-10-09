import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './ListsView.css'

// `tone` é valor interno persistido em `choosen.lists.v1`: só o `name` é texto
// de tela e, por isso, o único traduzido.
const colors = [
  { tone: 'gold', name: 'Dourado', value: '#f2b844' },
  { tone: 'blue', name: 'Azul', value: '#8cb9f0' },
  { tone: 'green', name: 'Verde', value: '#8cc9ac' },
  { tone: 'purple', name: 'Roxo', value: '#bea5e6' },
]
const colorFor = (tone) => colors.find((color) => color.tone === tone)?.value ?? colors[0].value
const videoCount = (count) => `${count} ${count === 1 ? 'vídeo' : 'vídeos'}`

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
        <button className="lists-icon-button" type="button" aria-label="Fechar diálogo" onClick={onClose}><Icon name="close" /></button>
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
      setError('Dê um nome à sua lista para continuar.')
      nameRef.current?.focus()
      return
    }
    onSave({ name: name.trim(), description: description.trim(), tone })
  }

  return (
    <Modal title={list ? 'Editar lista' : 'Criar uma nova lista'} onClose={onClose}>
      <form className="lists-form" onSubmit={submit}>
        <label className="lists-field">
          <span>Nome da lista</span>
          <input ref={nameRef} value={name} onChange={(event) => { setName(event.target.value); setError('') }} maxLength={60} placeholder="ex.: Descobertas de fim de semana" required aria-invalid={!!error} aria-describedby={error ? 'list-name-error' : undefined} />
        </label>
        {error && <p className="lists-form-error" id="list-name-error" role="alert">{error}</p>}
        <label className="lists-field">
          <span>Descrição <small>(opcional)</small></span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={180} rows={3} placeholder="O que faz parte desta coleção?" />
        </label>
        <fieldset className="lists-color-options">
          <legend>Cor da capa</legend>
          {colors.map((color) => (
            <label key={color.tone}>
              <input type="radio" name="list-color" value={color.tone} checked={tone === color.tone} onChange={() => setTone(color.tone)} />
              <span className="lists-color-swatch" style={{ '--list-color': color.value }} />
              <span className="visually-hidden">{color.name}</span>
            </label>
          ))}
        </fieldset>
        <div className="lists-dialog-actions">
          <button className="lists-secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="lists-primary-button" type="submit">{list ? 'Salvar alterações' : 'Criar lista'}</button>
        </div>
      </form>
    </Modal>
  )
}

function VideoPicker({ videos, onAdd, onClose }) {
  const [selected, setSelected] = useState([])
  return (
    <Modal title="Adicionar vídeos" onClose={onClose}>
      <form className="lists-form" onSubmit={(event) => { event.preventDefault(); if (selected.length) onAdd(selected) }}>
        <p className="lists-hint">Escolha na coleção de vídeos de demonstração.</p>
        <div className="lists-video-picker">
          {videos.map((video) => (
            <label className="lists-picker-option" key={video.id}>
              <input type="checkbox" checked={selected.includes(video.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, video.id] : current.filter((id) => id !== video.id))} />
              <div><strong>{video.title}</strong><small>{video.creator} · {video.duration}</small></div>
            </label>
          ))}
        </div>
        {videos.length === 0 && <p className="lists-hint">Todos os vídeos disponíveis já estão nesta lista.</p>}
        <div className="lists-dialog-actions">
          <button className="lists-secondary-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="lists-primary-button" type="submit" disabled={!selected.length}>Adicionar {selected.length ? videoCount(selected.length) : 'vídeos'}</button>
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
    setNotice(editing ? `“${nextList.name}” atualizada.` : `“${nextList.name}” criada. Abra para adicionar vídeos.`)
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
          <button className="lists-back-button" type="button" onClick={() => { setSelectedId(null); setNotice('') }}><Icon name="arrow" size={16} /> Todas as listas</button>
          <header className="lists-detail-header">
            <div className="list-detail-icon" style={{ '--list-color': colorFor(selectedList.tone) }}><Icon name="list" size={30} /></div>
            <div>
              <p className="lists-eyebrow">SUA COLEÇÃO</p>
              <h1 ref={headingRef} tabIndex={-1}>{selectedList.name}</h1>
              <p>{selectedList.description || 'Uma coleção de vídeos, escolhida por você.'}</p>
              <span className="lists-video-count">{videoCount(videosFor(selectedList).length)}</span>
            </div>
          </header>
          <div className="lists-detail-actions">
            <button className="lists-primary-button" type="button" onClick={() => setModal({ type: 'videos' })}><Icon name="plus" size={17} /> Adicionar vídeos</button>
            <button className="lists-secondary-button" type="button" onClick={() => setModal({ type: 'edit', list: selectedList })}><Icon name="edit" size={17} /> Editar lista</button>
            <button className="lists-danger-button" type="button" onClick={() => setModal({ type: 'delete' })}><Icon name="trash" size={17} /> Excluir lista</button>
          </div>
        </>
      ) : (
        <>
          <header className="lists-header">
            <div>
              <p className="lists-eyebrow">SUAS COLEÇÕES</p>
              <h1 ref={headingRef} tabIndex={-1}>Listas</h1>
              <p>Um lugar para tudo o que você quer assistir.</p>
              <div className="lists-summary">{lists.length} {lists.length === 1 ? 'lista' : 'listas'} <span aria-hidden="true">·</span> {videoCount(savedCount)} {savedCount === 1 ? 'salvo' : 'salvos'}</div>
            </div>
            <button className="lists-primary-button" type="button" onClick={() => setModal({ type: 'create' })}><Icon name="plus" size={18} /> Nova lista</button>
          </header>
          <div className="lists-toolbar">
            <label className="lists-search"><Icon name="search" size={18} /><span className="visually-hidden">Buscar listas</span><input type="search" placeholder="Busque nas suas listas..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="lists-sort"><span>Ordenar por</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Atualizadas recentemente</option><option value="name">Nome (A–Z)</option><option value="videos">Mais vídeos</option></select></label>
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
                <button className="lists-icon-button" type="button" aria-label={`Remover ${video.title} da lista`} onClick={() => updateVideos(selectedList.videoIds.filter((id) => id !== video.id), `“${video.title}” removido desta lista.`)}><Icon name="close" size={18} /></button>
              </article>
            ))}
          </div>
        ) : (
          <div className="lists-empty"><Icon name="video" size={40} /><h2>Um espacinho para descobrir</h2><p>Adicione alguns vídeos e deixe esta lista com a sua cara.</p><button className="lists-primary-button" type="button" onClick={() => setModal({ type: 'videos' })}><Icon name="plus" size={17} /> Adicionar seu primeiro vídeo</button></div>
        )
      ) : matchingLists.length ? (
        <div className="lists-grid">
          {matchingLists.map((list) => (
            <article className="list-card" key={list.id}>
              <button className="list-card-open" type="button" aria-label={`Abrir ${list.name}`} onClick={() => { setSelectedId(list.id); setNotice('') }}>
                <div className="list-cover" style={{ '--list-color': colorFor(list.tone) }}><Icon name="list" size={48} /><span className="list-cover-count"><Icon name="video" size={13} /> {videoCount(videosFor(list).length)}</span></div>
                <div className="list-card-copy"><h2>{list.name}</h2><p>{list.description || 'Suas próximas descobertas começam aqui.'}</p></div>
              </button>
              <div className="list-card-footer"><span>Coleção pessoal</span><button className="lists-icon-button" type="button" aria-label={`Editar ${list.name}`} onClick={() => setModal({ type: 'edit', list })}><Icon name="edit" size={16} /></button></div>
            </article>
          ))}
          {!query.trim() && <button className="list-create-card" type="button" onClick={() => setModal({ type: 'create' })}><Icon name="plus" size={30} /><strong>Abra espaço para mais</strong><span>Criar uma nova lista</span></button>}
        </div>
      ) : (
        <div className="lists-empty"><Icon name={query.trim() ? 'search' : 'list'} size={40} /><h2>{query.trim() ? 'Nenhuma lista encontrada' : 'Sua próxima coleção começa aqui'}</h2><p>{query.trim() ? `Nenhuma lista corresponde a “${query.trim()}”. Tente outro nome.` : 'Guarde suas descobertas favoritas juntas na sua primeira lista.'}</p><button className="lists-primary-button" type="button" onClick={() => query.trim() ? setQuery('') : setModal({ type: 'create' })}>{query.trim() ? 'Limpar busca' : 'Criar sua primeira lista'}</button></div>
      )}

      {(modal?.type === 'create' || modal?.type === 'edit') && <ListForm list={modal.list} onSave={saveList} onClose={() => setModal(null)} />}
      {modal?.type === 'videos' && selectedList && <VideoPicker videos={availableVideos.filter((video) => !selectedList.videoIds.includes(video.id))} onClose={() => setModal(null)} onAdd={(ids) => updateVideos([...selectedList.videoIds, ...ids], `${videoCount(ids.length)} ${ids.length === 1 ? 'adicionado' : 'adicionados'} a “${selectedList.name}”.`)} />}
      {modal?.type === 'delete' && selectedList && (
        <Modal title="Excluir esta lista?" onClose={() => setModal(null)}>
          <p className="lists-delete-copy">“{selectedList.name}” será excluída. Os vídeos continuarão disponíveis para adicionar a outras listas.</p>
          <div className="lists-dialog-actions">
            <button className="lists-secondary-button" type="button" onClick={() => setModal(null)}>Cancelar</button>
            <button className="lists-danger-button" type="button" onClick={() => { onListsChange(lists.filter((list) => list.id !== selectedId)); setSelectedId(null); setModal(null); setNotice(`“${selectedList.name}” excluída.`) }}>Excluir lista</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
