/**
 * T009 (005) — the attendee's own agenda, in domain terms (constitution Principle V, FR-234).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY** (FR-190, FR-208,
 * FR-227).
 *
 * Identity comes from the sign-in session at the request boundary and never from an argument.
 * That absence is what makes the isolation structural rather than a rule every caller has to
 * remember: there is no expression a component author could write that names another
 * attendee's saves or notes, because there is no parameter in which to name them.
 *
 * The `eventId` these methods do take is the same deliberate exception 002 recorded for the
 * catalog: an event identifier says *which conference*, never *which person*, and the server
 * verifies the registration before any read or write (FR-228, FR-229).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **These are separate interfaces from `CatalogRepository`, and that separation is a
 * requirement rather than a preference** (FR-191).
 *
 * The catalog is seeded conference content and is declared read-only *in perpetuity*, because
 * a catalog write is organizer administration and Principle III puts that out of scope. Saved
 * sessions and notes are **attendee state about conference content** — the attendee owns them
 * outright — so they belong here. If you are reading this because adding `saveSession` to
 * `CatalogRepository` looked like the natural home, that is exactly the mistake this note and
 * the unit test in `apps/api/tests/unit/catalog-read-only.test.ts` exist to catch.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * One attendee's private free text against one session.
 *
 * `updatedAt` is an absolute instant, ISO-8601, as everywhere else in this product (FR-124).
 * It is returned by a write as well as by a read, because that is what lets the editor's status
 * enter *saved* **from a confirmed response** rather than from a keystroke — the property that
 * keeps the autosave non-optimistic (FR-210, research D5).
 */
export interface SessionNote {
  readonly sessionId: string
  readonly body: string
  readonly updatedAt: string
}

/**
 * T007 (014) / T196 (014 tranche 2) — one commitment: a saved session **or a held place**, and
 * whether the session has moved since the attendee last looked.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`changedSinceViewed` IS PER-ROW STATE ABOUT ONE SESSION, AND THAT IS THE WHOLE OF N2**
 * (FR-1030, FR-1031, constitution v5.2.0).
 *
 * The server computes it as `sessions.logistics_changed_at > viewed_at` — two timestamps and a
 * comparison, on whichever commitment row this is, with nothing stored per change. It travels
 * on **this existing payload** rather than on a new read, which is what keeps 014 from
 * declaring a new cached surface and meeting the `passThrough` trap 008 fell into (research
 * R7, R13).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THIS SHAPE CANNOT BECOME THE NOTIFICATION CENTRE v3.1.0 FORBIDS.**
 *
 * There is no per-change record to list and no counter to sum. A "3 things changed" badge is
 * not one small step away from this interface — it would need a query somebody has to write
 * deliberately, against data that does not exist. That is the difference between a rule and a
 * hope, and it is why the marker is a boolean **on the row it describes** rather than a
 * collection somebody could render.
 *
 * **No surface in either product may present a count of these** (FR-1031, FR-1034a). The
 * coalesced notification body carries one and is the single stated exception, because a
 * notification is an interruption rather than a place to look.
 * `apps/web/tests/unit/authoring-absences.test.tsx` asserts it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T196 — ONE LIST WITH A DISCRIMINATOR, NEVER TWO LISTS** (FR-1064, FR-1066, research R13).
 *
 * `commitment` says which of the two commitments this row is: `saved` on a mandatory session,
 * `place` on an optional one — enrolment REPLACES saving there (FR-1063). A single row whose
 * kind is a property of the row makes the state FR-1064 forbids — *saved an optional session
 * while holding no place* — **unrepresentable on the client** rather than merely absent. Two
 * sets would make `saved.has(id) && !held.has(id)` a perfectly typeable state, and FR-1064's
 * "asserted as an absence" would have to be argued about client state instead of falling out
 * of the type.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface Commitment {
  readonly sessionId: string
  /**
   * True while the session has materially changed — cancelled, start time, or room — since this
   * attendee last viewed it (v5.2.0 N1). Cleared by `markViewed`, never by time passing.
   */
  readonly changedSinceViewed: boolean
  /** Which of the two commitments this row is (FR-1063, FR-1066). */
  readonly commitment: 'saved' | 'place'
}

/**
 * T209 (014 tranche 2) — the remaining places in ONE optional session, at the moment of asking
 * (FR-1070, FR-1071a).
 *
 * `remaining` is derived server-side — capacity minus a live count — and `open` is derived
 * against the server's own clock. **Never cached** (FR-1070b): a stale number reads as a
 * promise of a place, so the client declares the read `passThrough` and omits the figure
 * entirely where it cannot be read live. A fact about one session while deciding — no caller
 * may aggregate it across sessions (FR-1070a).
 */
export interface PlaceAvailability {
  readonly remaining: number
  readonly open: boolean
}

/**
 * The attendee's commitments to sessions of one conference — saves on mandatory sessions,
 * held places in optional ones (FR-1063, FR-1066).
 *
 * Durable server-side state surviving sign-out, a change of device, and a conference switch
 * away and back (FR-185).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T196 — THIS WAS `SavedSessionRepository`, AND THE RENAME IS THE POINT** (FR-1066a's rule
 * applied to a reviewer-visible name, research R13). From tranche 2 the set it serves carries
 * two commitments, so a name asserting it holds only saves would be the same falsified claim
 * 016's review found in product copy — brightest exactly where it is blindest. **No new
 * repository was added for enrolment, and none may be**: this repository is cached, and only
 * its own decorating Proxy can purge the `saved` entry an enrolment invalidates. A separate
 * `EnrolmentRepository` would leave the cached commitment set claiming a place the attendee
 * just released, for up to the 24-hour cache lifetime — a silent staleness bug no unit or
 * component test can see, exactly 008's `slots` shape.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface CommitmentRepository {
  /**
   * The attendee's commitments for this conference (FR-188, FR-1066), each with its marker
   * state (FR-1030) and its kind (T196).
   *
   * **Identifiers, not whole sessions.** The programme is read separately and already carries
   * the session data; returning it again here would be a second source of truth that could
   * disagree with the first.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **T074 (014) — this returned `string[]` until 014, and the marker travels on it rather
   * than on a method of its own.** That is deliberate: a `listChangedSessions` would be a read
   * whose subject is *things that happened*, which is exactly the surface FR-1031 forbids —
   * and once the read exists, rendering it is a small ask. The marker is a property **of a
   * commitment**, so it belongs on the commitment.
   *
   * **T196 — THE METHOD KEEPS ITS NAME WHILE THE INTERFACE CHANGED ITS OWN.** `listSaved` is
   * the identity the caching decorator's `reads` map is configured against at the composition
   * root (`reads: { listSaved: 'saved' }`), and the cache resource key derives from it.
   * Renaming the method would silently retire the cached `saved` entry every device already
   * holds and re-cache under a new resource — a migration nobody asked for, bought for a name.
   * The honest name lives on the interface and the row; the method name is a wire-level
   * identity, recorded here rather than "tidied" (research R13).
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * An attendee who has committed to nothing yields an **empty array**, not an error — a valid
   * answer the caller renders as an explicit empty state (FR-195).
   */
  listSaved(eventId: string): Promise<Commitment[]>

  /**
   * Save a **mandatory** session. **Idempotent** (FR-187) — saving twice does not create a
   * second record, so a double-tap on a slow connection is simply the same request twice.
   *
   * T196 (014 tranche 2) — an optional session is refused with code `not_saveable` (FR-1064):
   * enrolment REPLACES saving there, and there is no route by which a saved optional session
   * can arise. The refusal carries the server's own explanation and the client renders it
   * rather than folding it into another (FR-1069a).
   */
  save(eventId: string, sessionId: string): Promise<void>

  /**
   * Unsave a session. **Idempotent** — succeeds whether or not it was saved.
   *
   * T056 (014) — this is also how an attendee removes a **cancelled** session from their list
   * (FR-1023). No separate path, and none is wanted: a cancelled session is an ordinary saved
   * session that will not happen, and giving it its own removal verb would make the client ask
   * which one to call.
   */
  unsave(eventId: string, sessionId: string): Promise<void>

  /**
   * T075 (014) — records that the attendee has looked at this session, clearing its marker
   * (FR-1030).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THE ONE MEMBER 014 ADDS TO ANY ATTENDEE-FACING REPOSITORY, AND IT IS A WRITE.**
   *
   * Research R7's claim is that the marker adds **no new read** — it travels on `listSaved`
   * above. This is the other half: clearing it is an act the attendee performs, so it is a
   * write, and it is declared as one at the composition root. A write purges the whole
   * conference prefix from the offline cache, which is **correct rather than tolerated here**:
   * the programme being purged is the one that just changed.
   *
   * Idempotent, and a no-op for a session the attendee has not saved — there is no row to
   * stamp, and refusing would make opening a session in Agenda's "All" view an error.
   *
   * **Refused offline, never queued**, like every other write in this product.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  markViewed(eventId: string, sessionId: string): Promise<void>

  /**
   * T196 (014 tranche 2) — take a place in an **optional** session (FR-1063).
   *
   * A **write**, purging the conference prefix from the offline cache — correct rather than
   * tolerated, on `markViewed`'s own argument: the commitment set it purges is the one that
   * just changed. Refused with a code naming which fact refused it — `session_full`,
   * `enrolment_closed`, `already_enrolled`, `not_optional` — and the four are mutually
   * distinguishable by construction (FR-1069, FR-1069a).
   *
   * **The caller MUST have shown the FR-1074 notice first**: before a place is taken the
   * attendee is told their name becomes visible to this conference's organizers — the only one
   * of the product's four privacy exceptions its subject can decline by not acting, which is
   * only true if they know before they act.
   *
   * **Refused offline, never queued** (FR-1070b), like every other write in this product.
   */
  enrol(eventId: string, sessionId: string): Promise<void>

  /**
   * T196 (014 tranche 2) — release a held place (FR-1067). **Idempotent.**
   *
   * The place returns to the session's availability immediately. Available after enrolment
   * closes too — the deadline governs *taking* a place, never holding one (FR-1071b) — and a
   * place released after closing stays untakeable, which is honest about the seat rather than
   * a reservation for nobody. A write, purging the conference prefix like `enrol` above.
   */
  release(eventId: string, sessionId: string): Promise<void>

  /**
   * T196, T209 (014 tranche 2) — the remaining places in one optional session, **live**
   * (FR-1070).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **A READ THAT MUST NEVER BE CACHED, AND THE DECLARATION IS NOT OPTIONAL** (FR-1070b,
   * research R13). The composition root declares it `passThrough` — 008's `slots` lesson, both
   * halves: leaving it out of `reads` would classify it as a write and purge the attendee's
   * whole cached conference every time a panel opened, and caching it would publish a stale
   * seat count that reads as a promise of a place. It is also structurally uncacheable here:
   * the decorator keys on `args[0]` alone, so a per-session read would collide every session
   * onto one cache entry and serve the first session's count for the second.
   *
   * Where this cannot be answered live — offline, or a failure — the caller **omits the figure
   * entirely** rather than showing a stale one. 404 for a session that is not optional, in the
   * uniform indistinguishable shape.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  places(eventId: string, sessionId: string): Promise<PlaceAvailability>
}

/**
 * The attendee's personal notes, for one conference.
 *
 * **This is the product's first attendee-authored free text**, which is why every method is
 * scoped by the session identity carries and none of them can name another author (FR-208).
 */
export interface SessionNotesRepository {
  /**
   * Every note the attendee has written in this conference.
   *
   * Read as a set rather than one session at a time, so opening the detail panel needs no
   * additional request and the whole set caches as a single entry.
   */
  listNotes(eventId: string): Promise<SessionNote[]>

  /**
   * Write or replace the note against a session.
   *
   * **The last confirmed write wins** (FR-214). No merge is attempted and no conflict is
   * detected — conflict resolution is a decision the constitution requires be recorded
   * separately, and this feature does not take one.
   *
   * `body` must be 1–10,000 characters. The limit is enforced server-side and again at the
   * column; the editor surfaces it as it is approached so the attendee never learns of it
   * through a rejected write (FR-213).
   */
  writeNote(eventId: string, sessionId: string, body: string): Promise<SessionNote>

  /**
   * Remove the note against a session. **Idempotent.**
   *
   * This is the path clearing the text takes (FR-212): an emptied note is deleted rather than
   * stored blank, so "no note" has exactly one representation.
   */
  deleteNote(eventId: string, sessionId: string): Promise<void>
}
