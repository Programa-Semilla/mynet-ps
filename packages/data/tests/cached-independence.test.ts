import { describe, expect, it } from 'vitest'

import { cached } from '../src/http/cached.js'
import type { CachedEntry, LocalCache } from '../src/http/cache-store.js'

/**
 * T058 (005) — **two concurrent callers each receive their OWN promise** (FR-222, SC-212).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE TEST THAT KEEPS THE HOME COMPOSITION CONTRACT INTACT.**
 *
 * The cache dedupes an in-flight read so that two Home cards asking for the same programme
 * cost one request. The obvious way to do that — hand both callers the same promise — quietly
 * breaks FR-164: one caller's rejection *becomes* the other caller's rejection, so one card
 * failing would suppress a sibling's rendering, and one card's retry would be something the
 * other had to wait on.
 *
 * FR-222 states the requirement in exactly those terms: reads may be shared, "**without any
 * card depending on another card's presence or data**", and "when a shared read fails, each
 * card MUST render its own failure state independently".
 *
 * So each caller gets a *derived* promise. The `.then(v => v)` in `cached.ts` that produces it
 * looks like a no-op and is not one — this file is what stops it being "simplified" away.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const nullStore = (): LocalCache => ({
  read: async () => null as CachedEntry<never> | null,
  write: async () => {},
  purge: async () => {},
})

/** A repository whose single read is held open until the test settles it. */
const heldRepository = () => {
  let settle: { resolve: (value: string[]) => void; reject: (error: Error) => void } | undefined
  let calls = 0

  return {
    get calls() {
      return calls
    },
    resolve: (value: string[]) => settle?.resolve(value),
    reject: (error: Error) => settle?.reject(error),
    repository: {
      listSaved: async (_eventId: string): Promise<string[]> => {
        calls += 1
        return new Promise<string[]>((resolve, reject) => {
          settle = { resolve, reject }
        })
      },
    },
  }
}

const READS = { listSaved: 'saved' } as const

describe('concurrent callers of a shared read', () => {
  it('issues ONE request for two concurrent callers', async () => {
    const held = heldRepository()
    const subject = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)

    const first = subject.listSaved('summit')
    const second = subject.listSaved('summit')

    // The whole reason the cache exists at the repository boundary: adding a third reader to
    // Home does not add a third request (SC-210).
    expect(held.calls).toBe(1)

    held.resolve(['a'])
    expect(await first).toEqual(['a'])
    expect(await second).toEqual(['a'])
  })

  it('gives each caller a SEPARATE promise object', () => {
    const held = heldRepository()
    const subject = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)

    const first = subject.listSaved('summit')
    const second = subject.listSaved('summit')

    // Not merely equal values — distinct objects, so their rejection handling is independent.
    expect(first).not.toBe(second)

    held.resolve([])
  })

  it('lets ONE caller handle a rejection WITHOUT affecting the other (SC-212)', async () => {
    const held = heldRepository()
    const subject = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)

    const failing = subject.listSaved('summit')
    const alsoFailing = subject.listSaved('summit')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The first caller catches and recovers — as a Home card does when it renders its own
    // failure state. The second must still receive the rejection and render *its* own failure
    // state, rather than being silently resolved by a sibling's recovery.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const firstOutcome = failing.then(
      () => 'resolved',
      () => 'each card renders its own failure',
    )

    held.reject(new Error('the shared read failed'))

    expect(await firstOutcome).toBe('each card renders its own failure')
    await expect(
      alsoFailing,
      'A sibling handling the failure must not swallow it for the other caller.',
    ).rejects.toThrow('the shared read failed')
  })

  it('does not let one caller’s unhandled rejection become the other’s problem', async () => {
    const held = heldRepository()
    const subject = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)

    const first = subject.listSaved('summit')
    const second = subject.listSaved('summit')

    held.reject(new Error('boom'))

    // Both reject, independently, and both are observed here so neither is unhandled.
    await expect(first).rejects.toThrow('boom')
    await expect(second).rejects.toThrow('boom')
  })

  it('starts a FRESH request once the shared one has settled — a retry is not blocked', async () => {
    const held = heldRepository()
    const subject = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)

    const first = subject.listSaved('summit')
    held.reject(new Error('first attempt failed'))
    await expect(first).rejects.toThrow('first attempt failed')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // FR-222: no card may be made to "wait on another card's retry". The in-flight entry is
    // cleared the moment the request settles, so a retry is a real new request rather than a
    // second subscription to a promise that has already failed.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const retry = subject.listSaved('summit')
    expect(held.calls).toBe(2)

    held.resolve(['a'])
    expect(await retry).toEqual(['a'])
  })

  it('does not share across conferences', async () => {
    const held = heldRepository()
    const subject = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)

    void subject.listSaved('summit')
    void subject.listSaved('horizons')

    // Two conferences are two reads. Sharing them would be the "one conference's content under
    // another's name" failure FR-220 exists to prevent.
    expect(held.calls).toBe(2)
    held.resolve([])
  })

  it('does not share across attendees', async () => {
    const held = heldRepository()
    const ada = cached(held.repository, nullStore(), { attendeeId: 'ada' }, READS)
    const grace = cached(held.repository, nullStore(), { attendeeId: 'grace' }, READS)

    void ada.listSaved('summit')
    void grace.listSaved('summit')

    // Separate decorators, separate in-flight maps — and separate cache keys besides.
    expect(held.calls).toBe(2)
    held.resolve([])
  })
})
