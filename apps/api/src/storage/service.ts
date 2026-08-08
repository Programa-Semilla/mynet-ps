/**
 * T015 (004) — the durable binary content port (FR-352, FR-393, research D3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS PORT IS SERVER-SIDE, AND IT IS DELIBERATELY NOT A SEVENTH MEMBER OF `DeviceServices`.**
 *
 * Constitution v2.3.0 introduces `StorageService` "alongside" the six device capabilities, and
 * a literal reading would put it in `packages/platform`. It is here instead, and the reasoning
 * is recorded rather than left for someone to rediscover as an inconsistency:
 *
 * - The six are **client** capabilities — things a browser or a device can do. Avatar bytes are
 *   received, inspected, resized, re-encoded and stored by the **server**. Nothing in that
 *   sentence is a device capability.
 * - `packages/platform/src/interfaces/index.ts` opens by stating the six names "are fixed by
 *   the constitution and are not open to restyling", and `DeviceServices` enumerates exactly
 *   six. A seventh member would contradict that file *and* the constitution's own separate
 *   listing.
 * - Putting the port on the client would mean the client writes to storage directly, which
 *   needs signed URLs and puts vendor credentials adjacent to the bundle — against Principle
 *   VIII's "secrets never reach the client".
 *
 * So the constitutional text is read as binding on the **discipline** — a project-owned
 * interface, no vendor SDK reachable from feature code — rather than on the package. Research
 * D3 records the same conclusion, and the plan's post-design constitution check lists it as one
 * of three close calls it deliberately did not decide silently.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Three methods, and no more.** Every one of them is needed by a requirement — `put` and
 * `get` by FR-346, `delete` by FR-350 (replacing an avatar must make the previous bytes
 * unretrievable) and by FR-366 (deletion removes the avatar). A `list` or a `copy` would be
 * capability nothing asks for, and every method here is one the production adapter must
 * implement before register entry 11 can be closed.
 *
 * **The interface says nothing about buckets, regions, URLs or credentials**, which is what
 * makes the vendor swap one file. A caller that needed to know would have defeated FR-352 by
 * knowing.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface StoredBytes {
  readonly bytes: Buffer
  readonly contentType: string
}

export interface StorageService {
  /**
   * Writes bytes under a key, **replacing** anything already there.
   *
   * Replacement rather than refusal is what FR-350 needs: an attendee uploading a new avatar
   * over an old one must not be able to end up with both, and a caller that had to delete
   * first would have a window in which neither existed.
   */
  put(key: string, bytes: Buffer, contentType: string): Promise<void>

  /** The bytes under a key, or `null` when there are none. Absence is an answer, not a fault. */
  get(key: string): Promise<StoredBytes | null>

  /**
   * 006 — the bytes under several keys, in **one** round trip. Absent keys are simply missing
   * from the result.
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **A fourth method, and the header above says there must never be one — so this earns it.**
   *
   * That rule exists to stop capability nobody asked for: a `list` or a `copy` would be surface
   * the production adapter has to implement for no requirement. This is not that. It is `get`,
   * for the case the directory actually has, and a requirement asks for it: FR-456 makes a page
   * of twenty-four cards **one request**, and resolving their faces one key at a time turned
   * that one request into 1 + N *statements* against a pool of ten connections — at the maximum
   * page size, 101. SC-402 and SC-403 are stated at 1,000 attendees, and this is the part of
   * the response that scales with page size rather than with the query.
   *
   * It does not weaken FR-459: the caller still passes only keys derived from rows the
   * visibility predicate already bounded, so the face is still reachable exactly when the
   * profile is.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  getMany(keys: readonly string[]): Promise<ReadonlyMap<string, StoredBytes>>

  /**
   * Removes the object under a key. **Idempotent** — deleting nothing succeeds.
   *
   * That matters on the deletion path: `DELETE /account` removes the object before the row
   * (research D10), and an attendee with no avatar must not make the whole operation fail on
   * its first step.
   */
  delete(key: string): Promise<void>
}

/**
 * The key an attendee's avatar lives under.
 *
 * Derived from the attendee identifier rather than random, so an orphaned object is *findable*
 * — the one failure mode research D10 accepts is a row pointing at missing bytes, and the
 * inverse (bytes no row references) is only auditable if the key says whose they were.
 *
 * Exported from the port rather than from the route, because both the profile route and the
 * deletion path construct it and they must not be able to disagree.
 */
export const avatarObjectKey = (attendeeId: string): string => `avatars/${attendeeId}`

/**
 * T023 (006) — the card rendition's key, **derived rather than stored** (FR-457, research D3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE DECISION THAT KEEPS "NO NEW TABLE AND NO NEW COLUMN" TRUE, AND IT IS
 * LOAD-BEARING RATHER THAN INCIDENTAL.**
 *
 * The obvious alternative is an `avatar_card_object_key` column on `attendees`. That column
 * would be **a new column collecting attendee data**, and `tests/unit/export-coverage.test.ts`
 * derives its expectations from the Drizzle schema — so it would **fail by existing**. Passing
 * it would take either exporting a second copy of an image the export already embeds, or
 * writing an allow-list entry justifying the omission. Deriving the key needs neither.
 *
 * It also means the deletion path reaches the card rendition without being told where it is:
 * `deleteAccount` derives both keys from the attendee identifier it already holds (FR-460).
 * A stored key would have made deletion depend on a column being correct, and a row whose key
 * had drifted would leave a face behind after the account was gone.
 *
 * `stored_objects` is deliberately opaque about what a key means — its own header says
 * "`storage/service.ts` decides what a key means" — so a key convention belongs exactly here.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Derived from the profile key, not from the attendee id**, so there is one place that decides
 * where an attendee's avatar lives. If `avatarObjectKey` ever changes, this follows it rather
 * than silently continuing to point at the old prefix.
 */
export const cardKeyFor = (profileKey: string): string => `${profileKey}/card`
