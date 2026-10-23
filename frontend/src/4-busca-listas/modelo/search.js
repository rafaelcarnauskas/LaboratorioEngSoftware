// Regras da busca no cliente: as mesmas do Serviço de Busca do back
// (backend/app/busca_listas/servico.py). Usadas na hora, enquanto a resposta do
// back não chega, e quando a API está fora do ar.
import { categoryKey } from './categories'

export const durationSeconds = (duration) =>
  String(duration).split(':').reduce((total, part) => total * 60 + Number(part), 0)

export const normalize = (value) =>
  String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const SHORT_LIMIT = 60

// filtros: { query, category ('All' = todas), duration ('any'|'short'|'long'), sort ('featured'|'title'|'shortest') }
export function searchVideos(videos, { query = '', category = 'All', duration = 'any', sort = 'featured' } = {}) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const results = videos.filter((video) => {
    const text = normalize(`${video.title} ${video.creator} ${video.category}`)
    const seconds = durationSeconds(video.duration)
    return terms.every((term) => text.includes(term)) &&
      (category === 'All' || categoryKey(video.category) === categoryKey(category)) &&
      (duration === 'any' || (duration === 'short' ? seconds <= SHORT_LIMIT : seconds > SHORT_LIMIT))
  })
  if (sort === 'title') return [...results].sort((a, b) => a.title.localeCompare(b.title))
  if (sort === 'shortest') return [...results].sort((a, b) => durationSeconds(a.duration) - durationSeconds(b.duration))
  return results
}
