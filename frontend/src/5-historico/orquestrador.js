// Controller de "Meu tempo": junta as regras de uso (lib/usage.js) e as opções
// de limite (hooks/useMyTime.js) num resumo pronto para a tela exibir.
import { limitOptions } from './modelo/useMyTime'
import { dailyAverage, limitState, minutesToday, weeklyUsage, wellnessDays } from './modelo/usage'

export { limitOptions }

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
