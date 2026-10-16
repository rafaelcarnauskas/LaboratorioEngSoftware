import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { findCommunity } from '../../2-comunidades/orquestrador'
import { findShareUrl, relatedCommunities as relatedTo, selectFinds } from '../orquestrador'
import logoMark from '../../assets/finds/icons/logo-mark.svg'
import commentIcon from '../../assets/finds/icons/comment.svg'
import shareIcon from '../../assets/finds/icons/share.svg'
import saveIcon from '../../assets/finds/icons/save.svg'
import emojiIcon from '../../assets/finds/icons/emoji.svg'
import './Finds.css'

const currentUser = { username: 'mendesvictor', name: 'Victor Grandolfo Mendes' }

// Placeholder: os botões já são clicáveis, as funções entram nos próximos passos.
function handleNotImplemented() {}

function formatCount(count) {
  return count.toLocaleString('pt-BR')
}

function ChoosenLikeMark({ liked }) {
  return (
    <span className={`finds-like-mark${liked ? ' finds-like-mark--liked' : ''}`} aria-hidden="true">
      <span />
    </span>
  )
}

function FindPost({
  find,
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
  const commentInputId = `comentario-${find.id}`
  const feedbackId = `feedback-${find.id}`
  const commentsPanelId = `comentarios-${find.id}`

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
  const commentCount = find.commentCount + comments.length
  const likeCount = find.likes + (isLiked ? 1 : 0)

  return (
    <article
      className="finds-post"
      aria-label={`Vídeo de @${find.author}`}
      data-testid="find"
      data-find-id={find.id}
    >
      <div className="finds-video">
        <button
          className="finds-video-media"
          type="button"
          onClick={handleNotImplemented}
          aria-label={`Reproduzir vídeo: ${find.caption}`}
        >
          {/* Fundo desfocado preenche o quadro vertical sem cortar a imagem. */}
          <img className="finds-video-backdrop" src={find.image} alt="" />
          <img className="finds-video-image" src={find.image} alt="" />
        </button>

        <div className="finds-video-overlay">
          <div className="finds-video-author">
            <button
              className="finds-profile-link"
              type="button"
              onClick={handleNotImplemented}
              aria-label={`Ver perfil de @${find.author}`}
            >
              <img className="finds-avatar" src={find.avatar} alt="" width="32" height="32" />
              <span className="finds-post-author">@{find.author}</span>
            </button>
            <button
              className={`finds-follow${isFollowing ? ' finds-follow--following' : ''}`}
              type="button"
              onClick={() => onToggleFollow(find.author)}
              aria-pressed={isFollowing}
              aria-label={isFollowing ? `Deixar de seguir @${find.author}` : `Seguir @${find.author}`}
              data-testid="acao-seguir"
            >
              {isFollowing ? 'Seguindo ✓' : 'Seguir +'}
            </button>
            {community && (
              // Sem role="status"/"alert" aqui: os testes do Finds procuram
              // essas live regions dentro do post para ler o feedback de
              // comentário. O próprio botão comunica o estado via aria-pressed.
              <button
                className={`finds-community${isJoined ? ' finds-community--joined' : ''}`}
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

          <div className={`finds-caption${isCaptionExpanded ? ' finds-caption--expanded' : ''}`}>
            <p className="finds-caption-text" ref={captionRef}>{find.caption}</p>
            {isCaptionTruncated && !isCaptionExpanded && (
              <button
                className="finds-caption-more"
                type="button"
                onClick={() => setIsCaptionExpanded(true)}
                aria-label="Ver legenda completa"
              >
                mais
              </button>
            )}
          </div>
          <p className="finds-time">{find.postedAt}</p>
        </div>
      </div>

      <div className="finds-actions">
        <button
          className={`finds-action finds-like-action${isLiked ? ' finds-like-action--liked' : ''}`}
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
          className={`finds-action${isCommentsOpen ? ' finds-action--active' : ''}`}
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
          className="finds-action"
          type="button"
          onClick={() => onShare(find)}
          aria-label="Compartilhar"
          data-testid="acao-compartilhar"
        >
          <img src={shareIcon} alt="" width="28" height="28" />
        </button>
        <button
          className={`finds-action${isSaved ? ' finds-action--saved' : ''}`}
          type="button"
          onClick={() => onToggleSave(find.id)}
          aria-label={isSaved ? 'Remover dos salvos' : 'Salvar'}
          aria-pressed={isSaved}
          data-testid="acao-salvar"
        >
          <img src={saveIcon} alt="" width="28" height="28" />
        </button>
      </div>

      {isCommentsOpen && (
        <section
          className="finds-comments-panel"
          id={commentsPanelId}
          aria-label="Comentários"
          onKeyDown={handlePanelKeyDown}
        >
          <header className="finds-comments-header">
            <h2>Comentários</h2>
            <button
              className="finds-comments-close"
              type="button"
              onClick={closeComments}
              aria-label="Fechar comentários"
            >
              ✕
            </button>
          </header>

          {/* Só a lista rola; o campo e o botão Post ficam sempre no rodapé do painel. */}
          <div className="finds-comments-body" ref={commentListRef}>
            <button className="finds-text-button finds-view-comments" type="button" onClick={handleNotImplemented}>
              Ver os {formatCount(find.commentCount)} comentários anteriores
            </button>
            {comments.length > 0 && (
              <ul className="finds-comments" data-testid="lista-comentarios">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <span className="finds-comment-author">{comment.author}</span> {comment.text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="finds-comments-footer">
            {feedback.message && (
              <p
                id={feedbackId}
                className={`finds-feedback finds-feedback--${feedback.status}`}
                role={hasError ? 'alert' : 'status'}
              >
                {feedback.message}
              </p>
            )}
            <form className="finds-comment-form" noValidate onSubmit={handleCommentSubmit}>
              <button className="finds-icon-button" type="button" onClick={handleNotImplemented} aria-label="Inserir emoji">
                <img src={emojiIcon} alt="" width="24" height="24" />
              </button>
              <label className="finds-visually-hidden" htmlFor={commentInputId}>Comentário</label>
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
                className={`finds-comment-submit${commentText.trim() ? '' : ' finds-comment-submit--idle'}`}
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

// Permanência mínima para o find contar como visto.
export const MIN_DWELL_MS = 3000

// Teto por visualização individual. NÃO é teto do total acumulado por find:
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

// Qual find ocupa a maior parte da viewport. A rolagem nativa continua sendo o
// mecanismo de navegação: o observer apenas observa.
function useFocusedFind(pageRef, findIds) {
  const [focusedId, setFocusedId] = useState(findIds[0] ?? null)

  useEffect(() => {
    // Sem IntersectionObserver o rastreio é desligado em silêncio: a tela
    // continua funcionando, só não registra visualização.
    if (!('IntersectionObserver' in window)) return
    const posts = pageRef.current?.querySelectorAll('[data-find-id]')
    if (!posts || posts.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setFocusedId(visible.target.dataset.findId)
      },
      { threshold: [0.25, 0.5, 0.75] },
    )

    posts.forEach((post) => observer.observe(post))
    return () => observer.disconnect()
  }, [pageRef, findIds])

  return focusedId
}

// Na troca de foco, o find anterior é contabilizado se ficou tempo suficiente.
function useWatchTracking(focusedId, onFindWatched) {
  const startedAt = useRef(null)
  const previousId = useRef(null)

  useEffect(() => {
    const now = Date.now()
    const previous = previousId.current

    if (previous !== null && startedAt.current !== null) {
      const seconds = attributedSeconds(now - startedAt.current)
      if (seconds > 0) onFindWatched(previous, seconds)
    }

    previousId.current = focusedId
    startedAt.current = focusedId === null ? null : now
  }, [focusedId, onFindWatched])

  // Sair da tela de finds também fecha a visualização em andamento.
  useEffect(() => () => {
    if (previousId.current !== null && startedAt.current !== null) {
      const seconds = attributedSeconds(Date.now() - startedAt.current)
      if (seconds > 0) onFindWatched(previousId.current, seconds)
    }
  }, [onFindWatched])
}

function Finds({
  category = null,
  communityId = null,
  niches = [],
  initialFindId = null,
  onFindWatched = handleNotImplemented,
  onGoHome,
  memberships = [],
  onJoinCommunity = handleNotImplemented,
  onLeaveCommunity = handleNotImplemented,
  followedAuthors = [],
  onToggleFollow = handleNotImplemented,
  savedFindIds = [],
  onToggleSave = handleNotImplemented,
}) {
  // Seletor único: categoria, comunidade e nichos em conjunção.
  // `niches` vazio significa "todos" os nichos da comunidade.
  const nicheKey = niches.join('|')
  const visibleFinds = useMemo(
    () => selectFinds({ category, communityId, niches }),
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
  const saved = new Set(savedFindIds)
  const relatedCommunities = useMemo(
    () => relatedTo(visibleFinds, { community, category }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, community?.category, visibleFinds],
  )

  // Aviso de rodapé do feed (ex.: link copiado). Fica fora dos posts: os testes
  // do Finds procuram as live regions de comentário dentro de cada post.
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  async function handleShare(find) {
    const url = findShareUrl(find)
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
  const findIds = useMemo(() => visibleFinds.map((find) => find.id), [visibleFinds])
  const focusedId = useFocusedFind(pageRef, findIds)
  useWatchTracking(focusedId, onFindWatched)

  // Abertura por find específico: o feed já nasce posicionado nele, antes da
  // primeira pintura, para não aparecer um salto de rolagem.
  useLayoutEffect(() => {
    if (!initialFindId) return

    const selector = `[data-find-id="${CSS?.escape ? CSS.escape(initialFindId) : initialFindId}"]`
    const target = pageRef.current?.querySelector(selector)
    target?.scrollIntoView({ block: 'start' })
  }, [initialFindId, visibleFinds])

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
      const post = pageRef.current?.querySelector('.finds-post')
      if (!direction || isTyping || !post) return

      event.preventDefault()
      pageRef.current.scrollBy({ top: direction * post.offsetHeight, behavior: 'smooth' })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="finds-page" ref={pageRef}>
      <a
        className="finds-brand"
        href="/"
        onClick={handleGoHome}
        aria-label="Choosen - voltar para a página inicial"
      >
        <img src={logoMark} alt="" width="90" height="90" />
        <span className="finds-brand-name">Choosen</span>
      </a>

      <main className="finds-feed" aria-label={feedLabel}>
        {visibleFinds.length === 0 ? (
          <p className="finds-empty" role="status">
            {emptyMessage}
          </p>
        ) : (
          visibleFinds.map((find) => (
            <FindPost
              key={find.id}
              find={find}
              community={findCommunity(find.communityId)}
              isJoined={joinedIds.has(find.communityId)}
              onJoinCommunity={onJoinCommunity}
              onLeaveCommunity={onLeaveCommunity}
              isFollowing={followed.has(find.author)}
              onToggleFollow={onToggleFollow}
              isSaved={saved.has(find.id)}
              onToggleSave={onToggleSave}
              onShare={handleShare}
            />
          ))
        )}
      </main>

      <p className="finds-notice" role="status" data-testid="aviso-finds">{notice}</p>

      <aside className="finds-side">
        <section className="finds-community-suggestions" aria-labelledby="related-communities-title">
          <p className="finds-side-eyebrow">EXPLORE TAMBÉM</p>
          <h2 id="related-communities-title">Comunidades relacionadas</h2>
          <p className="finds-side-intro">Descubra outras comunidades de vídeos curtos escolhidas para você.</p>

          {relatedCommunities.length > 0 ? (
            <ul>
              {relatedCommunities.map((candidate) => {
                const isJoined = joinedIds.has(candidate.id)

                return (
                <li key={candidate.id}>
                  <article className={`finds-community-card finds-community-card--${candidate.tone}`}>
                  <button
                    className="finds-community-card-main"
                    type="button"
                    onClick={() => (isJoined ? onLeaveCommunity(candidate.id) : onJoinCommunity(candidate.id))}
                    aria-pressed={isJoined}
                    aria-label={
                      isJoined
                        ? `Sair da comunidade ${candidate.name}`
                        : `Entrar na comunidade ${candidate.name}`
                    }
                  >
                    <span className="finds-community-card-icon" aria-hidden="true">{candidate.icon}</span>
                    <span className="finds-community-card-copy">
                      <strong>{candidate.name}</strong>
                      <small>{candidate.description}</small>
                      <small>{candidate.memberCount.toLocaleString('pt-BR')} membros</small>
                    </span>
                  </button>
                  <span className={`finds-community-membership${isJoined ? ' finds-community-membership--joined' : ''}`}>
                    {isJoined ? 'Participando' : 'Entrar'}
                  </span>
                  </article>
                </li>
                )
              })}
            </ul>
          ) : (
            <p className="finds-side-empty">Você já está explorando todas as comunidades disponíveis.</p>
          )}
        </section>
      </aside>
    </div>
  )
}

export default Finds
