// Derivações puras de tempo de uso e de agrupamento de histórico.
// Nenhuma dependência de React e nenhuma leitura de relógio: toda função que
// depende do tempo recebe `now` como argumento, o que torna o agrupamento por
// dia e o cálculo semanal determinísticos nos testes.

// Indexado por `getDay()`: a posição 0 é domingo.
export const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Chave de dia civil local, não UTC: visualizações às 23:50 pertencem ao dia local.
export function toDayKey(timestamp) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// Horário local em 24 horas, `HH:MM` (Requisitos 6.8 e 7.2).
export function formatTime(timestamp) {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Rótulo de grupo da Tela_History: dia corrente, dia anterior ou a data longa.
export function groupLabel(timestamp, now) {
  const todayKey = toDayKey(now)

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toDayKey(yesterday)

  const key = toDayKey(timestamp)

  if (key === todayKey) return 'Hoje'
  if (key === yesterdayKey) return 'Ontem'

  return new Date(timestamp).toLocaleDateString('pt-BR', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// Minutos de um dia civil local, arredondados para o minuto inteiro mais próximo.
export function minutesForDay(events, dayKey) {
  const seconds = events
    .filter((event) => toDayKey(event.watchedAt) === dayKey)
    .reduce((total, event) => total + event.seconds, 0)
  return Math.round(seconds / 60)
}

export function minutesToday(events, now) {
  return minutesForDay(events, toDayKey(now))
}

// Sete entradas, da mais antiga para a mais recente; a última é o dia corrente.
export function weeklyUsage(events, now) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (6 - index))
    const dayKey = toDayKey(date)

    return {
      day: dayLabels[date.getDay()],
      dayKey,
      minutes: minutesForDay(events, dayKey),
      current: index === 6,
    }
  })
}

// Divisão por 7 fixo, não por `week.length`: o Requisito 8.4 pede a média dos
// últimos 7 dias, e `weeklyUsage` sempre devolve exatamente 7 buckets.
export function dailyAverage(week) {
  return Math.round(week.reduce((total, day) => total + day.minutes, 0) / 7)
}

// Selo_Bem_Estar: dias estritamente abaixo do Limite_Diario (Requisito 8.14).
export function wellnessDays(week, dailyLimit) {
  return week.filter((day) => day.minutes < dailyLimit).length
}

// `rawPercentage` fica separado de `clampedPercentage` porque a UI exibe o número
// cru no anel (pode passar de 100) e usa o valor limitado para a largura da barra
// e o ângulo do anel. O Requisito 8.5 pede o clamp apenas nos elementos visuais.
// Limite zero é impossível pelo validador de `useMyTime`, mas a divisão é
// protegida de todo jeito.
export function limitState(minutes, dailyLimit) {
  const rawPercentage = dailyLimit > 0 ? Math.round((minutes / dailyLimit) * 100) : 0
  const isOverLimit = minutes >= dailyLimit

  return {
    rawPercentage,
    clampedPercentage: Math.min(Math.max(rawPercentage, 0), 100),
    remainingMinutes: Math.max(dailyLimit - minutes, 0),
    isOverLimit,
    status: isOverLimit ? 'Limite atingido' : 'Dentro do limite',
  }
}

// Histórico ordenado e agrupado para a Tela_History: ordem decrescente de
// instante, cada evento em exatamente um grupo (Requisitos 6.7 e 6.9).
export function groupHistory(events, now) {
  const groups = []
  const byLabel = new Map()

  for (const event of [...events].sort((a, b) => b.watchedAt - a.watchedAt)) {
    const label = groupLabel(event.watchedAt, now)

    if (!byLabel.has(label)) {
      const group = { label, items: [] }
      byLabel.set(label, group)
      groups.push(group)
    }

    byLabel.get(label).items.push(event)
  }

  return groups
}

// Histórico recente da Home: os mais recentes primeiro (Requisito 7.1).
export function recentlyWatched(events, limit = 4) {
  return [...events].sort((a, b) => b.watchedAt - a.watchedAt).slice(0, limit)
}
