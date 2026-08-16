import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { cacheKey, type CachedEntry, type LocalCache } from '@mynet/data/http'
import type { Event } from '@mynet/data'
import { OfflineError } from '@mynet/data'

import { erasingWithdrawnConferences } from '../../src/app/services.js'

/**
 * FIX-3 — **a conference the attendee has left is erased on the next successful reading of the
 * conferences they are registered for** (FIX-301–FIX-305, constitution v5.4.0 R1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CASE THIS EXISTS FOR IS A COLD START ON A DEVICE THAT DID NOT WITHDRAW.**
 *
 * The caching decorator drops a conference the moment a read scoped to it is refused, and on
 * the device that performed the withdrawal that is prompt and complete. On any other device the
 * refused read is frequently **never issued at all**: `GET /workspace/active-event` answers an
 * attendee registered for nothing with 204 — a success — every conference-scoped read is gated
 * behind that resolving to `ready`, and no route carries an `:eventId` parameter, so no
 * destination holds a remembered conference id it could fire with. After a full reload the
 * client never addresses the withdrawn conference again.
 *
 * So the mechanism was sound and the entries stayed. This is the read that does arrive.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **These assertions read the store directly, for FIX-2's reason.** The subject is what remains
 * on the device, and nothing on screen distinguishes an erased conference from one that is
 * merely never asked for.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const conference = (id: string): Event => ({
  id,
  name: id,
  location: 'Barcelona',
  startsOn: '2026-09-14',
  endsOn: '2026-09-17',
  timezone: 'Europe/Madrid',
})

/** An in-memory `LocalCache`, so these tests are about the wire rather than IndexedDB. */
const memoryStore = () => {
  const entries = new Map<string, CachedEntry<unknown>>()

  const store: LocalCache = {
    read: async <T>(key: string) => (entries.get(key) as CachedEntry<T> | undefined) ?? null,
    write: async <T>(key: string, payload: T) => {
      entries.set(key, { payload, retrievedAt: '2026-09-14T09:00:00.000Z' })
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

  return { store, entries }
}

/** A store already holding what a device would have cached before the withdrawal. */
const deviceHolding = async () => {
  const { store, entries } = memoryStore()

  for (const resource of ['programme', 'tracks', 'saved', 'notes']) {
    await store.write(cacheKey('ada', 'summit', resource), [resource])
    await store.write(cacheKey('ada', 'horizons', resource), [resource])
  }

  // The event-less keys: the active conference, which every session still writes, and the
  // legacy `self` identity entry — since 012's T032 `getCurrent` is `passThrough` and writes
  // nothing, but devices that last ran a pre-012 build still carry the key, so the erasure must
  // keep skipping it. Reading either as a conference id would have the erasure deleting the
  // attendee's own event-less entries on the first successful read.
  await store.write(cacheKey('ada', '', 'self'), { id: 'ada' })
  await store.write(cacheKey('ada', '', 'active-event'), conference('summit'))

  // A second attendee on the same device — a phone lent at a conference, a kiosk.
  await store.write(cacheKey('grace', 'horizons', 'notes'), ['grace’s note'])

  return { store, entries }
}

const held = (entries: Map<string, CachedEntry<unknown>>, attendeeId: string, eventId: string) =>
  [...entries.keys()].filter((key) => key.startsWith(cacheKey(attendeeId, eventId, '')))

describe('erasing a conference absent from a live registered list', () => {
  it('ERASES a withdrawn conference on a cold start, with no read of it refused (FIX-301, FIX-305)', async () => {
    const { store, entries } = await deviceHolding()

    // The client has just started. It has issued no conference-scoped read, so nothing has been
    // refused and the decorator's purge has had no opportunity to run — which is exactly the
    // state a reload leaves a device in.
    const events = erasingWithdrawnConferences(
      { listRegistered: async () => [conference('summit')] },
      store,
      { current: () => 'ada' },
    )

    await expect(events.listRegistered()).resolves.toEqual([conference('summit')])

    expect(
      held(entries, 'ada', 'horizons'),
      'A conference the server no longer lists is still cached on the device. On a device that ' +
        'did not perform the withdrawal nothing else will ever remove it: no read names that ' +
        'conference, so no read is refused, so the decorator never purges (FIX-301).',
    ).toEqual([])

    // ...and the conference they are still registered for is untouched. Erasing it would be
    // FR-215 destroyed by the mechanism meant to bound retention.
    expect(held(entries, 'ada', 'summit')).toHaveLength(4)
  })

  it('erases NOTHING when the read fails, because a failure is not an empty answer (FIX-302)', async () => {
    const { store, entries } = await deviceHolding()

    const events = erasingWithdrawnConferences(
      {
        listRegistered: async () => {
          throw new OfflineError('Loading your conferences')
        },
      },
      store,
      { current: () => 'ada' },
    )

    await expect(events.listRegistered()).rejects.toBeInstanceOf(OfflineError)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **An empty answer that failed is not an answer that the attendee is registered for
    // nothing.** Treating one as the other would erase a working offline copy on every
    // connectivity blip — every conference, on every device, whenever a lift went underground.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(held(entries, 'ada', 'summit')).toHaveLength(4)
    expect(held(entries, 'ada', 'horizons')).toHaveLength(4)
  })

  it('never reads an event-less key as a conference, so identity survives', async () => {
    const { store, entries } = await deviceHolding()

    const events = erasingWithdrawnConferences(
      { listRegistered: async () => [conference('summit'), conference('horizons')] },
      store,
      { current: () => 'ada' },
    )

    await events.listRegistered()

    expect(
      entries.has(cacheKey('ada', '', 'self')),
      'The legacy identity entry was erased. `getActive` takes no event argument (and pre-012 ' +
        'builds keyed `getCurrent` the same way — devices still carry that `self` key), so the ' +
        'decorator keys the event segment empty — read as a conference id, that is a ' +
        '"conference" absent from every registered list, and the erasure destroys the ' +
        "attendee's own event-less entries.",
    ).toBe(true)
    expect(entries.has(cacheKey('ada', '', 'active-event'))).toBe(true)
  })

  it('touches no other attendee’s entries on a shared device', async () => {
    const { store, entries } = await deviceHolding()

    // Ada is registered for nothing at all — the strongest form of the answer, and the one that
    // would take everything on the device if the erasure were not scoped by attendee.
    const events = erasingWithdrawnConferences({ listRegistered: async () => [] }, store, {
      current: () => 'ada',
    })

    await events.listRegistered()

    expect(held(entries, 'ada', 'summit')).toEqual([])
    expect(held(entries, 'ada', 'horizons')).toEqual([])
    expect(
      entries.has(cacheKey('grace', 'horizons', 'notes')),
      'Erasing one attendee’s withdrawn conference took another attendee’s notes with it.',
    ).toBe(true)
  })

  it('erases nothing before identity has resolved', async () => {
    const { store, entries } = await deviceHolding()

    // `anonymous` is the scope's value until `getCurrent` answers. There is no prefix to scope
    // an erasure to, and guessing one is the single way this could reach somebody else's data.
    const events = erasingWithdrawnConferences({ listRegistered: async () => [] }, store, {
      current: () => 'anonymous',
    })

    await expect(events.listRegistered()).resolves.toEqual([])
    expect(entries.size).toBe(11)
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FIX-305'S OTHER HALF: THE HELPER ABOVE IS ONLY A FIX IF IT IS WIRED IN.**
 *
 * Every assertion above imports `erasingWithdrawnConferences` directly, and it has to — the
 * cold-start case cannot be reached through `createServices()`, which builds a real
 * `HttpClient` and a real `WebLocalCache` that stores nothing outside a browser. The price of
 * that is exact and has to be paid separately: **delete the wrapper from the composition root,
 * leave `events: new HttpEventsRepository(http)` bare, and every test in this file still
 * passes** — FIX-301 and FIX-305 unmet in the shipped product, on a fully green build. The
 * helper's own header says it is exported *"only so that FIX-305 can be a real test"*, so its
 * single production call site is precisely the thing those tests cannot see.
 *
 * So this reads the composition root as **text**, which is `messages-absences.test.ts`'s idiom
 * for the inverse claim — that `conversations` and `messages` are constructed **bare**. That
 * guard has existed since 016; its mirror for `events` was never written.
 *
 * **Comments are stripped first.** The paragraphs in `services.ts` that explain this wiring name
 * the helper repeatedly, and a check its own justification could satisfy is one that goes on
 * passing after the wiring is deleted and the prose is left behind — 016's finding that a check
 * whose subject is prose is brightest exactly where it is blindest, read from the other end.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const compositionRoot = (): string =>
  readFileSync(join(import.meta.dirname, '../../src/app/services.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the composition root wires the erasure this feature depends on', () => {
  it('finds the composition root to read — a gate that cannot fail is not a gate', () => {
    expect(compositionRoot()).toContain('export const createServices')
  })

  it('WRAPS the events repository in `erasingWithdrawnConferences` (FIX-301, FIX-305)', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Whitespace-tolerant **across** the call, because prettier is free to break the three
    // arguments onto their own lines the moment anything about that line grows — and still
    // specific enough that the bare construction cannot satisfy it, because between `events:`
    // and `new HttpEventsRepository(` the bare form has nothing at all where this requires the
    // wrapper's name and its opening parenthesis.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(
      /events:\s*erasingWithdrawnConferences\(\s*new HttpEventsRepository\(\s*http\s*\)/.test(
        compositionRoot(),
      ),
      'The events repository is no longer wrapped in `erasingWithdrawnConferences` at the ' +
        'composition root. Every other assertion in this file imports that helper directly, so ' +
        'all of them stay green while FIX-301 and FIX-305 are unmet in the shipped product. ' +
        '**The erasure is the only mechanism that reaches a device which never issues a refused ' +
        'read**: `GET /workspace/active-event` answers an attendee registered for nothing with ' +
        '204, every conference-scoped read is gated behind that resolving to `ready`, and no ' +
        'route carries an `:eventId`, so after a cold start nothing addresses the withdrawn ' +
        'conference again and the decorator’s purge-on-refusal never fires. An unwrapped ' +
        '`events` member therefore leaves the withdrawn conference’s programme, saved set and ' +
        'notes on the device with nothing left to remove them — silently reopening the cache ' +
        'residue register entry 22 was closed over, in a fully passing build.',
    ).toBe(true)
  })

  it('constructs NO bare events repository at the composition root', () => {
    // The negative half of the pair, exactly as `messages-absences.test.ts` writes it: one
    // assertion requires the shape that must be there, one refuses the shape that must not.
    // Removing the wrapper fails both, which is the point of writing them separately.
    expect(
      /events:\s*new\s+Http[A-Za-z]*Repository\(/.test(compositionRoot()),
      'The events repository is constructed bare at the composition root. `listRegistered()` is ' +
        'the one call in the client that learns the authoritative set of conferences, and it is ' +
        'the only read a cold-started device makes that names them at all — undecorated, live, ' +
        'and therefore trustworthy. Constructed bare it erases nothing, and a conference the ' +
        'attendee has left survives on that device until something reads it, which on that ' +
        'device nothing will (FIX-301, register entry 22).',
    ).toBe(false)
  })
})
