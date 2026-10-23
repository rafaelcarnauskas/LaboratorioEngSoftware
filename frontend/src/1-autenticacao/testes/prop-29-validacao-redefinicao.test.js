// Property 29: Validação local da Tela_Redefinir_Senha.
// **Validates: Requisitos 16.4**
//
// Para qualquer par (nova senha, confirmação), a função de validação do
// formulário de `ResetPassword.jsx` permite o envio se e somente se
// `8 ≤ nova.length ≤ 128` e `confirmação === nova`, e devolve o erro de tamanho
// ou de confirmação conforme a regra violada.
//
// Sobre `length`: o design fixa `nova.length`, que em JS conta unidades UTF-16
// (um emoji fora do BMP vale 2). O oráculo segue o design, e os geradores
// incluem caracteres astrais para que essa contagem seja de fato exercitada.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { validarRedefinicao as validarDaTela } from '../telas/ResetPassword'
import {
  MENSAGEM_CONFIRMACAO_DIFERENTE,
  MENSAGEM_TAMANHO_SENHA,
  TAMANHO_MAXIMO_SENHA,
  TAMANHO_MINIMO_SENHA,
  validarRedefinicao,
} from '../modelo/redefinicao'

const RUNS = { numRuns: 300 }

// ---------------------------------------------------------------------------
// Oráculo (escrito a partir do design, não do código)
// ---------------------------------------------------------------------------
function oraculo(nova, confirmacao) {
  const n = typeof nova === 'string' ? nova : ''
  const c = typeof confirmacao === 'string' ? confirmacao : ''
  const erros = {}
  if (!(n.length >= 8 && n.length <= 128)) erros.password = MENSAGEM_TAMANHO_SENHA
  if (c !== n) erros.confirmPassword = MENSAGEM_CONFIRMACAO_DIFERENTE
  return erros
}

const podeEnviar = (erros) => !erros.password && !erros.confirmPassword

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

// Unidades variadas: ASCII, unicode do BMP, emoji (par substituto), espaços e
// caracteres invisíveis que costumam enganar comparações.
const unidade = fc.oneof(
  fc.string({ unit: 'binary-ascii', minLength: 1, maxLength: 1 }),
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
  fc.constantFrom('a', 'A', ' ', '\t', '\n', 'é', 'e\u0301', 'ß', '😀', '🔑', '中', '\u200b', '\u00a0', '\0'),
)

// Senha com tamanho (em `length`) concentrado nas bordas 7/8/9 e 127/128/129,
// mas também curta, vazia e longa. Gera por partes e corta/completa até o
// tamanho alvo com ASCII, para não depender de quantas unidades cada parte tem.
const tamanhoAlvo = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(0, 1, 7, 8, 9, 64, 127, 128, 129, 200) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 160 }) },
)

const senhaArb = fc
  .record({
    alvo: tamanhoAlvo,
    partes: fc.array(unidade, { maxLength: 40 }),
    preenchimento: fc.constantFrom('x', '0', ' ', '#'),
  })
  .map(({ alvo, partes, preenchimento }) => {
    let s = partes.join('')
    // Corta sem partir um par substituto ao meio só quando cabe; se cortar no
    // meio, o resultado ainda é uma string JS válida para o teste.
    if (s.length > alvo) s = s.slice(0, alvo)
    while (s.length < alvo) s += preenchimento
    return s
  })

// Confirmações "quase iguais" à nova senha: idêntica, com uma unidade a mais
// ou a menos, trocada, com caixa diferente, com espaços nas pontas, em forma
// unicode diferente ou totalmente aleatória.
function confirmacaoPara(nova) {
  return fc.oneof(
    { weight: 4, arbitrary: fc.constant(nova) },
    fc.constant(nova + 'x'),
    fc.constant(nova.slice(0, -1)),
    fc.constant(nova.slice(1)),
    fc.constant(` ${nova}`),
    fc.constant(`${nova} `),
    fc.constant(nova.toUpperCase()),
    fc.constant(nova.normalize('NFD')),
    fc.constant(''),
    fc.nat({ max: Math.max(nova.length - 1, 0) }).map((i) => {
      if (nova.length === 0) return 'z'
      const trocado = nova[i] === 'q' ? 'r' : 'q'
      return nova.slice(0, i) + trocado + nova.slice(i + 1)
    }),
    senhaArb,
  )
}

const parArb = senhaArb.chain((nova) =>
  fc.record({ nova: fc.constant(nova), confirmacao: confirmacaoPara(nova) }),
)

// Valores que não são string (o formulário só passa strings, mas a função
// trata o resto como '').
const naoStringArb = fc.oneof(
  fc.constantFrom(undefined, null, true, false, 0, 12345678, NaN),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.object({ maxDepth: 1 }),
)

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('Property 29: Validação local da Tela_Redefinir_Senha', () => {
  it('ResetPassword.jsx usa a mesma função de validação do modelo', () => {
    expect(validarDaTela).toBe(validarRedefinicao)
  })

  it('os limites do modelo são 8 e 128', () => {
    expect(TAMANHO_MINIMO_SENHA).toBe(8)
    expect(TAMANHO_MAXIMO_SENHA).toBe(128)
  })

  it('permite o envio sse 8 ≤ nova.length ≤ 128 e confirmação === nova, com o erro da regra violada', () => {
    fc.assert(
      fc.property(parArb, ({ nova, confirmacao }) => {
        const erros = validarRedefinicao(nova, confirmacao)

        // Resultado exato: só as chaves das regras violadas, com a mensagem certa.
        expect(erros).toEqual(oraculo(nova, confirmacao))

        const tamanhoOk = nova.length >= 8 && nova.length <= 128
        const confirmacaoOk = confirmacao === nova
        expect(podeEnviar(erros)).toBe(tamanhoOk && confirmacaoOk)
        expect('password' in erros).toBe(!tamanhoOk)
        expect('confirmPassword' in erros).toBe(!confirmacaoOk)
      }),
      RUNS,
    )
  })

  it('pares arbitrários e independentes seguem o oráculo', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 140 }), fc.string({ maxLength: 140 }), (nova, confirmacao) => {
        expect(validarRedefinicao(nova, confirmacao)).toEqual(oraculo(nova, confirmacao))
      }),
      RUNS,
    )
  })

  it('valores que não são string valem como vazio', () => {
    fc.assert(
      fc.property(
        fc.oneof(naoStringArb, senhaArb),
        fc.oneof(naoStringArb, senhaArb),
        (nova, confirmacao) => {
          fc.pre(typeof nova !== 'string' || typeof confirmacao !== 'string')
          const erros = validarRedefinicao(nova, confirmacao)
          expect(erros).toEqual(oraculo(nova, confirmacao))
          // Nova senha que não é string nunca permite o envio.
          if (typeof nova !== 'string') expect(erros.password).toBe(MENSAGEM_TAMANHO_SENHA)
        },
      ),
      RUNS,
    )
  })

  it('as mensagens nunca contêm os valores digitados', () => {
    // Só valores que não aparecem por acaso nas mensagens fixas.
    const segredo = senhaArb.filter(
      (s) =>
        s.trim().length >= 3 &&
        !MENSAGEM_TAMANHO_SENHA.includes(s) &&
        !MENSAGEM_CONFIRMACAO_DIFERENTE.includes(s),
    )
    fc.assert(
      fc.property(segredo, segredo, (nova, confirmacao) => {
        for (const mensagem of Object.values(validarRedefinicao(nova, confirmacao))) {
          expect(mensagem.includes(nova)).toBe(false)
          expect(mensagem.includes(confirmacao)).toBe(false)
        }
      }),
      RUNS,
    )
  })

  it('exemplos nas bordas', () => {
    expect(validarRedefinicao('x'.repeat(7), 'x'.repeat(7))).toEqual({ password: MENSAGEM_TAMANHO_SENHA })
    expect(validarRedefinicao('x'.repeat(8), 'x'.repeat(8))).toEqual({})
    expect(validarRedefinicao('x'.repeat(128), 'x'.repeat(128))).toEqual({})
    expect(validarRedefinicao('x'.repeat(129), 'x'.repeat(129))).toEqual({ password: MENSAGEM_TAMANHO_SENHA })
    expect(validarRedefinicao('senha-boa', 'senha-Boa')).toEqual({
      confirmPassword: MENSAGEM_CONFIRMACAO_DIFERENTE,
    })
    expect(validarRedefinicao('', 'x')).toEqual({
      password: MENSAGEM_TAMANHO_SENHA,
      confirmPassword: MENSAGEM_CONFIRMACAO_DIFERENTE,
    })
  })
})
