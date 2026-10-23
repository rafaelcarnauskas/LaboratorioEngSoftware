import { useEffect, useState } from 'react'
import { apiAtiva, buscarVideos } from '../servico'
import { presentVideo, videoCatalog } from './videoCatalog'

// Catálogo usado por Busca e Listas: começa com a cópia local e é trocado pelo
// do Serviço de Busca assim que o back responde.
export default function useVideoCatalog() {
  const [videos, setVideos] = useState(videoCatalog)
  const [fromApi, setFromApi] = useState(false)

  useEffect(() => {
    if (!apiAtiva) return
    let ativo = true
    buscarVideos()
      .then((resultado) => {
        if (!ativo) return
        setVideos(resultado.map(presentVideo))
        setFromApi(true)
      })
      .catch(() => { /* sem back: segue com a cópia local */ })
    return () => { ativo = false }
  }, [])

  return { videos, fromApi }
}
