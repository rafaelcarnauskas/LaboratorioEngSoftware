//O filtro de Tela_Search é a conjunção dos três
// predicados (termo, Categoria_Canonica e faixa de duração) e a ordenação é
// uma permutação monotônica do conjunto filtrado.
//
// A lógica de filtro e de ordenação vive dentro de `SearchView`, então as duas
// propriedades rodam contra a tela renderizada: os filtros são aplicados pelos
// próprios controles e o resultado lido do DOM é comparado com um modelo de
// referência escrito direto da definição da propriedade.
import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import fc from 'fast-check'
import SearchView from './SearchView'
import { categoryDefinitions, categoryKey } from '../modelo/categories'

const RUNS = 100

const CANONICAL_NAMES = categoryDefinitions.map((item) => item.name)
// 'Ideas' e 'Wellness' saíram do catálogo real na tarefa 1.3; aqui elas voltam
// como categoria órfã, para exercitar o caso `categoryKey === null`.
const ORPHAN_NAMES = ['Ideas', 'Wellness']
const CHIP_LABELS = ['All', ...CANONICAL_NAMES]

// Palavras com e sem acento: o predicado de termo normaliza caixa e acentuação,
// então 'café' e 'cafe' precisam casar entre si.
const WORDS = ['pasta', 'Pizza', 'Café', 'cafe', 'Horta', 'ROTINA', 'treino', 'Sports']
const CREATORS = ['Ana Lima', 'BRUNO Sá', 'chef zé']

const categoryArb = fc
  .constantFrom(...CANONICAL_NAMES, ...ORPHAN_NAMES)
  .chain((name) => fc.constantFrom(name, name.toLowerCase(), name.toUpperCase()))

// Durações no formato 'M:SS' do Catalogo_Videos, cobrindo os dois lados da
// fronteira de 60 segundos que separa 'short' de 'long'.
const durationArb = fc
  .tuple(fc.nat({ max: 3 }), fc.nat({ max: 59 }))
  .map(([minutes, secs]) => `${minutes}:${String(secs).padStart(2, '0')}`)

const videoArb = fc.record({
  word: fc.constantFrom(...WORDS),
  creator: fc.constantFrom(...CREATORS),
  category: categoryArb,
  duration: durationArb,
})

// Título único por vídeo: é por ele que o teste identifica o card renderizado.
const catalogArb = fc.array(videoArb, { maxLength: 12 }).map((items) =>
  items.map((item, index) => ({
    id: `v-${index}`,
    title: `${item.word} ${index}`,
    creator: item.creator,
    category: item.category,
    duration: item.duration,
    color: '#ff5f6d',
    artwork: 'search',
  })),
)

const queryArb = fc
  .array(
    fc.oneof(
      fc.constantFrom(...WORDS),
      fc.string({ minLength: 1, maxLength: 3, unit: fc.constantFrom('a', 'e', 'i', 'o', 'z', 'ç', ' ') }),
    ),
    { maxLength: 2 },
  )
  .map((parts) => parts.join(' '))

const chipArb = fc.constantFrom(...CHIP_LABELS)
const durationFilterArb = fc.constantFrom('any', 'short', 'long')
const sortArb = fc.constantFrom('featured', 'shortest', 'title')

// --- Modelo de referência -----------------------------------------------

const refSeconds = (duration) =>
  duration.split(':').reduce((total, part) => total * 60 + Number(part), 0)

const refNormalize = (value) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function expectedResults(videos, { query, category, duration }) {
  const terms = refNormalize(query).split(/\s+/).filter(Boolean)

  return videos.filter((video) => {
    const text = refNormalize(`${video.title} ${video.creator} ${video.category}`)
    const matchesTerms = terms.every((term) => text.includes(term))
    const matchesCategory =
      category === 'All' || categoryKey(video.category) === categoryKey(category)
    const matchesDuration =
      duration === 'any' ||
      (duration === 'short' ? refSeconds(video.duration) <= 60 : refSeconds(video.duration) > 60)

    return matchesTerms && matchesCategory && matchesDuration
  })
}

// --- Harness de renderização ---------------------------------------------

function renderSearch(videos) {
  const view = render(
    createElement(SearchView, { videos, lists: [], onListsChange: () => {}, storageError: '' }),
  )

  function applyFilters({ query, category, duration, sort }) {
    const input = view.container.querySelector('#discover-videos')
    fireEvent.change(input, { target: { value: query } })

    const chips = [...view.container.querySelectorAll('.search-category-chip')]
    fireEvent.click(chips[CHIP_LABELS.indexOf(category)])

    const selects = [...view.container.querySelectorAll('.search-selects select')]
    fireEvent.change(selects[0], { target: { value: duration } })
    if (sort !== undefined) fireEvent.change(selects[1], { target: { value: sort } })
  }

  function renderedTitles() {
    return [...view.container.querySelectorAll('.search-video-card h3')].map(
      (heading) => heading.textContent,
    )
  }

  return { ...view, applyFilters, renderedTitles }
}

afterEach(cleanup)

describe('Property 8: filtro de busca é a conjunção dos três predicados', () => {
  it('exibe exatamente os vídeos que satisfazem termo, categoria e duração ao mesmo tempo', () => {
    fc.assert(
      fc.property(catalogArb, queryArb, chipArb, durationFilterArb, (videos, query, category, duration) => {
        const search = renderSearch(videos)
        search.applyFilters({ query, category, duration, sort: 'featured' })

        const expected = expectedResults(videos, { query, category, duration })
        // Sem ordenação explícita a lista segue a ordem do catálogo, então a
        // comparação é por sequência, não por conjunto.
        expect(search.renderedTitles()).toEqual(expected.map((video) => video.title))

        search.unmount()
      }),
      { numRuns: RUNS },
    )
  })

  it('cada predicado isolado é mais permissivo que a conjunção dos três', () => {
    fc.assert(
      fc.property(catalogArb, queryArb, chipArb, durationFilterArb, (videos, query, category, duration) => {
        const all = expectedResults(videos, { query: '', category: 'All', duration: 'any' })
        const byTerm = expectedResults(videos, { query, category: 'All', duration: 'any' })
        const byCategory = expectedResults(videos, { query: '', category, duration: 'any' })
        const byDuration = expectedResults(videos, { query: '', category: 'All', duration })

        const search = renderSearch(videos)
        search.applyFilters({ query, category, duration, sort: 'featured' })
        const shown = new Set(search.renderedTitles())

        expect(all).toEqual(videos)
        for (const subset of [byTerm, byCategory, byDuration]) {
          const titles = new Set(subset.map((video) => video.title))
          expect([...shown].every((title) => titles.has(title))).toBe(true)
        }

        search.unmount()
      }),
      { numRuns: RUNS },
    )
  })
})

describe('Property 9: ordenação é uma permutação ordenada do conjunto filtrado', () => {
  it('mantém o mesmo conjunto filtrado e o deixa monotônico segundo o critério', () => {
    fc.assert(
      fc.property(
        catalogArb,
        queryArb,
        chipArb,
        durationFilterArb,
        sortArb,
        (videos, query, category, duration, sort) => {
          const search = renderSearch(videos)
          search.applyFilters({ query, category, duration, sort })

          const filtered = expectedResults(videos, { query, category, duration })
          const shown = search.renderedTitles()

          // Permutação: mesmo multiconjunto de títulos, em qualquer ordem.
          expect([...shown].sort()).toEqual(filtered.map((video) => video.title).sort())

          const byTitle = new Map(videos.map((video) => [video.title, video]))
          const shownVideos = shown.map((title) => byTitle.get(title))

          for (let index = 1; index < shownVideos.length; index += 1) {
            const previous = shownVideos[index - 1]
            const current = shownVideos[index]

            if (sort === 'title') {
              expect(previous.title.localeCompare(current.title)).toBeLessThanOrEqual(0)
            } else if (sort === 'shortest') {
              expect(refSeconds(previous.duration)).toBeLessThanOrEqual(refSeconds(current.duration))
            }
          }

          // 'featured' preserva a ordem do catálogo.
          if (sort === 'featured') {
            expect(shown).toEqual(filtered.map((video) => video.title))
          }

          search.unmount()
        },
      ),
      { numRuns: RUNS },
    )
  })
})
