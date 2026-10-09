// testes de exemplo para estados vazios e padrões.
//
// Um exemplo por caso, sem geradores: estes testes fixam o que a UI mostra
// quando não há nada a mostrar (estado vazio) e quando nada foi configurado
// (padrão). Todos montam o `App` inteiro, porque é no shell que a Barra_Superior,
// o menu lateral e a navegação por URL se encontram.
//
// O projeto não usa `@testing-library/jest-dom`, então as asserções olham o DOM
// direto (`getAttribute`, `.value`, `.disabled`) em vez de matchers de elemento.
//
// Duas acomodações do ambiente, nenhuma delas de produção:
//   - `App` mostra a tela de carregamento por 1500ms; `mountApp` adianta o
//     relógio com timers falsos e volta aos reais antes de qualquer interação;
//   - o jsdom não implementa `scrollIntoView` nem `IntersectionObserver`.
//     `Reels` já tolera a ausência do observer em silêncio; o `scrollIntoView`
//     recebe um stub porque `Reels` o chama ao abrir um reel específico.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { videoCatalog } from '../data/videoCatalog'
import { installLocalStorageStub } from './helpers/localStorageStub'

let stub = null
let restoreStorage = null
let originalScrollIntoView = null

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore

  originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()

  window.history.pushState(null, '', '/')
})

afterEach(() => {
  cleanup()
  Element.prototype.scrollIntoView = originalScrollIntoView
  restoreStorage?.()
  stub = null
  restoreStorage = null
})

// Monta o App já passado da tela de carregamento e devolve o `user-event`.
// Começa com sessão salva para pular a tela de login (testada no Selenium).
async function mountApp() {
  stub.seed({ 'choosen.session': JSON.stringify({ email: 'victor@email.com', name: 'Victor Mendes' }) })
  vi.useFakeTimers()
  try {
    // `createElement` em vez de JSX: a configuração atual do Vitest transforma
    // JSX pelo runtime clássico, que exigiria um `React` no escopo.
    render(createElement(App))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
  } finally {
    vi.useRealTimers()
  }
  return userEvent.setup()
}

const topBar = () => document.querySelector('header.top-bar')
const sectionTitles = () =>
  screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

// --- Barra_Superior ------------------------------------------------------

describe('Barra_Superior', () => {
  // marca e notificações são os únicos elementos
  // interativos; a busca global saiu do header.
  it('tem apenas a marca e o controle de notificações', async () => {
    await mountApp()

    const header = topBar()
    expect(header).not.toBeNull()
    expect(within(header).getByText('CHOOSEN')).toBeTruthy()

    const controls = within(header).getAllByRole('button')
    expect(controls).toHaveLength(1)
    expect(controls[0].getAttribute('aria-label')).toBe('Notificações')

    expect(within(header).queryByRole('searchbox')).toBeNull()
    expect(within(header).queryByRole('textbox')).toBeNull()
    expect(header.querySelector('.search-box')).toBeNull()
    expect(document.getElementById('quick-video-search')).toBeNull()
  })
})

// --- Tela_Home -----------------------------------------------------------

describe('Tela_Home', () => {
  // Requisito 1.1: três seções, nesta ordem.
  it('apresenta as três seções na ordem especificada', async () => {
    await mountApp()

    expect(sectionTitles()).toEqual([
      'Suas comunidades',
      'Talvez você goste dessas comunidades',
      'Assistidos recentemente',
    ])
  })

  // sem adesão, a primeira seção convida a entrar em uma.
  it('exibe o estado vazio das comunidades aderidas quando não há adesão', async () => {
    await mountApp()

    expect(
      screen.getByText(
        'Você ainda não entrou em nenhuma comunidade. Escolha uma abaixo para começar.',
      ),
    ).toBeTruthy()
  })

  // com o catálogo inteiro aderido, a segunda seção desaparece.
  it('omite a seção de sugestões quando todas as comunidades estão aderidas', async () => {
    const now = Date.now()
    stub.seed({
      'choosen.communities.v1': JSON.stringify([
        { id: 'poli-usp', joinedAt: now - 3000 },
        { id: 'judo-brasil', joinedAt: now - 2000 },
        { id: 'vida-de-pet', joinedAt: now - 1000 },
      ]),
    })

    await mountApp()

    expect(sectionTitles()).toEqual(['Suas comunidades', 'Assistidos recentemente'])
    expect(screen.queryByText('Talvez você goste dessas comunidades')).toBeNull()
  })

  // sem evento de visualização, a seção recente mostra o vazio.
  it('exibe o estado vazio do histórico recente quando nada foi assistido', async () => {
    await mountApp()

    expect(
      screen.getByText('Os vídeos que você assistiu recentemente aparecerão aqui.'),
    ).toBeTruthy()
  })

  //limpar o histórico leva a Home de volta ao estado vazio.
  it('volta ao estado vazio do histórico recente depois de limpar o histórico', async () => {
    stub.seed({
      'choosen.history.v1': JSON.stringify([
        { reelId: 'sports-1', watchedAt: Date.now() - 60_000, seconds: 30 },
      ]),
    })

    const user = await mountApp()

    // Antes de limpar: o item aparece na seção de histórico recente.
    expect(
      screen.getByRole('button', { name: /Final do basquete masculino — Interusp 2026/ }),
    ).toBeTruthy()
    expect(
      screen.queryByText('Os vídeos que você assistiu recentemente aparecerão aqui.'),
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Histórico' }))
    await user.click(screen.getByRole('button', { name: 'Limpar histórico' }))
    await user.click(screen.getByRole('button', { name: 'Início' }))

    expect(
      screen.getByText('Os vídeos que você assistiu recentemente aparecerão aqui.'),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /Final do basquete masculino — Interusp 2026/ }),
    ).toBeNull()
  })
})

// --- Tela_Search ---------------------------------------------------------

describe('Tela_Search', () => {
  // Requisito 4.6: a tela monta com o campo vazio e sem filtro aplicado.
  it('monta com o campo de busca vazio e sem filtros', async () => {
    const user = await mountApp()
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(screen.getByLabelText('Buscar por títulos, criadores ou categorias').value).toBe('')
    expect(screen.getByRole('button', { name: 'Todos os vídeos' }).getAttribute('aria-pressed')).toBe('true')
    // Os valores internos dos selects não foram traduzidos.
    expect(screen.getByLabelText('Duração').value).toBe('any')
    expect(screen.getByLabelText('Ordenar por').value).toBe('featured')

    // Sem filtro, o cabeçalho de resultados é o de exploração e o catálogo
    // inteiro está à vista.
    expect(screen.getByRole('heading', { level: 2, name: 'Explorar vídeos' })).toBeTruthy()
    expect(screen.getByText(`${videoCatalog.length} vídeos`, { exact: false })).toBeTruthy()
  })

  // Requisito 4.5: combinação sem resultado exibe a mensagem de vazio.
  it('exibe a mensagem de resultado vazio quando nada casa com o termo', async () => {
    const user = await mountApp()
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.type(
      screen.getByLabelText('Buscar por títulos, criadores ou categorias'),
      'zzqqxx',
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Nenhuma descoberta por aqui ainda' }),
    ).toBeTruthy()
    expect(screen.getByText(/Não encontramos vídeos que correspondam/)).toBeTruthy()
  })
})

// --- Tela_Comunidade -----------------------------------------------------

describe('Tela_Comunidade', () => {
  // cabeçalho da comunidade e faixa de chips de nicho.
  it('exibe o cabeçalho da comunidade e os chips dos seus nichos', async () => {
    window.history.pushState(null, '', '/?tela=comunidade&comunidade=poli-usp')
    await mountApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Poli USP' })).toBeTruthy()
    expect(screen.getByText('Esportes e vida acadêmica da Escola Politécnica da USP.')).toBeTruthy()
    expect(screen.getByText('1.284 membros', { exact: false })).toBeTruthy()

    const niches = screen.getByRole('group', { name: 'Filtrar Poli USP por nicho' })
    const chips = within(niches).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Basquete',
      'Atletismo',
      'Vida acadêmica',
    ])
    for (const chip of chips) {
      expect(chip.getAttribute('aria-pressed')).toBe('false')
    }
    // Sem seleção, não há controle de limpar filtros.
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
  })

  // nicho sem vídeo mostra a mensagem e o filtro fica de pé.
  it('exibe o estado vazio de vídeos sem desfazer o filtro de nicho', async () => {
    window.history.pushState(null, '', '/?tela=comunidade&comunidade=poli-usp')
    const user = await mountApp()

    await user.click(screen.getByRole('button', { name: 'Atletismo' }))

    expect(
      screen.getByText(
        'Nenhum vídeo nos nichos que você selecionou. Limpe os filtros para ver tudo.',
      ),
    ).toBeTruthy()
    // O filtro continua selecionado: nada é limpo automaticamente.
    expect(screen.getByRole('button', { name: 'Atletismo' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeTruthy()
  })

  // selecionar um vídeo abre a Tela_Reels nesse vídeo.
  it('abre o player quando um vídeo da comunidade é selecionado', async () => {
    window.history.pushState(null, '', '/?tela=comunidade&comunidade=poli-usp')
    const user = await mountApp()

    await user.click(
      screen.getByRole('button', { name: /Final do basquete masculino — Interusp 2026/ }),
    )

    expect(screen.getByLabelText('Vídeos da comunidade Poli USP')).toBeTruthy()
    expect(
      screen.getAllByTestId('reel').map((post) => post.getAttribute('data-reel-id')),
    ).toContain('sports-1')
    expect(window.location.search).toBe('?tela=reels&comunidade=poli-usp&reel=sports-1')
  })

  //o retorno é controle próprio da tela, sem history.back().
  it('volta à visão de origem pelo próprio controle de retorno', async () => {
    const user = await mountApp()

    await user.click(screen.getByRole('button', { name: 'Abrir Poli USP' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Poli USP' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '← Voltar' }))

    expect(screen.getByRole('heading', { level: 1, name: /Olá, Victor/ })).toBeTruthy()
    expect(sectionTitles()).toEqual([
      'Suas comunidades',
      'Talvez você goste dessas comunidades',
      'Assistidos recentemente',
    ])
  })
})

// --- Tela_History --------------------------------------------------------

describe('Tela_History', () => {
  // histórico sem evento exibe a mensagem de vazio.
  it('exibe a mensagem de histórico vazio', async () => {
    const user = await mountApp()
    await user.click(screen.getByRole('button', { name: 'Histórico' }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'Nenhum vídeo assistido ainda' }),
    ).toBeTruthy()
    expect(screen.getByText('Os vídeos que você assistir vão aparecer aqui.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Limpar histórico' }).disabled).toBe(true)
  })
})

// --- Tela_MyTime ---------------------------------------------------------

describe('Tela_MyTime', () => {
  //sem a chave gravada, limite de 60 minutos,
  // `bedtime` e `screenTime` habilitados, `weekly` desabilitado — e, sem
  // histórico, zero minuto no dia corrente.
  it('adota os padrões com o armazenamento limpo', async () => {
    window.history.pushState(null, '', '/profile/my-time')
    await mountApp()

    expect(stub.raw('choosen.mytime.v1')).toBeNull()

    expect(screen.getByRole('button', { name: '1 hora' }).getAttribute('aria-pressed')).toBe('true')
    for (const label of ['30 min', '45 min', '1,5 hora', '2 horas']) {
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('false')
    }

    const checked = (name) =>
      screen.getByRole('switch', { name }).getAttribute('aria-checked')
    expect(checked(/^Lembrete de hora de dormir/)).toBe('true')
    expect(checked(/^Alertas de tempo de tela/)).toBe('true')
    expect(checked(/^Relatório semanal de resumo/)).toBe('false')

    // Sem histórico: zero minuto hoje, contra o limite padrão de 60.
    const today = document.querySelector('.screen-time-number-row')
    expect(within(today).getByText('0 min')).toBeTruthy()
    expect(within(today).getByText('60 min de limite')).toBeTruthy()
  })
})

// --- Tela_Communities ----------------------------------------------------

describe('Tela_Communities', () => {
  //a aplicação começa sem nenhuma adesão e a seção
  // "Suas comunidades" mostra o estado vazio.
  it('começa sem nenhuma adesão e exibe o estado vazio', async () => {
    const user = await mountApp()
    await user.click(screen.getByRole('button', { name: 'Comunidades' }))

    expect(stub.raw('choosen.communities.v1')).toBeNull()
    expect(
      screen.getByText(
        'Você ainda não participa de nenhuma comunidade. Abra um vídeo e participe da comunidade por trás dele.',
      ),
    ).toBeTruthy()
    // A seção "Descubra" segue com o catálogo inteiro à disposição.
    expect(screen.getByRole('heading', { level: 2, name: 'Descubra' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Participar de / })).toHaveLength(3)
  })
})
