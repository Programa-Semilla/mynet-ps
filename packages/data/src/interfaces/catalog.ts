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
 * v5.2.0 gave it a write path into the catalog — so that justification no longer holds, and it
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

/**
 * T193 (014 tranche 2) — the two kinds of session (FR-1060). The kind decides the identity of
 * the **one** commitment control an attendee sees: a mandatory session is saved, an optional
 * one is enrolled in, and enrolment replaces saving (FR-1063).
 */
export type SessionKind = 'mandatory' | 'optional'

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
  /**
   * T193 (014 tranche 2) — **nullable, because a virtual session has no room** (FR-1050,
   * SC-1022). Whether a session is in person, virtual or both is **derived from what it
   * carries** — a room, an access link, or both — and never stored as a delivery attribute
   * (FR-1051): a stored flag would be a second source of truth for what these two fields
   * already answer, and the one that drifted would be the one displayed. A session with no
   * room renders **no room line at all** — never an empty one.
   */
  readonly room: Room | null
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
   * T193 (014 tranche 2) — mandatory or optional (FR-1060). Conference content, the same for
   * every reader; the attendee's own commitment to it lives in `CommitmentRepository`, never
   * here. **Capacity is deliberately NOT on this payload**: the programme is cached, and a
   * cached seat count reads as a promise of a place — the live figure comes from
   * `CommitmentRepository.places` alone (FR-1070b).
   */
  readonly kind: SessionKind
  /**
   * T193 (014 tranche 2) — where a virtual or hybrid session is attended (FR-1052), `https:`
   * only, validated at the write path and constrained at the column. Null for an in-person
   * session, and the client then renders **no link line at all** (SC-1022). Rendered as a
   * plain anchor — never fetched by the product, never markup in a summary (FR-1054).
   */
  readonly accessLink: string | null
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
