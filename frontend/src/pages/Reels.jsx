import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reels, suggestions } from '../data/reels'
import logoMark from '../assets/reels/icons/logo-mark.svg'
import searchIcon from '../assets/reels/icons/search.svg'
import likeIcon from '../assets/reels/icons/like.svg'
import commentIcon from '../assets/reels/icons/comment.svg'
import shareIcon from '../assets/reels/icons/share.svg'
import saveIcon from '../assets/reels/icons/save.svg'
import emojiIcon from '../assets/reels/icons/emoji.svg'
import navHomeIcon from '../assets/reels/icons/nav-home.svg'
import navNewPostIcon from '../assets/reels/icons/nav-new-post.svg'
import navExploreIcon from '../assets/reels/icons/nav-explore.svg'
import navActivityIcon from '../assets/reels/icons/nav-activity.svg'
import meSmallAvatar from '../assets/reels/avatars/me-small.svg'
import meAvatar from '../assets/reels/avatars/me.png'
import './Reels.css'

const currentUser = { username: 'mendesvictor', name: 'Victor Grandolfo Mendes' }

const menuItems = [
  { label: 'Home', icon: navHomeIcon },
  { label: 'New post', icon: navNewPostIcon },
  { label: 'Explore', icon: navExploreIcon },
  { label: 'Activity', icon: navActivityIcon },
  { label: 'Profile', icon: meSmallAvatar },
]

const footerLinks = [
  'About', 'Press', 'API', 'Jobs', 'Privacy', 'Terms', 'Locations',
  'Top Accounts', 'Hashtags', 'Language',
]

// Placeholder: os botões já são clicáveis, as funções entram nos próximos passos.
function handleNotImplemented() {}

function formatCount(count) {
  return count.toLocaleString('pt-BR')
}

function ReelPost({ reel }) {
  const commentInputId = `comentario-${reel.id}`
  const feedbackId = `feedback-${reel.id}`
  const commentsPanelId = `comentarios-${reel.id}`

  const captionRef = useRef(null)
  const [isCaptionTruncated, setIsCaptionTruncated] = useState(false)
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false)

  const [isCommentsOpen, setIsCommentsOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState([])
  const [feedback, setFeedback] = useState({ status: '', message: '' })
  const commentListRef = useRef(null)
  const commentsToggleRef = useRef(null)

  // Só mostra "more" quando a legenda realmente não cabe em uma linha.
  useLayoutEffect(() => {
    function checkTruncation() {
      const caption = captionRef.current
      if (caption) setIsCaptionTruncated(caption.scrollWidth > caption.clientWidth)
    }

    checkTruncation()
    document.fonts?.ready.then(checkTruncation)
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [])

  // Ao abrir o painel, o cursor já vai para o campo de comentário.
  useEffect(() => {
    if (isCommentsOpen) document.getElementById(commentInputId)?.focus()
  }, [isCommentsOpen, commentInputId])

  // Ao publicar, a lista rola até o comentário novo.
  useEffect(() => {
    const list = commentListRef.current
    if (comments.length > 0 && list) list.scrollTop = list.scrollHeight
  }, [comments])

  function handleCommentChange(event) {
    setCommentText(event.target.value)
    setFeedback({ status: '', message: '' })
  }

  function handleCommentSubmit(event) {
    event.preventDefault()
    const text = commentText.trim()

    if (!text) {
      setFeedback({ status: 'erro', message: 'Escreva um comentário antes de publicar.' })
      return
    }

    setComments([...comments, { id: Date.now(), author: currentUser.username, text }])
    setCommentText('')
    setFeedback({ status: 'sucesso', message: 'Comentário publicado.' })
  }

  // Ao fechar, o foco volta para o botão que abriu o painel.
  function closeComments() {
    setIsCommentsOpen(false)
    commentsToggleRef.current?.focus()
  }

  function handlePanelKeyDown(event) {
    if (event.key === 'Escape') closeComments()
  }

  const hasError = feedback.status === 'erro'
  const commentCount = reel.commentCount + comments.length

  return (
    <article
      className="reels-post"
      aria-label={`Vídeo de @${reel.author}`}
      data-testid="reel"
      data-reel-id={reel.id}
    >
      <div className="reels-video">
        <button
          className="reels-video-media"
          type="button"
          onClick={handleNotImplemented}
          aria-label={`Reproduzir vídeo: ${reel.caption}`}
        >
          {/* Fundo desfocado preenche o quadro vertical sem cortar a imagem. */}
          <img className="reels-video-backdrop" src={reel.image} alt="" />
          <img className="reels-video-image" src={reel.image} alt="" />
        </button>

        <div className="reels-video-overlay">
          <div className="reels-video-author">
            <button
              className="reels-profile-link"
              type="button"
              onClick={handleNotImplemented}
              aria-label={`Ver perfil de @${reel.author}`}
            >
              <img className="reels-avatar" src={reel.avatar} alt="" width="32" height="32" />
              <span className="reels-post-author">@{reel.author}</span>
            </button>
            <button className="reels-follow" type="button" onClick={handleNotImplemented}>
              Follow +
            </button>
          </div>

          <div className={`reels-caption${isCaptionExpanded ? ' reels-caption--expanded' : ''}`}>
            <p className="reels-caption-text" ref={captionRef}>{reel.caption}</p>
            {isCaptionTruncated && !isCaptionExpanded && (
              <button
                className="reels-caption-more"
                type="button"
                onClick={() => setIsCaptionExpanded(true)}
                aria-label="Ver legenda completa"
              >
                more
              </button>
            )}
          </div>
          <p className="reels-time">{reel.postedAt}</p>
        </div>
      </div>

      <div className="reels-actions">
        <button className="reels-action" type="button" onClick={handleNotImplemented} aria-label="Curtir">
          <img src={likeIcon} alt="" width="28" height="28" />
          <span>{formatCount(reel.likes)}</span>
        </button>
        <button
          className={`reels-action${isCommentsOpen ? ' reels-action--active' : ''}`}
          ref={commentsToggleRef}
          type="button"
          onClick={() => setIsCommentsOpen(!isCommentsOpen)}
          aria-label="Comentários"
          aria-expanded={isCommentsOpen}
          aria-controls={commentsPanelId}
          data-testid="abrir-comentarios"
        >
          <img src={commentIcon} alt="" width="28" height="28" />
          <span>{formatCount(commentCount)}</span>
        </button>
        <button className="reels-action" type="button" onClick={handleNotImplemented} aria-label="Compartilhar">
          <img src={shareIcon} alt="" width="28" height="28" />
        </button>
        <button className="reels-action" type="button" onClick={handleNotImplemented} aria-label="Salvar">
          <img src={saveIcon} alt="" width="28" height="28" />
        </button>
      </div>

      {isCommentsOpen && (
        <section
          className="reels-comments-panel"
          id={commentsPanelId}
          aria-label="Comentários"
          onKeyDown={handlePanelKeyDown}
        >
          <header className="reels-comments-header">
            <h2>Comentários</h2>
            <button
              className="reels-comments-close"
              type="button"
              onClick={closeComments}
              aria-label="Fechar comentários"
            >
              ✕
            </button>
          </header>

          {/* Só a lista rola; o campo e o botão Post ficam sempre no rodapé do painel. */}
          <div className="reels-comments-body" ref={commentListRef}>
            <button className="reels-text-button reels-view-comments" type="button" onClick={handleNotImplemented}>
              Ver os {formatCount(reel.commentCount)} comentários anteriores
            </button>
            {comments.length > 0 && (
              <ul className="reels-comments" data-testid="lista-comentarios">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <span className="reels-comment-author">{comment.author}</span> {comment.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="reels-comments-footer">
            {feedback.message && (
              <p
                id={feedbackId}
                className={`reels-feedback reels-feedback--${feedback.status}`}
                role={hasError ? 'alert' : 'status'}
              >
                {feedback.message}
              </p>
            )}
            <form className="reels-comment-form" noValidate onSubmit={handleCommentSubmit}>
              <button className="reels-icon-button" type="button" onClick={handleNotImplemented} aria-label="Inserir emoji">
                <img src={emojiIcon} alt="" width="24" height="24" />
              </button>
              <label className="reels-visually-hidden" htmlFor={commentInputId}>Comentário</label>
              <input
                id={commentInputId}
                name="comentario"
                type="text"
                placeholder="Add a comment..."
                value={commentText}
                onChange={handleCommentChange}
                aria-invalid={hasError}
                aria-describedby={hasError ? feedbackId : undefined}
              />
              <button
                className={`reels-comment-submit${commentText.trim() ? '' : ' reels-comment-submit--idle'}`}
                type="submit"
                data-testid="acao-principal"
              >
                Post
              </button>
            </form>
          </div>
        </section>
      )}
    </article>
  )
}

const scrollKeys = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }

function Reels({ category = 'sports' }) {
  const categoryReels = reels.filter((reel) => reel.category === category)
  const pageRef = useRef(null)

  // Setas/PageUp/PageDown passam de vídeo, como no Shorts e no TikTok.
  useEffect(() => {
    function handleKeyDown(event) {
      const direction = scrollKeys[event.key]
      const isTyping = event.target.matches?.('input, textarea')
      const post = pageRef.current?.querySelector('.reels-post')
      if (!direction || isTyping || !post) return

      event.preventDefault()
      pageRef.current.scrollBy({ top: direction * post.offsetHeight, behavior: 'smooth' })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="reels-page" ref={pageRef}>
      <header className="reels-topbar">
        <form className="reels-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <label className="reels-visually-hidden" htmlFor="reels-busca">Search</label>
          <img src={searchIcon} alt="" width="10" height="10" />
          <input id="reels-busca" type="search" placeholder="Search" />
        </form>
      </header>

      <a className="reels-brand" href="/" aria-label="Choosen - voltar para a página inicial">
        <img src={logoMark} alt="" width="90" height="90" />
        <span className="reels-brand-name">Choosen</span>
      </a>

      <main className="reels-feed" aria-label={`Vídeos da categoria ${category}`}>
        {categoryReels.length === 0 ? (
          <p className="reels-empty" role="status">
            Nenhum vídeo encontrado na categoria "{category}".
          </p>
        ) : (
          categoryReels.map((reel) => <ReelPost key={reel.id} reel={reel} />)
        )}
      </main>

      <aside className="reels-side">
        <nav className="reels-menu" aria-label="Menu">
          {menuItems.map((item) => (
            <button
              className="reels-menu-item"
              key={item.label}
              type="button"
              onClick={handleNotImplemented}
              aria-label={item.label}
            >
              <img src={item.icon} alt="" width="22" height="22" />
            </button>
          ))}
        </nav>

        <section className="reels-profile" aria-label="Sua conta">
          <button
            className="reels-profile-link"
            type="button"
            onClick={handleNotImplemented}
            aria-label={`Ver seu perfil, @${currentUser.username}`}
          >
            <img className="reels-avatar" src={meAvatar} alt="" width="56" height="56" />
            <span className="reels-profile-names">
              <span className="reels-profile-user">{currentUser.username}</span>
              <span className="reels-profile-name">{currentUser.name}</span>
            </span>
          </button>
          <button className="reels-link-button" type="button" onClick={handleNotImplemented}>
            Switch
          </button>
        </section>

        <section className="reels-suggestions" aria-labelledby="reels-suggestions-title">
          <h2 id="reels-suggestions-title">Suggestions For You</h2>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.username}>
                <button
                  className="reels-profile-link"
                  type="button"
                  onClick={handleNotImplemented}
                  aria-label={`Ver perfil de @${suggestion.username}`}
                >
                  <img className="reels-avatar" src={suggestion.avatar} alt="" width="32" height="32" />
                  <span className="reels-suggestion-names">
                    <span className="reels-suggestion-user">{suggestion.username}</span>
                    <span className="reels-suggestion-desc">Followed by {suggestion.username} + 2 more</span>
                  </span>
                </button>
                <button className="reels-link-button" type="button" onClick={handleNotImplemented}>
                  Follow
                </button>
              </li>
            ))}
          </ul>
        </section>

        <footer className="reels-footer">
          <ul className="reels-footer-links">
            {footerLinks.map((link) => (
              <li key={link}>
                <button className="reels-text-button" type="button" onClick={handleNotImplemented}>
                  {link}
                </button>
              </li>
            ))}
          </ul>
          <p>© 2026 CHOOSEN</p>
        </footer>
      </aside>
    </div>
  )
}

export default Reels
