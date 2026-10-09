// Properties 33 e 34 do design: o Filtro_Nicho (Servico_Nichos).
//
// A Property 33 roda contra o hook porque "sem chave = sem filtro" é decisão
// do hook, não de uma função pura isolada. A Property 34 roda contra
// `sanitizeNicheMap`, que aceita o catálogo por parâmetro.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import fc from 'fast-check'
import useCommunityNiches, { sanitizeNicheMap } from './useCommunityNiches'
import { communities, findCommunity } from '../data/communities'
import { installLocalStorageStub } from '../tests/helpers/localStorageStub'

const RUNS = 100
const storageKey = 'choosen.communityNiches.v1'

let stub = null
let restoreStorage = null

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
})

afterEach(() => {
  restoreStorage?.()
  stub = null
  restoreStorage = null
})

// --- Property 33 ---------------------------------------------------------

// O hook valida o nicho contra o catálogo real, então a sequência de
// acionamentos usa comunidade e nichos de verdade.
const toggleScenario = fc.constantFrom(...communities).chain((community) => {
  const nicheIds = community.niches.map((niche) => niche.id)

  return fc.record({
    communityId: fc.constant(community.id),
    nicheIds: fc.constant(nicheIds),
    sequence: fc.array(fc.constantFrom(...nicheIds), { maxLength: 12 }),
    repeated: fc.constantFrom(...nicheIds),
  })
})

function oddlyToggled(sequence) {
  const counts = new Map()
  for (const nicheId of sequence) {
    counts.set(nicheId, (counts.get(nicheId) ?? 0) + 1)
  }
  return new Set([...counts.entries()].filter(([, count]) => count % 2 === 1).map(([id]) => id))
}

describe('useCommunityNiches', () => {
  // **Property 33: Filtro_Nicho é um conjunto com toggle involutivo e limpeza
  // idempotente**
  //
  // **Validates: Requirements 10.5, 10.6, 10.8**
  it('mantém um conjunto dos nichos acionados em paridade ímpar, com toggle involutivo e limpeza idempotente', () => {
    fc.assert(
      fc.property(toggleScenario, ({ communityId, sequence, repeated }) => {
        stub.reset()

        const { result, unmount } = renderHook(() => useCommunityNiches())

        for (const nicheId of sequence) {
          act(() => result.current.toggleNiche(communityId, nicheId))
        }

        const selected = result.current.nichesFor(communityId)

        // Conjunto: sem duplicatas e exatamente os nichos de paridade ímpar.
        expect(new Set(selected).size).toBe(selected.length)
        expect(new Set(selected)).toEqual(oddlyToggled(sequence))
        expect(result.current.storageError).toBe('')

        // Involução: acionar o mesmo nicho duas vezes devolve o estado anterior.
        const before = [...selected]
        act(() => result.current.toggleNiche(communityId, repeated))
        act(() => result.current.toggleNiche(communityId, repeated))
        expect([...result.current.nichesFor(communityId)].sort()).toEqual([...before].sort())

        // Limpeza: filtro vazio, e qualquer limpeza seguinte dá o mesmo.
        act(() => result.current.clearNiches(communityId))
        const cleared = result.current.nichesFor(communityId)
        const clearedSnapshot = stub.raw(storageKey)
        expect(cleared).toEqual([])

        act(() => result.current.clearNiches(communityId))
        expect(result.current.nichesFor(communityId)).toEqual([])
        expect(stub.raw(storageKey)).toBe(clearedSnapshot)

        // "Sem filtro" é ausência da chave, não lista vazia.
        expect(Object.keys(result.current.nichesByCommunity)).not.toContain(communityId)

        unmount()
      }),
      { numRuns: RUNS },
    )
  })

  // Parte do enunciado da Property 34: dado obsoleto não vira Erro_Armazenamento.
  //
  // **Validates: Requirements 10.13, 10.14**
  it('carrega filtro com dado obsoleto sem reportar erro de armazenamento', () => {
    fc.assert(
      fc.property(nicheMapArbitrary(communities), (raw) => {
        stub.reset()
        stub.seed({ [storageKey]: JSON.stringify(raw) })

        const { result, unmount } = renderHook(() => useCommunityNiches())

        expect(result.current.storageError).toBe('')
        expect(result.current.nichesByCommunity).toEqual(sanitizeNicheMap(raw, communities))

        unmount()
      }),
      { numRuns: RUNS },
    )
  })
})

// --- Property 34 ---------------------------------------------------------

// Catálogo sintético: exercita o parâmetro `catalog` e inclui uma comunidade
// sem nicho declarado, que deve ser descartada por inteiro.
const syntheticCatalog = [
  { id: 'alpha', niches: [{ id: 'n1', label: 'N1' }, { id: 'n2', label: 'N2' }] },
  { id: 'beta', niches: [{ id: 'n2', label: 'N2' }, { id: 'n3', label: 'N3' }] },
  { id: 'gamma', niches: [] },
]

// Mapa de forma válida, misturando identificadores do catálogo com obsoletos.
function nicheMapArbitrary(catalog) {
  const knownCommunities = catalog.map((community) => community.id)
  const declared = [...new Set(catalog.flatMap((community) => community.niches.map((n) => n.id)))]

  const communityId = fc.oneof(
    fc.constantFrom(...knownCommunities),
    fc.constantFrom('comunidade-extinta', 'clube-antigo'),
  )
  const nicheId = fc.oneof(
    fc.constantFrom(...declared),
    fc.constantFrom('nicho-removido', 'xadrez'),
  )

  return fc.dictionary(communityId, fc.array(nicheId, { maxLength: 6 }), { maxKeys: 5 })
}

function assertSanitized(raw, catalog) {
  const byId = new Map(catalog.map((community) => [community.id, community]))
  const sane = sanitizeNicheMap(raw, catalog)

  // Só sobra o que o catálogo reconhece, sem duplicata e sem lista vazia.
  for (const [communityId, niches] of Object.entries(sane)) {
    const community = byId.get(communityId)
    expect(community).toBeDefined()
    expect(niches.length).toBeGreaterThan(0)
    expect(new Set(niches).size).toBe(niches.length)
    for (const nicheId of niches) {
      expect(community.niches.some((niche) => niche.id === nicheId)).toBe(true)
    }
  }

  // Nada válido foi perdido no caminho.
  for (const [communityId, niches] of Object.entries(raw)) {
    const community = byId.get(communityId)
    if (community === undefined) continue
    for (const nicheId of niches) {
      if (!community.niches.some((niche) => niche.id === nicheId)) continue
      expect(sane[communityId]).toContain(nicheId)
    }
  }
}

describe('sanitizeNicheMap', () => {
  // **Property 34: Saneamento do Filtro_Nicho descarta dado obsoleto em silêncio**
  //
  // **Validates: Requirements 10.13, 10.14**
  it('descarta comunidade fora do catálogo e nicho não declarado, preservando os pares válidos', () => {
    fc.assert(
      fc.property(nicheMapArbitrary(communities), (raw) => {
        assertSanitized(raw, communities)

        // Coerência com o catálogo real, via a API pública de consulta.
        for (const communityId of Object.keys(sanitizeNicheMap(raw, communities))) {
          expect(findCommunity(communityId)).not.toBeNull()
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('aplica o mesmo saneamento contra um catálogo passado por parâmetro', () => {
    fc.assert(
      fc.property(nicheMapArbitrary(syntheticCatalog), (raw) => {
        assertSanitized(raw, syntheticCatalog)
        expect(Object.keys(sanitizeNicheMap(raw, syntheticCatalog))).not.toContain('gamma')
      }),
      { numRuns: RUNS },
    )
  })
})
