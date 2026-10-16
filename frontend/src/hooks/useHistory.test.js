// Property 15 do design: contrato puro de `mergeEvent` (Servico_Historico).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { mergeEvent, MAX_EVENT_SECONDS } from './useHistory'

const RUNS = 100
const MAX_EVENTS = 100

// Réplica do validador de leitura de `useHistory` (não exportado pelo módulo):
// a Property 15 exige que tudo que `mergeEvent` produz passe nessa validação.
function isValidEvent(event) {
  return (
    event !== null && typeof event === 'object' &&
    typeof event.findId === 'string' && event.findId.length > 0 &&
    Number.isFinite(event.watchedAt) && event.watchedAt > 0 &&
    Number.isInteger(event.seconds) && event.seconds > 0 && event.seconds <= MAX_EVENT_SECONDS
  )
}

function viewsArbitrary(poolSize) {
  const findId = fc.integer({ min: 0, max: poolSize - 1 }).map((index) => `find-${index}`)

  return fc.array(
    fc.record({
      findId,
      watchedAt: fc.integer({ min: 1, max: 10_000_000 }),
      seconds: fc.integer({ min: 1, max: 90 }),
    }),
    { minLength: 1, maxLength: 160 },
  )
}

function fold(views) {
  return views.reduce((events, view) => mergeEvent(events, view), [])
}

describe('mergeEvent', () => {
  // **Property 15: Histórico mantém uma entrada por find, acumulando o tempo e
  // guardando o instante mais recente**
  //
  // **Validates: Requirements 6.2, 6.12**
  it('mantém uma entrada por find, soma os segundos e guarda o instante mais recente', () => {
    // Pool abaixo do teto de 100: nada é descartado, então os invariantes de
    // acumulação valem sobre a sequência inteira.
    fc.assert(
      fc.property(viewsArbitrary(40), (views) => {
        const events = fold(views)

        const ids = events.map((event) => event.findId)
        expect(new Set(ids).size).toBe(ids.length)
        expect(events.length).toBeLessThanOrEqual(MAX_EVENTS)
        expect(events.every(isValidEvent)).toBe(true)

        expect(new Set(ids)).toEqual(new Set(views.map((view) => view.findId)))

        for (const event of events) {
          const own = views.filter((view) => view.findId === event.findId)
          const expectedWatchedAt = Math.max(...own.map((view) => view.watchedAt))
          const expectedSeconds = Math.min(
            own.reduce((total, view) => total + view.seconds, 0),
            MAX_EVENT_SECONDS,
          )

          expect(event.watchedAt).toBe(expectedWatchedAt)
          expect(event.seconds).toBe(expectedSeconds)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('corta em 100 entradas sem descartar nada mais recente do que o que mantém', () => {
    // Pool acima do teto: aqui o corte age, e o que importa é a regra de
    // descarte (o mais antigo sai) e o tamanho máximo.
    fc.assert(
      fc.property(viewsArbitrary(150), (views) => {
        const events = fold(views)

        expect(events.length).toBeLessThanOrEqual(MAX_EVENTS)
        expect(events.every(isValidEvent)).toBe(true)

        const kept = new Set(events.map((event) => event.findId))
        const droppedTimes = views
          .filter((view) => !kept.has(view.findId))
          .map((view) => view.watchedAt)

        if (droppedTimes.length > 0) {
          const oldestKept = Math.min(...events.map((event) => event.watchedAt))
          expect(Math.max(...droppedTimes)).toBeLessThanOrEqual(oldestKept)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('soma os segundos de uma revisita e avança watchedAt', () => {
    const first = mergeEvent([], { findId: 'sports-1', watchedAt: 1000, seconds: 10 })
    const second = mergeEvent(first, { findId: 'sports-1', watchedAt: 5000, seconds: 7 })

    expect(second).toEqual([{ findId: 'sports-1', watchedAt: 5000, seconds: 17 }])
  })

  it('não retrocede watchedAt quando a visualização registrada é mais antiga', () => {
    const events = mergeEvent(
      [{ findId: 'cute-1', watchedAt: 9000, seconds: 12 }],
      { findId: 'cute-1', watchedAt: 4000, seconds: 3 },
    )

    expect(events).toEqual([{ findId: 'cute-1', watchedAt: 9000, seconds: 15 }])
  })
})
