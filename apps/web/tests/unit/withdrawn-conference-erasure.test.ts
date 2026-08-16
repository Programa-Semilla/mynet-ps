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

  // The two event-less keys every session writes: identity, and the active conference. Their
  // event segment is empty, and reading either as a conference id would have the erasure
  // deleting the attendee's own cached identity on the first successful read.
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
      'The cached identity was erased. `getCurrent` and `getActive` take no event argument, so ' +
        'the decorator keys them with an empty event segment — read as a conference id, that is ' +
        'a "conference" absent from every registered list, and the attendee is signed out of ' +
        'their own offline shell.',
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
