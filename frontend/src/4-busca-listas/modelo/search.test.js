import { describe, expect, it } from 'vitest'
import { searchVideos } from './search'
import { formatDuration, presentVideo, videoCatalog } from './videoCatalog'
import { diffLists } from './listsSync'

const ids = (videos) => videos.map((video) => video.id)

describe('searchVideos (mesmas regras do Serviço de Busca do back)', () => {
  it('sem filtros devolve o catálogo na ordem', () => {
    expect(ids(searchVideos(videoCatalog))).toEqual(ids(videoCatalog))
  })

  it('ignora acentos e maiúsculas e exige todos os termos', () => {
    expect(ids(searchVideos(videoCatalog, { query: 'CIENCIA espresso' }))).toEqual(['curiosities-2'])
    expect(ids(searchVideos(videoCatalog, { query: 'espresso gatos' }))).toEqual([])
  })

  it('filtra por categoria e duração', () => {
    expect(ids(searchVideos(videoCatalog, { category: 'Sports' }))).toEqual(['sports-4', 'sports-5'])
    expect(ids(searchVideos(videoCatalog, { duration: 'long' }))).toEqual(['tips-2', 'technology-1'])
  })

  it('ordena por mais curtos', () => {
    const seconds = searchVideos(videoCatalog, { sort: 'shortest' }).map((video) => video.duration)
    expect(seconds[0]).toBe('0:28')
    expect(seconds.at(-1)).toBe('1:24')
  })
})

describe('presentVideo', () => {
  it('usa a apresentação local quando o id existe no catálogo', () => {
    const video = presentVideo({ id: 'tips-2', title: 'Cozinha', creator: 'smallspaces', category: 'tips', durationSeconds: 72 })
    expect(video).toMatchObject({ creator: '@smallspaces', category: 'Tips', duration: '1:12', artwork: 'home' })
  })

  it('usa a apresentação da categoria para vídeos só do back (Finds)', () => {
    const video = presentVideo({ id: 'sports-1', title: 'Basquete', creator: 'BmPoliUsp', category: 'sports', durationSeconds: 42 })
    expect(video).toMatchObject({ creator: '@BmPoliUsp', category: 'sports', duration: '0:42', artwork: 'activity' })
  })

  it('formata a duração', () => {
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(null)).toBe('--:--')
  })
})

describe('diffLists', () => {
  const base = { name: 'A', description: '', tone: 'gold', updatedAt: 1 }

  it('cria a lista antes de adicionar os vídeos dela', () => {
    expect(diffLists([], [{ ...base, id: 'l1', videoIds: ['tips-1', 'tips-2'] }])).toEqual([
      { type: 'create', listId: 'l1', fields: { name: 'A', description: '', tone: 'gold' } },
      { type: 'add', listId: 'l1', videoId: 'tips-1' },
      { type: 'add', listId: 'l1', videoId: 'tips-2' },
    ])
  })

  it('detecta edição, vídeos adicionados e removidos e listas apagadas', () => {
    const before = [{ ...base, id: 'l1', videoIds: ['tips-1'] }, { ...base, id: 'l2', videoIds: [] }]
    const after = [{ ...base, id: 'l1', name: 'B', videoIds: ['tips-2'] }]
    expect(diffLists(before, after)).toEqual([
      { type: 'delete', listId: 'l2' },
      { type: 'edit', listId: 'l1', fields: { name: 'B', description: '', tone: 'gold' } },
      { type: 'remove', listId: 'l1', videoId: 'tips-1' },
      { type: 'add', listId: 'l1', videoId: 'tips-2' },
    ])
  })

  it('não gera operação quando nada mudou (só updatedAt)', () => {
    const lists = [{ ...base, id: 'l1', videoIds: ['tips-1'] }]
    expect(diffLists(lists, [{ ...lists[0], updatedAt: 99 }])).toEqual([])
  })
})
