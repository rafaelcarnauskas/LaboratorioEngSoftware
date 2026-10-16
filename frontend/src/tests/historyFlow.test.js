// permanência atribuída, exibição do
// histórico, histórico recente da Home e roteamento do item recente.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { attributedSeconds, MAX_ATTRIBUTED_SECONDS, MIN_DWELL_MS } from '../pages/Finds'
import { groupHistory, recentlyWatched } from '../lib/usage'
import { hydrate } from '../lib/findsIndex'
import { buildUrl, parseUrl } from '../lib/navigation'
import { finds } from '../data/finds'

const RUNS = 100

const dwellArbitrary = fc.oneof(
  fc.integer({ min: -10_000, max: 400_000 }),
  // Concentra amostras na vizinhança do limiar de 3 segundos.
  fc.integer({ min: MIN_DWELL_MS - 50, max: MIN_DWELL_MS + 50 }),
  fc.double({ min: -1e6, max: 1e9, noNaN: true }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0),
)

const NOW = Date.UTC(2026, 2, 15, 12, 0, 0)

const eventsArbitrary = fc.array(
  fc.record({
    findId: fc.constantFrom(...finds.map((find) => find.id)),
    // Até dez dias antes de `now`, para cobrir Today, Yesterday e datas longas.
    watchedAt: fc.integer({ min: NOW - 10 * 86_400_000, max: NOW }),
    seconds: fc.integer({ min: 1, max: 90 }),
  }),
  { maxLength: 25 },
)

function sortedKey(events) {
  return [...events]
    .map((event) => `${event.findId}@${event.watchedAt}:${event.seconds}`)
    .sort()
}

function isDescending(events) {
  return events.every((event, index) => index === 0 || events[index - 1].watchedAt >= event.watchedAt)
}

describe('permanência atribuída', () => {
  // Registro só ocorre a partir de 3 segundos de permanência**
  //
  it('devolve valor positivo se e somente se a permanência é finita e >= 3000ms', () => {
    fc.assert(
      fc.property(dwellArbitrary, (dwellMs) => {
        const seconds = attributedSeconds(dwellMs)
        const shouldCount = Number.isFinite(dwellMs) && dwellMs >= MIN_DWELL_MS

        expect(seconds > 0).toBe(shouldCount)

        if (shouldCount) {
          expect(seconds).toBe(Math.min(Math.round(dwellMs / 1000), MAX_ATTRIBUTED_SECONDS))
          expect(seconds).toBeLessThanOrEqual(MAX_ATTRIBUTED_SECONDS)
        } else {
          expect(seconds).toBe(0)
        }
      }),
      { numRuns: RUNS },
    )
  })
})

describe('exibição do histórico', () => {
  // Histórico é exibido em ordem decrescente de instante**
  //
  // **Validates: Requirements 6.7**
  it('é uma permutação do conjunto, decrescente em watchedAt', () => {
    fc.assert(
      fc.property(eventsArbitrary, (events) => {
        const groups = groupHistory(events, NOW)
        const shown = groups.flatMap((group) => group.items)

        expect(sortedKey(shown)).toEqual(sortedKey(events))
        expect(isDescending(shown)).toBe(true)
        // Cada rótulo de dia aparece em exatamente um grupo.
        expect(new Set(groups.map((group) => group.label)).size).toBe(groups.length)
      }),
      { numRuns: RUNS },
    )
  })
})

describe('histórico recente da Home', () => {
  // Histórico recente mostra os quatro mais recentes**

  it('mostra min(tamanho, 4) itens e nenhum item de fora é mais recente', () => {
    fc.assert(
      fc.property(eventsArbitrary, (events) => {
        const recent = recentlyWatched(events, 4)

        expect(recent.length).toBe(Math.min(events.length, 4))
        expect(isDescending(recent)).toBe(true)

        const remaining = sortedKey(events)
        for (const key of sortedKey(recent)) {
          const at = remaining.indexOf(key)
          expect(at).toBeGreaterThanOrEqual(0)
          remaining.splice(at, 1)
        }

        if (recent.length > 0 && remaining.length > 0) {
          const oldestShown = recent[recent.length - 1].watchedAt
          const outsideTimes = remaining.map((key) => Number(key.split('@')[1].split(':')[0]))
          expect(Math.max(...outsideTimes)).toBeLessThanOrEqual(oldestShown)
        }
      }),
      { numRuns: RUNS },
    )
  })

  // **Item do histórico recente roteia para a comunidade e o find certos**

  it('roteia para a comunidade e o find do item acionado', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...finds.map((find) => find.id)),
        fc.integer({ min: NOW - 86_400_000, max: NOW }),
        (findId, watchedAt) => {
          const [item] = hydrate([{ findId, watchedAt, seconds: 10 }])
          expect(item.find.id).toBe(findId)

          // O item da Home aciona openFinds(find.communityId, find.id).
          const url = buildUrl({
            screen: 'finds',
            communityId: item.find.communityId,
            findId: item.find.id,
          })
          const nav = parseUrl(url.slice(url.indexOf('?')))

          expect(nav).toEqual({
            screen: 'finds',
            communityId: item.find.communityId,
            findId: item.find.id,
            sanitized: false,
          })
        },
      ),
      { numRuns: RUNS },
    )
  })
})
