// Orquestrador de Busca e Listas: liga as telas Buscar e Listas aos Serviços de
// Busca e de Listas do back (servico.js), com o Model local como reserva.
import { categoryDefinitions, categoryKey, resolveCategory } from './modelo/categories'
import { presentVideo, videoCatalog } from './modelo/videoCatalog'
import { searchVideos } from './modelo/search'
import useLists from './modelo/useLists'
import useVideoCatalog from './modelo/useVideoCatalog'
import { apiAtiva, buscarVideos } from './servico'

// buscar(termo, categoria, duração) do diagrama de sequência. Devolve null quando
// não há back, e a tela fica com o resultado local.
export async function searchOnServer({ query, category, duration, sort }) {
  if (!apiAtiva) return null
  try {
    const resultado = await buscarVideos({ termo: query, categoria: category, duracao: duration, ordem: sort })
    return resultado.map(presentVideo)
  } catch {
    return null
  }
}

export {
  categoryDefinitions, categoryKey, resolveCategory, searchVideos, useLists, useVideoCatalog, videoCatalog,
}
