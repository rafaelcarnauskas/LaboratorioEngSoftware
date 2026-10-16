//o gráfico semanal da Tela_MyTime.
//
// `MyTimeView` não é exportado; a tela é alcançada por
// `<Profile path="/profile/my-time" />`, que é exatamente como `App.jsx` a
// monta. Os minutos chegam pelos Eventos_Visualizacao, então o gerador produz
// eventos e a expectativa vem de `weeklyUsage`, a mesma derivação pura que a
// tela consome.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import fc from 'fast-check'
import Profile from '../pages/profile/Profile'
import { finds } from '../data/finds'
import { weeklyUsage } from '../lib/usage'

const RUNS = 25
const PROPERTY_TIMEOUT_MS = 120_000

afterEach(cleanup)

// Eventos espalhados pelos últimos sete dias, com um find por entrada: é o que
// alimenta os sete buckets do gráfico. `maxLength` segue o catálogo porque o
// histórico guarda uma entrada por find.
const eventsArbitrary = fc
  .uniqueArray(fc.constantFrom(...finds.map((find) => find.id)), { minLength: 0, maxLength: finds.length })
  .chain((findIds) =>
    fc.tuple(
      ...findIds.map((findId) =>
        fc.record({
          findId: fc.constant(findId),
          minutesAgo: fc.integer({ min: 0, max: 7 * 24 * 60 - 1 }),
          // Até 3 horas por find: o gráfico precisa ver colunas com volume
          // diferente, não só barras de um minuto.
          seconds: fc.integer({ min: 1, max: 10_800 }),
        }),
      ),
    ),
  )

describe('Gráfico semanal da Tela_MyTime', () => {
  // **Gráfico semanal reflete os minutos recebidos com um único
  // destaque**

  it('renderiza sete barras com os minutos recebidos e exatamente um dia corrente destacado', () => {
    fc.assert(
      fc.property(eventsArbitrary, (plans) => {
        cleanup()

        const now = Date.now()
        const events = plans.map((plan) => ({
          findId: plan.findId,
          watchedAt: now - plan.minutesAgo * 60_000,
          seconds: plan.seconds,
        }))

        const expected = weeklyUsage(events, now)
        const { container } = render(<Profile path="/profile/my-time" events={events} />)

        const items = [...container.querySelectorAll('.weekly-bar-item')]
        expect(items).toHaveLength(7)

        items.forEach((item, index) => {
          const day = expected[index]
          expect(item.querySelector('.weekly-value').textContent).toBe(String(day.minutes))
          expect(item.querySelector('.weekly-day').textContent).toBe(day.day)
        })

        // Um único destaque, e ele é o último bucket — o dia corrente.
        const highlighted = items.filter((item) => item.querySelector('.weekly-bar.is-current'))
        expect(highlighted).toHaveLength(1)
        expect(highlighted[0]).toBe(items[6])
        expect(container.querySelectorAll('.weekly-value.is-current')).toHaveLength(1)
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})
