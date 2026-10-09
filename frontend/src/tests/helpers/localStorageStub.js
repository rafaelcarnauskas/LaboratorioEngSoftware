// Stub de `localStorage` para os testes de persistência.
//
// Os hooks de persistência (useLists, useCommunities, useHistory, useMyTime,
// useCommunityNiches) falam com o `localStorage` global: leem com `getItem`,
// gravam com `setItem` e removem com `removeItem`, sempre dentro de `try/catch`.
// Este stub cobre os três cenários que as propriedades precisam exercitar:
//
//   1. round-trip — gravar e ler de volta o mesmo payload;
//   2. payload inválido — injetar lixo direto no armazenamento com `seed`;
//   3. falha de escrita — `failWrites` / `failRemoves` fazem o método lançar,
//      como um navegador com a cota esgotada ou o armazenamento bloqueado.
//
// O jsdom já oferece um `localStorage` real, mas ele não sabe falhar sob
// demanda e não é inspecionável sem passar pela própria API. Trocar o global
// por este stub dá controle sobre as duas coisas.

/**
 * Cria um `localStorage` em memória, com controle de falha.
 *
 * @param {Record<string, string>} [initial] pares chave/valor já presentes
 * @returns {object} o stub, com a API do Storage mais os auxiliares de teste
 */
export function createLocalStorageStub(initial = {}) {
  const store = new Map(Object.entries(initial))

  const stub = {
    // Erros a lançar em vez de executar a operação. `null` = operação normal.
    failWrites: null,
    failRemoves: null,

    get length() {
      return store.size
    },

    key(index) {
      return [...store.keys()][index] ?? null
    },

    getItem(key) {
      const value = store.get(String(key))
      return value === undefined ? null : value
    },

    setItem(key, value) {
      if (stub.failWrites !== null) throw stub.failWrites
      store.set(String(key), String(value))
    },

    removeItem(key) {
      if (stub.failRemoves !== null) throw stub.failRemoves
      store.delete(String(key))
    },

    clear() {
      if (stub.failRemoves !== null) throw stub.failRemoves
      store.clear()
    },

    // --- auxiliares de teste, fora da API do Storage ---

    /** Injeta valores crus, sem passar por `setItem` nem acionar falha. */
    seed(entries) {
      for (const [key, value] of Object.entries(entries)) {
        store.set(String(key), String(value))
      }
      return stub
    },

    /** Lê o valor cru, sem passar por `getItem` nem acionar falha. */
    raw(key) {
      const value = store.get(String(key))
      return value === undefined ? null : value
    },

    /** Snapshot do armazenamento inteiro, para asserção direta. */
    snapshot() {
      return Object.fromEntries(store)
    },

    /** Faz `setItem` lançar. Sem argumento, usa um QuotaExceededError. */
    breakWrites(error = new Error('QuotaExceededError')) {
      stub.failWrites = error
      return stub
    },

    /** Faz `removeItem` e `clear` lançarem. */
    breakRemoves(error = new Error('SecurityError')) {
      stub.failRemoves = error
      return stub
    },

    /** Volta a operar normalmente, mantendo o conteúdo. */
    repair() {
      stub.failWrites = null
      stub.failRemoves = null
      return stub
    },

    /** Esvazia e repara, sem acionar falha. Serve para `beforeEach`. */
    reset() {
      store.clear()
      return stub.repair()
    },
  }

  return stub
}

/**
 * Instala o stub como `globalThis.localStorage`, substituindo o do jsdom.
 *
 * Devolve `{ storage, restore }`: chame `restore()` no `afterEach` para
 * devolver o global original e não contaminar os outros arquivos de teste.
 *
 * @param {Record<string, string>} [initial]
 */
export function installLocalStorageStub(initial = {}) {
  const storage = createLocalStorageStub(initial)
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })

  function restore() {
    if (original === undefined) {
      delete globalThis.localStorage
    } else {
      Object.defineProperty(globalThis, 'localStorage', original)
    }
  }

  return { storage, restore }
}
