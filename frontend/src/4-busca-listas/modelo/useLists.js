import { useEffect, useRef, useState } from 'react'
import { apiAtiva, carregarListas, enviarOperacoes, erroApi } from '../servico'
import { diffLists } from './listsSync'
import { legacyVideoIds } from './videoCatalog'

const storageKey = 'choosen.lists.v1'
const tones = ['gold', 'blue', 'green', 'purple']

function createInitialLists() {
  return [
    { id: 'watch-later', name: 'Assistir depois', description: 'Boas descobertas, guardadas para o momento certo.', tone: 'gold', videoIds: ['curiosities-1', 'curiosities-2'], updatedAt: 3 },
    { id: 'learn-something-new', name: 'Aprender algo novo', description: 'Pequenas descobertas. Um pouco mais de conhecimento cada dia.', tone: 'blue', videoIds: ['tips-1', 'tips-2'], updatedAt: 2 },
    { id: 'everyday-inspiration', name: 'Inspiração do dia a dia', description: 'Ideias novas para um dia mais equilibrado.', tone: 'green', videoIds: ['tips-2', 'sports-4'], updatedAt: 1 },
  ]
}

// Listas salvas antes de o catálogo vir do back guardavam ids numéricos (1 a 9).
const migrateVideoId = (id) => (Number.isInteger(id) ? legacyVideoIds[id] ?? id : id)

function isValidList(list) {
  return (
    list && typeof list.id === 'string' && list.id.length > 0 &&
    typeof list.name === 'string' && list.name.trim().length > 0 && list.name.length <= 60 &&
    typeof list.description === 'string' && list.description.length <= 180 &&
    tones.includes(list.tone) && Number.isFinite(list.updatedAt) &&
    Array.isArray(list.videoIds) &&
    list.videoIds.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(list.videoIds).size === list.videoIds.length
  )
}

function loadLists() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { lists: createInitialLists(), storageError: '' }

    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) throw new Error('Invalid saved lists')
    const lists = parsed.map((list) =>
      list && Array.isArray(list.videoIds) ? { ...list, videoIds: list.videoIds.map(migrateVideoId) } : list,
    )
    if (!lists.every(isValidList) || new Set(lists.map((list) => list.id)).size !== lists.length) {
      throw new Error('Invalid saved lists')
    }

    return { lists, storageError: '' }
  } catch {
    return {
      lists: createInitialLists(),
      storageError: 'Não foi possível carregar suas listas salvas. Suas alterações continuarão disponíveis nesta sessão.',
    }
  }
}

function saveCopy(lists) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(lists))
    return ''
  } catch {
    return 'Seu navegador não conseguiu salvar estas alterações. Elas continuarão disponíveis nesta sessão.'
  }
}

// Com `usuario` e a API no ar, o Serviço de Listas é a fonte; o localStorage vira cópia local.
// As telas continuam entregando o array inteiro; o hook envia ao back só o que mudou.
export default function useLists(usuario) {
  const [state, setState] = useState(loadLists)
  const listsRef = useRef(state.lists)
  const queue = useRef(Promise.resolve())
  const usarApi = apiAtiva && Boolean(usuario)

  // Envia em ordem: cada sincronização espera a anterior terminar.
  function sync(operations) {
    if (!usarApi || operations.length === 0) return
    queue.current = queue.current
      .then(() => enviarOperacoes(usuario, operations))
      .catch(() => setState((current) => ({ ...current, storageError: erroApi })))
  }

  useEffect(() => {
    if (!usarApi) return
    let ativo = true
    carregarListas(usuario)
      .then((serverLists) => {
        if (!ativo) return
        // Primeiro acesso deste usuário no back: leva as listas do navegador para lá.
        if (serverLists.length === 0 && listsRef.current.length > 0) {
          queue.current = queue.current
            .then(() => enviarOperacoes(usuario, diffLists([], listsRef.current)))
            .catch(() => setState((current) => ({ ...current, storageError: erroApi })))
          return
        }
        listsRef.current = serverLists
        setState({ lists: serverLists, storageError: saveCopy(serverLists) })
      })
      .catch(() => { if (ativo) setState((current) => ({ ...current, storageError: erroApi })) })
    return () => { ativo = false }
  }, [usarApi, usuario])

  function updateLists(lists) {
    const operations = diffLists(listsRef.current, lists)
    listsRef.current = lists
    setState({ lists, storageError: saveCopy(lists) })
    sync(operations)
  }

  return { ...state, updateLists }
}
