// Teste de propriedade da renderização da Tela_Perfil e da Tela_Redefinir_Senha (Property 30).
//
// Feature: autenticacao-conta, Property 30: Telas renderizam o Perfil_Publico e não vazam segredos
// **Validates: Requisitos 6.3, 6.4, 6.5, 16.13**
//
// O Orquestrador_Acesso é simulado com `vi.mock` só em `loadProfile` e
// `resetPassword`: o resto (classes de erro, `mensagemDeErro`, mapa de
// mensagens) é o módulo real, o mesmo que as telas usam. O `localStorage` é o
// stub em memória, porque a Tela_Perfil importa subtelas de outras partes que
// leem o armazenamento.
//
// Cada execução do `fc.asyncProperty` monta a tela do zero e chama `cleanup()`
// no fim (no `finally`), para que uma execução não enxergue o DOM da anterior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fc from 'fast-check'
import Profile from '../telas/Profile'
import ResetPassword from '../telas/ResetPassword'
import {
  ErroConexao,
  ErroServidor,
  MENSAGEM_ERRO_CONEXAO,
  MENSAGEM_ERRO_SERVIDOR,
  loadProfile,
  resetPassword,
} from '../orquestrador'
import { MENSAGEM_TAMANHO_SENHA, TAMANHO_MINIMO_SENHA } from '../modelo/redefinicao'
import { installLocalStorageStub } from '../../tests/helpers/localStorageStub'

vi.mock('../orquestrador', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, loadProfile: vi.fn(), resetPassword: vi.fn() }
})

// 100 execuções por propriedade (cada uma monta a tela inteira no jsdom); o
// limite de tempo do teste é folgado para máquinas mais lentas.
const NUM_RUNS = 100
const LIMITE_MS = 120_000

let restoreStorage = () => {}

beforeEach(() => {
  restoreStorage = installLocalStorageStub().restore
})

afterEach(() => {
  cleanup()
  vi.mocked(loadProfile).mockReset()
  vi.mocked(resetPassword).mockReset()
  restoreStorage()
})

// --- geradores -------------------------------------------------------------

// Perfil_Publico com as regras do Requisito 1: nome de 1 a 60 caracteres não
// vazio após `trim`, username `[A-Za-z0-9._]{1,30}`, descrição de até 160
// caracteres (vazia ou não), foto vazia ou data URI de imagem.
const perfilArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }).filter((nome) => nome.trim() !== ''),
  username: fc.stringMatching(/^[A-Za-z0-9._]{1,30}$/),
  email: fc.emailAddress(),
  description: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 160 })),
  photo: fc.oneof(
    fc.constant(''),
    fc
      .tuple(
        fc.constantFrom('png', 'jpeg', 'webp', 'gif'),
        fc.base64String({ minLength: 4, maxLength: 64 }),
      )
      .map(([tipo, base64]) => `data:image/${tipo};base64,${base64}`),
  ),
  isCommunityAdmin: fc.boolean(),
  isSystemAdmin: fc.boolean(),
})

// Token_Redefinicao: o formato real (`secrets.token_urlsafe(32)`, 43
// caracteres de `[A-Za-z0-9_-]`) e, por robustez, outros valores imprimíveis
// sem espaço que um link adulterado poderia trazer.
const tokenArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_-]{43}$/),
  fc.string({ minLength: 8, maxLength: 64 }).filter((token) => !/\s/.test(token)),
)

// Nova senha com pelo menos 6 caracteres (como no enunciado da Property 30).
// De 6 a 7 a validação local barra o envio; de 8 a 128 a senha chega a
// `resetPassword` e o desfecho simulado é exibido.
const senhaArb = fc.string({ minLength: 6, maxLength: 128 })

const DESFECHOS = ['ok', 'token-invalido', 'senha-invalida', 'conexao', 'servidor']
const desfechoArb = fc.constantFrom(...DESFECHOS)

// --- auxiliares da Tela_Redefinir_Senha -------------------------------------

// Conexão e servidor rejeitam com mensagens que carregam os segredos: se a
// tela exibisse `error.message` em vez do mapa único, o vazamento apareceria.
function simularDesfecho(desfecho, token, senha) {
  const mock = vi.mocked(resetPassword)
  mock.mockReset()
  if (desfecho === 'conexao') {
    mock.mockRejectedValue(new ErroConexao(`timeout ao enviar ${token} ${senha}`))
  } else if (desfecho === 'servidor') {
    mock.mockRejectedValue(new ErroServidor(`500 com ${token} e ${senha}`, 500))
  } else {
    mock.mockResolvedValue(desfecho)
  }
}

function botaoEnviar() {
  return screen.getByTestId('redefinir-enviar')
}

// Preenche o formulário, envia e espera a tela assentar no estado do desfecho.
// `paste` entrega a senha exatamente como gerada (sem a interpretação de
// `{`/`[` do `type`). Devolve o texto renderizado da página.
async function executarRedefinicao(token, senha, desfecho) {
  simularDesfecho(desfecho, token, senha)
  const user = userEvent.setup()
  const { container } = render(
    <ResetPassword token={token} onGoToLogin={vi.fn()} onGoToForgot={vi.fn()} />,
  )

  await user.click(screen.getByLabelText('New password'))
  await user.paste(senha)
  await user.click(screen.getByLabelText('Confirm new password'))
  await user.paste(senha)
  await user.click(botaoEnviar())

  if (senha.length < TAMANHO_MINIMO_SENHA) {
    // Barrada localmente: mensagem de tamanho no campo, nenhuma requisição (16.4).
    expect(container.querySelector('#reset-password-error')?.textContent).toBe(
      MENSAGEM_TAMANHO_SENHA,
    )
    expect(resetPassword).not.toHaveBeenCalled()
    return document.body.textContent
  }

  if (desfecho === 'ok') {
    await screen.findByTestId('redefinir-sucesso')
  } else if (desfecho === 'token-invalido') {
    await screen.findByTestId('redefinir-token-invalido')
  } else if (desfecho === 'senha-invalida') {
    await waitFor(() => {
      expect(container.querySelector('#reset-password-error')?.textContent).toBe(
        MENSAGEM_TAMANHO_SENHA,
      )
      expect(botaoEnviar().disabled).toBe(false)
    })
  } else {
    const esperada = desfecho === 'conexao' ? MENSAGEM_ERRO_CONEXAO : MENSAGEM_ERRO_SERVIDOR
    await waitFor(() => {
      expect(screen.getByTestId('redefinir-erro').textContent).toBe(esperada)
      expect(botaoEnviar().disabled).toBe(false)
    })
  }

  // Token lido da URL e senha sem alteração, numa única chamada (16.5).
  expect(resetPassword).toHaveBeenCalledTimes(1)
  expect(resetPassword).toHaveBeenCalledWith(token, senha)
  return document.body.textContent
}

// Texto fixo de todas as variações da tela, obtido com segredos sentinela. Um
// token ou senha gerado que já seja trecho desse texto (ex.: a senha
// "password") apareceria na tela sem ter sido interpolado, então esses casos
// são descartados com `fc.pre`.
async function textoFixoDaTela() {
  const tokenSentinela = 'SENTINELA_token_0123456789abcdefghijklmnopq'
  const casos = [
    ...DESFECHOS.map((desfecho) => ['Sentinela#Senha!2024', desfecho]),
    ['Sn#7!x', 'ok'],
  ]
  const textos = []
  for (const [senha, desfecho] of casos) {
    try {
      textos.push(await executarRedefinicao(tokenSentinela, senha, desfecho))
    } finally {
      cleanup()
    }
  }
  // Separador fora do alfabeto gerado: nenhuma busca atravessa dois textos.
  return textos.join('\u0000')
}

// --- propriedades ----------------------------------------------------------

describe('Property 30: Telas renderizam o Perfil_Publico e não vazam segredos', () => {
  it(
    'a Tela_Perfil exibe os dados do Perfil_Publico e os botões de administração conforme os flags',
    async () => {
      await fc.assert(
        fc.asyncProperty(perfilArb, async (perfil) => {
          vi.mocked(loadProfile).mockReset()
          vi.mocked(loadProfile).mockResolvedValue(perfil)
          try {
            const { container } = render(
              <Profile path="/profile" onNavigate={vi.fn()} onSignOut={vi.fn()} />,
            )

            const bloco = await waitFor(() => {
              const elemento = container.querySelector('.profile-user')
              expect(elemento).not.toBeNull()
              return elemento
            })

            // Uma requisição por abertura de `/profile` (6.1).
            expect(loadProfile).toHaveBeenCalledTimes(1)
            expect(screen.queryByTestId('perfil-carregando')).toBeNull()
            expect(screen.queryByTestId('perfil-erro')).toBeNull()

            // Nome, `@` + username e e-mail do Perfil_Publico, sem dados fixos (6.3).
            expect(bloco.querySelector('strong').textContent).toBe(perfil.name)
            const linhas = bloco.querySelectorAll('small')
            expect(linhas[0].textContent).toBe(`@${perfil.username}`)
            expect(linhas[1].textContent).toBe(perfil.email)

            // Descrição somente quando não vazia (6.3).
            const descricao = bloco.querySelector('.profile-description')
            if (perfil.description.length > 0) {
              expect(descricao?.textContent).toBe(perfil.description)
            } else {
              expect(descricao).toBeNull()
              expect(linhas).toHaveLength(2)
            }

            // Foto quando presente; avatar padrão (inicial do nome) quando vazia (6.4).
            const foto = bloco.querySelector('img')
            if (perfil.photo !== '') {
              expect(foto).not.toBeNull()
              expect(foto.getAttribute('src')).toBe(perfil.photo)
              expect(foto.getAttribute('alt')).toBe(`Foto de perfil de ${perfil.name}`)
            } else {
              expect(foto).toBeNull()
              const avatar = bloco.querySelector('.profile-avatar')
              expect(avatar).not.toBeNull()
              expect(avatar.getAttribute('aria-hidden')).toBe('true')
              expect(avatar.textContent).toBe(perfil.name.trim().charAt(0).toUpperCase())
            }

            // Botões de administração se e somente se os flags são verdadeiros (6.5).
            const administrarComunidades = screen.queryByRole('button', {
              name: /Administrar comunidades/,
            })
            const administracaoSistema = screen.queryByRole('button', {
              name: /Administração do sistema/,
            })
            expect(administrarComunidades !== null).toBe(perfil.isCommunityAdmin)
            expect(administracaoSistema !== null).toBe(perfil.isSystemAdmin)
          } finally {
            cleanup()
          }
        }),
        { numRuns: NUM_RUNS },
      )
    },
    LIMITE_MS,
  )

  it(
    'o texto da Tela_Redefinir_Senha nunca contém o token nem a senha, em qualquer desfecho',
    async () => {
      const textoFixo = await textoFixoDaTela()

      await fc.assert(
        fc.asyncProperty(tokenArb, senhaArb, desfechoArb, async (token, senha, desfecho) => {
          fc.pre(!textoFixo.includes(token) && !textoFixo.includes(senha))
          try {
            const texto = await executarRedefinicao(token, senha, desfecho)
            // Nenhuma mensagem interpola o token nem a senha (16.13).
            expect(texto.includes(token)).toBe(false)
            expect(texto.includes(senha)).toBe(false)
          } finally {
            cleanup()
          }
        }),
        { numRuns: NUM_RUNS },
      )
    },
    LIMITE_MS,
  )
})
