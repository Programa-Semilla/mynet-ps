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
 * **No method creates, updates or deletes anything here, and none ever may.** The catalog is
 * seeded conference content; a write path would be organizer administration, which Principle III
 * places out of scope (FR-132, FR-134).
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
