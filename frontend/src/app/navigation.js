// Contrato de URL da navegação por comunidade (Requisito 11).
// Estado de navegação da query string:
// { screen: 'home' | 'comunidade' | 'finds', communityId: string | null, findId: string | null }
//
// Módulo puro, sem React: recebe e devolve apenas dados, o que permite testar o
// round-trip de URL sem navegador.
import { isKnownCommunity } from '../2-comunidades/modelo/communities'
import { categoryKey } from '../4-busca-listas/modelo/categories'
import { findsById } from '../3-videos/modelo/findsIndex'

export const homeState = { screen: 'home', communityId: null, findId: null }

// Sempre caminho absoluto `/`: navegar da Profile para uma comunidade precisa
// limpar o `/profile` do pathname (ver regra de precedência no design).
export function buildUrl(state) {
  if (state.screen === 'comunidade' && state.communityId !== null) {
    return `/?tela=comunidade&comunidade=${encodeURIComponent(state.communityId)}`
  }

  if (state.screen === 'finds' && state.communityId !== null) {
    const base = `/?tela=finds&comunidade=${encodeURIComponent(state.communityId)}`
    return state.findId === null ? base : `${base}&find=${encodeURIComponent(state.findId)}`
  }

  // Forma legada por categoria: só existe quando a URL de entrada a trouxe.
  if (state.screen === 'finds' && state.communityId === null && state.category) {
    const base = `/?tela=finds&categoria=${encodeURIComponent(state.category)}`

    return state.findId ? `${base}&find=${encodeURIComponent(state.findId)}` : base
  }

  return '/'
}

// `sanitized` indica que a URL recebida continha parâmetros que foram descartados
// e que App.jsx deve substituir a entrada do histórico (Requisito 11.5).
export function parseUrl(search) {
  const params = new URLSearchParams(search)
  const screen = params.get('tela')
  const communityId = params.get('comunidade')

  if (screen !== 'comunidade' && screen !== 'finds') {
    const hadParams = screen !== null || communityId !== null || params.get('find') !== null
    return { ...homeState, sanitized: hadParams }
  }

  // Forma legada `?tela=finds&categoria={Categoria_Canonica}`: não é produzida
  // por `buildUrl`, mas é o ponto de entrada da Suite_Selenium, que é contrato
  // estável (Requisito 3.7). A Tela_Finds abre filtrada por categoria, sem
  // comunidade, e a chave de categoria só aparece no estado nesse caso.
  if (screen === 'finds' && communityId === null) {
    const category = categoryKey(params.get('categoria'))

    if (category !== null) {
      const rawLegacyFindId = params.get('find')
      const legacyFindId =
        rawLegacyFindId !== null && findsById.has(rawLegacyFindId) ? rawLegacyFindId : null

      return {
        screen: 'finds',
        category,
        communityId: null,
        findId: legacyFindId,
        sanitized: rawLegacyFindId !== null && legacyFindId === null,
      }
    }
  }

  if (communityId === null || !isKnownCommunity(communityId)) {
    return { ...homeState, sanitized: true }
  }

  if (screen === 'comunidade') {
    return { screen: 'comunidade', communityId, findId: null, sanitized: false }
  }

  // Find fora do catálogo não invalida a navegação: a comunidade é válida, então
  // a tela abre no primeiro find da lista filtrada e só o parâmetro `find` cai.
  const rawFindId = params.get('find')
  const findId = rawFindId !== null && findsById.has(rawFindId) ? rawFindId : null

  return { screen: 'finds', communityId, findId, sanitized: rawFindId !== null && findId === null }
}
