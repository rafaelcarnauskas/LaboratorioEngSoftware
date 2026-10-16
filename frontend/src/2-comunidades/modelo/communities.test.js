// Testes de propriedade de partitionCommunities (Property 30).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { partitionCommunities } from './communities'

const RUNS = { numRuns: 100 }

// Catálogo sintético: só `id` importa para a partição, mas os demais campos
// vão junto para garantir que as comunidades devolvidas são as próprias
// entradas do catálogo, não cópias reconstruídas.
const catalogArb = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 8 })
  .map((ids) => ids.map((id, index) => ({ id, name: `Community ${index}`, memberCount: index })))

// Adesões: subconjunto dos identificadores do catálogo, mais identificadores
// desconhecidos, sempre sem repetir (unicidade é garantia do Servico_Adesoes).
const scenarioArb = catalogArb.chain((catalog) =>
  fc.record({
    catalog: fc.constant(catalog),
    memberships: fc
      .uniqueArray(
        fc.record({
          id: fc.oneof(
            fc.constantFrom(...catalog.map((community) => community.id)),
            fc.string({ minLength: 1, maxLength: 8 }),
          ),
          joinedAt: fc.integer({ min: 0, max: 10_000 }),
        }),
        { selector: (membership) => membership.id, maxLength: 10 },
      ),
  }),
)

describe('Property 30: Home e Tela_Communities particionam o catálogo entre aderidas e sugeridas', () => {
  // **Validates: Requirements 1.2, 1.4, 1.7, 9.10**
  it('as duas listas são disjuntas e cobrem exatamente o catálogo', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalog, memberships }) => {
        const { joined, suggested } = partitionCommunities(memberships, catalog)

        const joinedIds = joined.map((community) => community.id)
        const suggestedIds = suggested.map((community) => community.id)

        expect(new Set(joinedIds).size).toBe(joinedIds.length)
        expect(new Set(suggestedIds).size).toBe(suggestedIds.length)
        expect(joinedIds.filter((id) => suggestedIds.includes(id))).toEqual([])
        expect([...joinedIds, ...suggestedIds].sort()).toEqual(
          catalog.map((community) => community.id).sort(),
        )
      }),
      RUNS,
    )
  })

  // **Validates: Requirements 1.2, 9.10**
  it('aderidas são precisamente as comunidades com adesão, em ordem decrescente de joinedAt', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalog, memberships }) => {
        const { joined } = partitionCommunities(memberships, catalog)

        const catalogIds = new Set(catalog.map((community) => community.id))
        const expectedIds = memberships
          .filter((membership) => catalogIds.has(membership.id))
          .map((membership) => membership.id)

        expect(joined.map((community) => community.id).sort()).toEqual([...expectedIds].sort())

        const joinedAtById = new Map(memberships.map((m) => [m.id, m.joinedAt]))
        const instants = joined.map((community) => joinedAtById.get(community.id))
        for (let index = 1; index < instants.length; index += 1) {
          expect(instants[index - 1]).toBeGreaterThanOrEqual(instants[index])
        }
      }),
      RUNS,
    )
  })

  // **Validates: Requirements 1.4, 1.7**
  it('sugeridas são as demais, como subsequência da ordem de declaração, e vazias só se tudo tem adesão', () => {
    fc.assert(
      fc.property(scenarioArb, ({ catalog, memberships }) => {
        const { joined, suggested } = partitionCommunities(memberships, catalog)

        const positions = suggested.map((community) =>
          catalog.findIndex((entry) => entry.id === community.id),
        )
        for (let index = 1; index < positions.length; index += 1) {
          expect(positions[index - 1]).toBeLessThan(positions[index])
        }
        suggested.forEach((community, index) => {
          expect(community).toBe(catalog[positions[index]])
        })

        expect(suggested.length === 0).toBe(joined.length === catalog.length)
      }),
      RUNS,
    )
  })
})
