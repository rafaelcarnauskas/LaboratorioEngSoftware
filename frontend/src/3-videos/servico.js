// Serviço de Vídeos no frontend: lê o catálogo em `GET /api/v1/videos`.
import { avatarGerado, capaGerada, resolverImagem } from '../app/imagensCatalogo'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TEMPO_LIMITE_MS = 8000

export async function buscarVideos() {
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)
  try {
    const response = await fetch(`${API_URL}/api/v1/videos`, { signal: controle.signal })
    if (!response.ok) throw new Error(`GET /videos respondeu ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(prazo)
  }
}

// Vídeo da API → formato de find usado pelas telas. `local` é o find de
// exemplo com o mesmo id, se existir: dele vêm as imagens importadas quando o
// caminho do backend não resolve.
export function paraFind(video, local = null) {
  const author = video.author || local?.author || 'choosen'
  return {
    id: video.id,
    title: video.title,
    category: video.category,
    communityId: video.communityId,
    nicheId: video.nicheId ?? null,
    author,
    avatar: resolverImagem(video.avatar) ?? local?.avatar ?? avatarGerado(author),
    image: resolverImagem(video.image) ?? local?.image ?? capaGerada(video.title),
    caption: video.caption,
    likes: video.likes,
    commentCount: video.commentCount,
    postedAt: video.postedAt,
    duration: video.duration,
    mediaUrl: video.mediaUrl ?? null,
  }
}
