// Diferença entre duas versões das listas, em operações do Serviço de Listas.
// As telas continuam trocando o array inteiro (updateLists); daqui sai o que
// precisa ser enviado ao back, na ordem certa para cada lista.
const sameFields = (a, b) => a.name === b.name && a.description === b.description && a.tone === b.tone

export function diffLists(before, after) {
  const operations = []
  const oldById = new Map(before.map((list) => [list.id, list]))
  const newIds = new Set(after.map((list) => list.id))

  for (const list of before) {
    if (!newIds.has(list.id)) operations.push({ type: 'delete', listId: list.id })
  }

  for (const list of after) {
    const old = oldById.get(list.id)
    if (!old) {
      operations.push({ type: 'create', listId: list.id, fields: { name: list.name, description: list.description, tone: list.tone } })
      for (const videoId of list.videoIds) operations.push({ type: 'add', listId: list.id, videoId })
      continue
    }
    if (!sameFields(old, list)) {
      operations.push({ type: 'edit', listId: list.id, fields: { name: list.name, description: list.description, tone: list.tone } })
    }
    const oldVideos = new Set(old.videoIds)
    const newVideos = new Set(list.videoIds)
    for (const videoId of old.videoIds) {
      if (!newVideos.has(videoId)) operations.push({ type: 'remove', listId: list.id, videoId })
    }
    for (const videoId of list.videoIds) {
      if (!oldVideos.has(videoId)) operations.push({ type: 'add', listId: list.id, videoId })
    }
  }
  return operations
}
