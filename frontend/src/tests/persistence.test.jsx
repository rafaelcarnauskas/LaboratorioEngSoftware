// Properties 10, 11, 12, 13, 19 e 29 do design: o contrato de persistência
// compartilhado pelos cinco hooks de armazenamento.
//
// Todos seguem a mesma forma (`load` validando na entrada, `write` em
// try/catch na saída), então as Properties 11, 12 e 13 são escritas uma única
// vez sobre uma tabela de hooks, em vez de repetidas por chave. O que cada
// hook tem de próprio fica nos campos da tabela: o gerador de estado válido,
// a mutação que exercita a escrita e os payloads inválidos de borda.
//
// O estado padrão de cada chave não é duplicado aqui: ele é lido do próprio
// hook com o armazenamento vazio. Assim a Property 12 compara contra o padrão
// de verdade, sem repetir constantes que o hook já define.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import fc from 'fast-check'
import useLists from '../4-busca-listas/modelo/useLists'
import useCommunities from '../2-comunidades/modelo/useCommunities'
import useHistory, { MAX_EVENT_SECONDS } from '../5-historico/modelo/useHistory'
import useMyTime, { limitOptions } from '../5-historico/modelo/useMyTime'
import useCommunityNiches from '../2-comunidades/modelo/useCommunityNiches'
import { communities } from '../2-comunidades/modelo/communities'
import { finds } from '../3-videos/modelo/finds'
import { installLocalStorageStub } from './helpers/localStorageStub'

const RUNS = 100

let stub = null
let restoreStorage = null

beforeEach(() => {
  const installed = installLocalStorageStub()
  stub = installed.storage
  restoreStorage = installed.restore
})

afterEach(() => {
  restoreStorage?.()
  stub = null
  restoreStorage = null
})

// --- geradores de estado válido -----------------------------------------

const wordArb = fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd', 'e'), minLength: 1, maxLength: 10 })

const listArb = fc.record({
  id: wordArb,
  name: fc.string({ unit: fc.constantFrom('a', 'b', ' '), minLength: 1, maxLength: 20 }).map((value) => `l${value}`),
  description: fc.string({ unit: fc.constantFrom('x', ' '), maxLength: 40 }),
  tone: fc.constantFrom('gold', 'blue', 'green', 'purple'),
  updatedAt: fc.integer({ min: 0, max: 1_000_000 }),
  videoIds: fc.uniqueArray(fc.integer({ min: 1, max: 9 }), { maxLength: 5 }),
})

const validListsArb = fc.uniqueArray(listArb, { maxLength: 4, selector: (list) => list.id })

const knownCommunityIds = communities.map((community) => community.id)
const knownFindIds = finds.map((find) => find.id)

const validEventArb = fc.record({
  findId: fc.constantFrom(...knownFindIds),
  watchedAt: fc.integer({ min: 1, max: 2_000_000_000_000 }),
  seconds: fc.integer({ min: 1, max: 90 }),
})

const validEventsArb = fc
  .uniqueArray(validEventArb, { maxLength: 6, selector: (event) => event.findId })
  .map((events) => [...events].sort((a, b) => b.watchedAt - a.watchedAt))

// --- tabela de hooks -----------------------------------------------------

// Payloads que violam o esquema de QUALQUER uma das cinco chaves: JSON
// malformado e valores JSON de tipo errado. Serve de base comum, somada aos
// payloads de borda específicos de cada chave.
const corruptedPayloadArb = fc.constantFrom(
  '{',
  '[',
  '{"a":',
  '[1,',
  '}',
  'undefined',
  'NaN',
  "{'a':1}",
  '',
  'null',
  '0',
  '3.5',
  '"texto"',
  'true',
  'false',
  '[1,2,3]',
  '[null]',
  '[[]]',
  '{"a":1}',
  '{"a":"b"}',
)

function json(value) {
  return JSON.stringify(value)
}

const tooManyEvents = Array.from({ length: 101 }, (_, index) => ({
  findId: `find-${index}`,
  watchedAt: index + 1,
  seconds: 10,
}))

const hookSpecs = [
  {
    label: 'useLists',
    key: 'choosen.lists.v1',
    hook: useLists,
    select: (state) => state.lists,
    // Grava um estado válido inteiro pela API do hook.
    write: (result, lists) => act(() => result.current.updateLists(lists)),
    stateArb: validListsArb,
    mutate: (result) => {
      const next = [{ id: 'novo', name: 'Nova lista', description: '', tone: 'gold', updatedAt: 9, videoIds: [1] }]
      act(() => result.current.updateLists(next))
      return next
    },
    edgeInvalid: [
      json([{ id: 'a', name: '   ', description: '', tone: 'gold', updatedAt: 1, videoIds: [] }]),
      json([{ id: 'a', name: 'n'.repeat(61), description: '', tone: 'gold', updatedAt: 1, videoIds: [] }]),
      json([{ id: 'a', name: 'ok', description: 'd'.repeat(181), tone: 'gold', updatedAt: 1, videoIds: [] }]),
      json([{ id: 'a', name: 'ok', description: '', tone: 'red', updatedAt: 1, videoIds: [] }]),
      json([{ id: 'a', name: 'ok', description: '', tone: 'gold', updatedAt: null, videoIds: [] }]),
      json([{ id: 'a', name: 'ok', description: '', tone: 'gold', updatedAt: 1, videoIds: [1.5] }]),
      json([{ id: 'a', name: 'ok', description: '', tone: 'gold', updatedAt: 1, videoIds: [1, 1] }]),
      json([
        { id: 'a', name: 'ok', description: '', tone: 'gold', updatedAt: 1, videoIds: [] },
        { id: 'a', name: 'ok', description: '', tone: 'blue', updatedAt: 2, videoIds: [] },
      ]),
      json([{ id: '', name: 'ok', description: '', tone: 'gold', updatedAt: 1, videoIds: [] }]),
    ],
  },
  {
    label: 'useCommunities',
    key: 'choosen.communities.v1',
    hook: useCommunities,
    select: (state) => state.memberships,
    write: (result, ids) => {
      for (const communityId of ids) {
        act(() => result.current.joinCommunity(communityId))
      }
    },
    stateArb: fc.uniqueArray(fc.constantFrom(...knownCommunityIds), { maxLength: 3 }),
    mutate: (result) => {
      act(() => result.current.joinCommunity(knownCommunityIds[0]))
      return [knownCommunityIds[0]]
    },
    assertMutated: (result, [communityId]) => {
      expect(result.current.memberships.map((membership) => membership.id)).toEqual([communityId])
    },
    edgeInvalid: [
      json([{ id: '', joinedAt: 1 }]),
      json([{ id: 'poli-usp' }]),
      json([{ id: 'poli-usp', joinedAt: 'ontem' }]),
      json([{ id: 'poli-usp', joinedAt: 1 }, { id: 'poli-usp', joinedAt: 2 }]),
      json([{ joinedAt: 1 }]),
    ],
  },
  {
    label: 'useHistory',
    key: 'choosen.history.v1',
    hook: useHistory,
    select: (state) => state.events,
    write: (result, events) => {
      // Do mais antigo para o mais recente: mergeEvent reordena por watchedAt.
      for (const event of [...events].reverse()) {
        act(() => result.current.recordView(event.findId, event.seconds, event.watchedAt))
      }
    },
    stateArb: validEventsArb,
    mutate: (result) => {
      act(() => result.current.recordView(knownFindIds[0], 12, 1_700_000_000_000))
      return [{ findId: knownFindIds[0], watchedAt: 1_700_000_000_000, seconds: 12 }]
    },
    edgeInvalid: [
      json([{ findId: '', watchedAt: 1, seconds: 1 }]),
      json([{ findId: 'sports-1', watchedAt: 0, seconds: 1 }]),
      json([{ findId: 'sports-1', watchedAt: -5, seconds: 1 }]),
      json([{ findId: 'sports-1', watchedAt: 1, seconds: 0 }]),
      json([{ findId: 'sports-1', watchedAt: 1, seconds: 1.5 }]),
      json([{ findId: 'sports-1', watchedAt: 1, seconds: MAX_EVENT_SECONDS + 1 }]),
      json([{ findId: 'sports-1', watchedAt: 1, seconds: 10 }, { findId: 'sports-1', watchedAt: 2, seconds: 10 }]),
      json(tooManyEvents),
    ],
  },
  {
    label: 'useMyTime',
    key: 'choosen.mytime.v1',
    hook: useMyTime,
    select: (state) => state.settings,
    write: (result, settings) => act(() => result.current.updateSettings(settings)),
    stateArb: fc.record({
      dailyLimit: fc.constantFrom(...limitOptions),
      reminders: fc.record({ bedtime: fc.boolean(), screenTime: fc.boolean(), weekly: fc.boolean() }),
    }),
    mutate: (result) => {
      const current = result.current.settings.dailyLimit
      const next = limitOptions.find((option) => option !== current)
      act(() => result.current.setDailyLimit(next))
      return next
    },
    assertMutated: (result, next) => {
      expect(result.current.settings.dailyLimit).toBe(next)
    },
    edgeInvalid: [
      json({ dailyLimit: 61, reminders: { bedtime: true, screenTime: true, weekly: false } }),
      json({ dailyLimit: 60, reminders: { bedtime: true, screenTime: true } }),
      json({ dailyLimit: 60, reminders: { bedtime: true, screenTime: true, weekly: false, extra: true } }),
      json({ dailyLimit: 60, reminders: { bedtime: 'sim', screenTime: true, weekly: false } }),
      json({ dailyLimit: 60, reminders: null }),
      json({ reminders: { bedtime: true, screenTime: true, weekly: false } }),
    ],
  },
  {
    label: 'useCommunityNiches',
    key: 'choosen.communityNiches.v1',
    hook: useCommunityNiches,
    select: (state) => state.nichesByCommunity,
    write: (result, map) => {
      for (const [communityId, niches] of Object.entries(map)) {
        for (const nicheId of niches) {
          act(() => result.current.toggleNiche(communityId, nicheId))
        }
      }
    },
    stateArb: fc
      .tuple(
        ...communities.map((community) =>
          fc.uniqueArray(fc.constantFrom(...community.niches.map((niche) => niche.id)), { maxLength: 3 }),
        ),
      )
      .map((selections) =>
        Object.fromEntries(
          communities
            .map((community, index) => [community.id, selections[index]])
            .filter(([, niches]) => niches.length > 0),
        ),
      ),
    mutate: (result) => {
      const [community] = communities
      const nicheId = community.niches[0].id
      act(() => result.current.toggleNiche(community.id, nicheId))
      return { [community.id]: [nicheId] }
    },
    edgeInvalid: [
      json({ 'poli-usp': 'basquete' }),
      json({ 'poli-usp': [1] }),
      json({ 'poli-usp': [''] }),
      json({ 'poli-usp': [null] }),
      json({ 'poli-usp': ['basquete'], 'judo-brasil': 42 }),
    ],
  },
]

// Estado padrão real da chave: o que o hook devolve com armazenamento vazio.
function defaultStateFor(spec) {
  stub.reset()
  const { result, unmount } = renderHook(() => spec.hook())
  const value = spec.select(result.current)
  expect(result.current.storageError).toBe('')
  unmount()
  return value
}

describe.each(hookSpecs)('$label', (spec) => {
  // **Property 11: Persistência faz round-trip nas quatro chaves**
  //
  // **Validates: Requirements 5.1, 5.2, 6.3, 6.4, 8.8, 8.9, 8.10, 9.4, 10.11, 10.12**
  it('devolve um estado equivalente na sessão seguinte, com storageError vazio', () => {
    fc.assert(
      fc.property(spec.stateArb, (state) => {
        stub.reset()

        const first = renderHook(() => spec.hook())
        spec.write(first.result, state)
        const written = spec.select(first.result.current)
        expect(first.result.current.storageError).toBe('')
        first.unmount()

        // Sessão seguinte: mesmo armazenamento, hook montado de novo.
        const second = renderHook(() => spec.hook())
        expect(spec.select(second.result.current)).toEqual(written)
        expect(second.result.current.storageError).toBe('')
        second.unmount()
      }),
      { numRuns: RUNS },
    )
  })

  // **Property 12: Leitura de payload inválido devolve o padrão sem lançar**
  //
  // **Validates: Requirements 5.4, 6.5, 8.12, 9.8, 10.15**
  it('cai no estado padrão com Erro_Armazenamento quando o payload viola o esquema', () => {
    const payloadArb = fc.oneof(corruptedPayloadArb, fc.constantFrom(...spec.edgeInvalid))

    fc.assert(
      fc.property(payloadArb, (payload) => {
        const fallback = defaultStateFor(spec)

        stub.reset()
        stub.seed({ [spec.key]: payload })

        // Montar o hook não propaga exceção: o load trata tudo em try/catch.
        const { result, unmount } = renderHook(() => spec.hook())

        expect(spec.select(result.current)).toEqual(fallback)
        expect(result.current.storageError).not.toBe('')

        unmount()
      }),
      { numRuns: RUNS },
    )
  })

  // **Property 13: Falha de escrita preserva o estado em memória**
  //
  // **Validates: Requirements 5.5, 6.6, 8.13, 9.9, 10.16**
  it('mantém o estado novo em memória e reporta Erro_Armazenamento quando setItem lança', () => {
    stub.reset()
    const { result, unmount } = renderHook(() => spec.hook())

    stub.breakWrites()
    const expected = spec.mutate(result)

    if (spec.assertMutated) {
      spec.assertMutated(result, expected)
    } else {
      expect(spec.select(result.current)).toEqual(expected)
    }
    expect(result.current.storageError).not.toBe('')
    // Nada foi gravado: a chave continua ausente do armazenamento.
    expect(stub.raw(spec.key)).toBeNull()

    unmount()
  })
})

// --- Property 19 ---------------------------------------------------------

describe('useHistory.clearHistory', () => {
  // **Property 19: Limpar histórico esvazia memória e armazenamento, de forma
  // idempotente**
  //
  // **Validates: Requirements 6.10**
  it('esvazia eventos e armazenamento, e a segunda limpeza dá o mesmo resultado', () => {
    fc.assert(
      fc.property(validEventsArb, (events) => {
        stub.reset()
        stub.seed({ 'choosen.history.v1': JSON.stringify(events) })

        const { result, unmount } = renderHook(() => useHistory())
        expect(result.current.events).toEqual(events)

        act(() => result.current.clearHistory())
        expect(result.current.events).toEqual([])
        expect(result.current.storageError).toBe('')
        expect(stub.raw('choosen.history.v1')).toBeNull()

        act(() => result.current.clearHistory())
        expect(result.current.events).toEqual([])
        expect(result.current.storageError).toBe('')
        expect(stub.raw('choosen.history.v1')).toBeNull()

        unmount()
      }),
      { numRuns: RUNS },
    )
  })

  it('esvazia a memória e reporta erro quando removeItem lança', () => {
    stub.reset()
    stub.seed({ 'choosen.history.v1': JSON.stringify([{ findId: 'sports-1', watchedAt: 10, seconds: 5 }]) })

    const { result, unmount } = renderHook(() => useHistory())
    stub.breakRemoves()

    act(() => result.current.clearHistory())
    expect(result.current.events).toEqual([])
    expect(result.current.storageError).not.toBe('')

    unmount()
  })
})

// --- Property 29 ---------------------------------------------------------

const membershipCommandArb = fc.record({
  kind: fc.constantFrom('join', 'leave'),
  communityId: fc.oneof(
    fc.constantFrom(...knownCommunityIds),
    fc.constantFrom('comunidade-extinta', 'clube-antigo', ''),
  ),
})

// Oráculo independente: o último comando de cada id do catálogo decide.
function expectedMemberships(commands) {
  const known = new Set(knownCommunityIds)
  const joined = new Set()

  for (const { kind, communityId } of commands) {
    if (!known.has(communityId)) continue
    if (kind === 'join') joined.add(communityId)
    else joined.delete(communityId)
  }

  return joined
}

describe('useCommunities', () => {
  // **Property 29: Adesões mantêm unicidade e ignoram comunidade desconhecida**
  //
  // **Validates: Requirements 9.2, 9.3, 9.5, 9.6, 9.7**
  it('guarda no máximo uma adesão por id, só do catálogo, decidida pelo último comando', () => {
    fc.assert(
      fc.property(fc.array(membershipCommandArb, { maxLength: 15 }), (commands) => {
        stub.reset()

        const { result, unmount } = renderHook(() => useCommunities())

        for (const { kind, communityId } of commands) {
          act(() => {
            if (kind === 'join') result.current.joinCommunity(communityId)
            else result.current.leaveCommunity(communityId)
          })
        }

        const ids = result.current.memberships.map((membership) => membership.id)

        expect(new Set(ids).size).toBe(ids.length)
        expect(new Set(ids)).toEqual(expectedMemberships(commands))
        for (const id of ids) {
          expect(knownCommunityIds).toContain(id)
        }
        expect(result.current.storageError).toBe('')

        unmount()
      }),
      { numRuns: RUNS },
    )
  })

  it('descarta adesão de comunidade fora do catálogo sem reportar erro', () => {
    const payloadArb = fc.uniqueArray(
      fc.record({
        id: fc.oneof(fc.constantFrom(...knownCommunityIds), fc.constantFrom('comunidade-extinta', 'clube-antigo')),
        joinedAt: fc.integer({ min: 1, max: 2_000_000_000_000 }),
      }),
      { maxLength: 5, selector: (membership) => membership.id },
    )

    fc.assert(
      fc.property(payloadArb, (memberships) => {
        stub.reset()
        stub.seed({ 'choosen.communities.v1': JSON.stringify(memberships) })

        const { result, unmount } = renderHook(() => useCommunities())

        expect(result.current.storageError).toBe('')
        expect(result.current.memberships).toEqual(
          memberships.filter((membership) => knownCommunityIds.includes(membership.id)),
        )

        unmount()
      }),
      { numRuns: RUNS },
    )
  })
})

// --- Property 10 ---------------------------------------------------------

// O limite de nome e de descrição é aplicado na validação de leitura de
// `choosen.lists.v1` (o formulário da Tela_Lists repete o mesmo limite com
// `maxLength` e com o `trim` antes de salvar). Gerar em volta das bordas 60 e
// 180 é o que faz a propriedade valer como "se e somente se".
const boundedNameArb = fc.oneof(
  fc.string({ unit: fc.constantFrom('a', ' '), minLength: 0, maxLength: 4 }),
  fc.constantFrom('', ' ', '   ', '\t', 'a'.repeat(59), 'a'.repeat(60), 'a'.repeat(61), ` ${'a'.repeat(60)}`),
  fc.integer({ min: 58, max: 62 }).map((length) => 'a'.repeat(length)),
)

const boundedDescriptionArb = fc.oneof(
  fc.string({ unit: fc.constantFrom('x', ' '), maxLength: 4 }),
  fc.integer({ min: 178, max: 182 }).map((length) => 'x'.repeat(length)),
)

describe('validação de lista', () => {
  // **Property 10: Validação de lista aceita exatamente os limites especificados**
  //
  // **Validates: Requirements 5.6**
  it('aceita a lista se e somente se o nome não é branco e cabe em 60 e a descrição cabe em 180', () => {
    fc.assert(
      fc.property(boundedNameArb, boundedDescriptionArb, (name, description) => {
        const expectedAccepted =
          name.trim().length > 0 && name.length <= 60 && description.length <= 180

        const saved = [{ id: 'alvo', name, description, tone: 'gold', updatedAt: 1, videoIds: [1] }]

        stub.reset()
        stub.seed({ 'choosen.lists.v1': JSON.stringify(saved) })

        const { result, unmount } = renderHook(() => useLists())

        if (expectedAccepted) {
          expect(result.current.lists).toEqual(saved)
          expect(result.current.storageError).toBe('')
        } else {
          expect(result.current.lists).not.toEqual(saved)
          expect(result.current.storageError).not.toBe('')
        }

        unmount()
      }),
      { numRuns: RUNS },
    )
  })
})
