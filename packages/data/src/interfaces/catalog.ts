/**
 * T041 (002) — the conference programme, in domain terms (constitution Principle V).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **These methods take an `eventId`, and that is deliberate** — see the note in `events.ts`.
 * An event identifier says *which conference*, never *which person*: identity still comes from
 * the sign-in session, and the server verifies the registration before any read (FR-145–FR-147).
 * The departure from 001's "no identifier at all" rule is recorded in plan.md's Complexity
 * Tracking.
 *
 * **No method creates, updates or deletes anything here, and none ever may** (FR-132, FR-134,
 * FR-191, FR-1003).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T007 (014) — THE REASON FOR THAT PROHIBITION CHANGED AND THE PROHIBITION DID NOT.**
 *
 * It used to read *"a write path would be organizer administration, which Principle III places
 * out of scope"*. Constitution v4.0.0 brought organizer administration **into** scope and
 * v4.2.0 gave it a write path into the catalog — so that justification no longer holds, and it
 * is corrected here rather than left to be believed.
 *
 * What replaces it is stronger for this interface specifically: **the write path exists, and it
 * is in the other product.** `apps/admin` reaches it through `AdministrationRepository`; MyNet
 * gains no authoring surface, no privileged view and no rendering that branches on
 * administrative tier (FR-1003), and that is asserted as an absence over the source rather than
 * claimed here. Adding a write method to this interface would put an authoring capability in
 * the attendee bundle whether or not any component called it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * A session category, visually coded.
 *
 * `colorToken` is a **token name**, e.g. `track-design` — never a colour value. The palette
 * lives in `apps/web/src/theme/tokens.css` and nowhere else (FR-136, research D7). `name` is
 * always rendered as text too, so colour is never the sole carrier of meaning.
 */
export interface Track {
  readonly id: string
  readonly name: string
  readonly colorToken: string
}

export interface Room {
  readonly id: string
  readonly name: string
}

/**
 * Someone speaking at a session.
 *
 * Seeded conference content, **not an attendee profile**. The same human at two conferences is
 * two unrelated records — a consequence of per-event scoping that feature 004 must not assume
 * away.
 */
export interface Speaker {
  readonly id: string
  readonly name: string
  readonly title: string | null
  readonly company: string | null
}

export interface Session {
  readonly id: string
  readonly title: string
  readonly summary: string | null
  /**
   * Absolute instants, ISO-8601 (FR-124). **Not** a local time and not relative wording:
   * "starts in 15 minutes" is only true at the instant it is computed, so it is computed at
   * display time against the reader's clock, or not at all.
   */
  readonly startsAt: string
  readonly endsAt: string
  readonly track: Track
  readonly room: Room
  /**
   * T007 (014) — **cancelled, and therefore still on the programme** (FR-1020, FR-1022).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Conference content, not attendee state: every attendee reading this conference sees the
   * same value, and it depends on nothing about who is asking. That is why it lives here rather
   * than beside the marker in `agenda.ts`.
   *
   * **A cancelled session is presented, not withheld.** It stays in the programme, in Agenda,
   * in the detail panel and in Home's rest-of-day timeline, marked (FR-1022) — an attendee who
   * saved it needs to see that it will not happen, and a session that simply vanished would be
   * indistinguishable from one they misremembered. The single exception is Home's "Up next",
   * which skips it (FR-1022a): that card answers *where do I go now*, and a cancelled session
   * is not an answer to that question.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  readonly cancelled: boolean
  /**
   * **Empty when the session has none** (FR-138) — never null, and never absent.
   *
   * A nullable field would let "this session has no speaker" and "the speakers did not load"
   * collapse into the same falsy check, and the second would then render as the first.
   */
  readonly speakers: readonly Speaker[]
}

export interface CatalogRepository {
  /**
   * The conference's programme, chronological (FR-137).
   *
   * A conference with no programme yields an **empty array**, not an error (FR-139) — a valid
   * answer the caller renders as an explicit empty state.
   */
  listSessions(eventId: string): Promise<Session[]>

  /** The conference's tracks, for coding and legends. */
  listTracks(eventId: string): Promise<Track[]>
}
