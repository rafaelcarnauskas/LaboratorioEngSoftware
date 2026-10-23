// Comunicação com o Serviço de Busca e o Serviço de Listas (backend/app/busca_listas).
// Ainda não está ligado às telas: Busca e Listas usam o catálogo local
// (modelo/videoCatalog.js, ids numéricos) e o backend usa o catálogo da parte 3
// (ids texto, ex.: 'sports-1'). Ligar depois que o grupo unificar o catálogo.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Nos testes as telas ficam só no localStorage.
export const apiAtiva = import.meta.env.MODE !== 'test'

export const erroApi = 'Não foi possível falar com o servidor. Suas listas ficam salvas só neste navegador.'

// X-Usuario é provisório até a parte 1 (autenticação) existir no back.
async function chamar(usuario, caminho, opcoes = {}) {
  const response = await fetch(`${API_URL}/api/v1${caminho}`, {
    ...opcoes,
    headers: { 'Content-Type': 'application/json', ...(usuario ? { 'X-Usuario': usuario } : {}) },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const erro = new Error(typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`)
    erro.status = response.status // 409 = vídeo já está na lista
    throw erro
  }
  return response.status === 204 ? null : response.json()
}

// duracao: 'any' | 'short' | 'long'; ordem: 'featured' | 'title' | 'shortest'
export function buscarVideos({ termo = '', categoria, duracao = 'any', ordem = 'featured' } = {}) {
  const params = new URLSearchParams({ termo, duracao, ordem })
  if (categoria && categoria !== 'All') params.set('categoria', categoria)
  return chamar(null, `/busca?${params}`)
}

export const carregarListas = (usuario) => chamar(usuario, '/listas')

export const criarLista = (usuario, { name, description = '', tone = 'gold' }) =>
  chamar(usuario, '/listas', { method: 'POST', body: JSON.stringify({ name, description, tone }) })

export const editarLista = (usuario, listaId, campos) =>
  chamar(usuario, `/listas/${encodeURIComponent(listaId)}`, { method: 'PATCH', body: JSON.stringify(campos) })

export const apagarLista = (usuario, listaId) =>
  chamar(usuario, `/listas/${encodeURIComponent(listaId)}`, { method: 'DELETE' })

export const salvarNaLista = (usuario, listaId, videoId) =>
  chamar(usuario, `/listas/${encodeURIComponent(listaId)}/itens`, { method: 'POST', body: JSON.stringify({ videoId }) })

export const removerDaLista = (usuario, listaId, videoId) =>
  chamar(usuario, `/listas/${encodeURIComponent(listaId)}/itens/${encodeURIComponent(videoId)}`, { method: 'DELETE' })

// Modal "Salvar em uma lista": o vídeo fica exatamente nas listas marcadas.
export const definirListasDoVideo = (usuario, videoId, listIds) =>
  chamar(usuario, `/videos/${encodeURIComponent(videoId)}/listas`, { method: 'PUT', body: JSON.stringify({ listIds }) })
