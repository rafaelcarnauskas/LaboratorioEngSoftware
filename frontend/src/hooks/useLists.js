import { useState } from 'react'

const storageKey = 'choosen.lists.v1'
const tones = ['gold', 'blue', 'green', 'purple']

function createInitialLists() {
  return [
    { id: 'watch-later', name: 'Watch later', description: 'Good finds, saved for the right moment.', tone: 'gold', videoIds: [1, 4], updatedAt: 3 },
    { id: 'learn-something-new', name: 'Learn something new', description: 'Small discoveries. A little more knowledge every day.', tone: 'blue', videoIds: [2, 3], updatedAt: 2 },
    { id: 'everyday-inspiration', name: 'Everyday inspiration', description: 'Fresh ideas for a more balanced day.', tone: 'green', videoIds: [3, 5], updatedAt: 1 },
  ]
}

function loadLists() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { lists: createInitialLists(), storageError: '' }

    const lists = JSON.parse(saved)
    if (!Array.isArray(lists) || !lists.every((list) =>
      list && typeof list.id === 'string' && list.id.length > 0 &&
      typeof list.name === 'string' && list.name.trim().length > 0 && list.name.length <= 60 &&
      typeof list.description === 'string' && list.description.length <= 180 &&
      tones.includes(list.tone) && Number.isFinite(list.updatedAt) &&
      Array.isArray(list.videoIds) && list.videoIds.every(Number.isInteger) &&
      new Set(list.videoIds).size === list.videoIds.length,
    ) || new Set(lists.map((list) => list.id)).size !== lists.length) {
      throw new Error('Invalid saved lists')
    }

    return { lists, storageError: '' }
  } catch {
    return {
      lists: createInitialLists(),
      storageError: 'Saved lists could not be loaded. Your changes will stay available during this session.',
    }
  }
}

export default function useLists() {
  const [state, setState] = useState(loadLists)

  function updateLists(lists) {
    let storageError = ''
    try {
      localStorage.setItem(storageKey, JSON.stringify(lists))
    } catch {
      storageError = 'Your browser could not save these changes. They will stay available during this session.'
    }
    setState({ lists, storageError })
  }

  return { ...state, updateLists }
}
