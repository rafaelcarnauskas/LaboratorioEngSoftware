//a navegação entre finds respeita os limites da lista
// filtrada e é reversível.
//
// A Tela_Finds navega por rolagem: o handler de teclado de `Finds` desloca o
// feed em exatamente uma altura de post por acionamento, e o find em foco é o
// que está alinhado a essa posição. `jsdom` não faz layout — `offsetHeight` é
// 0 e `scrollTop` nunca sai de 0 — então o harness abaixo fornece só a parte
// que é do navegador (altura do post e o clamp do `scrollTop` entre 0 e o
// máximo rolável). O que está sob teste continua sendo o código da tela: o
// mapeamento de teclas, a direção e a magnitude do deslocamento.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import fc from 'fast-check'
import Finds from '../pages/Finds'
import { selectFinds } from '../lib/findsIndex'

const RUNS = 100
const POST_HEIGHT = 800

const NEXT_KEYS = ['ArrowDown', 'PageDown']
const PREVIOUS_KEYS = ['ArrowUp', 'PageUp']

let originalOffsetHeight = null

beforeEach(() => {
  originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => POST_HEIGHT,
  })
})

afterEach(() => {
  cleanup()
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  } else {
    delete HTMLElement.prototype.offsetHeight
  }
})

// Semântica de rolagem do navegador aplicada ao contêiner do feed.
function installScroll(container, postCount) {
  const max = POST_HEIGHT * Math.max(postCount - 1, 0)
  let top = 0

  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value) => {
      top = Math.min(Math.max(value, 0), max)
    },
  })

  container.scrollBy = ({ top: delta }) => {
    container.scrollTop = top + delta
  }
}

function focusedIndex(container) {
  return Math.round(container.scrollTop / POST_HEIGHT)
}

function press(key) {
  fireEvent.keyDown(document.body, { key })
}

describe('Property 4: navegação entre finds respeita os limites e é reversível', () => {
  const finds = selectFinds({})
  const total = finds.length

  it('o catálogo de referência não é vazio', () => {
    expect(total).toBeGreaterThan(1)
  })

  it('avançar e retornar sempre deixam o foco dentro dos limites da lista', () => {
    const { container } = render(createElement(Finds))
    const page = container.querySelector('.finds-page')
    installScroll(page, total)

    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...NEXT_KEYS, ...PREVIOUS_KEYS), { maxLength: 12 }),
        (keys) => {
          page.scrollTop = 0

          for (const key of keys) {
            press(key)
            const index = focusedIndex(page)
            expect(index).toBeGreaterThanOrEqual(0)
            expect(index).toBeLessThanOrEqual(total - 1)
          }
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('para qualquer índice que não seja o último, retornar depois de avançar devolve o índice original', () => {
    const { container } = render(createElement(Finds))
    const page = container.querySelector('.finds-page')
    installScroll(page, total)

    fc.assert(
      fc.property(
        fc.nat({ max: total - 1 }),
        fc.constantFrom(...NEXT_KEYS),
        fc.constantFrom(...PREVIOUS_KEYS),
        (start, nextKey, previousKey) => {
          page.scrollTop = 0
          for (let step = 0; step < start; step += 1) press(nextKey)
          expect(focusedIndex(page)).toBe(start)

          press(nextKey)
          const advanced = focusedIndex(page)
          expect(advanced).toBe(Math.min(start + 1, total - 1))

          press(previousKey)
          const returned = focusedIndex(page)
          expect(returned).toBeGreaterThanOrEqual(0)
          expect(returned).toBeLessThanOrEqual(total - 1)

          // Reversibilidade: só o último índice não tem para onde avançar.
          if (start !== total - 1) {
            expect(returned).toBe(start)
          } else {
            expect(returned).toBe(Math.max(start - 1, 0))
          }
        },
      ),
      { numRuns: RUNS },
    )
  })

  it('retornar no primeiro find e avançar no último mantêm o foco', () => {
    const { container } = render(createElement(Finds))
    const page = container.querySelector('.finds-page')
    installScroll(page, total)

    page.scrollTop = 0
    press('ArrowUp')
    expect(focusedIndex(page)).toBe(0)

    for (let step = 0; step < total + 3; step += 1) press('ArrowDown')
    expect(focusedIndex(page)).toBe(total - 1)
  })
})
