import { describe, expect, it } from 'vitest'

import {
  cached,
  cacheKey,
  CACHE_LIFETIME_MS,
  conferencePrefix,
  createFreshnessRegistry,
  heldConferences,
} from '../src/http/cached.js'
import type { CachedEntry, LocalCache } from '../src/http/cache-store.js'
import {
  NotAuthenticatedError,
  OfflineError,
  RequestRefusedError,
  SessionExpiredError,
} from '../src/interfaces/errors.js'

/**
 * T056, T057 (005) — the caching decorator: scoping, lifetime, and invalidation
 * (FR-215, FR-219–FR-221, research D10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The two assertions that matter most here are both about ACCESS, not about performance.**
 *
 * Cache keys include the attendee, so a second sign-in on a shared device cannot read the
 * first attendee's notes. And an entry past 24 hours is treated as absent, because offline
 * that age limit is the *only* thing that revokes access after a registration is withdrawn —
 * there is no server present to refuse.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** An in-memory `LocalCache`, so these tests are about the decorator rather than IndexedDB. */
const memoryStore = (clock: () => number = () => Date.now()) => {
  const entries = new Map<string, CachedEntry<unknown>>()
  const purges: string[] = []
  const removals: string[] = []

  const store: LocalCache = {
    read: async <T>(key: string) => (entries.get(key) as CachedEntry<T> | undefined) ?? null,
    write: async <T>(key: string, payload: T) => {
      entries.set(key, { payload, retrievedAt: new Date(clock()).toISOString() })
    },
    purge: async (prefix: string) => {
      purges.push(prefix)
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },
    /**
     * FIX-2 — an exact key, and the double distinguishes it from `purge` **on purpose**.
     *
     * FIX-203 requires the expiry branch to delete one entry and leave its neighbours alone.
     * Implementing this as `purge(key)` here would make that requirement untestable: the two
     * would be the same operation in the double, and a decorator that had widened to the
     * conference prefix would still pass.
     */
    remove: async (key: string) => {
      removals.push(key)
      entries.delete(key)
    },
    keys: async (prefix: string) => [...entries.keys()].filter((key) => key.startsWith(prefix)),
  }

  return { store, entries, purges, removals }
}

/** A saved-session repository whose behaviour each test dictates. */
const repositoryThat = (behaviour: {
  listSaved?: (eventId: string) => Promise<string[]>
  save?: (eventId: string, sessionId: string) => Promise<void>
}) => {
  const calls: string[] = []
  return {
    calls,
    repository: {
      listSaved: async (eventId: string) => {
        calls.push(`listSaved:${eventId}`)
        return behaviour.listSaved ? behaviour.listSaved(eventId) : []
      },
      save: async (eventId: string, sessionId: string) => {
        calls.push(`save:${eventId}`)
        if (behaviour.save) await behaviour.save(eventId, sessionId)
      },
    },
  }
}

const READS = { listSaved: 'saved' } as const

describe('the caching decorator', () => {
  it('serves a read from the server and stores it', async () => {
    const { store, entries } = memoryStore()
    const { repository } = repositoryThat({ listSaved: async () => ['a', 'b'] })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)

    expect(await subject.listSaved('summit')).toEqual(['a', 'b'])
    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(true)
  })

  it('serves the CACHE when the server cannot be reached (FR-215)', async () => {
    const { store } = memoryStore()
    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['a', 'b']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)
    await subject.listSaved('summit')

    online = false
    expect(await subject.listSaved('summit')).toEqual(['a', 'b'])
  })

  it('re-throws when there is NOTHING cached, rather than answering empty (FR-219)', async () => {
    const { store } = memoryStore()
    const { repository } = repositoryThat({
      listSaved: async () => {
        throw new OfflineError('Loading your saved sessions')
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)

    // An empty array here would tell the attendee they have saved nothing, when the truth is
    // that we do not know — and they would go and save it all again.
    await expect(subject.listSaved('never-read')).rejects.toBeInstanceOf(OfflineError)
  })

  it('KEYS BY ATTENDEE, so a shared device cannot leak across sign-ins (research D10)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A phone lent at a conference, or a kiosk. Keyed by conference alone, signing out and in
    // as somebody else would serve the previous attendee's cached notes — the product's first
    // attendee-authored free text. This is a Principle VIII failure the cache would have
    // introduced, in a feature added to make things *better* offline.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const { store } = memoryStore()
    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['ada-saved-this']
      },
    })

    await cached(repository, store, { attendeeId: 'ada' }, READS).listSaved('summit')

    // Grace signs in on the same device, offline. She must not read Ada's cached set.
    online = false
    const grace = cached(repository, store, { attendeeId: 'grace' }, READS)

    await expect(
      grace.listSaved('summit'),
      "Grace must not be served Ada's cached content on a shared device.",
    ).rejects.toBeInstanceOf(OfflineError)
  })

  it('TREATS AN ENTRY OLDER THAN 24 HOURS AS ABSENT (FR-221)', async () => {
    let nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store } = memoryStore(() => nowMs)

    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['a']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, { now: () => nowMs })
    await subject.listSaved('summit')

    online = false

    // One hour short of the limit: still readable, which is the point of caching at all.
    nowMs += CACHE_LIFETIME_MS - 60 * 60 * 1000
    expect(await subject.listSaved('summit')).toEqual(['a'])

    // Past it: refused exactly as a conference never read. Offline this is the only thing that
    // revokes access after a registration is withdrawn.
    nowMs += 2 * 60 * 60 * 1000
    await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(OfflineError)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FIX-2 — THE LIFETIME BOUNDED SERVING AND BOUNDED RETENTION NOT AT ALL** (FIX-201–FIX-204,
   * constitution v5.4.0 R1).
   *
   * The test above proves an aged entry is not *served*. That was the whole of the guarantee,
   * and it left a second one unmade: `write` puts an entry and only `purge` ever removed one, so
   * a device that stops being able to reach the account keeps every conference-scoped entry it
   * had, in IndexedDB, **indefinitely**. Such a device renders signed-out, so nothing is
   * displayed — **what survives is bytes**, against a deletion screen that says in bold that no
   * copy is kept.
   *
   * **The assertion has to read the store directly** (FIX-204). Through the decorator, "deleted"
   * and "present but stale" produce the same rejection — which is the entire subject of the fix,
   * and the reason a behavioural test could never have caught its absence.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('DELETES an entry it reads past its lifetime, rather than leaving the bytes (FIX-201)', async () => {
    let nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store, entries, purges, removals } = memoryStore(() => nowMs)

    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['a']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, { now: () => nowMs })
    await subject.listSaved('summit')
    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(true)

    online = false
    nowMs += CACHE_LIFETIME_MS + 1000

    // FIX-202 — the caller's outcome is **unchanged**: the same rejection, so the surface still
    // reports that a connection is needed and nothing is cached. This fix changes what is
    // stored, never what is shown.
    await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(OfflineError)

    expect(
      entries.has(cacheKey('ada', 'summit', 'saved')),
      'An entry past its lifetime was left on the device. It can never be served again, so what ' +
        'remains is a copy of conference content nobody is entitled to read and nothing will ' +
        'ever remove — the retention half of FR-221, which the age limit alone does not close.',
    ).toBe(false)

    expect(removals).toEqual([cacheKey('ada', 'summit', 'saved')])
    expect(
      purges,
      'The expiry branch reached for `purge`. That is a prefix match and would take this ' +
        "conference's other entries, which may still be fresh and still readable (FIX-203).",
    ).toEqual([])
  })

  it('deletes EXACTLY the expired key, leaving a fresh neighbour readable (FIX-203)', async () => {
    let nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store, entries, purges } = memoryStore(() => nowMs)

    let online = true
    const answering = async <T>(answer: T): Promise<T> => {
      if (!online) throw new OfflineError('Loading your conference')
      return answer
    }

    // Two resources under **one** conference, deliberately read a day apart so they age out a
    // day apart. Written as one object rather than through `repositoryThat`, which knows only
    // about saved sessions.
    const repository = {
      listSaved: async (_eventId: string) => answering(['session-1']),
      listNotes: async (_eventId: string) => answering(['a note']),
    }

    const subject = cached(
      repository,
      store,
      { attendeeId: 'ada' },
      { listSaved: 'saved', listNotes: 'notes' },
      { now: () => nowMs },
    )

    await subject.listSaved('summit')
    nowMs += CACHE_LIFETIME_MS - 60 * 60 * 1000
    await subject.listNotes('summit')

    // The saved set is now 25 hours old; the note is two.
    online = false
    nowMs += 2 * 60 * 60 * 1000
    await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(OfflineError)

    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(false)
    expect(
      entries.has(cacheKey('ada', 'summit', 'notes')),
      "One entry ageing out discarded its neighbour. The attendee's notes were still inside the " +
        'lifetime and still readable offline; deleting them is FR-215 broken by the mechanism ' +
        'meant to bound retention (FIX-203).',
    ).toBe(true)

    // And it is genuinely still readable, not merely still present.
    expect(await subject.listNotes('summit')).toEqual(['a note'])
    expect(purges).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE UNPARSEABLE STAMP — THE THIRD PROPERTY THE FIX-2 BRANCH NAMES, AND THE ONE NOTHING
   * EXECUTED** (FIX-201, FIX-202).
   *
   * `cached.ts` lists three load-bearing properties of that branch and this is the third: *"an
   * unparseable stamp is deleted too"*. Every other test in this file takes its stamp from the
   * double's clock, which always produces a valid ISO string — so `isFresh`'s `Number.isNaN`
   * guard, and the deletion that now follows it, were reachable by no test at all.
   *
   * **It is the one route by which an entry can be permanently unreadable AND permanently
   * retained**, which is the exact retention hole FIX-201 exists to close, and it is reachable
   * in production from a corrupted or hand-edited IndexedDB record.
   *
   * It also guards a plausible simplification. `isFresh` reduced to
   * `now - retrieved <= CACHE_LIFETIME_MS` is `false` for `NaN` **by accident** — `NaN` compares
   * false with everything — so the first half of this test would go on passing while the entry
   * silently became one that is never served and never deleted. That is a tidy-up nobody would
   * think to argue for, which is why the stamp is seeded rather than written.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('DELETES an entry whose stamp cannot be parsed, not merely refuses to serve it (FIX-201)', async () => {
    const nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store, entries, purges, removals } = memoryStore(() => nowMs)

    const { repository } = repositoryThat({
      listSaved: async () => {
        throw new OfflineError('Loading your saved sessions')
      },
    })

    // Seeded **directly into the backing map**, bypassing `store.write` — which is the only way
    // to produce this entry, because `write` stamps from the clock and the clock cannot lie in
    // this shape. A device gets here through a corrupted record, not through this decorator.
    entries.set(cacheKey('ada', 'summit', 'saved'), {
      payload: ['a session the attendee saved'],
      retrievedAt: 'not-a-date',
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, { now: () => nowMs })

    // FIX-202 — **the caller's outcome is unchanged.** An entry whose age cannot be established
    // fails towards "nothing cached", which is the direction that cannot leak: the worst outcome
    // is a request the attendee would have made anyway.
    await expect(
      subject.listSaved('summit'),
      'An entry with an unparseable stamp was SERVED. Its age cannot be established, so nothing ' +
        'can say it is inside the lifetime — and the lifetime is the only thing that revokes ' +
        'access offline (FR-221).',
    ).rejects.toBeInstanceOf(OfflineError)

    expect(
      entries.has(cacheKey('ada', 'summit', 'saved')),
      'An entry with an unparseable stamp was left on the device. It can never be served again ' +
        'and nothing else will ever reach it, so it is the one entry that is both permanently ' +
        'unreadable and permanently retained — retention with no possible benefit, which is the ' +
        'hole FIX-201 exists to close.',
    ).toBe(false)

    expect(removals).toEqual([cacheKey('ada', 'summit', 'saved')])
    expect(
      purges,
      'The unparseable-stamp branch reached for `purge`. That is a prefix match and would take ' +
        "this conference's other entries, which may still be fresh and still readable (FIX-203).",
    ).toEqual([])
  })

  it('PURGES a conference when the server REFUSES (FR-221)', async () => {
    const { store, entries } = memoryStore()
    let refuse = false
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (refuse) throw new RequestRefusedError('not_found', 'That is not available.')
        return ['a']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)
    await subject.listSaved('summit')
    expect(entries.size).toBe(1)

    // The attendee's registration has been withdrawn. The cache must not go on serving what
    // the server has begun refusing — it is not an authorization bypass.
    refuse = true
    await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(RequestRefusedError)
    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(false)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **004 — THE CASE THAT WAS ACTUALLY BROKEN, AND WHICH NOTHING ASSERTED.**
   *
   * `isRefusal` originally recognised only `RequestRefusedError`. The test above therefore
   * proves the branch works for the one error class that never reached it in the failing
   * scenario. The scenario the spec names as an Edge Case is different: *an attendee deletes
   * their account while signed in on a second device*, and that device's next read comes back
   * **401**, not 404.
   *
   * With `NotAuthenticatedError` and `SessionExpiredError` outside `isRefusal`, a 401 fell
   * through to the offline fallback and the second device was served its cached programme,
   * saved sessions and notes — for an account that no longer exists. That is the cache acting
   * as an authorization bypass, which is exactly what the widening closed and what these two
   * cases now hold closed.
   *
   * Reverting `isRefusal` to `error instanceof RequestRefusedError` must turn these red.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it.each([
    ['NotAuthenticatedError', () => new NotAuthenticatedError()],
    ['SessionExpiredError', () => new SessionExpiredError()],
  ])(
    'PURGES and re-throws on %s — a 401 is a refusal, not an outage (FR-330, FR-369)',
    async (_name, makeError) => {
      const { store, entries } = memoryStore()
      let refuse = false
      const { repository } = repositoryThat({
        listSaved: async () => {
          if (refuse) throw makeError()
          return ['a']
        },
      })

      const subject = cached(repository, store, { attendeeId: 'ada' }, READS)
      await subject.listSaved('summit')
      expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(true)

      // The account was deleted, or every session revoked by a password reset, on another device.
      refuse = true

      // It must REJECT rather than resolve. Resolving would hand this device the cached copy of
      // an account the server has stopped recognising.
      await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(makeError().constructor)

      // And the bytes must be gone, not merely unserved — the next read has nothing to fall back
      // to even if it arrives while offline.
      expect(
        entries.has(cacheKey('ada', 'summit', 'saved')),
        'a 401 must purge the conference; leaving it cached is the authorization bypass',
      ).toBe(false)
    },
  )

  it('purges only the refused conference, not every conference (research D10)', async () => {
    const { store, entries } = memoryStore()
    const refused = new Set<string>()
    const { repository } = repositoryThat({
      listSaved: async (eventId) => {
        if (refused.has(eventId))
          throw new RequestRefusedError('not_found', 'That is not available.')
        return [eventId]
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)
    await subject.listSaved('summit')
    await subject.listSaved('horizons')
    expect(entries.size).toBe(2)

    refused.add('summit')
    await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(RequestRefusedError)

    // One conference's refusal must not discard another conference's readable content.
    expect(entries.has(cacheKey('ada', 'horizons', 'saved'))).toBe(true)
    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(false)
  })

  it('does NOT cache or queue writes (FR-217)', async () => {
    const { store, entries } = memoryStore()
    const { repository, calls } = repositoryThat({
      listSaved: async () => ['a'],
      save: async () => {
        throw new OfflineError('Saving that session')
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)

    await expect(subject.save('summit', 'session-1')).rejects.toBeInstanceOf(OfflineError)

    // Nothing stored, nothing retried, nothing waiting to be replayed later.
    expect(entries.size).toBe(0)
    expect(calls).toEqual(['save:summit'])
  })

  it('drops a conference’s cached reads after a SUCCESSFUL write', async () => {
    const { store, entries } = memoryStore()
    const { repository } = repositoryThat({ listSaved: async () => ['a'] })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS)
    await subject.listSaved('summit')
    expect(entries.size).toBe(1)

    // The attendee's own saved set has just changed. Keeping the old payload would be a second
    // source of truth for what the server holds — and no age limit would catch it.
    await subject.save('summit', 'session-1')
    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(false)
  })

  it('reports NOTHING while the content is live, so no stamp is shown (SC-204)', async () => {
    const nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store } = memoryStore(() => nowMs)
    const freshness = createFreshnessRegistry()
    const { repository } = repositoryThat({ listSaved: async () => ['a'] })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, {
      now: () => nowMs,
      freshness,
    })
    await subject.listSaved('summit')

    // The read reached the server. SC-204's second half: no cached surface is presented as if
    // it were live — and the converse, that live content carries no staleness stamp.
    expect(freshness.lastRetrieved('ada', 'summit', 'saved')).toBeNull()
  })

  it('reports WHEN it was retrieved once the cache is what served it (FR-216)', async () => {
    const nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store } = memoryStore(() => nowMs)
    const freshness = createFreshnessRegistry()

    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['a']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, {
      now: () => nowMs,
      freshness,
    })
    await subject.listSaved('summit')

    online = false
    await subject.listSaved('summit')

    // Now the surface must say when this content was retrieved (FR-216).
    expect(freshness.lastRetrieved('ada', 'summit', 'saved')).toBe('2026-09-14T09:00:00.000Z')
  })

  it('CLEARS the stamp again once a live read succeeds (SC-204)', async () => {
    const nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store } = memoryStore(() => nowMs)
    const freshness = createFreshnessRegistry()

    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['a']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, {
      now: () => nowMs,
      freshness,
    })
    await subject.listSaved('summit')
    online = false
    await subject.listSaved('summit')
    expect(freshness.lastRetrieved('ada', 'summit', 'saved')).not.toBeNull()

    // Back online. A stamp left behind would tell the attendee that current content is stale —
    // the same lie as the reverse, and the one nobody thinks to test for.
    online = true
    await subject.listSaved('summit')
    expect(freshness.lastRetrieved('ada', 'summit', 'saved')).toBeNull()
  })

  it('reports nothing for an entry past its lifetime, so no stale stamp is shown', async () => {
    let nowMs = Date.parse('2026-09-14T09:00:00.000Z')
    const { store } = memoryStore(() => nowMs)
    const freshness = createFreshnessRegistry()

    let online = true
    const { repository } = repositoryThat({
      listSaved: async () => {
        if (!online) throw new OfflineError('Loading your saved sessions')
        return ['a']
      },
    })

    const subject = cached(repository, store, { attendeeId: 'ada' }, READS, {
      now: () => nowMs,
      freshness,
    })
    await subject.listSaved('summit')

    online = false
    nowMs += CACHE_LIFETIME_MS + 1000
    await expect(subject.listSaved('summit')).rejects.toBeInstanceOf(OfflineError)

    expect(
      freshness.lastRetrieved('ada', 'summit', 'saved'),
      'Content past its lifetime is refused outright, not shown with an old stamp.',
    ).toBeNull()
  })

  it('scopes an attendee purge to that attendee, for sign-out', async () => {
    const { store, entries } = memoryStore()
    const { repository } = repositoryThat({ listSaved: async () => ['a'] })

    await cached(repository, store, { attendeeId: 'ada' }, READS).listSaved('summit')
    await cached(repository, store, { attendeeId: 'grace' }, READS).listSaved('summit')
    expect(entries.size).toBe(2)

    await store.purge(conferencePrefix('ada', 'summit'))

    expect(entries.has(cacheKey('ada', 'summit', 'saved'))).toBe(false)
    expect(entries.has(cacheKey('grace', 'summit', 'saved'))).toBe(true)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A DECLARED LIVE READ IS CALLED ON THE REAL REPOSITORY, NOT ON THE PROXY** (FR-215,
   * FR-647).
   *
   * `passThrough` names a read that must stay live: not served from the cache, not written to
   * it, and — the reason it exists — **not treated as a write and therefore not purging the
   * conference**.
   *
   * The first implementation returned the method itself, which is subtly wrong in a way no
   * plain-object double can expose. Every HTTP repository in this package holds its client in a
   * `#private` field, and a `#private` field lives on the instance, not on a Proxy wrapping it
   * — so calling the bare method with the Proxy as `this` throws `TypeError: Cannot read
   * private member`. It shipped, and the scheduling dialog told every attendee "Times could not
   * be loaded" until an e2e walkthrough caught it.
   *
   * So this double is a **class with a private field**, deliberately, and not the object
   * literal the rest of this file uses. The shape is the assertion.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('calls a declared live read on the repository itself, private fields intact', async () => {
    const { store, entries } = memoryStore()

    class RepositoryWithPrivateState {
      readonly #answer: readonly string[]

      constructor(answer: readonly string[]) {
        this.#answer = answer
      }

      async slots(_eventId: string): Promise<readonly string[]> {
        return this.#answer
      }

      async listSaved(_eventId: string): Promise<readonly string[]> {
        return this.#answer
      }
    }

    const subject = cached(
      new RepositoryWithPrivateState(['09:00']),
      store,
      { attendeeId: 'ada' },
      READS,
      { passThrough: ['slots'] },
    )

    // Populate the conference cache through a genuinely cached read...
    await subject.listSaved('summit')
    expect(entries.size).toBe(1)

    // ...then the live read. It must not throw, must answer, and must leave the cache alone.
    await expect(subject.slots('summit')).resolves.toEqual(['09:00'])

    expect(
      entries.has(cacheKey('ada', 'summit', 'saved')),
      'A declared live read purged the conference. That is the write branch, and enrolling a ' +
        "read in it destroys the attendee's cached programme, saved sessions and notes.",
    ).toBe(true)

    // Nor was its own answer stored.
    expect(entries.size).toBe(1)
  })

  it('passes through methods it was not told to cache', async () => {
    const { store, entries } = memoryStore()
    const { repository, calls } = repositoryThat({ listSaved: async () => ['a'] })

    const subject = cached(repository, store, { attendeeId: 'ada' }, {})

    await subject.listSaved('summit')
    await subject.listSaved('summit')

    // No resource declared, so no caching and no coalescing — two real reads.
    expect(calls).toEqual(['listSaved:summit', 'listSaved:summit'])
    expect(entries.size).toBe(0)
  })
})

/**
 * FIX-3's key grammar, read in the direction `cacheKey` does not go.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The erasure itself lives at the composition root and must (FIX-303). What lives here is the
 * **parser**, beside the format it parses, so the grammar has one definition rather than two —
 * and it is exercised against a **table of keys rather than whatever the decorator happens to
 * write today**, which is 009's precedent for the event audit's predicate: a guard exercised
 * only by the calls that exist stops guarding when they change.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the conferences a stored key set names', () => {
  it('reads a conference id back out of every key the decorator writes', () => {
    const keys = [
      cacheKey('ada', 'summit', 'programme'),
      cacheKey('ada', 'summit', 'notes'),
      cacheKey('ada', 'horizons', 'saved'),
    ]

    expect(heldConferences('ada', keys).sort()).toEqual(['horizons', 'summit'])
  })

  it('names NO conference for an event-less key', () => {
    // `getCurrent` and `getActive` take no event argument, so the decorator keys them with an
    // empty event segment. Read as a conference, the empty id is absent from every registered
    // list — and the erasure would delete the attendee's own cached identity every time it ran.
    expect(heldConferences('ada', [cacheKey('ada', '', 'self')])).toEqual([])
    expect(heldConferences('ada', [cacheKey('ada', '', 'active-event')])).toEqual([])
  })

  it('ignores keys belonging to another attendee, including one whose id EXTENDS this one', () => {
    expect(
      heldConferences('ada', [
        cacheKey('grace', 'summit', 'notes'),
        // `attendee:ada|` cannot match `attendee:adam|…` because `|` sorts below every ordinary
        // character — the same terminator that keeps `purge` from crossing attendees.
        cacheKey('adam', 'summit', 'notes'),
      ]),
    ).toEqual([])
  })

  it('ignores a key this grammar did not write', () => {
    expect(
      heldConferences('ada', ['attendee:ada|something-else', 'attendee:ada|event:unterminated']),
    ).toEqual([])
  })
})
