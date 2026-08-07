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
 * Which sessions the attendee intends to attend, for one conference.
 *
 * Durable server-side state surviving sign-out, a change of device, and a conference switch
 * away and back (FR-185).
 */
export interface SavedSessionRepository {
  /**
   * The saved session identifiers for this conference (FR-188).
   *
   * **Identifiers, not whole sessions.** The programme is read separately and already carries
   * the session data; returning it again here would be a second source of truth that could
   * disagree with the first.
   *
   * An attendee who has saved nothing yields an **empty array**, not an error — a valid answer
   * the caller renders as an explicit empty state (FR-195).
   */
  listSaved(eventId: string): Promise<string[]>

  /**
   * Save a session. **Idempotent** (FR-187) — saving twice does not create a second record,
   * so a double-tap on a slow connection is simply the same request twice.
   */
  save(eventId: string, sessionId: string): Promise<void>

  /** Unsave a session. **Idempotent** — succeeds whether or not it was saved. */
  unsave(eventId: string, sessionId: string): Promise<void>
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
