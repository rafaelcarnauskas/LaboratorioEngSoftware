//os cards de histórico e os cards de comunidade.
//
// Escolha de alvo: ha dois lugares (o card da Tela_History e
// o card do histórico recente da Tela_Home) e a Property 31 fala do card de
// comunidade da Tela_Home. `History` é importável direto; `CommunityTile` e o
// card de histórico recente vivem dentro de `App.jsx` e não são exportados,
// então os dois são exercitados montando `App` inteiro, com o estado chegando
// pelo `localStorage` — que é a única entrada que esses componentes têm. Testar
// o cabeçalho de `CommunityDetail` seria mais barato, mas o Requisito 1.5 é
// sobre o card da Home, e é ele que precisa de cobertura.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import fc from 'fast-check'
import App from '../App'
import History from '../pages/History'
import { reels } from '../data/reels'
import { communities } from '../data/communities'
import { countByCommunity } from '../lib/reelsIndex'
import { formatTime, recentlyWatched } from '../lib/usage'
import { installLocalStorageStub } from './helpers/localStorageStub'

const RUNS = 25
const PROPERTY_TIMEOUT_MS = 120_000

// Hora local em 24h
const clockPattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

const historyKey = 'choosen.history.v1'
const communitiesKey = 'choosen.communities.v1'

let stub = null
let restoreStorage = null

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  restoreStorage?.()
  stub = null
  restoreStorage = null
})

// --- geradores -----------------------------------------------------------

// Evento_Visualizacao válido para o Servico_Historico: um por reel, `seconds`
// inteiro positivo e `watchedAt` dentro dos últimos sete dias.
const eventPlansArbitrary = fc
  .uniqueArray(fc.constantFrom(...reels.map((reel) => reel.id)), { minLength: 1, maxLength: reels.length })
  .chain((reelIds) =>
    fc.tuple(
      ...reelIds.map((reelId) =>
        fc.record({
          reelId: fc.constant(reelId),
          minutesAgo: fc.integer({ min: 0, max: 7 * 24 * 60 - 1 }),
          seconds: fc.integer({ min: 1, max: 90 }),
        }),
      ),
    ),
  )

function buildEvents(plans, now) {
  return plans.map((plan) => ({
    reelId: plan.reelId,
    watchedAt: now - plan.minutesAgo * 60_000,
    seconds: plan.seconds,
  }))
}

const reelsById = new Map(reels.map((reel) => [reel.id, reel]))

// App exibe uma tela de carregamento por 1,5s antes do conteúdo.
function renderApp() {
  vi.useFakeTimers()
  const utils = render(<App />)
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  vi.useRealTimers()
  return utils
}

describe('Cards de histórico', () => {
  //Card de histórico expõe título, autor e hora em `HH:MM`**
 
  it('expõe título, autor e hora em HH:MM em cada card da Tela_History', () => {
    fc.assert(
      fc.property(eventPlansArbitrary, (plans) => {
        cleanup()

        const now = Date.now()
        const events = buildEvents(plans, now)
        const { container } = render(<History events={events} />)

        const cards = [...container.querySelectorAll('.history-card')]
        expect(cards).toHaveLength(events.length)

        for (const event of events) {
          const reel = reelsById.get(event.reelId)
          const card = cards.find((item) => item.textContent.includes(reel.title))

          expect(card).toBeDefined()
          expect(card.querySelector('h3').textContent).toBe(reel.title)
          expect(card.textContent).toContain(reel.author)

          const clock = card.querySelector('.history-card-meta span').textContent
          expect(clock).toBe(formatTime(event.watchedAt))
          expect(clock).toMatch(clockPattern)
        }
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)

  // ** Card de histórico expõe título, autor e hora em `HH:MM`**

  it('expõe título, autor e hora em HH:MM em cada card do histórico recente da Tela_Home', () => {
    fc.assert(
      fc.property(eventPlansArbitrary, (plans) => {
        cleanup()
        stub.reset()

        const now = Date.now()
        const events = buildEvents(plans, now)
        stub.seed({ [historyKey]: JSON.stringify(events) })

        const { container } = renderApp()

        //a seção mostra os quatro mais recentes.
        const expected = recentlyWatched(events, 4)
        const cards = [...container.querySelectorAll('.home-recent-card')]
        expect(cards).toHaveLength(expected.length)

        cards.forEach((card, index) => {
          const event = expected[index]
          const reel = reelsById.get(event.reelId)

          expect(card.querySelector('strong').textContent).toBe(reel.title)
          expect(card.textContent).toContain(`@${reel.author}`)

          const clock = card.querySelector('.home-recent-time').textContent
          expect(clock).toBe(formatTime(event.watchedAt))
          expect(clock).toMatch(clockPattern)
        })
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})

// Adesões válidas para o Servico_Comunidades: subconjunto do catálogo, cada uma
// com um instante de entrada próprio.
const membershipsArbitrary = fc
  .subarray(communities.map((community) => community.id))
  .chain((ids) =>
    fc.tuple(
      ...ids.map((id) =>
        fc.record({ id: fc.constant(id), joinedAt: fc.integer({ min: 1, max: 10_000 }) }),
      ),
    ),
  )

describe('Card de comunidade da Home', () => {
  // **Card de comunidade expõe nome, ícone, descrição, membros e
  // contagem de reels**

  it('expõe nome, ícone, descrição, membros e a contagem de reels de cada comunidade do catálogo', () => {
    fc.assert(
      fc.property(membershipsArbitrary, (memberships) => {
        cleanup()
        stub.reset()
        stub.seed({ [communitiesKey]: JSON.stringify(memberships) })

        const { container } = renderApp()

        // Aderidas e sugeridas particionam o catálogo: um card por comunidade.
        const tiles = [...container.querySelectorAll('.community-tile')]
        expect(tiles).toHaveLength(communities.length)

        for (const community of communities) {
          const tile = container.querySelector(`[aria-label="Abrir ${community.name}"]`)
          expect(tile).not.toBeNull()

          expect(tile.querySelector('strong').textContent).toBe(community.name)
          expect(tile.querySelector('.community-tile-icon').textContent).toBe(community.icon)
          expect(tile.querySelector('.community-tile-description').textContent).toBe(
            community.description,
          )

          const meta = tile.querySelector('.community-tile-meta').textContent
          expect(meta).toContain(`${community.memberCount.toLocaleString('pt-BR')} membros`)

          // A contagem exibida é a dos reels cujo communityId é esta comunidade.
          const reelCount = reels.filter((reel) => reel.communityId === community.id).length
          expect(countByCommunity(community.id)).toBe(reelCount)
          expect(meta).toContain(`${reelCount} ${reelCount === 1 ? 'vídeo' : 'vídeos'}`)
        }
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})
