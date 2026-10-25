// Comunicação com o Serviço de Histórico e o Serviço de Tempo de Uso (backend/app/historico).
import { getToken } from '../1-autenticacao/modelo/session.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Nos testes os hooks ficam só no localStorage.
export const apiAtiva = import.meta.env.MODE !== 'test'

export const erroApi = 'Não foi possível falar com o servidor. Sua atividade fica salva só neste navegador.'

async function chamar(usuario, caminho, opcoes = {}) {
  const token = getToken()
  const response = await fetch(`${API_URL}/api/v1${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcoes.headers,
    },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.status === 204 ? null : response.json()
}

export const carregarHistorico = (usuario) => chamar(usuario, '/historico/recentes?limite=100')

export const registrarVisualizacao = (usuario, { findId, seconds, watchedAt }) =>
  chamar(usuario, '/historico/visualizacoes', { method: 'POST', body: JSON.stringify({ findId, seconds, watchedAt }) })

export const limparHistorico = (usuario) => chamar(usuario, '/historico', { method: 'DELETE' })

export const carregarPreferencias = (usuario) => chamar(usuario, '/tempo/preferencias')

export const salvarPreferencias = (usuario, settings) =>
  chamar(usuario, '/tempo/preferencias', { method: 'PUT', body: JSON.stringify(settings) })
