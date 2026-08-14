import { asc, eq } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'
import { rooms, sessions, sessionSpeakers, speakers, tracks } from '../schema/catalog.js'

/**
 * T037 (002) — reads of the conference programme (FR-137–FR-140, FR-147).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FUNCTION HERE TAKES AN `EventScope`, NEVER A BARE STRING.**
 *
 * That is the whole point, and it is why the signatures look slightly awkward. An `EventScope`
 * can only be produced by `requireEventAccess`, so a handler that skipped verification cannot
 * call anything in this file — not because it would be refused at runtime, but because it does
 * not compile. Verification becomes a precondition of reading rather than a step a reader may
 * omit (FR-147).
 *
 * If you are here because you want to read a programme from somewhere that has no scope — a
 * script, a job, a new endpoint — the answer is not to widen these signatures. It is to obtain
 * a scope, or to explain in review why this read is not attendee-facing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T014 (014) — THERE IS STILL NO WRITE PATH IN THIS FILE AND THERE MUST NOT BE ONE. WHAT
 * CHANGED IS THE REASON, AND THE OLD REASON IS NOW FALSE.**
 *
 * It read: *the catalog is seeded content; creating or editing it would be organizer
 * administration, which Principle III places out of scope.* Constitution v4.0.0 brought
 * administration into scope and v5.2.0 gave it a write path into these exact tables, so that
 * sentence no longer justifies anything — and it is corrected rather than deleted, because "the
 * comment stopped being true" and "the rule was withdrawn" look identical in a diff.
 *
 * **The write path is `db/queries/admin-catalog.ts`, and it is a different file because it
 * serves a different principal with a different authority model.** Every function here takes an
 * `EventScope`, minted by `requireEventAccess` from an **attendee's registration**. Every
 * function there takes a `ConferenceAuthorityScope`, minted by `requireConferenceAuthority` from
 * an operator's tier or assignment. An organizer authoring a conference has no registration and
 * needs none; a platform operator has no `attendees` row at all.
 *
 * Widening these signatures to serve both would make one module answer to two principals under
 * two authority models, and `catalog-read-only.test.ts`'s name-shape assertion would have to
 * become a list of permitted write names — the "weakened until it stops checking anything"
 * failure that guard's own comment warns about. So **FR-191 survives literally**:
 * `CatalogRepository` is read-only in perpetuity, and 014 did not reinterpret "in perpetuity" to
 * mean "until 014" (research R1).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

export type SessionRow = {
  readonly id: string
  readonly title: string
  readonly summary: string | null
  readonly startsAt: string
  readonly endsAt: string
  /**
   * T053 (014) — **cancelled, and therefore still on the programme** (FR-1020, FR-1022).
   *
   * A cancelled session is **presented, not withheld**: it stays in Agenda, in the detail panel
   * and in Home's rest-of-day timeline, marked. An attendee who saved it needs to see that it
   * will not happen, and a session that simply vanished would be indistinguishable from one they
   * misremembered. Home's "Up next" is the single exception and skips it (FR-1022a).
   */
  readonly cancelled: boolean
  readonly track: { readonly id: string; readonly name: string; readonly colorToken: string }
  readonly room: { readonly id: string; readonly name: string }
  readonly speakers: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly title: string | null
    readonly company: string | null
  }>
}

export type TrackRow = {
  readonly id: string
  readonly name: string
  readonly colorToken: string
}

/**
 * The event's programme, chronological (FR-137).
 *
 * An event with no programme returns `[]` — a valid answer that the client renders as an empty
 * state, not a failure (FR-139).
 *
 * **Speakers come back as an array, empty when there are none** (FR-138). Never null: a client
 * cannot then confuse "this session has no speaker" with "the speakers did not load", which is
 * the distinction a nullable field destroys.
 *
 * Two queries rather than one join, deliberately: a join across the many-to-many would return a
 * row per speaker and require de-duplication in application code, which is where a session with
 * two speakers quietly becomes two sessions.
 */
export const listSessions = async (unverified: EventScope): Promise<SessionRow[]> => {
  // Membership, not merely shape. A value can satisfy `EventScope` and still never have been
  // through the guard — `Object.assign`, `structuredClone` and the prototype's constructor all
  // produce one. This is the check that makes FR-147 true at runtime.
  const scope = assertVerifiedScope(unverified)
  const db = getDb()

  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      summary: sessions.summary,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      cancelledAt: sessions.cancelledAt,
      trackId: tracks.id,
      trackName: tracks.name,
      trackColorToken: tracks.colorToken,
      roomId: rooms.id,
      roomName: rooms.name,
    })
    .from(sessions)
    .innerJoin(tracks, eq(tracks.id, sessions.trackId))
    .innerJoin(rooms, eq(rooms.id, sessions.roomId))
    // The scope's event id, not one the handler passed separately — there is no second value
    // that could disagree with what was verified.
    .where(eq(sessions.eventId, scope.eventId))
    // Chronological, with a total order so two reads of a schedule containing simultaneous
    // starts cannot disagree (FR-137, and the component test in T031).
    .orderBy(asc(sessions.startsAt), asc(sessions.id))

  if (rows.length === 0) return []

  const speakerRows = await db
    .select({
      sessionId: sessionSpeakers.sessionId,
      id: speakers.id,
      name: speakers.name,
      title: speakers.title,
      company: speakers.company,
    })
    .from(sessionSpeakers)
    .innerJoin(speakers, eq(speakers.id, sessionSpeakers.speakerId))
    // Scoped again on the speaker side rather than trusting the join to stay inside the event.
    // `session_speakers` cannot express the same-event rule as a foreign key (data-model.md),
    // so this is where it is actually enforced for reads.
    .where(eq(speakers.eventId, scope.eventId))
    .orderBy(asc(speakers.name))

  const bySession = new Map<string, SessionRow['speakers'][number][]>()
  for (const row of speakerRows) {
    const list = bySession.get(row.sessionId) ?? []
    list.push({ id: row.id, name: row.name, title: row.title, company: row.company })
    bySession.set(row.sessionId, list)
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    // Absolute instants over the wire (FR-124). All relative wording — "starts in 15 minutes" —
    // is computed at display time against the reader's clock, or not at all.
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    // A boolean rather than the instant. **When** it was cancelled is the organizer's business
    // and answers no question an attendee surface asks; `whether` is the whole of FR-1022.
    cancelled: row.cancelledAt !== null,
    track: { id: row.trackId, name: row.trackName, colorToken: row.trackColorToken },
    room: { id: row.roomId, name: row.roomName },
    speakers: bySession.get(row.id) ?? [],
  }))
}

/**
 * The event's tracks, for coding and legends.
 *
 * Carries the token **name**, never a colour value — the palette lives in
 * `apps/web/src/theme/tokens.css` and nowhere else (FR-136, research D7).
 */
export const listTracks = async (unverified: EventScope): Promise<TrackRow[]> => {
  const scope = assertVerifiedScope(unverified)

  return getDb()
    .select({ id: tracks.id, name: tracks.name, colorToken: tracks.colorToken })
    .from(tracks)
    .where(eq(tracks.eventId, scope.eventId))
    .orderBy(asc(tracks.name))
}
