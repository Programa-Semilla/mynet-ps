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
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FIX-2 / FIX-3 (constitution v5.4.0 R1) — THE INTERFACE GAINS TWO MEMBERS, AND BOTH ARE
 * STORAGE PRIMITIVES RATHER THAN POLICY.**
 *
 * It stood at three members from 005 to here, and widening it is not free: every
 * implementation must supply them, and each new verb is a new way for a caller to reach past
 * the decorator. So the addition is stated rather than made quietly, and both members were
 * chosen to keep the paragraph above true — **neither knows what a conference is, what an
 * attendee is, or when an entry stops being readable.**
 *
 * They exist because R1's two licensed mechanisms are each **unimplementable with `read`,
 * `write` and `purge` alone**:
 *
 *   - **`remove`** — an entry read past its lifetime must be deleted (FIX-201), and it must be
 *     *that one entry* (FIX-203). `purge(key)` is a prefix match, so it would also take any
 *     resource whose name extends this one. No resource does today; the day one does, the loss
 *     is silent and offline-only, which is the class of defect this whole fix is about.
 *   - **`keys`** — a conference the attendee has left must be erased even though no read of it
 *     was ever refused (FIX-301), and *which* conferences are held on this device is a question
 *     only the store can answer. Nothing else in the product can enumerate them: the composition
 *     root has no memory across a reload, which is precisely the cold-start case FIX-3 exists
 *     for.
 *
 * **The alternative was a bookkeeping index** — the client writing down which conferences it
 * had cached, under a key of its own. It was rejected for the reason this codebase rejects
 * denormalised counters: it is a second source of truth for something the rows already answer,
 * and the copy that drifted would be the one deciding whether somebody's withdrawn conference
 * survives on their phone.
 * ═════════════════════════════════════════════════════════════════════════════════════════
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

  /**
   * Removes the entry stored under **exactly** this key. A key holding nothing is not an error.
   *
   * The narrow counterpart to `purge`, and the narrowness is the requirement (FIX-203): the
   * caller here has established that *one* entry has aged out, and its neighbours under the
   * same conference may still be fresh and still readable. `purge` cannot express that — it
   * selects every key the argument is a prefix of.
   *
   * **Fails silently, like every other member**, for the reason stated at the top of the web
   * implementation: this runs on a path whose caller is already about to report that nothing is
   * cached, and a rejection would turn an ordinary offline answer into an unhandled error.
   */
  remove(key: string): Promise<void>

  /**
   * Every key currently stored whose own key begins with this prefix, in no defined order.
   *
   * The read-side mirror of `purge`, selecting on the same boundary. It answers "what does this
   * device still hold for this attendee" — the question that has no other source, because the
   * store outlives every process that wrote to it.
   *
   * **It returns keys, never payloads.** A caller deciding what to discard needs to know what
   * exists and nothing more, and handing back the entries would put other people's conference
   * content in the hands of code whose whole job is to delete it.
   *
   * A store that cannot be read answers `[]`, for the reason `read` answers `null`: a cache
   * that cannot be enumerated is indistinguishable from an empty one, and the caller's next act
   * is to delete things — so failing towards "there is nothing to delete" is the direction that
   * cannot destroy an attendee's working offline copy.
   */
  keys(keyPrefix: string): Promise<readonly string[]>
}
