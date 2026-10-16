// Testes de propriedade de `usage.js` (tarefa 12.6).
// Nenhum fake timer: o instante `agora` é gerado junto com os eventos e passado
// explicitamente, exatamente como a aplicação faz.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  dailyAverage,
  groupHistory,
  groupLabel,
  limitState,
  minutesToday,
  weeklyUsage,
  wellnessDays,
} from './usage.js'

const DAY_MS = 24 * 60 * 60 * 1000
const RUNS = { numRuns: 200 }

// Limites válidos de Limite_Diario (`limitOptions` de `useMyTime`).
const limitOptions = [30, 45, 60, 90, 120]

// --- Oráculos independentes -------------------------------------------------
// Reimplementados a partir do dia civil local, sem reaproveitar `toDayKey`, para
// que o teste não valide a implementação contra ela mesma.

function localMidnight(timestamp) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Diferença em dias civis locais. O arredondamento absorve o salto de horário
// de verão, que faz um "dia" ter 23 ou 25 horas.
function civilDayDiff(later, earlier) {
  return Math.round((localMidnight(later) - localMidnight(earlier)) / DAY_MS)
}

function expectedLabel(watchedAt, now) {
  const diff = civilDayDiff(now, watchedAt)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return new Date(watchedAt).toLocaleDateString('pt-BR', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function expectedMinutes(events, dayOffsetFromNow, now) {
  const seconds = events
    .filter((event) => civilDayDiff(now, event.watchedAt) === dayOffsetFromNow)
    .reduce((total, event) => total + event.seconds, 0)
  return Math.round(seconds / 60)
}

// --- Geradores --------------------------------------------------------------

// Faixa de datas larga, mas dentro de uma janela em que o fuso local é estável.
const nowArb = fc.integer({
  min: Date.UTC(2022, 0, 1),
  max: Date.UTC(2028, 0, 1),
})

// Eventos espalhados numa janela de 20 dias ao redor de `agora`: cobre o dia
// corrente, o anterior, os sete buckets da semana e dias fora da janela.
function eventsArb(now, maxLength = 15) {
  return fc.array(
    fc.record({
      findId: fc.string({ minLength: 1, maxLength: 6 }),
      watchedAt: fc.integer({ min: now - 20 * DAY_MS, max: now }),
      seconds: fc.integer({ min: 1, max: 5400 }),
    }),
    { maxLength },
  )
}

// `agora` e o histórico gerados em conjunto, com identidade única por evento
// para que a checagem de "exatamente um grupo" seja inequívoca.
const historyArb = nowArb.chain((now) =>
  eventsArb(now).map((events) => ({
    now,
    events: events.map((event, index) => ({ ...event, findId: `${event.findId}-${index}` })),
  })),
)

// Vetor de 7 minutos diários, na forma que `weeklyUsage` devolve.
const weekArb = fc.array(fc.integer({ min: 0, max: 600 }), { minLength: 7, maxLength: 7 })
  .map((minutes) => minutes.map((value, index) => ({ minutes: value, current: index === 6 })))

const minutesArb = fc.integer({ min: 0, max: 1000 })
const limitArb = fc.constantFrom(...limitOptions)

// --- Property 18 ------------------------------------------------------------

describe('Property 18: Cada evento pertence a exatamente um grupo, com o rótulo correto', () => {
  // **Validates: Requirements 6.9**
  it('rotula o instante como Hoje, Ontem ou a data da visualização', () => {
    fc.assert(
      fc.property(
        nowArb.chain((now) =>
          fc
            .integer({ min: now - 30 * DAY_MS, max: now })
            .map((watchedAt) => ({ now, watchedAt })),
        ),
        ({ now, watchedAt }) => {
          expect(groupLabel(watchedAt, now)).toBe(expectedLabel(watchedAt, now))
        },
      ),
      RUNS,
    )
  })

  it('coloca todo evento em exatamente um grupo, com o rótulo do próprio instante', () => {
    fc.assert(
      fc.property(historyArb, ({ now, events }) => {
        const groups = groupHistory(events, now)

        const flattened = groups.flatMap((group) => group.items)
        expect(flattened).toHaveLength(events.length)
        expect(new Set(flattened.map((event) => event.findId)).size).toBe(events.length)

        // Rótulos distintos entre grupos: nenhum evento tem dois grupos candidatos.
        const labels = groups.map((group) => group.label)
        expect(new Set(labels).size).toBe(labels.length)

        for (const group of groups) {
          for (const item of group.items) {
            expect(group.label).toBe(expectedLabel(item.watchedAt, now))
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})

// --- Property 22 ------------------------------------------------------------

describe('Property 22: Minutos do dia somam apenas os eventos daquele dia', () => {
  // **Validates: Requirements 8.1, 8.15**
  it('soma só os eventos do dia civil local de agora', () => {
    fc.assert(
      fc.property(historyArb, ({ now, events }) => {
        expect(minutesToday(events, now)).toBe(expectedMinutes(events, 0, now))
      }),
      { numRuns: 150 },
    )
  })

  it('devolve zero para histórico vazio', () => {
    fc.assert(
      fc.property(nowArb, (now) => {
        expect(minutesToday([], now)).toBe(0)
      }),
      RUNS,
    )
  })
})

// --- Property 23 ------------------------------------------------------------

describe('Property 23: Uso semanal tem sete buckets disjuntos terminando no dia corrente', () => {
  // **Validates: Requirements 8.2**
  it('devolve 7 buckets disjuntos, o último sendo o dia corrente', () => {
    fc.assert(
      fc.property(historyArb, ({ now, events }) => {
        const week = weeklyUsage(events, now)

        expect(week).toHaveLength(7)
        expect(week[6].current).toBe(true)
        expect(week.filter((day) => day.current)).toHaveLength(1)

        // Buckets disjuntos: sete chaves de dia distintas, do mais antigo para o
        // mais recente, terminando no dia local de `agora`.
        const keys = week.map((day) => day.dayKey)
        expect(new Set(keys).size).toBe(7)
        expect([...keys].sort()).toEqual(keys)

        week.forEach((day, index) => {
          expect(day.minutes).toBe(expectedMinutes(events, 6 - index, now))
        })
      }),
      { numRuns: 150 },
    )
  })

  it('ignora eventos fora da janela de sete dias', () => {
    fc.assert(
      fc.property(historyArb, ({ now, events }) => {
        const week = weeklyUsage(events, now)
        const total = week.reduce((sum, day) => sum + day.minutes, 0)

        // Os minutos são arredondados por dia, então o total é a soma dos
        // arredondamentos diários dos eventos dos últimos 7 dias civis.
        const inWindow = [0, 1, 2, 3, 4, 5, 6].reduce(
          (sum, offset) => sum + expectedMinutes(events, offset, now),
          0,
        )
        expect(total).toBe(inWindow)
      }),
      { numRuns: 150 },
    )
  })
})

// --- Property 25 ------------------------------------------------------------

describe('Property 25: Média diária é a soma dividida por sete', () => {
  // **Validates: Requirements 8.4**
  it('divide a soma dos minutos por 7 fixo', () => {
    fc.assert(
      fc.property(weekArb, (week) => {
        const sum = week.reduce((total, day) => total + day.minutes, 0)
        expect(dailyAverage(week)).toBe(Math.round(sum / 7))
      }),
      RUNS,
    )
  })
})

// --- Property 26 ------------------------------------------------------------

describe('Property 26: Percentual exibido fica entre zero e cem', () => {
  // **Validates: Requirements 8.5**
  it('mantém clampedPercentage no intervalo fechado de 0 a 100', () => {
    fc.assert(
      fc.property(minutesArb, limitArb, (minutes, limit) => {
        const { clampedPercentage } = limitState(minutes, limit)
        expect(clampedPercentage).toBeGreaterThanOrEqual(0)
        expect(clampedPercentage).toBeLessThanOrEqual(100)
      }),
      RUNS,
    )
  })
})

// --- Property 27 ------------------------------------------------------------

describe('Property 27: Estado do limite é uma dicotomia com minutos restantes corretos', () => {
  // **Validates: Requirements 8.6, 8.7**
  it('devolve Dentro do limite se e somente se os minutos são estritamente menores que o limite', () => {
    fc.assert(
      fc.property(minutesArb, limitArb, (minutes, limit) => {
        const state = limitState(minutes, limit)

        expect(state.isOverLimit).toBe(minutes >= limit)
        expect(state.status).toBe(minutes < limit ? 'Dentro do limite' : 'Limite atingido')
        expect(state.remainingMinutes).toBe(Math.max(limit - minutes, 0))
      }),
      RUNS,
    )
  })
})

// --- Property 28 ------------------------------------------------------------

describe('Property 28: Selo de bem-estar conta os dias estritamente abaixo do limite', () => {
  // **Validates: Requirements 8.14**
  it('conta os dias com minutos estritamente abaixo do limite, entre 0 e 7', () => {
    fc.assert(
      fc.property(weekArb, limitArb, (week, limit) => {
        const count = wellnessDays(week, limit)

        expect(count).toBe(week.filter((day) => day.minutes < limit).length)
        expect(count).toBeGreaterThanOrEqual(0)
        expect(count).toBeLessThanOrEqual(7)
      }),
      RUNS,
    )
  })
})
