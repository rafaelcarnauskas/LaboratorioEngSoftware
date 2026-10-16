// Orquestrador de Atividade: histórico agrupado e resumo de "Meu tempo" a partir
// das regras de uso (modelo/usage.js) e das opções de limite (modelo/useMyTime.js).
import { findCommunity } from '../2-comunidades/modelo/communities'
import { hydrate } from '../3-videos/modelo/findsIndex'
import { limitOptions } from './modelo/useMyTime'
import { dailyAverage, formatTime, groupHistory, limitState, minutesToday, weeklyUsage, wellnessDays } from './modelo/usage'

export { formatTime, limitOptions }

// Histórico agrupado por dia, com o find e o nome da comunidade já anexados.
// Eventos cujo find saiu do catálogo são descartados por `hydrate`.
export function historyGroups(events, now) {
  return groupHistory(hydrate(events), now).map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      communityName: findCommunity(item.find.communityId)?.name ?? '',
    })),
  }))
}

export function myTimeSummary(events, now, dailyLimit) {
  const weekUsage = weeklyUsage(events, now)
  const todayMinutes = minutesToday(events, now)

  return {
    todayMinutes,
    weekUsage,
    averageMinutes: dailyAverage(weekUsage),
    balancedDays: wellnessDays(weekUsage, dailyLimit),
    ...limitState(todayMinutes, dailyLimit),
  }
}
