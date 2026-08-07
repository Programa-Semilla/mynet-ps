import { describe, expect, it } from 'vitest'

import { prefixBounds, resetLocalCacheForTests, WebLocalCache } from '../src/web/local-cache.js'

/**
 * T056 (005) — the web `LocalCache` (FR-215, FR-220, FR-221, research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT THIS FILE CAN AND CANNOT HONESTLY ASSERT — READ BEFORE ADDING TO IT.**
 *
 * This project's `unit` layer runs in Node, which has no IndexedDB. Two choices follow, and
 * both are deliberate:
 *
 *   - **The 24-hour lifetime is NOT tested here**, because it is not implemented here. The
 *     interface stores and returns and decides nothing; the age limit lives in the caching
 *     decorator, expressed once, and is asserted in
 *     `packages/data/tests/cached-repository.test.ts`. Putting a second copy of the rule in
 *     this layer is exactly what would let a native implementation later disagree with the web
 *     one about when an attendee's access is revoked offline.
 *
 *   - **The IndexedDB round trip is proved in a browser**, by `e2e/agenda-offline.spec.ts`.
 *     Standing up a fake IndexedDB here would test the fake — a gate that reads as coverage
 *     and checks nothing, which this codebase warns about repeatedly.
 *
 * What is left is genuinely worth holding: the prefix boundary, which is the one piece of real
 * logic in the implementation, and the degradation path, which is what stops an offline
 * *feature* becoming an online *regression*.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

describe('the prefix boundary a purge selects on', () => {
  /** Whether a key falls inside the half-open range, exactly as IndexedDB compares strings. */
  const selects = (prefix: string, key: string): boolean => {
    const { lower, upper } = prefixBounds(prefix)
    return key >= lower && key <= upper
  }

  it('selects every key beginning with the prefix', () => {
    const prefix = 'attendee:ada|event:summit|'

    for (const resource of ['programme', 'saved', 'notes']) {
      expect(selects(prefix, `${prefix}${resource}`), resource).toBe(true)
    }
  })

  it('reaches every conference when purging an ATTENDEE — the sign-out case', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A longer prefix extends a shorter one, so the attendee bound must sort after all of it.
    // If it did not, signing out would leave one conference's notes readable to whoever signed
    // in next on the same device.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const attendee = 'attendee:ada|'

    expect(selects(attendee, 'attendee:ada|event:summit|notes')).toBe(true)
    expect(selects(attendee, 'attendee:ada|event:horizons|programme')).toBe(true)
  })

  it('does NOT select another attendee’s keys', () => {
    // The Principle VIII failure this boundary prevents: purging Ada must not be the thing
    // that decides whether Grace's content survives, in either direction.
    expect(selects('attendee:ada|', 'attendee:grace|event:summit|saved')).toBe(false)
    expect(selects('attendee:grace|', 'attendee:ada|event:summit|saved')).toBe(false)
  })

  it('does NOT select another conference’s keys when purging one conference', () => {
    // FR-221's "purging the whole cache on any refusal" was rejected: one conference's refusal
    // must not discard another conference's readable content.
    const summit = 'attendee:ada|event:summit|'
    expect(selects(summit, 'attendee:ada|event:horizons|programme')).toBe(false)
  })

  it('does not select an attendee whose identifier merely EXTENDS another', () => {
    // `attendee:ada|` cannot match `attendee:adam|…` because the `|` terminator sorts below
    // every ordinary character. Without a terminator in the key format this would be a real
    // cross-attendee leak rather than a hypothetical one.
    expect(selects('attendee:ada|', 'attendee:adam|event:summit|saved')).toBe(false)
  })
})

describe('storage that is unavailable', () => {
  /**
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **Every failure path must yield "nothing cached" rather than an error**, and this is the
   * assertion that holds it.
   *
   * Storage can be missing for reasons unrelated to this product: private browsing, a quota, a
   * corrupt database, an evicted origin — and, here, a Node process. In every one of those the
   * honest behaviour is the same as an empty cache, and the attendee is told a connection is
   * needed (FR-219).
   *
   * An implementation that threw would take down surfaces that work perfectly well online,
   * which would make a feature added to improve the offline experience a *reliability
   * regression* for everyone else.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('reads as empty rather than throwing when there is no IndexedDB', async () => {
    resetLocalCacheForTests()
    const cache = new WebLocalCache()

    await expect(cache.read('attendee:ada|event:summit|saved')).resolves.toBeNull()
  })

  it('accepts a write silently rather than throwing', async () => {
    resetLocalCacheForTests()
    const cache = new WebLocalCache()

    // The caller is a repository serving a read it has already answered. A rejection here would
    // turn a successful online read into a failure.
    await expect(cache.write('attendee:ada|event:summit|saved', ['a'])).resolves.toBeUndefined()
  })

  it('accepts a purge silently rather than throwing', async () => {
    resetLocalCacheForTests()
    const cache = new WebLocalCache()

    // Purging runs on sign-out and on an authorization refusal. Throwing would turn "your
    // access was withdrawn" into an unhandled error on a path that must always complete.
    await expect(cache.purge('attendee:ada|')).resolves.toBeUndefined()
  })

  it('satisfies the LocalCache interface', () => {
    const cache = new WebLocalCache()

    // Structural, because the composition root is where this meets `@mynet/data`'s structural
    // copy of the same shape — the two packages are leaves and neither imports the other.
    expect(typeof cache.read).toBe('function')
    expect(typeof cache.write).toBe('function')
    expect(typeof cache.purge).toBe('function')
  })
})
