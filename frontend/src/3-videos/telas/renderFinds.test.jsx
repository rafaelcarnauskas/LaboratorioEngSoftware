//renderização e comentários da Tela_Finds.
//
// Os quatro rodam contra `Finds.jsx` montado de verdade, contra o
// catálogo real de finds — o componente é o dono dos contratos de seletor
// (`data-find-id`, `data-testid="abrir-comentarios"`, `acao-principal`,
// `lista-comentarios`) e das mensagens de feedback, então não há função pura
// equivalente a testar.
//
// jsdom não tem IntersectionObserver: `useFocusedFind` desliga o rastreio em
// silêncio, o que é exatamente o comportamento documentado. Nenhum stub é
// necessário porque nenhuma destas propriedades fala de foco.
// `React` entra explicitamente porque o transform de JSX destes testes é o
// clássico (`React.createElement`), não o automático do build.
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import Finds from './Finds'
import { finds } from '../modelo/finds'
import { communities } from '../../2-comunidades/modelo/communities'
import { selectFinds } from '../modelo/findsIndex'

// Testes de renderização são caros; 25 iterações por propriedade.
const RUNS = 25

// 25 montagens com interação de teclado passam folgado dos 5s padrão do Vitest.
const PROPERTY_TIMEOUT_MS = 120_000

afterEach(cleanup)

// --- geradores -----------------------------------------------------------

// Abertura por comunidade, com um subconjunto qualquer dos nichos dela
// (vazio = todos). Espelha a forma como App.jsx monta a tela.
const byCommunity = fc.constantFrom(...communities).chain((community) =>
  fc.record({
    category: fc.constant(null),
    communityId: fc.constant(community.id),
    niches: fc.subarray(community.niches.map((niche) => niche.id)),
  }),
)

// Abertura por categoria, incluindo grafias que exercitam o `categoryKey`.
const byCategory = fc.constantFrom('sports', 'cute', 'Sports', ' Cute ', 'humor').map((category) => ({
  category,
  communityId: null,
  niches: [],
}))

const feedScenario = fc.oneof(byCommunity, byCategory)

// Alfabeto seguro para `user-event`: sem `{`, `[` nem `\t`, que o teclado
// virtual interpreta como comandos de tecla.
const safeChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCNZ0123456789 .,!?-ãéç'.split(''))

const validComment = fc
  .string({ unit: safeChar, minLength: 1, maxLength: 24 })
  .filter((text) => text.trim().length > 0)

// Um find concreto e o filtro que garante a presença dele no feed.
const findScenario = fc.constantFrom(...finds).map((find) => ({
  find,
  communityId: find.communityId,
  niches: [find.nicheId],
}))

function formatCount(count) {
  return count.toLocaleString('pt-BR')
}

describe('Finds — renderização do feed', () => {
  // **Cada find renderizado expõe autor, avatar, legenda e
  // `data-find-id`**

  it('renderiza cada find do filtro com autor, avatar, legenda e data-find-id, sem a barra superior do template', () => {
    fc.assert(
      fc.property(feedScenario, ({ category, communityId, niches }) => {
        cleanup()

        const expected = selectFinds({ category, communityId, niches })
        const { container } = render(
          <Finds category={category} communityId={communityId} niches={niches} />,
        )

        // A tela deixou de usar a barra e os ícones do template do Instagram.
        expect(container.querySelector('.finds-topbar')).toBeNull()

        const posts = [...container.querySelectorAll('.finds-post')]
        expect(posts.map((post) => post.dataset.findId)).toEqual(expected.map((find) => find.id))

        posts.forEach((post, index) => {
          const find = expected[index]

          expect(post.getAttribute('data-find-id')).toBe(find.id)
          expect(within(post).getByText(`@${find.author}`)).toBeTruthy()
          expect(post.querySelector('.finds-avatar').getAttribute('src')).toBe(find.avatar)
          expect(post.querySelector('.finds-caption-text').textContent).toBe(find.caption)
        })
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})

describe('Finds — ações e comunidades', () => {
  it('alterna a curtida com a marca Choosen e atualiza o contador', async () => {
    const find = finds[0]
    const user = userEvent.setup()
    const { container } = render(<Finds communityId={find.communityId} niches={[find.nicheId]} />)
    const post = within(container.querySelector(`[data-find-id="${find.id}"]`))
    const like = post.getByTestId('acao-curtir')

    expect(like.getAttribute('aria-pressed')).toBe('false')
    expect(like.getAttribute('aria-label')).toBe('Curtir')
    expect(like.textContent).toBe(formatCount(find.likes))

    await user.click(like)

    expect(like.getAttribute('aria-pressed')).toBe('true')
    expect(like.getAttribute('aria-label')).toBe('Remover curtida')
    expect(like.textContent).toBe(formatCount(find.likes + 1))
    expect(like.querySelector('.finds-like-mark--liked')).toBeTruthy()
    expect(like.querySelectorAll('.finds-like-mark > span')).toHaveLength(1)

    await user.click(like)

    expect(like.getAttribute('aria-pressed')).toBe('false')
    expect(like.textContent).toBe(formatCount(find.likes))
  })

  it('substitui recomendações de perfis por comunidades e permite entrar sem sair do vídeo', async () => {
    const user = userEvent.setup()
    const joined = []
    const { container, getByRole, queryByText } = render(
      <Finds
        communityId="vida-de-pet"
        onJoinCommunity={(communityId) => joined.push(communityId)}
      />,
    )

    expect(getByRole('heading', { name: 'Comunidades relacionadas' })).toBeTruthy()
    expect(queryByText('Sugestões para você')).toBeNull()
    expect(container.querySelector('.finds-menu')).toBeNull()
    expect(
      within(container.querySelector('.finds-side')).queryByRole('button', {
        name: 'Entrar na comunidade Vida de Pet',
      }),
    ).toBeNull()

    await user.click(getByRole('button', { name: 'Entrar na comunidade Poli USP' }))

    expect(joined).toEqual(['poli-usp'])
  })
})

describe('Finds — comentário válido', () => {
  // **Submissão de comentário válido insere no topo e incrementa o
  // contador**

  it('insere cada comentário no topo da lista, preserva os anteriores e soma ao contador inicial', async () => {
    await fc.assert(
      fc.asyncProperty(
        findScenario,
        fc.array(validComment, { minLength: 1, maxLength: 3 }),
        async ({ find, communityId, niches }, texts) => {
          cleanup()

          const user = userEvent.setup()
          const { container } = render(<Finds communityId={communityId} niches={niches} />)

          const post = container.querySelector(`[data-find-id="${find.id}"]`)
          const panel = within(post)

          await user.click(panel.getByTestId('abrir-comentarios'))

          const submitted = []

          for (const text of texts) {
            await user.type(panel.getByLabelText('Comentário'), text)
            await user.click(panel.getByTestId('acao-principal'))

            submitted.unshift(text.trim())

            // Inserção no topo, com os anteriores logo abaixo e na ordem.
            const items = [...panel.getByTestId('lista-comentarios').querySelectorAll('li')]
            expect(items).toHaveLength(submitted.length)
            expect(items.map((item) => item.textContent)).toEqual(
              submitted.map((value) => `mendesvictor ${value}`),
            )

            // Contador = commentCount inicial + quantidade submetida.
            expect(panel.getByTestId('abrir-comentarios').textContent).toBe(
              formatCount(find.commentCount + submitted.length),
            )
          }
        },
      ),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)

  // **Comentário válido anuncia confirmação em `role="status"`**

  it('anuncia "Comentário publicado." em role="status" após a submissão', async () => {
    await fc.assert(
      fc.asyncProperty(findScenario, validComment, async ({ find, communityId, niches }, text) => {
        cleanup()

        const user = userEvent.setup()
        const { container } = render(<Finds communityId={communityId} niches={niches} />)

        const panel = within(container.querySelector(`[data-find-id="${find.id}"]`))

        await user.click(panel.getByTestId('abrir-comentarios'))
        await user.type(panel.getByLabelText('Comentário'), text)
        await user.click(panel.getByTestId('acao-principal'))

        expect(panel.getByRole('status').textContent).toBe('Comentário publicado.')
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})

describe('Finds — comentário em branco', () => {
  // **Comentário em branco é rejeitado sem alterar estado**

  it('rejeita string vazia ou só com espaços, mantendo lista e contador e anunciando em role="alert"', async () => {
    await fc.assert(
      fc.asyncProperty(
        findScenario,
        // Zero a quatro espaços: a string vazia está incluída.
        fc.integer({ min: 0, max: 4 }),
        // Um comentário válido antes do branco em metade dos casos: o estado
        // "inalterado" precisa ser testado também quando já existe conteúdo.
        fc.option(validComment, { nil: null }),
        async ({ find, communityId, niches }, spaces, seed) => {
          cleanup()

          const user = userEvent.setup()
          const { container } = render(<Finds communityId={communityId} niches={niches} />)

          const panel = within(container.querySelector(`[data-find-id="${find.id}"]`))
          const input = () => panel.getByLabelText('Comentário')

          await user.click(panel.getByTestId('abrir-comentarios'))

          if (seed !== null) {
            await user.type(input(), seed)
            await user.click(panel.getByTestId('acao-principal'))
          }

          const expectedCount = formatCount(find.commentCount + (seed === null ? 0 : 1))
          const before = panel.queryByTestId('lista-comentarios')?.innerHTML ?? null

          if (spaces > 0) await user.type(input(), ' '.repeat(spaces))
          await user.click(panel.getByTestId('acao-principal'))

          // Lista e contador intactos.
          expect(panel.queryByTestId('lista-comentarios')?.innerHTML ?? null).toBe(before)
          expect(panel.getByTestId('abrir-comentarios').textContent).toBe(expectedCount)

          // E a recusa é anunciada como erro, não como confirmação.
          expect(panel.getByRole('alert').textContent).toBe(
            'Escreva um comentário antes de publicar.',
          )
          expect(panel.queryByRole('status')).toBeNull()
        },
      ),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})
