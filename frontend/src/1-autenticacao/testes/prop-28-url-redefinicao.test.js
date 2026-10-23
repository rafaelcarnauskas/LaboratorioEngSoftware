// Property 28: Leitura da URL de redefinição.
// **Validates: Requisitos 16.1, 16.8**
//
// O link do Backend tem a forma `?tela=redefinir-senha&token={token}`. Para
// qualquer token não vazio (inclusive com caracteres que exigem codificação),
// `lerRedefinicaoDaUrl` devolve `{ token }` já decodificado; sem token ou com
// valor vazio devolve `{ token: null }`; com qualquer outra `tela` (ou nenhuma)
// devolve `null`, deixando a URL para `parseUrl`.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { lerRedefinicaoDaUrl, TELA_REDEFINIR_SENHA } from '../modelo/redefinicao'

const RUNS = { numRuns: 200 }

// ---------------------------------------------------------------------------
// Oráculo independente (não usa URLSearchParams): segue a decodificação
// application/x-www-form-urlencoded — separa por `&`, divide cada par no
// primeiro `=`, troca `+` por espaço e aplica decodeURIComponent. Vale a
// primeira ocorrência de cada chave.
// ---------------------------------------------------------------------------
function decodificar(parte) {
  return decodeURIComponent(parte.replace(/\+/g, ' '))
}

function oraculoParametro(query, chave) {
  const corpo = query.startsWith('?') ? query.slice(1) : query
  for (const par of corpo.split('&')) {
    if (par === '') continue
    const i = par.indexOf('=')
    const nome = decodificar(i === -1 ? par : par.slice(0, i))
    if (nome === chave) return i === -1 ? '' : decodificar(par.slice(i + 1))
  }
  return null
}

function oraculo(query) {
  if (oraculoParametro(query, 'tela') !== TELA_REDEFINIR_SENHA) return null
  const token = oraculoParametro(query, 'token')
  return { token: token === null || token === '' ? null : token }
}

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

// Pedaços "difíceis": separadores da query, `+`, `%`, sequências que parecem
// já codificadas, espaços e unicode (acentos, emoji, CJK).
const pedacoEspecial = fc.constantFrom(
  '&', '=', '+', '%', '?', '#', '/', ' ', '%20', '%2B', '%25', '&token=x',
  'tela=home', 'é', 'ç', 'ñ', '😀', '中文', '\u00a0', '-', '_', '.', '~',
)

const pedaco = fc.oneof(
  pedacoEspecial,
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 4 }),
  fc.string({ unit: 'binary-ascii', minLength: 1, maxLength: 4 }),
)

// Token não vazio com mistura de caracteres comuns e especiais.
const tokenArb = fc
  .array(pedaco, { minLength: 1, maxLength: 8 })
  .map((partes) => partes.join(''))
  .filter((t) => t.length > 0)

// Duas formas de codificar valores: encodeURIComponent (espaço → %20) e a
// serialização do URLSearchParams (espaço → `+`).
const codificador = fc.constantFrom(
  (v) => encodeURIComponent(v),
  (v) => new URLSearchParams([['k', v]]).toString().slice(2),
)

// Parâmetros extras cujo nome (decodificado) não é `tela` nem `token`.
const nomeExtraArb = fc
  .oneof(
    fc.constantFrom('page', 'community', 'find', 'utm_source', 'q', 'Tela', 'TOKEN', 'tokens'),
    fc.string({ unit: 'grapheme', minLength: 1, maxLength: 6 }),
  )
  .filter((nome) => nome !== 'tela' && nome !== 'token')

const extraArb = fc.record({ nome: nomeExtraArb, valor: fc.string({ unit: 'grapheme', maxLength: 6 }) })
const extrasArb = fc.array(extraArb, { maxLength: 4 })

// `tela` diferente de `redefinir-senha`: quase iguais, telas conhecidas e
// strings arbitrárias.
const outraTelaArb = fc
  .oneof(
    fc.constantFrom(
      'home', 'login', 'perfil', '', 'Redefinir-senha', 'REDEFINIR-SENHA', 'redefinir_senha',
      'redefinir-senha ', ' redefinir-senha', 'redefinir-senhas', 'redefinir', 'redefinir senha',
    ),
    fc.string({ unit: 'grapheme', maxLength: 20 }),
  )
  .filter((tela) => tela !== TELA_REDEFINIR_SENHA)

const prefixoArb = fc.constantFrom('?', '')

// Monta a query a partir de pares [nome, valor | undefined] em ordem aleatória.
// `valor === undefined` gera o par sem `=` (ex.: `&token`).
function montarQuery(prefixo, pares, codificar) {
  const corpo = pares
    .map(([nome, valor]) => (valor === undefined ? codificar(nome) : `${codificar(nome)}=${codificar(valor)}`))
    .join('&')
  return prefixo + corpo
}

// Embaralha os pares obrigatórios junto com os extras.
function paresEmbaralhados(obrigatorios, extrasArbitrary) {
  return extrasArbitrary.chain((extras) => {
    const todos = [...obrigatorios, ...extras.map(({ nome, valor }) => [nome, valor])]
    return fc.shuffledSubarray(todos, { minLength: todos.length, maxLength: todos.length })
  })
}

// ---------------------------------------------------------------------------
// Propriedades
// ---------------------------------------------------------------------------

describe('Property 28: Leitura da URL de redefinição', () => {
  it('link exato do Backend devolve { token } decodificado', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        const query = `?tela=redefinir-senha&token=${encodeURIComponent(token)}`
        expect(lerRedefinicaoDaUrl(query)).toEqual({ token })
      }),
      RUNS,
    )
  })

  it('token não vazio é lido com ou sem `?`, com extras em qualquer ordem e qualquer codificação', () => {
    const cenario = tokenArb.chain((token) =>
      fc.record({
        token: fc.constant(token),
        prefixo: prefixoArb,
        codificar: codificador,
        pares: paresEmbaralhados([['tela', TELA_REDEFINIR_SENHA], ['token', token]], extrasArb),
      }),
    )
    fc.assert(
      fc.property(cenario, ({ token, prefixo, codificar, pares }) => {
        const query = montarQuery(prefixo, pares, codificar)
        const resultado = lerRedefinicaoDaUrl(query)
        expect(resultado).toEqual({ token })
        expect(resultado).toEqual(oraculo(query))
      }),
      RUNS,
    )
  })

  it('sem o parâmetro token, ou com valor vazio, devolve { token: null }', () => {
    // 'ausente' omite o par; 'vazio' gera `token=`; 'semIgual' gera `token`.
    const formaToken = fc.constantFrom('ausente', 'vazio', 'semIgual')
    const cenario = formaToken.chain((forma) => {
      const obrigatorios = [['tela', TELA_REDEFINIR_SENHA]]
      if (forma === 'vazio') obrigatorios.push(['token', ''])
      if (forma === 'semIgual') obrigatorios.push(['token', undefined])
      return fc.record({
        prefixo: prefixoArb,
        codificar: codificador,
        pares: paresEmbaralhados(obrigatorios, extrasArb),
      })
    })
    fc.assert(
      fc.property(cenario, ({ prefixo, codificar, pares }) => {
        const query = montarQuery(prefixo, pares, codificar)
        const resultado = lerRedefinicaoDaUrl(query)
        expect(resultado).toEqual({ token: null })
        expect(resultado).toEqual(oraculo(query))
      }),
      RUNS,
    )
  })

  it('qualquer outra tela (ou nenhuma) devolve null, mesmo com token presente', () => {
    const cenario = fc
      .record({
        tela: fc.option(outraTelaArb, { nil: null }),
        token: fc.option(tokenArb, { nil: null }),
      })
      .chain(({ tela, token }) => {
        const obrigatorios = []
        if (tela !== null) obrigatorios.push(['tela', tela])
        if (token !== null) obrigatorios.push(['token', token])
        return fc.record({
          prefixo: prefixoArb,
          codificar: codificador,
          pares: paresEmbaralhados(obrigatorios, extrasArb),
        })
      })
    fc.assert(
      fc.property(cenario, ({ prefixo, codificar, pares }) => {
        const query = montarQuery(prefixo, pares, codificar)
        expect(lerRedefinicaoDaUrl(query)).toBeNull()
        expect(oraculo(query)).toBeNull()
      }),
      RUNS,
    )
  })

  it('null, undefined e query vazia são tratados como ausência de tela', () => {
    expect(lerRedefinicaoDaUrl(null)).toBeNull()
    expect(lerRedefinicaoDaUrl(undefined)).toBeNull()
    expect(lerRedefinicaoDaUrl('')).toBeNull()
    expect(lerRedefinicaoDaUrl('?')).toBeNull()
  })
})
