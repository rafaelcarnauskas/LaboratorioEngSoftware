// Testes de propriedade de navigation.js (Property 35).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildUrl, homeState, parseUrl } from './navigation'
import { communities } from '../data/communities'
import { reels } from '../data/reels'

const RUNS = { numRuns: 100 }

const communityIds = communities.map((community) => community.id)
const reelIds = reels.map((reel) => reel.id)

// Extrai a query string do caminho absoluto devolvido por buildUrl.
function searchOf(url) {
  return new URL(url, 'https://choosen.test').search
}

// Estados de navegação válidos: Home, Tela_Comunidade e Tela_Reels (com e sem
// reel alvo), sempre com identificadores presentes nos catálogos.
const validStateArb = fc.oneof(
  fc.constant({ ...homeState }),
  fc.record({
    screen: fc.constant('comunidade'),
    communityId: fc.constantFrom(...communityIds),
    reelId: fc.constant(null),
  }),
  fc.record({
    screen: fc.constant('reels'),
    communityId: fc.constantFrom(...communityIds),
    reelId: fc.oneof(fc.constant(null), fc.constantFrom(...reelIds)),
  }),
)

const unknownIdArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((value) => !communityIds.includes(value) && !reelIds.includes(value))

const unknownScreenArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((value) => value !== 'comunidade' && value !== 'reels')

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
        fc.constantFrom('comunidade', 'reels'),
        unknownIdArb,
        fc.oneof(fc.constant(null), unknownIdArb, fc.constantFrom(...reelIds)),
        (screen, communityId, reelId) => {
          const params = new URLSearchParams({ tela: screen, comunidade: communityId })
          if (reelId !== null) params.set('reel', reelId)

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
          expect(url).not.toContain('reel')
        },
      ),
      RUNS,
    )
  })

  // **Validates: Requirements 11.2, 11.5**
  it('reel fora do catálogo é descartado preservando a Tela_Reels da comunidade', () => {
    fc.assert(
      fc.property(fc.constantFrom(...communityIds), unknownIdArb, (communityId, reelId) => {
        const params = new URLSearchParams({ tela: 'reels', comunidade: communityId, reel: reelId })

        const parsed = parseUrl(`?${params.toString()}`)

        expect(parsed).toEqual({ screen: 'reels', communityId, reelId: null, sanitized: true })
      }),
      RUNS,
    )
  })
})
