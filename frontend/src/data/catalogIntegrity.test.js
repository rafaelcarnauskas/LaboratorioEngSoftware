// Integridade dos dados mock (Property 32). A relação
// `nicheId ⊂ niches(communityId)` é um invariante do catálogo, não algo
// validado em runtime: a verificação aqui é exaustiva sobre os dados reais,
// o que é mais forte que amostragem aleatória.
import { describe, expect, it } from 'vitest'
import { communities } from './communities'
import { reels } from './reels'

describe('Property 32: Todo reel declara um nicho da própria comunidade', () => {
  // **Validates: Requirements 10.1, 10.2**
  it('cada reel aponta para uma comunidade do catálogo e para um nicho que ela declara', () => {
    const nichesByCommunity = new Map(
      communities.map((community) => [
        community.id,
        new Set(community.niches.map((niche) => niche.id)),
      ]),
    )

    expect(reels.length).toBeGreaterThan(0)

    reels.forEach((reel) => {
      const declared = nichesByCommunity.get(reel.communityId)

      expect(declared, `reel ${reel.id} aponta para comunidade inexistente`).toBeDefined()
      expect(
        declared.has(reel.nicheId),
        `reel ${reel.id} declara o nicho "${reel.nicheId}", ausente de ${reel.communityId}`,
      ).toBe(true)
    })
  })

  // **Validates: Requirements 10.1**
  it('toda comunidade declara ao menos um nicho, com identificadores únicos', () => {
    expect(communities.length).toBeGreaterThan(0)

    communities.forEach((community) => {
      expect(Array.isArray(community.niches)).toBe(true)
      expect(community.niches.length).toBeGreaterThan(0)

      const ids = community.niches.map((niche) => niche.id)
      expect(new Set(ids).size).toBe(ids.length)
      ids.forEach((id) => {
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
      })
    })
  })
})
