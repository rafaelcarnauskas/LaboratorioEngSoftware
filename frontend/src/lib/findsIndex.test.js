//`selectFinds` é a interseção exata dos filtros
// informados, com conjunto de nichos vazio significando "todos".
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { categoryDefinitions, categoryKey } from './categories'
import { selectFinds } from './findsIndex'

const RUNS = 100

const COMMUNITY_IDS = ['poli-usp', 'judo-brasil', 'vida-de-pet', 'clube-do-livro']
const NICHE_IDS = ['basquete', 'atletismo', 'treino', 'festas', 'rotina', 'cuidados']
const CANONICAL_NAMES = categoryDefinitions.map((item) => item.name)

// Gerador inteligente: o catálogo sintético fica dentro do espaço de entrada
// real (ids de comunidade e de nicho de um conjunto pequeno, para que os
// filtros casem com frequência), mas a caixa do nome de categoria varia para
// exercitar a comparação via `categoryKey`.
const rawCategory = fc
  .constantFrom(...CANONICAL_NAMES)
  .chain((name) =>
    fc.constantFrom(name, name.toLowerCase(), name.toUpperCase(), ` ${name} `),
  )

const findArb = fc.record({
  category: rawCategory,
  communityId: fc.constantFrom(...COMMUNITY_IDS),
  nicheId: fc.constantFrom(...NICHE_IDS),
})

// Ids únicos e estáveis permitem comparar listas por identidade de item.
const catalogArb = fc
  .array(findArb, { maxLength: 20 })
  .map((items) => items.map((find, index) => ({ id: `find-${index}`, ...find })))

const filtersArb = fc.record({
  category: fc.option(fc.constantFrom(...CANONICAL_NAMES), { nil: null }),
  communityId: fc.option(fc.constantFrom(...COMMUNITY_IDS), { nil: null }),
  niches: fc.uniqueArray(fc.constantFrom(...NICHE_IDS), { maxLength: 4 }),
})

// Modelo de referência, escrito direto da definição da propriedade.
function expected(catalog, { category, communityId, niches }) {
  const wanted = new Set(niches)

  return catalog.filter((find) => {
    if (communityId !== null && find.communityId !== communityId) return false
    if (category !== null && categoryKey(find.category) !== categoryKey(category)) return false
    if (wanted.size > 0 && !wanted.has(find.nicheId)) return false
    return true
  })
}

describe('Property 2: seleção de finds é a interseção exata dos filtros', () => {
  it('devolve exatamente os finds que satisfazem todos os filtros, na ordem do catálogo', () => {
    fc.assert(
      fc.property(catalogArb, filtersArb, (catalog, filters) => {
        const selected = selectFinds(filters, catalog)

        expect(selected).toEqual(expected(catalog, filters))

        // Ordem do catálogo preservada: a seleção é uma subsequência.
        const positions = selected.map((find) => catalog.indexOf(find))
        expect(positions).toEqual([...positions].sort((a, b) => a - b))
        expect(positions.every((position) => position >= 0)).toBe(true)
      }),
      { numRuns: RUNS },
    )
  })

  it('não exclui nenhum find por nicho quando o conjunto de nichos é vazio', () => {
    fc.assert(
      fc.property(
        catalogArb,
        fc.option(fc.constantFrom(...CANONICAL_NAMES), { nil: null }),
        fc.option(fc.constantFrom(...COMMUNITY_IDS), { nil: null }),
        (catalog, category, communityId) => {
          const withEmpty = selectFinds({ category, communityId, niches: [] }, catalog)
          const withAll = selectFinds({ category, communityId, niches: NICHE_IDS }, catalog)

          expect(withEmpty).toEqual(withAll)

          // Sem nenhum filtro, a seleção é o catálogo inteiro.
          if (category === null && communityId === null) {
            expect(withEmpty).toEqual(catalog)
          }
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('nunca inclui find de outra comunidade quando a comunidade é informada', () => {
    fc.assert(
      fc.property(catalogArb, filtersArb, (catalog, filters) => {
        if (filters.communityId === null) return

        const selected = selectFinds(filters, catalog)
        expect(selected.every((find) => find.communityId === filters.communityId)).toBe(true)
      }),
      { numRuns: RUNS },
    )
  })

  it('a seleção por categoria ignora a caixa e os espaços do nome informado', () => {
    fc.assert(
      fc.property(catalogArb, fc.constantFrom(...CANONICAL_NAMES), (catalog, name) => {
        const base = selectFinds({ category: name }, catalog)

        expect(selectFinds({ category: name.toUpperCase() }, catalog)).toEqual(base)
        expect(selectFinds({ category: ` ${name.toLowerCase()} ` }, catalog)).toEqual(base)
      }),
      { numRuns: RUNS },
    )
  })
})
