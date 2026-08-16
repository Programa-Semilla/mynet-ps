import type { CachedEntry, LocalCache } from '../interfaces/local-cache.js'

/**
 * T062 (005) — the web `LocalCache`, over **IndexedDB** (research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Why IndexedDB, and why not the three alternatives:**
 *
 *   - **`SecureStorage`** — ruled out by the constitution, which states that it MUST NOT be
 *     used as a general cache. Governance, not preference.
 *   - **`localStorage`** — synchronous, so every read blocks the main thread; string-only, so
 *     a programme is serialised and re-parsed on every access; and capped at a few megabytes,
 *     which a 500-session programme plus notes will exceed at a large conference.
 *   - **In memory only** — does not survive a reload, so it cannot satisfy FR-215 at all.
 *
 * This file is one of the few places a browser API is called directly, and that is correct:
 * this *is* the implementation of the interface. `mynet/no-direct-platform-access` applies to
 * feature code, not to the adapter layer that exists to keep feature code out of it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Every failure path yields "nothing cached" rather than an error.**
 *
 * Storage can be unavailable for reasons that have nothing to do with this product: private
 * browsing, a quota, a corrupt database, a browser that has evicted it. In every one of those
 * cases the honest behaviour is the same as an empty cache — the attendee is told a connection
 * is needed (FR-219). An implementation that threw would take down a surface that works
 * perfectly well online, which would make the offline feature a *reliability regression*.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const DATABASE = 'mynet-cache'
const STORE = 'entries'
const VERSION = 1

/**
 * The open database, opened once and reused.
 *
 * `null` once opening has failed, so a browser without usable storage is asked once rather
 * than on every read.
 */
let opening: Promise<IDBDatabase | null> | undefined

const openDatabase = (): Promise<IDBDatabase | null> => {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    try {
      const request = indexedDB.open(DATABASE, VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      // Another tab holding an older version open. Rather than hanging, behave as no cache.
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return opening
}

/** Runs one transaction, resolving to `fallback` on any failure. */
const transact = <T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest | { onDone: (done: () => void) => void },
  read: (request: IDBRequest) => T,
  fallback: T,
): Promise<T> =>
  openDatabase().then(
    (db) =>
      new Promise<T>((resolve) => {
        if (!db) {
          resolve(fallback)
          return
        }

        try {
          const transaction = db.transaction(STORE, mode)
          const store = transaction.objectStore(STORE)
          const request = work(store)

          transaction.onerror = () => resolve(fallback)
          transaction.onabort = () => resolve(fallback)

          if ('onDone' in request) {
            transaction.oncomplete = () => resolve(fallback)
            return
          }

          request.onsuccess = () => resolve(read(request))
          request.onerror = () => resolve(fallback)
        } catch {
          resolve(fallback)
        }
      }),
  )

/**
 * The half-open key range that selects exactly the keys beginning with `prefix`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Exported so the boundary is testable without an IndexedDB. It is the one piece of real logic
 * in this file, and getting it wrong is silent in both directions: too narrow leaves a
 * withdrawn attendee's content readable offline, too wide discards a conference the attendee is
 * still registered for.
 *
 * `￿` is the largest code unit, so `prefix + '￿'` sorts after every string beginning
 * with `prefix` — and, critically, **after every longer prefix that extends it**, which is what
 * makes purging one attendee also reach all of their conferences.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const prefixBounds = (prefix: string): { lower: string; upper: string } => ({
  lower: prefix,
  upper: `${prefix}￿`,
})

export class WebLocalCache implements LocalCache {
  async read<T>(key: string): Promise<CachedEntry<T> | null> {
    return transact<CachedEntry<T> | null>(
      'readonly',
      (store) => store.get(key),
      (request) => (request.result as CachedEntry<T> | undefined) ?? null,
      null,
    )
  }

  async write<T>(key: string, payload: T): Promise<void> {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The stamp is taken **here, at the moment of the write**, and is what both FR-216's
    // "when was this retrieved" and FR-221's age limit read. Taking it at read time instead
    // would make every cached entry permanently fresh, which is the failure that would leave
    // a withdrawn registration readable offline forever.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const entry: CachedEntry<T> = { payload, retrievedAt: new Date().toISOString() }

    await transact<void>(
      'readwrite',
      (store) => store.put(entry, key),
      () => undefined,
      undefined,
    )
  }

  /**
   * FIX-2 — deletes one key, and only that key.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * `store.delete(key)` rather than a one-key range: IndexedDB's `delete` on an exact key is
   * the primitive, and routing it through `prefixBounds` would reintroduce the prefix match
   * this member exists to avoid.
   *
   * Silent on failure like every other member here. The caller is the caching decorator on its
   * way to reporting "a connection is needed and nothing is cached" — a rejection would turn
   * that ordinary answer into an unhandled error on a path that must always complete.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  async remove(key: string): Promise<void> {
    await transact<void>(
      'readwrite',
      (store) => store.delete(key),
      () => undefined,
      undefined,
    )
  }

  /**
   * FIX-3 — every key held under this prefix.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * `openKeyCursor` over the same bound `purge` uses, so the two agree by construction about
   * what "under this prefix" means. **Keys only**: `openCursor` would deserialise every payload
   * on the device to answer a question about names, and the caller is about to delete some of
   * them.
   *
   * Answers `[]` on any failure, which is the direction that cannot destroy anything — see the
   * interface. A store that reported keys it could not really see would have the caller purging
   * conferences on the strength of a failed read.
   *
   * **One caller asks for the whole grammar rather than one attendee's slice** — the retention
   * sweep (review finding I1), which must reach entries belonging to an attendee this device can
   * no longer identify. The cursor is bounded either way, so a broad prefix costs a longer scan
   * and nothing else; it is a `readonly` transaction on a fire-and-forget startup path.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  async keys(keyPrefix: string): Promise<readonly string[]> {
    const db = await openDatabase()
    if (!db) return []

    return new Promise<readonly string[]>((resolve) => {
      const found: string[] = []

      try {
        const transaction = db.transaction(STORE, 'readonly')
        const store = transaction.objectStore(STORE)
        const { lower, upper } = prefixBounds(keyPrefix)
        const request = store.openKeyCursor(IDBKeyRange.bound(lower, upper, false, false))

        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          if (typeof cursor.key === 'string') found.push(cursor.key)
          cursor.continue()
        }

        transaction.oncomplete = () => resolve(found)
        transaction.onerror = () => resolve([])
        transaction.onabort = () => resolve([])
      } catch {
        resolve([])
      }
    })
  }

  async purge(keyPrefix: string): Promise<void> {
    const db = await openDatabase()
    if (!db) return

    await new Promise<void>((resolve) => {
      try {
        const transaction = db.transaction(STORE, 'readwrite')
        const store = transaction.objectStore(STORE)
        // A key-range scan rather than reading every key: the store holds three entries per
        // conference per attendee, and a shared device can accumulate a lot of them.
        const { lower, upper } = prefixBounds(keyPrefix)
        const request = store.openKeyCursor(IDBKeyRange.bound(lower, upper, false, false))

        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          store.delete(cursor.key)
          cursor.continue()
        }

        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
        transaction.onabort = () => resolve()
      } catch {
        resolve()
      }
    })
  }
}

/** Test seam: forgets the memoised connection so a suite can substitute the environment. */
export const resetLocalCacheForTests = (): void => {
  opening = undefined
}
