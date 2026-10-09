// Contrato de URL da navegação por comunidade (Requisito 11).
// Estado de navegação da query string:
// { screen: 'home' | 'comunidade' | 'reels', communityId: string | null, reelId: string | null }
//
// Módulo puro, sem React: recebe e devolve apenas dados, o que permite testar o
// round-trip de URL sem navegador.
import { isKnownCommunity } from '../data/communities'
import { categoryKey } from './categories'
import { reelsById } from './reelsIndex'

export const homeState = { screen: 'home', communityId: null, reelId: null }

// Sempre caminho absoluto `/`: navegar da Profile para uma comunidade precisa
// limpar o `/profile` do pathname (ver regra de precedência no design).
export function buildUrl(state) {
  if (state.screen === 'comunidade' && state.communityId !== null) {
    return `/?tela=comunidade&comunidade=${encodeURIComponent(state.communityId)}`
  }

  if (state.screen === 'reels' && state.communityId !== null) {
    const base = `/?tela=reels&comunidade=${encodeURIComponent(state.communityId)}`
    return state.reelId === null ? base : `${base}&reel=${encodeURIComponent(state.reelId)}`
  }

  // Forma legada por categoria: só existe quando a URL de entrada a trouxe.
  if (state.screen === 'reels' && state.communityId === null && state.category) {
    const base = `/?tela=reels&categoria=${encodeURIComponent(state.category)}`

    return state.reelId ? `${base}&reel=${encodeURIComponent(state.reelId)}` : base
  }

  return '/'
}

// `sanitized` indica que a URL recebida continha parâmetros que foram descartados
// e que App.jsx deve substituir a entrada do histórico (Requisito 11.5).
export function parseUrl(search) {
  const params = new URLSearchParams(search)
  const screen = params.get('tela')
  const communityId = params.get('comunidade')

  if (screen !== 'comunidade' && screen !== 'reels') {
    const hadParams = screen !== null || communityId !== null || params.get('reel') !== null
    return { ...homeState, sanitized: hadParams }
  }

  // Forma legada `?tela=reels&categoria={Categoria_Canonica}`: não é produzida
  // por `buildUrl`, mas é o ponto de entrada da Suite_Selenium, que é contrato
  // estável (Requisito 3.7). A Tela_Reels abre filtrada por categoria, sem
  // comunidade, e a chave de categoria só aparece no estado nesse caso.
  if (screen === 'reels' && communityId === null) {
    const category = categoryKey(params.get('categoria'))

    if (category !== null) {
      const rawLegacyReelId = params.get('reel')
      const legacyReelId =
        rawLegacyReelId !== null && reelsById.has(rawLegacyReelId) ? rawLegacyReelId : null

      return {
        screen: 'reels',
        category,
        communityId: null,
        reelId: legacyReelId,
        sanitized: rawLegacyReelId !== null && legacyReelId === null,
      }
    }
  }

  if (communityId === null || !isKnownCommunity(communityId)) {
    return { ...homeState, sanitized: true }
  }

  if (screen === 'comunidade') {
    return { screen: 'comunidade', communityId, reelId: null, sanitized: false }
  }

  // Reel fora do catálogo não invalida a navegação: a comunidade é válida, então
  // a tela abre no primeiro reel da lista filtrada e só o parâmetro `reel` cai.
  const rawReelId = params.get('reel')
  const reelId = rawReelId !== null && reelsById.has(rawReelId) ? rawReelId : null

  return { screen: 'reels', communityId, reelId, sanitized: rawReelId !== null && reelId === null }
}
