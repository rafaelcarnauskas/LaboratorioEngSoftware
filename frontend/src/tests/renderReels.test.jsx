//renderização e comentários da Tela_Reels.
//
// Os quatro rodam contra `pages/Reels.jsx` montado de verdade, contra o
// catálogo real de reels — o componente é o dono dos contratos de seletor
// (`data-reel-id`, `data-testid="abrir-comentarios"`, `acao-principal`,
// `lista-comentarios`) e das mensagens de feedback, então não há função pura
// equivalente a testar.
//
// jsdom não tem IntersectionObserver: `useFocusedReel` desliga o rastreio em
// silêncio, o que é exatamente o comportamento documentado. Nenhum stub é
// necessário porque nenhuma destas propriedades fala de foco.
// `React` entra explicitamente porque o transform de JSX destes testes é o
// clássico (`React.createElement`), não o automático do build.
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import Reels from '../pages/Reels'
import { reels } from '../data/reels'
import { communities } from '../data/communities'
import { selectReels } from '../lib/reelsIndex'

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

// Um reel concreto e o filtro que garante a presença dele no feed.
const reelScenario = fc.constantFrom(...reels).map((reel) => ({
  reel,
  communityId: reel.communityId,
  niches: [reel.nicheId],
}))

function formatCount(count) {
  return count.toLocaleString('pt-BR')
}

describe('Reels — renderização do feed', () => {
  // **Cada reel renderizado expõe autor, avatar, legenda e
  // `data-reel-id`**

  it('renderiza cada reel do filtro com autor, avatar, legenda e data-reel-id, sem a barra superior do template', () => {
    fc.assert(
      fc.property(feedScenario, ({ category, communityId, niches }) => {
        cleanup()

        const expected = selectReels({ category, communityId, niches })
        const { container } = render(
          <Reels category={category} communityId={communityId} niches={niches} />,
        )

        // A tela deixou de usar a barra e os ícones do template do Instagram.
        expect(container.querySelector('.reels-topbar')).toBeNull()

        const posts = [...container.querySelectorAll('.reels-post')]
        expect(posts.map((post) => post.dataset.reelId)).toEqual(expected.map((reel) => reel.id))

        posts.forEach((post, index) => {
          const reel = expected[index]

          expect(post.getAttribute('data-reel-id')).toBe(reel.id)
          expect(within(post).getByText(`@${reel.author}`)).toBeTruthy()
          expect(post.querySelector('.reels-avatar').getAttribute('src')).toBe(reel.avatar)
          expect(post.querySelector('.reels-caption-text').textContent).toBe(reel.caption)
        })
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})

describe('Reels — ações e comunidades', () => {
  it('alterna a curtida com a marca Choosen e atualiza o contador', async () => {
    const reel = reels[0]
    const user = userEvent.setup()
    const { container } = render(<Reels communityId={reel.communityId} niches={[reel.nicheId]} />)
    const post = within(container.querySelector(`[data-reel-id="${reel.id}"]`))
    const like = post.getByTestId('acao-curtir')

    expect(like.getAttribute('aria-pressed')).toBe('false')
    expect(like.getAttribute('aria-label')).toBe('Curtir')
    expect(like.textContent).toBe(formatCount(reel.likes))

    await user.click(like)

    expect(like.getAttribute('aria-pressed')).toBe('true')
    expect(like.getAttribute('aria-label')).toBe('Remover curtida')
    expect(like.textContent).toBe(formatCount(reel.likes + 1))
    expect(like.querySelector('.reels-like-mark--liked')).toBeTruthy()
    expect(like.querySelectorAll('.reels-like-mark > span')).toHaveLength(1)

    await user.click(like)

    expect(like.getAttribute('aria-pressed')).toBe('false')
    expect(like.textContent).toBe(formatCount(reel.likes))
  })

  it('substitui recomendações de perfis por comunidades e permite entrar sem sair do vídeo', async () => {
    const user = userEvent.setup()
    const joined = []
    const { container, getByRole, queryByText } = render(
      <Reels
        communityId="vida-de-pet"
        onJoinCommunity={(communityId) => joined.push(communityId)}
      />,
    )

    expect(getByRole('heading', { name: 'Comunidades relacionadas' })).toBeTruthy()
    expect(queryByText('Sugestões para você')).toBeNull()
    expect(container.querySelector('.reels-menu')).toBeNull()
    expect(
      within(container.querySelector('.reels-side')).queryByRole('button', {
        name: 'Entrar na comunidade Vida de Pet',
      }),
    ).toBeNull()

    await user.click(getByRole('button', { name: 'Entrar na comunidade Poli USP' }))

    expect(joined).toEqual(['poli-usp'])
  })
})

describe('Reels — comentário válido', () => {
  // **Submissão de comentário válido insere no topo e incrementa o
  // contador**

  it('insere cada comentário no topo da lista, preserva os anteriores e soma ao contador inicial', async () => {
    await fc.assert(
      fc.asyncProperty(
        reelScenario,
        fc.array(validComment, { minLength: 1, maxLength: 3 }),
        async ({ reel, communityId, niches }, texts) => {
          cleanup()

          const user = userEvent.setup()
          const { container } = render(<Reels communityId={communityId} niches={niches} />)

          const post = container.querySelector(`[data-reel-id="${reel.id}"]`)
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
              formatCount(reel.commentCount + submitted.length),
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
      fc.asyncProperty(reelScenario, validComment, async ({ reel, communityId, niches }, text) => {
        cleanup()

        const user = userEvent.setup()
        const { container } = render(<Reels communityId={communityId} niches={niches} />)

        const panel = within(container.querySelector(`[data-reel-id="${reel.id}"]`))

        await user.click(panel.getByTestId('abrir-comentarios'))
        await user.type(panel.getByLabelText('Comentário'), text)
        await user.click(panel.getByTestId('acao-principal'))

        expect(panel.getByRole('status').textContent).toBe('Comentário publicado.')
      }),
      { numRuns: RUNS },
    )
  }, PROPERTY_TIMEOUT_MS)
})

describe('Reels — comentário em branco', () => {
  // **Comentário em branco é rejeitado sem alterar estado**

  it('rejeita string vazia ou só com espaços, mantendo lista e contador e anunciando em role="alert"', async () => {
    await fc.assert(
      fc.asyncProperty(
        reelScenario,
        // Zero a quatro espaços: a string vazia está incluída.
        fc.integer({ min: 0, max: 4 }),
        // Um comentário válido antes do branco em metade dos casos: o estado
        // "inalterado" precisa ser testado também quando já existe conteúdo.
        fc.option(validComment, { nil: null }),
        async ({ reel, communityId, niches }, spaces, seed) => {
          cleanup()

          const user = userEvent.setup()
          const { container } = render(<Reels communityId={communityId} niches={niches} />)

          const panel = within(container.querySelector(`[data-reel-id="${reel.id}"]`))
          const input = () => panel.getByLabelText('Comentário')

          await user.click(panel.getByTestId('abrir-comentarios'))

          if (seed !== null) {
            await user.type(input(), seed)
            await user.click(panel.getByTestId('acao-principal'))
          }

          const expectedCount = formatCount(reel.commentCount + (seed === null ? 0 : 1))
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
