// Comunicação com o Serviço de Busca e o Serviço de Listas (backend/app/busca_listas).
import { getToken } from '../1-autenticacao/modelo/session.js'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Nos testes as telas ficam só no localStorage.
export const apiAtiva = import.meta.env.MODE !== 'test'

export const erroApi = 'Não foi possível falar com o servidor. Suas listas ficam salvas só neste navegador.'

async function chamar(usuario, caminho, opcoes = {}) {
  const token = usuario ? getToken() : null
  const response = await fetch(`${API_URL}/api/v1${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opcoes.headers,
    },
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

// `id` é opcional: o front gera o id da lista (crypto.randomUUID) e o back o mantém.
export const criarLista = (usuario, { id, name, description = '', tone = 'gold' }) =>
  chamar(usuario, '/listas', { method: 'POST', body: JSON.stringify({ ...(id ? { id } : {}), name, description, tone }) })

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

// Executa, em ordem, as operações calculadas por modelo/listsSync.js.
// 409 (já existe) e 404 (já não existe) indicam que o back já está no estado
// desejado, então não são erro de sincronização.
export async function enviarOperacoes(usuario, operacoes) {
  for (const op of operacoes) {
    try {
      if (op.type === 'create') await criarLista(usuario, { id: op.listId, ...op.fields })
      else if (op.type === 'edit') await editarLista(usuario, op.listId, op.fields)
      else if (op.type === 'delete') await apagarLista(usuario, op.listId)
      else if (op.type === 'add') await salvarNaLista(usuario, op.listId, op.videoId)
      else if (op.type === 'remove') await removerDaLista(usuario, op.listId, op.videoId)
    } catch (erro) {
      if (erro.status !== 409 && erro.status !== 404) throw erro
    }
  }
}
