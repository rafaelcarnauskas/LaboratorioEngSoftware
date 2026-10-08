import { useState } from 'react'

const storageKey = 'choosen.history.v1'
const maxEvents = 100

// Teto de sanidade do total acumulado por reel: 24 horas em segundos.
// Não é limite de produto, é filtro de payload corrompido — nenhuma sequência
// plausível de visualizações de 90s chega perto disso.
export const MAX_EVENT_SECONDS = 86400

function isValidEvent(event) {
  return (
    event !== null && typeof event === 'object' &&
    typeof event.reelId === 'string' && event.reelId.length > 0 &&
    Number.isFinite(event.watchedAt) && event.watchedAt > 0 &&
    Number.isInteger(event.seconds) && event.seconds > 0 && event.seconds <= MAX_EVENT_SECONDS
  )
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { events: [], storageError: '' }

    const events = JSON.parse(saved)
    if (
      !Array.isArray(events) ||
      events.length > maxEvents ||
      !events.every(isValidEvent) ||
      new Set(events.map((event) => event.reelId)).size !== events.length
    ) {
      throw new Error('Invalid saved history')
    }

    return { events, storageError: '' }
  } catch {
    return {
      events: [],
      storageError: 'Não foi possível carregar seu histórico. A atividade nova continuará disponível nesta sessão.',
    }
  }
}

// Uma entrada por reel, mais recentes primeiro, teto de 100 entradas.
// O tempo ACUMULA: revisitar um reel soma os segundos à entrada existente e
// avança watchedAt para o instante mais recente.
export function mergeEvent(events, event) {
  const existing = events.find((item) => item.reelId === event.reelId) ?? null
  const others = events.filter((item) => item.reelId !== event.reelId)

  const merged = existing === null
    ? event
    : {
        reelId: event.reelId,
        watchedAt: Math.max(existing.watchedAt, event.watchedAt),
        seconds: Math.min(existing.seconds + event.seconds, MAX_EVENT_SECONDS),
      }

  return [merged, ...others]
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, maxEvents)
}

export default function useHistory() {
  const [state, setState] = useState(loadHistory)

  function recordView(reelId, seconds, watchedAt = Date.now()) {
    setState((current) => {
      const events = mergeEvent(current.events, { reelId, watchedAt, seconds })
      let storageError = ''
      try {
        localStorage.setItem(storageKey, JSON.stringify(events))
      } catch {
        storageError = 'Seu navegador não conseguiu salvar esta atividade. Ela continuará disponível nesta sessão.'
      }
      return { events, storageError }
    })
  }

  function clearHistory() {
    try {
      localStorage.removeItem(storageKey)
      setState({ events: [], storageError: '' })
    } catch {
      setState({
        events: [],
        storageError: 'Seu navegador não conseguiu apagar o histórico salvo. Ele está vazio nesta sessão.',
      })
    }
  }

  return { ...state, recordView, clearHistory }
}
