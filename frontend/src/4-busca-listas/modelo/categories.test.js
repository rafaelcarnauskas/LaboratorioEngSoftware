//resolução de Categoria_Canonica insensível à caixa e a espaços.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { categoryDefinitions, categoryKey, resolveCategory } from './categories'

const RUNS = 100

const canonicalNames = categoryDefinitions.map((item) => item.name)
const canonicalKeys = new Set(canonicalNames.map((name) => name.toLowerCase()))

// Espaços em volta: só caracteres que `String.prototype.trim` remove.
const whitespace = fc.string({
  unit: fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'),
  maxLength: 4,
})

// Variação de caixa caractere a caractere, preservando a sequência de letras.
const caseVariant = (name) =>
  fc
    .array(fc.boolean(), { minLength: name.length, maxLength: name.length })
    .map((flags) =>
      name
        .split('')
        .map((char, index) => (flags[index] ? char.toUpperCase() : char.toLowerCase()))
        .join(''),
    )

// Nome canônico com caixa embaralhada e espaços em volta.
const paddedVariant = fc
  .constantFrom(...canonicalNames)
  .chain((name) =>
    fc.tuple(fc.constant(name), caseVariant(name), whitespace, whitespace),
  )
  .map(([name, varied, before, after]) => ({ name, raw: `${before}${varied}${after}` }))

// Qualquer string que não seja uma Categoria_Canonica depois de normalizada.
const foreignString = fc
  .string()
  .filter((value) => !canonicalKeys.has(value.trim().toLowerCase()))

// Valores que não são string.
const nonString = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string()),
  fc.object(),
)

describe('Property 1: resolução de categoria é insensível à caixa e a espaços', () => {
  it('resolve toda variação de caixa e de espaços para a mesma Categoria_Canonica', () => {
    fc.assert(
      fc.property(paddedVariant, ({ name, raw }) => {
        const canonical = resolveCategory(name)

        expect(resolveCategory(raw)).toBe(canonical)
        expect(categoryKey(raw)).toBe(name.toLowerCase())
      }),
      { numRuns: RUNS },
    )
  })

  it('devolve null para string fora de categoryDefinitions', () => {
    fc.assert(
      fc.property(foreignString, (value) => {
        expect(resolveCategory(value)).toBeNull()
        expect(categoryKey(value)).toBeNull()
      }),
      { numRuns: RUNS },
    )
  })

  it('devolve null para valor que não é string', () => {
    fc.assert(
      fc.property(nonString, (value) => {
        expect(resolveCategory(value)).toBeNull()
        expect(categoryKey(value)).toBeNull()
      }),
      { numRuns: RUNS },
    )
  })

  // Exemplos âncora dos casos citados no design.
  it('trata "sports", "Sports" e " SPORTS " como a mesma categoria', () => {
    const canonical = resolveCategory('Sports')

    expect(resolveCategory('sports')).toBe(canonical)
    expect(resolveCategory(' SPORTS ')).toBe(canonical)
    expect(categoryKey(' SpOrTs\n')).toBe('sports')
  })
})
