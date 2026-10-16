import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { findCommunity, reelShareUrl, relatedCommunities as relatedTo, selectReels } from '../controllers/contentController'
import logoMark from '../assets/reels/icons/logo-mark.svg'
import commentIcon from '../assets/reels/icons/comment.svg'
import shareIcon from '../assets/reels/icons/share.svg'
import saveIcon from '../assets/reels/icons/save.svg'
import emojiIcon from '../assets/reels/icons/emoji.svg'
import './Reels.css'

const currentUser = { username: 'mendesvictor', name: 'Victor Grandolfo Mendes' }

// Placeholder: os botões já são clicáveis, as funções entram nos próximos passos.
function handleNotImplemented() {}

function formatCount(count) {
  return count.toLocaleString('pt-BR')
}

function ChoosenLikeMark({ liked }) {
  return (
    <span className={`reels-like-mark${liked ? ' reels-like-mark--liked' : ''}`} aria-hidden="true">
      <span />
    </span>
  )
}

function ReelPost({
  reel,
  community,
  isJoined,
  onJoinCommunity,
  onLeaveCommunity,
  isFollowing,
  onToggleFollow,
  isSaved,
  onToggleSave,
  onShare,
}) {
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
  const [isLiked, setIsLiked] = useState(false)
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

  // Ao publicar, a lista rola até o topo, onde o comentário novo foi inserido.
  useEffect(() => {
    const list = commentListRef.current
    if (comments.length > 0 && list) list.scrollTop = 0
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

    setComments([{ id: Date.now(), author: currentUser.username, text }, ...comments])
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
  const likeCount = reel.likes + (isLiked ? 1 : 0)

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
            <button
              className={`reels-follow${isFollowing ? ' reels-follow--following' : ''}`}
              type="button"
              onClick={() => onToggleFollow(reel.author)}
              aria-pressed={isFollowing}
              aria-label={isFollowing ? `Deixar de seguir @${reel.author}` : `Seguir @${reel.author}`}
              data-testid="acao-seguir"
            >
              {isFollowing ? 'Seguindo ✓' : 'Seguir +'}
            </button>
            {community && (
              // Sem role="status"/"alert" aqui: os testes do Reels procuram
              // essas live regions dentro do post para ler o feedback de
              // comentário. O próprio botão comunica o estado via aria-pressed.
              <button
                className={`reels-community${isJoined ? ' reels-community--joined' : ''}`}
                type="button"
                onClick={() => (isJoined ? onLeaveCommunity(community.id) : onJoinCommunity(community.id))}
                aria-pressed={isJoined}
                aria-label={
                  isJoined
                    ? `Sair da comunidade ${community.name}`
                    : `Entrar na comunidade ${community.name}`
                }
                data-testid="acao-comunidade"
                data-community-id={community.id}
              >
                <span aria-hidden="true">{community.icon}</span>
                {isJoined ? `Participando de ${community.name}` : `Entrar em ${community.name}`}
              </button>
            )}
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
                mais
              </button>
            )}
          </div>
          <p className="reels-time">{reel.postedAt}</p>
        </div>
      </div>

      <div className="reels-actions">
        <button
          className={`reels-action reels-like-action${isLiked ? ' reels-like-action--liked' : ''}`}
          type="button"
          onClick={() => setIsLiked((liked) => !liked)}
          aria-label={isLiked ? 'Remover curtida' : 'Curtir'}
          aria-pressed={isLiked}
          data-testid="acao-curtir"
        >
          <ChoosenLikeMark liked={isLiked} />
          <span>{formatCount(likeCount)}</span>
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
        <button
          className="reels-action"
          type="button"
          onClick={() => onShare(reel)}
          aria-label="Compartilhar"
          data-testid="acao-compartilhar"
        >
          <img src={shareIcon} alt="" width="28" height="28" />
        </button>
        <button
          className={`reels-action${isSaved ? ' reels-action--saved' : ''}`}
          type="button"
          onClick={() => onToggleSave(reel.id)}
          aria-label={isSaved ? 'Remover dos salvos' : 'Salvar'}
          aria-pressed={isSaved}
          data-testid="acao-salvar"
        >
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
                placeholder="Escreva um comentário..."
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
                Publicar
              </button>
            </form>
          </div>
        </section>
      )}
    </article>
  )
}

const scrollKeys = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }

// Permanência mínima para o reel contar como visto.
export const MIN_DWELL_MS = 3000

// Teto por visualização individual. NÃO é teto do total acumulado por reel:
// o histórico soma as visualizações, então assistir dez vezes soma dez
// visualizações. Este teto só existe para descartar permanências absurdas,
// como uma aba esquecida aberta.
export const MAX_ATTRIBUTED_SECONDS = 90

// Função pura exportada daqui porque é parte do contrato do rastreio desta
// tela; o custo é perder fast refresh neste arquivo durante o dev.
// eslint-disable-next-line react-refresh/only-export-components
export function attributedSeconds(dwellMs) {
  if (!Number.isFinite(dwellMs) || dwellMs < MIN_DWELL_MS) return 0
  return Math.min(Math.round(dwellMs / 1000), MAX_ATTRIBUTED_SECONDS)
}

// Qual reel ocupa a maior parte da viewport. A rolagem nativa continua sendo o
// mecanismo de navegação: o observer apenas observa.
function useFocusedReel(pageRef, reelIds) {
  const [focusedId, setFocusedId] = useState(reelIds[0] ?? null)

  useEffect(() => {
    // Sem IntersectionObserver o rastreio é desligado em silêncio: a tela
    // continua funcionando, só não registra visualização.
    if (!('IntersectionObserver' in window)) return
    const posts = pageRef.current?.querySelectorAll('[data-reel-id]')
    if (!posts || posts.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setFocusedId(visible.target.dataset.reelId)
      },
      { threshold: [0.25, 0.5, 0.75] },
    )

    posts.forEach((post) => observer.observe(post))
    return () => observer.disconnect()
  }, [pageRef, reelIds])

  return focusedId
}

// Na troca de foco, o reel anterior é contabilizado se ficou tempo suficiente.
function useWatchTracking(focusedId, onReelWatched) {
  const startedAt = useRef(null)
  const previousId = useRef(null)

  useEffect(() => {
    const now = Date.now()
    const previous = previousId.current

    if (previous !== null && startedAt.current !== null) {
      const seconds = attributedSeconds(now - startedAt.current)
      if (seconds > 0) onReelWatched(previous, seconds)
    }

    previousId.current = focusedId
    startedAt.current = focusedId === null ? null : now
  }, [focusedId, onReelWatched])

  // Sair da tela de reels também fecha a visualização em andamento.
  useEffect(() => () => {
    if (previousId.current !== null && startedAt.current !== null) {
      const seconds = attributedSeconds(Date.now() - startedAt.current)
      if (seconds > 0) onReelWatched(previousId.current, seconds)
    }
  }, [onReelWatched])
}

function Reels({
  category = null,
  communityId = null,
  niches = [],
  initialReelId = null,
  onReelWatched = handleNotImplemented,
  onGoHome,
  memberships = [],
  onJoinCommunity = handleNotImplemented,
  onLeaveCommunity = handleNotImplemented,
  followedAuthors = [],
  onToggleFollow = handleNotImplemented,
  savedReelIds = [],
  onToggleSave = handleNotImplemented,
}) {
  // Seletor único: categoria, comunidade e nichos em conjunção.
  // `niches` vazio significa "todos" os nichos da comunidade.
  const nicheKey = niches.join('|')
  const visibleReels = useMemo(
    () => selectReels({ category, communityId, niches }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, communityId, nicheKey],
  )

  const community = communityId === null ? null : findCommunity(communityId)

  const feedLabel = community
    ? `Vídeos da comunidade ${community.name}`
    : category
      ? `Vídeos da categoria ${category}`
      : 'Vídeos'

  // Com nichos ativos, o vazio é consequência do filtro, não da comunidade.
  const emptyMessage = niches.length > 0
    ? 'Nenhum vídeo encontrado para os nichos selecionados.'
    : community
      ? `Nenhum vídeo encontrado na comunidade ${community.name}.`
      : category
        ? `Nenhum vídeo encontrado na categoria "${category}".`
        : 'Nenhum vídeo encontrado.'

  const joinedIds = new Set(memberships.map((membership) => membership.id))
  const followed = new Set(followedAuthors)
  const saved = new Set(savedReelIds)
  const relatedCommunities = useMemo(
    () => relatedTo(visibleReels, { community, category }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, community?.category, visibleReels],
  )

  // Aviso de rodapé do feed (ex.: link copiado). Fica fora dos posts: os testes
  // do Reels procuram as live regions de comentário dentro de cada post.
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  async function handleShare(reel) {
    const url = reelShareUrl(reel)
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Link do vídeo copiado.')
    } catch {
      // Sem permissão de área de transferência: mostra o link para copiar à mão.
      setNotice(`Copie o link do vídeo: ${url}`)
    }
  }
  const pageRef = useRef(null)

  // Identidade estável enquanto o feed não muda, para o observer não ser
  // recriado a cada pintura.
  const reelIds = useMemo(() => visibleReels.map((reel) => reel.id), [visibleReels])
  const focusedId = useFocusedReel(pageRef, reelIds)
  useWatchTracking(focusedId, onReelWatched)

  // Abertura por reel específico: o feed já nasce posicionado nele, antes da
  // primeira pintura, para não aparecer um salto de rolagem.
  useLayoutEffect(() => {
    if (!initialReelId) return

    const selector = `[data-reel-id="${CSS?.escape ? CSS.escape(initialReelId) : initialReelId}"]`
    const target = pageRef.current?.querySelector(selector)
    target?.scrollIntoView({ block: 'start' })
  }, [initialReelId, visibleReels])

  // Sem onGoHome (tela aberta isolada), o link "/" recarrega a página inicial.
  function handleGoHome(event) {
    if (!onGoHome) return
    event.preventDefault()
    onGoHome()
  }

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
      <a
        className="reels-brand"
        href="/"
        onClick={handleGoHome}
        aria-label="Choosen - voltar para a página inicial"
      >
        <img src={logoMark} alt="" width="90" height="90" />
        <span className="reels-brand-name">Choosen</span>
      </a>

      <main className="reels-feed" aria-label={feedLabel}>
        {visibleReels.length === 0 ? (
          <p className="reels-empty" role="status">
            {emptyMessage}
          </p>
        ) : (
          visibleReels.map((reel) => (
            <ReelPost
              key={reel.id}
              reel={reel}
              community={findCommunity(reel.communityId)}
              isJoined={joinedIds.has(reel.communityId)}
              onJoinCommunity={onJoinCommunity}
              onLeaveCommunity={onLeaveCommunity}
              isFollowing={followed.has(reel.author)}
              onToggleFollow={onToggleFollow}
              isSaved={saved.has(reel.id)}
              onToggleSave={onToggleSave}
              onShare={handleShare}
            />
          ))
        )}
      </main>

      <p className="reels-notice" role="status" data-testid="aviso-reels">{notice}</p>

      <aside className="reels-side">
        <section className="reels-community-suggestions" aria-labelledby="related-communities-title">
          <p className="reels-side-eyebrow">EXPLORE TAMBÉM</p>
          <h2 id="related-communities-title">Comunidades relacionadas</h2>
          <p className="reels-side-intro">Descubra outras comunidades de vídeos curtos escolhidas para você.</p>

          {relatedCommunities.length > 0 ? (
            <ul>
              {relatedCommunities.map((candidate) => {
                const isJoined = joinedIds.has(candidate.id)

                return (
                <li key={candidate.id}>
                  <article className={`reels-community-card reels-community-card--${candidate.tone}`}>
                  <button
                    className="reels-community-card-main"
                    type="button"
                    onClick={() => (isJoined ? onLeaveCommunity(candidate.id) : onJoinCommunity(candidate.id))}
                    aria-pressed={isJoined}
                    aria-label={
                      isJoined
                        ? `Sair da comunidade ${candidate.name}`
                        : `Entrar na comunidade ${candidate.name}`
                    }
                  >
                    <span className="reels-community-card-icon" aria-hidden="true">{candidate.icon}</span>
                    <span className="reels-community-card-copy">
                      <strong>{candidate.name}</strong>
                      <small>{candidate.description}</small>
                      <small>{candidate.memberCount.toLocaleString('pt-BR')} membros</small>
                    </span>
                  </button>
                  <span className={`reels-community-membership${isJoined ? ' reels-community-membership--joined' : ''}`}>
                    {isJoined ? 'Participando' : 'Entrar'}
                  </span>
                  </article>
                </li>
                )
              })}
            </ul>
          ) : (
            <p className="reels-side-empty">Você já está explorando todas as comunidades disponíveis.</p>
          )}
        </section>
      </aside>
    </div>
  )
}

export default Reels
