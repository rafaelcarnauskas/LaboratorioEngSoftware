// Carrega o catálogo de vídeos e de comunidades da API depois do login.
//
// As telas leem `finds` e `communities` de forma síncrona; aqui as duas listas
// são trocadas pelo conteúdo do banco. Se o backend não responder, cada lista
// fica com os dados de exemplo do próprio front.
import { buscarComunidades, paraComunidade } from '../2-comunidades/servico'
import { communities, substituirComunidades } from '../2-comunidades/modelo/communities'
import { buscarVideos, paraFind } from '../3-videos/servico'
import { finds } from '../3-videos/modelo/finds'
import { substituirFinds } from '../3-videos/modelo/findsIndex'

// Cópias dos dados de exemplo, antes de qualquer troca.
const findsLocais = new Map(finds.map((find) => [find.id, find]))
const comunidadesLocais = new Map(communities.map((community) => [community.id, community]))

// Categoria mais comum entre os vídeos de cada comunidade (para a Home).
function categoriasPorComunidade(lista) {
  const contagem = new Map()
  for (const find of lista) {
    const porCategoria = contagem.get(find.communityId) ?? new Map()
    porCategoria.set(find.category, (porCategoria.get(find.category) ?? 0) + 1)
    contagem.set(find.communityId, porCategoria)
  }
  return new Map(
    [...contagem].map(([id, porCategoria]) => [id, [...porCategoria].sort((a, b) => b[1] - a[1])[0][0]]),
  )
}

export async function carregarCatalogo() {
  const [videos, comunidades] = await Promise.allSettled([buscarVideos(), buscarComunidades()])
  const resultado = { videos: videos.status === 'fulfilled', comunidades: comunidades.status === 'fulfilled' }

  if (resultado.videos) {
    substituirFinds(videos.value.map((video) => paraFind(video, findsLocais.get(video.id))))
  } else {
    console.warn('Catálogo de vídeos da API indisponível; usando os dados de exemplo.', videos.reason)
  }

  if (resultado.comunidades) {
    const categorias = categoriasPorComunidade(finds)
    substituirComunidades(
      comunidades.value.map((comunidade) =>
        paraComunidade(comunidade, comunidadesLocais.get(comunidade.id), {
          category: categorias.get(comunidade.id) ?? null,
        }),
      ),
    )
  } else {
    console.warn('Catálogo de comunidades da API indisponível; usando os dados de exemplo.', comunidades.reason)
  }

  return resultado
}
