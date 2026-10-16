// Testes de propriedade de navigation.js (Property 35).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildUrl, homeState, parseUrl } from './navigation'
import { communities } from '../2-comunidades/modelo/communities'
import { finds } from '../3-videos/modelo/finds'

const RUNS = { numRuns: 100 }

const communityIds = communities.map((community) => community.id)
const findIds = finds.map((find) => find.id)

// Extrai a query string do caminho absoluto devolvido por buildUrl.
function searchOf(url) {
  return new URL(url, 'https://choosen.test').search
}

// Estados de navegação válidos: Home, Tela_Comunidade e Tela_Finds (com e sem
// find alvo), sempre com identificadores presentes nos catálogos.
const validStateArb = fc.oneof(
  fc.constant({ ...homeState }),
  fc.record({
    screen: fc.constant('comunidade'),
    communityId: fc.constantFrom(...communityIds),
    findId: fc.constant(null),
  }),
  fc.record({
    screen: fc.constant('finds'),
    communityId: fc.constantFrom(...communityIds),
    findId: fc.oneof(fc.constant(null), fc.constantFrom(...findIds)),
  }),
)

const unknownIdArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((value) => !communityIds.includes(value) && !findIds.includes(value))

const unknownScreenArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((value) => value !== 'comunidade' && value !== 'finds')

describe('Property 35: URL de comunidade faz round-trip e sanea comunidade inválida', () => {
  // **Validates: Requirements 11.1, 11.2, 11.4, 11.5**
  it('parseUrl(buildUrl(state)) devolve o estado original com sanitized falso', () => {
    fc.assert(
      fc.property(validStateArb, (state) => {
        const parsed = parseUrl(searchOf(buildUrl(state)))

        expect(parsed).toEqual({ ...state, sanitized: false })
      }),
      RUNS,
    )
  })

  // **Validates: Requirements 11.4, 11.5**
  it('comunidade fora do catálogo cai na Home com sanitized verdadeiro', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('comunidade', 'finds'),
        unknownIdArb,
        fc.oneof(fc.constant(null), unknownIdArb, fc.constantFrom(...findIds)),
        (screen, communityId, findId) => {
          const params = new URLSearchParams({ tela: screen, comunidade: communityId })
          if (findId !== null) params.set('find', findId)

          const parsed = parseUrl(`?${params.toString()}`)

          expect(parsed).toEqual({ ...homeState, sanitized: true })
          expect(buildUrl(parsed)).toBe('/')
        },
      ),
      RUNS,
    )
  })

  // **Validates: Requirements 11.4, 11.5**
  it('tela não reconhecida cai na Home com sanitized verdadeiro', () => {
    fc.assert(
      fc.property(
        unknownScreenArb,
        fc.oneof(fc.constant(null), fc.constantFrom(...communityIds), unknownIdArb),
        (screen, communityId) => {
          const params = new URLSearchParams({ tela: screen })
          if (communityId !== null) params.set('comunidade', communityId)

          const parsed = parseUrl(`?${params.toString()}`)

          expect(parsed).toEqual({ ...homeState, sanitized: true })
          const url = buildUrl(parsed)
          expect(url).toBe('/')
          expect(url).not.toContain('comunidade')
          expect(url).not.toContain('find')
        },
      ),
      RUNS,
    )
  })

  // **Validates: Requirements 11.2, 11.5**
  it('find fora do catálogo é descartado preservando a Tela_Finds da comunidade', () => {
    fc.assert(
      fc.property(fc.constantFrom(...communityIds), unknownIdArb, (communityId, findId) => {
        const params = new URLSearchParams({ tela: 'finds', comunidade: communityId, find: findId })

        const parsed = parseUrl(`?${params.toString()}`)

        expect(parsed).toEqual({ screen: 'finds', communityId, findId: null, sanitized: true })
      }),
      RUNS,
    )
  })
})
