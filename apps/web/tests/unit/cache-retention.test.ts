import { describe, expect, it } from 'vitest'

import {
  CACHE_LIFETIME_MS,
  CLOCK_TRUST_CEILING_MS,
  cached,
  cacheKey,
  sweepExpired,
  type CachedEntry,
  type LocalCache,
} from '@mynet/data/http'
import type { Event } from '@mynet/data'
import { OfflineError } from '@mynet/data'

import { erasingWithdrawnConferences } from '../../src/app/services.js'

/**
 * Round 1 of the deep review, area A — **what the two shipped cache mechanisms could not reach**
 * (findings I1, M6, M3, M1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FIX-2 DELETED AN EXPIRED ENTRY ONLY WHEN SOMEBODY READ IT, AND THE DEVICE IT WAS WRITTEN
 * FOR READS NOTHING.**
 *
 * The spec's problem statement names *"a device that stops being able to reach the account"* —
 * the account deleted elsewhere, or a session that ended and was never re-established. That
 * device renders **signed-out**: every conference-scoped read is gated behind an identity that
 * never resolves, so the expiry branch in the decorator is never entered and every purge in the
 * composition root has no attendee to name. The bytes stay forever, with no size cap and no LRU
 * behind them.
 *
 * `sweepExpired` is the mechanism that reaches them, and **its whole property is that it does
 * not depend on who is signed in** — which is what these assertions are about.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY ASSERTION HERE READS THE STORE DIRECTLY** (FIX-204's rule, and for its reason). The
 * subject is what remains on the device, and through the decorator "deleted" and "present but
 * stale" are the same observation.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const AT = Date.parse('2026-09-14T09:00:00.000Z')

/** An in-memory `LocalCache` whose stamps are chosen per write, so ages are exact. */
const memoryStore = () => {
  const entries = new Map<string, CachedEntry<unknown>>()

  const store: LocalCache = {
    read: async <T>(key: string) => (entries.get(key) as CachedEntry<T> | undefined) ?? null,
    write: async <T>(key: string, payload: T) => {
      entries.set(key, { payload, retrievedAt: new Date(AT).toISOString() })
    },
    purge: async (prefix: string) => {
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },
    remove: async (key: string) => {
      entries.delete(key)
    },
    keys: async (prefix: string) => [...entries.keys()].filter((key) => key.startsWith(prefix)),
  }

  /** Puts an entry with a stamp of this test's choosing — `retrievedAt` is what is on trial. */
  const stamp = (key: string, retrievedAt: string) => {
    entries.set(key, { payload: ['content'], retrievedAt })
  }

  return { store, entries, stamp }
}

const at = (offsetMs: number) => new Date(AT + offsetMs).toISOString()

describe('the retention sweep — deleting entries nobody will ever read again (finding I1)', () => {
  it('DELETES an expired entry belonging to an attendee nobody is signed in as', async () => {
    const { store, entries, stamp } = memoryStore()

    // A device whose account was deleted on another device, or whose session lapsed months ago.
    // Nothing here is reachable: the client renders signed-out, resolves no identity, issues no
    // conference-scoped read, and every purge in `services.ts` needs an attendee id to name.
    stamp(cacheKey('ada', 'summit', 'programme'), at(-CACHE_LIFETIME_MS - 1))
    stamp(cacheKey('ada', 'summit', 'notes'), at(-CACHE_LIFETIME_MS - 1))
    stamp(cacheKey('ada', '', 'self'), at(-CACHE_LIFETIME_MS - 1))

    const deleted = await sweepExpired(store, () => AT)

    expect(deleted).toBe(3)
    expect(
      [...entries.keys()],
      'Entries that can never be served again survived a sweep that took no identity at all. ' +
        'This is the state the retention fix was written for: the expiry branch in `cached.ts` ' +
        'runs only when somebody reads, and on this device nobody ever will (finding I1).',
    ).toEqual([])
  })

  it('reaches EVERY attendee on a shared device, because it names none of them', async () => {
    const { store, entries, stamp } = memoryStore()

    // A phone lent at a conference, or a kiosk: one full conference set per attendee who ever
    // signed in and closed the tab. A sweep scoped to the signed-in attendee would leave all of
    // them, which is precisely the accumulation being fixed.
    stamp(cacheKey('ada', 'summit', 'notes'), at(-CACHE_LIFETIME_MS - 1))
    stamp(cacheKey('grace', 'summit', 'notes'), at(-CACHE_LIFETIME_MS - 1))
    stamp(cacheKey('lin', 'horizons', 'appointments'), at(-CACHE_LIFETIME_MS - 1))

    await sweepExpired(store, () => AT)

    expect(entries.size).toBe(0)
  })

  it('keeps every entry still inside its lifetime, so a working offline copy survives', async () => {
    const { store, entries, stamp } = memoryStore()

    stamp(cacheKey('ada', 'summit', 'programme'), at(-CACHE_LIFETIME_MS + 60_000))
    stamp(cacheKey('ada', 'summit', 'notes'), at(0))
    stamp(cacheKey('ada', 'horizons', 'programme'), at(-CACHE_LIFETIME_MS - 1))

    const deleted = await sweepExpired(store, () => AT)

    expect(deleted).toBe(1)
    expect(
      [...entries.keys()].sort(),
      'A sweep meant to delete what can no longer be served took content that is still ' +
        'readable offline — FR-215 broken by the mechanism meant to bound retention.',
    ).toEqual([cacheKey('ada', 'summit', 'notes'), cacheKey('ada', 'summit', 'programme')].sort())
  })

  it('deletes an entry whose stamp cannot be parsed, which can never become readable', async () => {
    const { store, entries, stamp } = memoryStore()

    stamp(cacheKey('ada', 'summit', 'programme'), 'not-a-date')

    await sweepExpired(store, () => AT)

    expect(entries.size).toBe(0)
  })

  it('asks for the whole key grammar, not one attendee’s slice', async () => {
    const { store, stamp } = memoryStore()
    const asked: string[] = []

    stamp(cacheKey('ada', 'summit', 'programme'), at(-CACHE_LIFETIME_MS - 1))

    await sweepExpired(
      {
        ...store,
        keys: async (prefix: string) => {
          asked.push(prefix)
          return store.keys(prefix)
        },
      },
      () => AT,
    )

    expect(
      asked,
      'The sweep enumerated under a prefix naming somebody. The entries it exists to delete ' +
        'belong to attendees this device can no longer identify, so a prefix that names one ' +
        'cannot reach them.',
    ).toEqual(['attendee:'])
  })

  it('resolves rather than rejecting when the store answers as an empty one', async () => {
    // `LocalCache`'s contract is that every member fails towards "nothing there". A sweep is
    // fire-and-forget on the startup path, so a store in that state must produce a quiet no-op.
    const unavailable: LocalCache = {
      read: async () => null,
      write: async () => undefined,
      purge: async () => undefined,
      remove: async () => undefined,
      keys: async () => [],
    }

    await expect(sweepExpired(unavailable, () => AT)).resolves.toBe(0)
  })
})

describe('a clock that has moved is not evidence about an entry (finding M6)', () => {
  it('does NOT delete an entry whose age only a moved clock explains', async () => {
    const { store, entries, stamp } = memoryStore()

    const key = cacheKey('ada', 'summit', 'notes')
    stamp(key, at(-CLOCK_TRUST_CEILING_MS - 1))

    const deleted = await sweepExpired(store, () => AT)

    expect(deleted).toBe(0)
    expect(
      entries.has(key),
      'A forward clock correction ages every entry at once, and deleting on it destroys the ' +
        'whole offline copy at exactly the moment the attendee is relying on it. Before FIX-2 ' +
        'that state was recoverable by fixing the clock; it must stay recoverable — serve ' +
        'nothing, delete nothing.',
    ).toBe(true)
  })

  it('does NOT delete an entry stamped in the future, which is the backwards jump', async () => {
    const { store, entries, stamp } = memoryStore()

    const key = cacheKey('ada', 'summit', 'notes')
    stamp(key, at(CLOCK_TRUST_CEILING_MS))

    await sweepExpired(store, () => AT)

    expect(entries.has(key)).toBe(true)
  })

  it('still deletes across any span the product plausibly sees between two uses', async () => {
    const { store, entries, stamp } = memoryStore()

    // The ceiling is deliberately large: a conference product's ordinary gap between two uses of
    // a device is months. A tighter one would protect the clock by disabling the sweep for every
    // realistic case, which is the retention hole itself.
    stamp(cacheKey('ada', 'summit', 'notes'), at(-90 * 24 * 60 * 60 * 1000))

    await sweepExpired(store, () => AT)

    expect(entries.size).toBe(0)
  })

  it('withholds rather than deletes on the READ path too, and serves nothing either way', async () => {
    const { store, entries, stamp } = memoryStore()

    const key = cacheKey('ada', 'summit', 'programme')
    stamp(key, at(-CLOCK_TRUST_CEILING_MS - 1))

    const offline = cached(
      {
        listSessions: async (_eventId: string): Promise<unknown> => {
          throw new OfflineError('Loading the programme')
        },
      },
      store,
      { attendeeId: 'ada' },
      { listSessions: 'programme' },
      { now: () => AT },
    )

    // FIX-202 is unchanged: the caller still reports that a connection is needed and nothing is
    // cached. What changes is only what is left on the device.
    await expect(offline.listSessions('summit')).rejects.toBeInstanceOf(OfflineError)
    expect(entries.has(key)).toBe(true)
  })

  it('deletes on the read path for an ordinary expiry, which FIX-201 requires', async () => {
    const { store, entries, stamp } = memoryStore()

    const key = cacheKey('ada', 'summit', 'programme')
    stamp(key, at(-CACHE_LIFETIME_MS - 1000))

    const offline = cached(
      {
        listSessions: async (_eventId: string): Promise<unknown> => {
          throw new OfflineError('Loading the programme')
        },
      },
      store,
      { attendeeId: 'ada' },
      { listSessions: 'programme' },
      { now: () => AT },
    )

    await expect(offline.listSessions('summit')).rejects.toBeInstanceOf(OfflineError)
    expect(entries.has(key)).toBe(false)
  })
})

const conference = (id: string): Event => ({
  id,
  name: id,
  location: 'Barcelona',
  startsOn: '2026-09-14',
  endsOn: '2026-09-17',
  timezone: 'Europe/Madrid',
})

describe('the withdrawn-conference erasure, on the two paths its wiring got wrong', () => {
  it('erases NOTHING when the signed-in identity moved while the read was in flight (M1)', async () => {
    const { store, entries } = memoryStore()

    await store.write(cacheKey('grace', 'horizons', 'notes'), ['grace’s note'])

    // Ada's request leaves; she signs out and Grace signs in on the same device before it
    // answers. Acting on the identity read *after* the await would let Ada's registered list
    // decide which of **Grace's** conferences are erased.
    let current = 'ada'
    const events = erasingWithdrawnConferences(
      {
        listRegistered: async () => {
          current = 'grace'
          return [conference('summit')]
        },
      },
      store,
      { current: () => current },
    )

    await expect(events.listRegistered()).resolves.toEqual([conference('summit')])

    expect(
      entries.has(cacheKey('grace', 'horizons', 'notes')),
      'One attendee’s registered list erased another attendee’s conference. The `anonymous` ' +
        'guard does not cover this: it catches "not resolved yet", never "resolved to somebody ' +
        'else" (finding M1).',
    ).toBe(true)
  })

  it('still erases when identity only BECAME real during the read, which is the cold start', async () => {
    const { store, entries } = memoryStore()

    await store.write(cacheKey('ada', 'horizons', 'notes'), ['note'])

    // `getCurrent()` and this call race on every load, so the scope reads `anonymous` when the
    // request is dispatched and resolves while it is in flight. Reading identity only *before*
    // the await would leave the cold-start device — the case FIX-3 exists for — never erased.
    let current = 'anonymous'
    const events = erasingWithdrawnConferences(
      {
        listRegistered: async () => {
          current = 'ada'
          return []
        },
      },
      store,
      { current: () => current },
    )

    await events.listRegistered()

    expect(entries.has(cacheKey('ada', 'horizons', 'notes'))).toBe(false)
  })

  it('answers the read even when the store rejects, rather than failing it (M3)', async () => {
    const rejecting: LocalCache = {
      read: async () => null,
      write: async () => undefined,
      purge: async () => {
        throw new Error('QuotaExceededError')
      },
      remove: async () => undefined,
      keys: async () => [cacheKey('ada', 'horizons', 'programme')],
    }

    const events = erasingWithdrawnConferences(
      { listRegistered: async () => [conference('summit')] },
      rejecting,
      { current: () => 'ada' },
    )

    await expect(
      events.listRegistered(),
      'A storage fault turned a successful network read into a rejection. `listRegistered()` is ' +
        'what `EventSwitcher` renders from, in the shell, on every destination — so a quota or a ' +
        'corrupt database would blank the conference switcher for a reason with nothing to do ' +
        'with the network (finding M3).',
    ).resolves.toEqual([conference('summit')])
  })
})
