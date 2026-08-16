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
 * Beyond this an entry is refused with the same wording as a conference never read, rather
 * than shown with an old stamp — **and, since FIX-2, deleted rather than merely left
 * unserved**. It used to be only *treated as* absent, which bounded serving and left the bytes
 * on the device forever.
 *
 * **Two mechanisms delete, and the second is not redundant.** The expiry branch below deletes
 * an entry somebody reads; `sweepExpired` deletes an entry nobody will ever read again, which
 * is the state a device whose account has gone is permanently in. Neither reaches the other's
 * case — review finding I1 is what established that the first alone does not close this.
 *
 * **This is the only mechanism that revokes access offline.** The spec review escalated its
 * absence from a governance gap to an authorization hole for precisely that reason, which is
 * why the value is a requirement rather than an assumption.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FIX-304 — WHAT THE ONLINE HALF OF THIS PARAGRAPH USED TO CLAIM, AND WHAT ACTUALLY
 * HAPPENS.**
 *
 * It read: *"Online, an authorization refusal purges the conference's entries immediately."*
 * That is true of **the mechanism** — the branches below do exactly that — and silent on the
 * only question that matters, which is **whether such a refusal ever arrives**. On the device
 * that performed the withdrawal it does. On any *other* device it frequently does not:
 *
 *   - `GET /workspace/active-event` answers an attendee registered for nothing with **204 — a
 *     success, not a refusal.** Every conference-scoped read in the client is gated behind that
 *     call resolving to `ready`, and no route carries an `:eventId` parameter, so no
 *     destination holds a remembered conference id it could fire with. **After a cold start or
 *     a full reload the client never addresses the withdrawn conference again**, so nothing is
 *     refused and this branch never runs.
 *   - A tab already open at `ready` does eventually purge, when the next gated surface mounts
 *     or retries. But **nothing forces it**: there is no poll, no focus refetch and no
 *     reconnect refetch of the active event. A device coming back online purges when somebody
 *     happens to navigate, not when it reconnects.
 *
 * So the age limit is not a backstop behind a prompt online purge; **for a cold-started device
 * it is the whole of it.** What closes the gap is not in this file and deliberately not in it:
 * a successful `EventsRepository.listRegistered()` erases every conference held for the
 * attendee and absent from the answer, wired at the composition root (`apps/web/src/app/
 * services.ts`, FIX-3/FIX-303). No repository is given responsibility for another's cache
 * here, which is the objection that withdrew 009's FR-756a.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Whether 24 hours is the *right* span is recorded as an open question — deferred by R1 as a
 * product judgement that cannot be priced without a real conference. That there is a value is
 * not.
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

/**
 * Every key this grammar writes, whoever it belongs to.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The one prefix that names no attendee, and the only caller who may want that is the
 * retention sweep below** — which runs before anybody has signed in and must reach a key
 * belonging to somebody who never will again.
 *
 * `attendeePrefix` is derived from it rather than repeating the literal, for
 * `heldConferences`' reason: a second copy of the key grammar is how the two drift, and the one
 * that fell behind would decide whether an expired entry is ever found.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const ALL_ATTENDEES_PREFIX = 'attendee:'

export const attendeePrefix = (attendeeId: string): string =>
  `${ALL_ATTENDEES_PREFIX}${attendeeId}|`

const eventPrefix = (eventId: string): string => `event:${eventId}|`

/** Everything cached for one attendee's one conference — what an authorization refusal drops. */
export const conferencePrefix = (attendeeId: string, eventId: string): string =>
  `${attendeePrefix(attendeeId)}${eventPrefix(eventId)}`

/**
 * The conferences this attendee has entries stored for, read back out of their keys.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE INVERSE OF `cacheKey`, AND IT LIVES BESIDE IT BECAUSE A SECOND COPY OF THE GRAMMAR IS
 * HOW THE TWO DRIFT.**
 *
 * FIX-3's erasure lives at the composition root and must (FIX-303) — no repository may be
 * given responsibility for another's cache, and no classification map is touched. **This is
 * not that mechanism.** It is a pure function over strings: it reads no store, deletes
 * nothing, decides nothing, and knows about no repository. What it knows is the key format,
 * which is written four lines above; writing a second parser for it at the root would mean the
 * format had two definitions and the one that fell behind would be the one deciding whether a
 * withdrawn conference survives on somebody's phone.
 *
 * **Keys naming no conference are skipped, and that is the subtle half.** `getActive` takes no
 * event argument, so the decorator keys it with an empty event segment —
 * `attendee:ada|event:|active-event` (until 012's T032, `getCurrent` wrote the same shape too,
 * and devices still carry those keys). Reading that as a conference whose id is the empty
 * string would offer the caller a "conference" absent from every registered list, and the
 * erasure would delete the attendee's own event-less entries on the first successful read.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const heldConferences = (attendeeId: string, keys: readonly string[]): string[] => {
  const attendee = attendeePrefix(attendeeId)
  const marker = 'event:'
  const held = new Set<string>()

  for (const key of keys) {
    if (!key.startsWith(attendee)) continue
    const rest = key.slice(attendee.length)
    if (!rest.startsWith(marker)) continue

    const terminator = rest.indexOf('|', marker.length)
    // No terminator is a key this grammar did not write; an id of zero length is the
    // event-less form above. Neither names a conference.
    if (terminator <= marker.length) continue

    held.add(rest.slice(marker.length, terminator))
  }

  return [...held]
}

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
  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **READS THAT ARE DELIBERATELY NOT CACHED — AND THE REASON THIS OPTION HAD TO EXIST** (008).
   *
   * Everything not named in `reads` falls into the write branch below, which **purges the whole
   * conference prefix on success**. That was safe while every unnamed method really was a write,
   * which was true for 005, 004 and 006.
   *
   * 008 added the first *read* that must not be cached: `AppointmentRepository.slots`. A stale
   * offered set would invite a proposal for a slot the reader has since filled, so leaving it
   * out of `reads` was correct — and leaving it out of `reads` **also enrolled it in the write
   * branch**, so opening the scheduling dialog silently destroyed the attendee's cached
   * programme, tracks, saved sessions, notes and appointments for that conference. FR-215 and
   * FR-647 both failed on the next disconnection, with nothing on screen to say why.
   *
   * The classification was by omission, so there was no way to say "this is a read, and it is
   * live". This is that way. A method named here is passed straight through: not served from
   * the cache, not written to it, and **not purging anything**.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  readonly passThrough?: readonly string[]
}

/**
 * **How far past its lifetime an entry may be before its age stops being evidence about the
 * ENTRY and starts being evidence about the CLOCK** (review finding M6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE STAMP IS WRITTEN FROM THE DEVICE CLOCK AND COMPARED AGAINST THE DEVICE CLOCK, SO A
 * CLOCK THAT MOVES AGES EVERY ENTRY AT ONCE.**
 *
 * Before FIX-2 that was recoverable: a device whose date had jumped forward served nothing,
 * and correcting the date brought the whole cache back. FIX-2 made the same branch
 * **destructive**, so a jump would delete the attendee's entire offline copy — at exactly the
 * moment they are offline and relying on it, since that is the only branch that runs.
 *
 * The asymmetry was already there and is worth naming: a **backwards** jump makes every entry
 * test as fresh forever, and this file has always accepted that. So the clock was already
 * treated as untrustworthy in one direction while FIX-2 began acting destructively on the
 * other.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THE CEILING IS LARGE, AND WHAT IT THEREFORE DOES NOT COVER.**
 *
 * A 25-hour absence and a 25-hour forward correction are **the same observation**, and no
 * amount of care here can separate them. Any ceiling picks a point on that trade, and picking
 * a tight one — a week, a month — would disable the retention sweep for the case that matters
 * most: this is a conference product, and the ordinary gap between two uses of a device is
 * months, not days. A ceiling shorter than that gap means an abandoned device's bytes are
 * never deleted at all, which is the defect FIX-2 exists to close.
 *
 * So the ceiling is set past any plausible period of disuse, and buys protection against the
 * **gross** error only: a stamp claiming to be more than a year older than "now", against a
 * store whose lifetime is a day, says more about the device's date than about the entry. Such
 * an entry is **not served and not deleted** — the pre-FIX-2 state, which is recoverable by
 * fixing the clock.
 *
 * **A small forward correction is knowingly not covered.** Closing it needs a clock the
 * platform does not offer, and the alternative — never deleting — is the retention hole.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const CLOCK_TRUST_CEILING_MS = 400 * 24 * 60 * 60 * 1000

/**
 * What may be done with an entry, given the clock:
 *
 *   - **`fresh`** — inside the lifetime, so serve it.
 *   - **`expired`** — past the lifetime by a credible margin, so serve nothing **and delete it**
 *     (FIX-201). An unparseable stamp lands here too: it can never become readable, so retaining
 *     it has no possible benefit.
 *   - **`withheld`** — an age only a moved clock explains. Serve nothing, delete nothing.
 *
 * One parse and one comparison, so the read path and the sweep cannot disagree about when an
 * entry stops being readable. That single definition is the reason the age rule lives in this
 * package rather than in `LocalCache`: an implementation re-deriving it could disagree with
 * this one about when access is revoked offline.
 */
type EntryAge = 'fresh' | 'expired' | 'withheld'

const ageOf = (entry: CachedEntry<unknown>, now: number): EntryAge => {
  const retrieved = Date.parse(entry.retrievedAt)
  // An unparseable stamp is treated as absent rather than as fresh. Failing towards "nothing
  // cached" is the direction that cannot leak: the worst outcome is a request the attendee
  // would have made anyway.
  if (Number.isNaN(retrieved)) return 'expired'

  const age = now - retrieved
  // A negative age — a stamp in the future — reads as fresh, exactly as it did before this
  // classifier existed. It is the backwards-jump case, and it is stated here rather than left
  // to fall out of the comparison so that the destructive branch below is visibly unreachable
  // for it.
  if (age <= CACHE_LIFETIME_MS) return 'fresh'
  return age <= CLOCK_TRUST_CEILING_MS ? 'expired' : 'withheld'
}

/**
 * Deletes every entry on the device that has aged past the lifetime, whoever it belongs to and
 * whether or not anybody ever reads it again (review finding I1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FIX-2's EXPIRY BRANCH CANNOT REACH THE DEVICE FIX-2 WAS WRITTEN FOR, AND THIS IS WHAT
 * REACHES IT.**
 *
 * The branch in `cached` deletes an entry at the moment it is *read* past its lifetime. That
 * requires somebody to issue a conference-scoped read while the server is unreachable — and
 * **the state the problem statement names is exactly the state in which no such read is ever
 * issued.** A device that has stopped being able to reach the account, because the account was
 * deleted elsewhere or a session ended and was never re-established, renders signed-out. Every
 * conference-scoped read is gated behind an identity that never resolves, so nothing under the
 * real attendee id is ever presented for expiry: the programme, the tracks, the saved set, the
 * appointments and **`notes`**, the product's only attendee-authored free text, sit in
 * IndexedDB forever. The decorator's five purges all require a live session with a resolved
 * identity, so on a lapsed session the only prefix any of them can name is
 * `attendee:anonymous|event:|`. There is no size cap and no LRU behind them. A shared device —
 * a phone lent at a conference, a kiosk — accumulates one full conference set per attendee who
 * ever signed in and closed the tab.
 *
 * So this runs **once at startup and depends on nobody being signed in**, which is the whole
 * property. It is the only mechanism here that acts on an attendee the device can no longer
 * identify.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS IS NOT THE MECHANISM R1 REJECTS, AND THE NEXT READER WILL ASK — SO IT IS ANSWERED
 * HERE.**
 *
 * Constitution v5.4.0 R1 rejects purging **on an authorization refusal**, and the objection is
 * specific: a `NotAuthenticatedError` or `SessionExpiredError` on `getCurrent()` cannot
 * distinguish an idle-timeout expiry from a deleted account, so acting on one destroys the
 * offline copy of an attendee who is about to sign back in. **That is a mechanism which
 * classifies why a session ended. This one classifies nothing.** It never looks at a session,
 * an error, an identity or a conference; it reads a stamp and a clock, and deletes only entries
 * FIX-201 has already declared unreadable by any caller. An entry it deletes is one the
 * decorator would refuse to serve a second later — so nothing that could have been shown is
 * lost, and an attendee who signs back in re-fetches what they would have re-fetched anyway.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THIS IS A FUNCTION HERE AND NOT A `sweep(olderThanMs)` MEMBER ON `LocalCache`.**
 *
 * A store-side sweep is one cursor pass rather than N reads, and that was the argument for it.
 * It was rejected because it moves the *comparison* — parse the stamp, judge the age, decide
 * what an unparseable one means — into every implementation of the interface, and
 * `local-cache.ts` states plainly that the lifetime is expressed **once**, in this package,
 * precisely so a native implementation cannot disagree with the web one about when access is
 * revoked offline. `ageOf` is that one definition, and the read path and this sweep share it by
 * construction. The cost is paid in transactions on a fire-and-forget startup path, which is
 * the cheap side of that trade.
 *
 * The reads are sequential rather than a `Promise.all`, so a device holding a lot of entries
 * spends its first moments serving the attendee's own requests rather than competing with them.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE RACE IS REAL AND ITS COST IS ONE REPEATED REQUEST.** A live read finishing between this
 * sweep's `read` and its `remove` would have a just-written entry deleted. That entry was
 * written by a **successful** live read, so the device was online a moment ago and the loss is a
 * repeat of a request it could make; nothing an attendee can see changes. The alternative — a
 * lock across the store — would be a mechanism far larger than the defect.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Answers the number of entries deleted, so a caller can assert on it. Every store member
 * fails towards "nothing there" rather than throwing (see `LocalCache`), so this resolves on
 * every path — and its caller at the composition root still catches, because a substituted
 * store is not bound by that and **nothing on a rendering path may depend on this succeeding**.
 */
export const sweepExpired = async (
  store: LocalCache,
  now: Clock = () => Date.now(),
): Promise<number> => {
  const keys = await store.keys(ALL_ATTENDEES_PREFIX)
  let deleted = 0

  for (const key of keys) {
    const entry = await store.read<unknown>(key)
    if (!entry) continue
    if (ageOf(entry, now()) !== 'expired') continue
    await store.remove(key)
    deleted += 1
  }

  return deleted
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
  const passThrough = new Set(options.passThrough ?? [])
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

      // ── A live read: not cached, and NOT a write ───────────────────────────────────────
      // Declared rather than inferred. See `CacheOptions.passThrough` for what inferring it
      // cost. Nothing is served, nothing is stored, and nothing is purged.
      //
      // **Bound to `target`, exactly as the two branches below apply to `target`.** Returning
      // the bare function instead invokes it with the *Proxy* as `this`, and every HTTP
      // repository here holds its client in a `#private` field — which a Proxy does not carry,
      // so the call throws `TypeError: Cannot read private member`. It reached the browser: the
      // scheduling dialog rendered "Times could not be loaded" for every attendee, and only the
      // e2e walkthrough caught it, because a plain-object double in a unit test has no private
      // field to fail on.
      if (resource === undefined && passThrough.has(property)) {
        return (original as (...a: unknown[]) => unknown).bind(target)
      }

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
            const age = entry ? ageOf(entry, now()) : undefined
            // An entry past its lifetime is treated as **absent**, so the caller reports "a
            // connection is needed and nothing is cached" rather than showing old content with
            // an old stamp (FR-219, FR-221).
            if (entry && age === 'fresh') {
              // Served from cache — so the surface must say when it was retrieved (FR-216).
              freshness?.record(key, entry.retrievedAt)
              return entry.payload
            }

            // ═══════════════════════════════════════════════════════════════════════════════
            // **FIX-2 — THE ENTRY IS DELETED HERE, NOT MERELY LEFT UNSERVED** (FIX-201,
            // constitution v5.4.0 R1).
            //
            // `WebLocalCache` has no eviction: `write` puts an entry and, before this line,
            // only `purge` ever removed one. So the 24-hour lifetime bounded **serving** and
            // bounded **retention** not at all. A device that stops being able to reach the
            // account — deleted elsewhere, or a session that ended and was never
            // re-established — renders signed-out and reads nothing, and kept every
            // conference-scoped entry it had in IndexedDB **indefinitely**. Nothing was
            // displayed; what survived was bytes, against a deletion screen that says in bold
            // that no copy is kept.
            //
            // **This is the moment an entry stops being readable, and it is therefore the
            // moment to delete it.** Doing it here is what makes the fix safe: it closes the
            // retention gap **without classifying why the session ended**.
            //
            // **The obvious fix — purging when a session is refused — is wrong and must not be
            // reinstated.** The refusal that arrives on a second device is a
            // `NotAuthenticatedError` or `SessionExpiredError` on `getCurrent()`, and an
            // idle-timeout expiry is **indistinguishable from a deleted account at that call
            // site**. Purging on it would destroy the offline copy of an attendee who is about
            // to sign back in, costing FR-215 for a case it was not aimed at. R1 rejects it by
            // name, along with two other alternatives, precisely so the next reader does not
            // re-propose one.
            //
            // Three properties, each load-bearing:
            //
            //   - **`remove`, never `purge`** (FIX-203). One expired entry is one entry; this
            //     conference's other resources may still be fresh and still readable, and
            //     `purge` is a prefix match that would take them.
            //   - **The caller's outcome is unchanged** (FIX-202). It still falls through to
            //     the same `throw` with the same error, so the surface still reports that a
            //     connection is needed and nothing is cached. **This changes what is stored,
            //     never what is shown** — which is why the assertion for it has to read the
            //     store directly (FIX-204): through the decorator, "deleted" and "present but
            //     stale" are the same observation.
            //   - **An unparseable stamp is deleted too.** `ageOf` already classifies such an
            //     entry `expired`; it can never become readable again, so leaving it is
            //     retention with no possible benefit.
            //   - **`withheld` is not deleted** (review finding M6). An age only a moved clock
            //     explains is not evidence about this entry, and deleting on it would destroy a
            //     working offline copy at the one moment it is being relied on. See
            //     `CLOCK_TRUST_CEILING_MS`.
            //
            // **This branch is not the whole of FIX-2, and reading it as though it were is the
            // defect review finding I1 recorded.** It runs only when somebody actively reads a
            // conference-scoped resource while the server is unreachable — and the device the
            // problem statement names, one that has stopped being able to reach the account,
            // renders signed-out and issues no such read ever again. `sweepExpired` above is
            // what reaches those entries; this branch is what keeps a device in ordinary use
            // from accumulating them between sweeps.
            // ═══════════════════════════════════════════════════════════════════════════════
            if (age === 'expired') await store.remove(key)

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
