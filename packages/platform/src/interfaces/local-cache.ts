/**
 * T061 (005) — client-side storage for cached conference content (FR-215–FR-222, research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A BROWSER CAPABILITY, SO IT IS REACHED THROUGH AN INTERFACE AND NEVER DIRECTLY**
 * (constitution Principle V).
 *
 * Application code calls this; nothing in `apps/web` names IndexedDB, and the lint rule counts
 * it if anything tries. A native shell later supplies its own implementation and no feature
 * code changes — which is the whole reason the six device capabilities are shaped this way.
 *
 * **This is NOT `SecureStorage`, and must never be replaced by it.** The constitution states
 * plainly that `SecureStorage` MUST NOT be used as a general cache. That is a governance rule,
 * not a preference: secret storage and bulk content storage have different threat models, and
 * conflating them puts a conference programme wherever the sign-in material lives.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This interface stores and returns; it decides nothing.**
 *
 * There is no expiry parameter, no eviction policy and no notion of freshness here. The
 * 24-hour lifetime (FR-221) belongs to the caching decorator in `packages/data`, where it is
 * expressed **once** — putting it here would mean every implementation of this interface
 * re-implemented a rule the specification fixes, and a native implementation could then
 * disagree with the web one about when an attendee's access is revoked offline.
 *
 * What this *does* own is the `retrievedAt` stamp, because only the writer knows when the
 * write happened.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** A cached payload and the moment it was retrieved from the server. */
export interface CachedEntry<T> {
  readonly payload: T
  /** ISO-8601. Feeds both the staleness stamp (FR-216) and the age limit (FR-221). */
  readonly retrievedAt: string
}

export interface LocalCache {
  /**
   * The entry stored under this key, or `null` when there is none.
   *
   * **Returns `null` rather than throwing on a miss**, because a miss is an ordinary answer:
   * the attendee has simply not read this conference yet, and the caller renders "a connection
   * is needed and nothing is cached" (FR-219) rather than a failure.
   *
   * A read that *fails* — storage unavailable, quota, a corrupt record — also yields `null`.
   * A cache that cannot be read is indistinguishable from an empty one for every purpose this
   * product has, and an implementation that threw would take down a surface that works
   * perfectly well online.
   */
  read<T>(key: string): Promise<CachedEntry<T> | null>

  /** Stores a payload under this key, stamped with the moment of retrieval. */
  write<T>(key: string, payload: T): Promise<void>

  /**
   * Removes every entry whose key begins with this prefix.
   *
   * A prefix rather than a key, because both invalidations this feature performs are
   * wholesale: an authorization refusal discards one `(attendee, conference)` pair, and
   * signing out discards everything belonging to an attendee (FR-221, research D10). Deleting
   * three named resources instead would mean a fourth added later was silently left behind —
   * still readable offline by somebody whose access had been withdrawn.
   */
  purge(keyPrefix: string): Promise<void>
}
