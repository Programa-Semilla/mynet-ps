import type { CachedEntry, LocalCache } from './cache-store.js'
import {
  NotAuthenticatedError,
  RequestRefusedError,
  SessionExpiredError,
} from '../interfaces/errors.js'

/**
 * T063, T064 (005) — the caching decorator (FR-215–FR-222, research D1, D10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A DECORATOR OVER A REPOSITORY, SO NO COMPONENT LEARNS THAT A CACHE EXISTS.**
 *
 * `cached(repo, …)` returns something satisfying the same interface. The composition root
 * wires the decorated instance and nothing else changes — not a card, not a hook, not a test
 * double. Principle V forbids components knowing transport or caching details, and this is how
 * both stay true at once: the interface is the contract, the cache is an implementation of it,
 * and a caller cannot tell the difference.
 *
 * It also means **the offline path and the repeat-read path are the same code**, which is why
 * closing `home-card-duplicate-reads` falls out of this rather than being separate work.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-222 / SC-212 — EVERY CALLER GETS ITS OWN PROMISE, AND THAT IS THE WHOLE CARE POINT.**
 *
 * Home renders independent cards, and FR-164 says no card may depend on another's presence or
 * data. Two of them read the same programme, so an in-flight read is shared — but sharing a
 * promise object would mean one caller's rejection *is* another caller's rejection, and one
 * card's failure would suppress a sibling's rendering. That is exactly the composition
 * contract FR-222 forbids breaking.
 *
 * So the in-flight request is deduped and each caller is handed a **separate** promise derived
 * from it. One card can fail, retry, and recover without the other noticing, and neither waits
 * on the other's retry.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Re-exported so consumers need not reach into `@mynet/platform` for the shape. */
export type { CachedEntry, LocalCache }

/**
 * **24 hours from retrieval** (FR-221).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Beyond this an entry is treated as absent — refused with the same wording as a conference
 * never read, rather than shown with an old stamp.
 *
 * **This is the only mechanism that revokes access offline.** Online, an authorization refusal
 * purges the conference's entries immediately; offline there is no server present to refuse,
 * so the age limit is what bounds the window in which an attendee whose registration has been
 * withdrawn can still read that conference's content. The spec review escalated its absence
 * from a governance gap to an authorization hole for precisely that reason, which is why the
 * value is a requirement rather than an assumption.
 *
 * Whether 24 hours is the *right* span is recorded as an open question. That there is a value
 * is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000

/**
 * A cache key: `(attendeeId, eventId, resource)` (research D10).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The attendee is in the key, and leaving it out would be a Principle VIII failure the
 * cache itself introduced.** Keyed by conference alone, signing out and in as somebody else on
 * a shared device — a phone lent at a conference, a kiosk — would serve the previous
 * attendee's cached *notes*. That is the product's first attendee-authored free text.
 *
 * The prefix structure is what makes both invalidations expressible as one purge: everything
 * for an attendee is `attendee:…`, everything for one of their conferences is
 * `attendee:…|event:…`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const cacheKey = (attendeeId: string, eventId: string, resource: string): string =>
  `${attendeePrefix(attendeeId)}${eventPrefix(eventId)}${resource}`

export const attendeePrefix = (attendeeId: string): string => `attendee:${attendeeId}|`

const eventPrefix = (eventId: string): string => `event:${eventId}|`

/** Everything cached for one attendee's one conference — what an authorization refusal drops. */
export const conferencePrefix = (attendeeId: string, eventId: string): string =>
  `${attendeePrefix(attendeeId)}${eventPrefix(eventId)}`

/** Which repository methods are cacheable reads, and what resource each stores under. */
export interface CachedReads {
  /** Method name → the `resource` segment of its cache key. */
  readonly [method: string]: string
}

export interface CacheScope {
  readonly attendeeId: string
}

/** The clock, injected so the age limit is testable without waiting a day. */
export type Clock = () => number

/**
 * Which surfaces are currently being served from the cache, and from when (FR-216, SC-204).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A component must be able to say "last updated at…" without knowing a cache exists.**
 *
 * FR-216 requires any surface served from cache to state when its content was retrieved, and
 * SC-204 requires that **no cached surface is presented as if it were live**. Neither is
 * answerable from the payload — a cached programme and a live one are the same array — and a
 * component cannot be told to ask the cache directly without exactly the transport knowledge
 * Principle V keeps out of it.
 *
 * So the decorator records what it just did. `lastRetrieved` answers **only** when the most
 * recent read for that key fell back to the cache; a successful live read clears the entry, so
 * the stamp disappears the moment the content is current again. That is what makes the two
 * halves of SC-204 true together rather than only the first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface FreshnessRegistry {
  /** When the payload currently on screen was retrieved, or `null` when it is live. */
  lastRetrieved(attendeeId: string, eventId: string, resource: string): string | null
  /** Written by the decorator. `null` means "this read was live". */
  record(key: string, retrievedAt: string | null): void
}

export const createFreshnessRegistry = (): FreshnessRegistry => {
  const served = new Map<string, string>()

  return {
    lastRetrieved: (attendeeId, eventId, resource) =>
      served.get(cacheKey(attendeeId, eventId, resource)) ?? null,
    record: (key, retrievedAt) => {
      if (retrievedAt === null) served.delete(key)
      else served.set(key, retrievedAt)
    },
  }
}

/**
 * Whether the server **answered and said no** — as opposed to not answering at all.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CACHE MUST NEVER SERVE A COPY OF SOMETHING THE SERVER HAS BEGUN REFUSING.**
 *
 * This predicate existed as a bare `instanceof RequestRefusedError`, and that missed the two
 * refusals that matter most: `NotAuthenticatedError` and `SessionExpiredError` extend `Error`
 * directly rather than `RequestRefusedError`, because 001 needed the client to tell "signed out
 * for inactivity" from "never signed in" and gave each its own type.
 *
 * The consequence was a genuine authorization bypass, and 004 is the feature that made it
 * reachable. A `401` fell through to the "offline, or a server fault" branch and the decorator
 * **served the cached identity from disk** — so after a password reset revoked every session
 * (FR-330), or after an account was deleted on another device (FR-369), the client kept
 * rendering a signed-in shell for up to the cache lifetime. FR-369's edge case names that
 * outcome exactly: *it must not present a signed-in shell for an attendee who no longer
 * exists.*
 *
 * Found by `e2e/password-recovery.spec.ts`. Nothing else could have: 005's own cache tests
 * exercise `RequestRefusedError`, which was never the broken case, and the API-side tests prove
 * the server revokes — which it does. The gap was entirely on this side of the wire.
 *
 * `SessionExpiredError` is included for the same reason and not merely for symmetry: an idle
 * session that the server has stopped honouring is a session, and reading a cached workspace
 * after it ends is reading data the server would refuse.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const isRefusal = (error: unknown): boolean =>
  error instanceof RequestRefusedError ||
  error instanceof NotAuthenticatedError ||
  error instanceof SessionExpiredError

export interface CacheOptions {
  readonly now?: Clock
  readonly freshness?: FreshnessRegistry
}

const isFresh = (entry: CachedEntry<unknown>, now: number): boolean => {
  const retrieved = Date.parse(entry.retrievedAt)
  // An unparseable stamp is treated as absent rather than as fresh. Failing towards "nothing
  // cached" is the direction that cannot leak: the worst outcome is a request the attendee
  // would have made anyway.
  if (Number.isNaN(retrieved)) return false
  return now - retrieved <= CACHE_LIFETIME_MS
}

/**
 * Wraps a repository so its named read methods are served from, and written to, the cache.
 *
 * Every method not named in `reads` is passed straight through — **writes are never cached and
 * never queued** (FR-217). A refused write additionally purges the conference it was refused
 * for, which is what keeps the cache from serving content the server has begun refusing.
 */
export const cached = <T extends object>(
  repository: T,
  store: LocalCache,
  scope: CacheScope,
  reads: CachedReads,
  options: CacheOptions = {},
): T => {
  const now = options.now ?? (() => Date.now())
  const freshness = options.freshness
  /**
   * In-flight reads, keyed by cache key. Cleared the moment the request settles, so this
   * dedupes concurrent callers and holds nothing between renders — the *cache* is the store,
   * this is only coalescing.
   */
  const inFlight = new Map<string, Promise<unknown>>()

  const purgeConference = (eventId: string): Promise<void> =>
    store.purge(conferencePrefix(scope.attendeeId, eventId))

  return new Proxy(repository, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver) as unknown
      if (typeof original !== 'function' || typeof property !== 'string') return original

      const resource = reads[property]

      // ── A write ────────────────────────────────────────────────────────────────────────
      if (resource === undefined) {
        return async (...args: unknown[]): Promise<unknown> => {
          const eventId = typeof args[0] === 'string' ? args[0] : undefined

          try {
            const result: unknown = await (original as (...a: unknown[]) => Promise<unknown>).apply(
              target,
              args,
            )

            // A successful write makes this conference's cached reads stale in a way no age
            // limit would catch — the attendee's own saved set has just changed. Dropping them
            // is cheaper and more honest than trying to patch the cached payload, which would
            // be a second source of truth for what the server holds.
            if (eventId) await purgeConference(eventId)
            return result
          } catch (error) {
            // ───────────────────────────────────────────────────────────────────────────────
            // **A refusal invalidates that conference immediately** (FR-221). The cache must
            // never serve content the server has begun refusing — a withdrawn registration
            // must not remain readable because it happens to be stored locally.
            // ───────────────────────────────────────────────────────────────────────────────
            if (isRefusal(error) && eventId) await purgeConference(eventId)
            throw error
          }
        }
      }

      // ── A cacheable read ───────────────────────────────────────────────────────────────
      return async (...args: unknown[]): Promise<unknown> => {
        const eventId = typeof args[0] === 'string' ? args[0] : ''
        const key = cacheKey(scope.attendeeId, eventId, resource)

        const existing = inFlight.get(key)
        // ─────────────────────────────────────────────────────────────────────────────────
        // `.then(v => v)` is not a no-op and must not be "simplified" away. It derives a
        // **separate promise** for this caller, so a rejection propagates to each caller
        // independently and one card's failure cannot suppress another's rendering (FR-222,
        // SC-212). Returning `existing` itself would hand every caller the same object.
        // ─────────────────────────────────────────────────────────────────────────────────
        if (existing) return existing.then((value) => value)

        const request = (async (): Promise<unknown> => {
          try {
            const fresh: unknown = await (original as (...a: unknown[]) => Promise<unknown>).apply(
              target,
              args,
            )
            await store.write(key, fresh)
            // Live. Any stamp this surface was carrying is now wrong and is cleared (SC-204).
            freshness?.record(key, null)
            return fresh
          } catch (error) {
            if (isRefusal(error)) {
              // Refused: drop this conference and re-throw. Serving the cached copy here would
              // turn the cache into an authorization bypass.
              await purgeConference(eventId)
              freshness?.record(key, null)
              throw error
            }

            // Offline, or a server fault. Fall back to the cache — this is FR-215.
            const entry = await store.read<unknown>(key)
            // An entry past its lifetime is treated as **absent**, so the caller reports "a
            // connection is needed and nothing is cached" rather than showing old content with
            // an old stamp (FR-219, FR-221).
            if (entry && isFresh(entry, now())) {
              // Served from cache — so the surface must say when it was retrieved (FR-216).
              freshness?.record(key, entry.retrievedAt)
              return entry.payload
            }

            freshness?.record(key, null)
            throw error
          }
        })().finally(() => {
          inFlight.delete(key)
        })

        inFlight.set(key, request)
        return request.then((value) => value)
      }
    },
  })
}
