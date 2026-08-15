import { sql } from 'drizzle-orm'

import { getDb } from '../client.js'
import { savedSessions, sessionEnrolments } from '../schema/agenda.js'
import { sessions } from '../schema/catalog.js'

/**
 * T016, T068, T070 (014) — **what counts as engagement, what counts as a material change, and
 * who has to be told** (FR-1018a, FR-1026, FR-1028, FR-1034, research R4, R5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE QUESTIONS AN ORGANIZER'S EDIT ASKS ABOUT ATTENDEES — NONE OF WHICH DISCLOSES ANYTHING
 * ABOUT ONE.**
 *
 *   - `ENGAGEMENT_TABLES` — *which tables decide whether a session may be deleted.* The list
 *     the coverage guard compares against the schema; the live counting happens in
 *     `admin-catalog.ts`'s `countEngagement` (tranche 2 deleted the caller-less boolean probe
 *     that used to sit beside it — see the note below `ENGAGEMENT_TABLES`).
 *   - `materialChangeOf` — *does this edit reach anybody's phone?* Pure; touches no database.
 *   - `attendeesToNotify` — *whose phone?* Identifiers, used to dispatch and never returned to
 *     any administrative surface.
 *
 * That last distinction is FR-1042 and is the reason the fan-out lives here rather than in
 * `admin-catalog.ts`: **no function in the write layer may return an attendee identity**, and the
 * cheapest way to keep that true is for the write layer not to have one. `countEngagement` —
 * the only engagement figure an operator ever sees — is in `admin-catalog.ts` and returns counts
 * with no identity attached (FR-1025).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The three changes that reach an attendee, and the fourth answer meaning *nothing did*.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **This union IS the scope of the second notification trigger** (constitution v5.2.0 N1,
 * FR-1026, FR-1027).
 *
 * v3.1.0 admitted exactly one trigger — a received message — and was worded so that a feature
 * wanting a second **must amend the constitution**. 014 is the first to take that up, and what it
 * was granted is enumerated rather than described: **cancelled, start time, room. Nothing else.**
 *
 * The principle that generated the set is *a notification is raised when a change affects **where
 * or whether** the attendee must be somewhere*. A title, a summary, a track or a change of
 * speaker is **content**, and content does not strand anybody in the wrong corridor. A session
 * **starting** is forbidden too (FR-1033), and that boundary is load-bearing: a reminder is
 * something an attendee could set themselves, while a room change is information only the product
 * holds.
 *
 * Widening this union is a constitution amendment, not a refactor.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export type MaterialChange = 'cancelled' | 'time' | 'room' | null

/** The shape `materialChangeOf` compares. A subset of the session row, so callers can pass rows. */
export interface SessionLogistics {
  readonly startsAt: Date
  // Nullable since 014 tranche 2 (FR-1049). A room appearing, disappearing or changing are all
  // "the room changed" to somebody deciding where to go — the `!==` below covers all three.
  readonly roomId: string | null
  readonly cancelledAt: Date | null
}

/**
 * Which material change, if any, an edit performed (FR-1026, FR-1027).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Pure, and deliberately so.** It reads no database and takes no scope, which is what lets the
 * caller compare the row it read inside its transaction against the row it wrote — the only two
 * values that can honestly answer "did this edit change anything material".
 *
 * **Cancellation outranks the other two**, and the ordering is a decision rather than an accident
 * of the `if` chain. An organizer who cancels a session *and* moves it in the same act has made
 * one change worth telling anybody about: it is not happening. Reporting `'room'` there would be
 * true and useless.
 *
 * **Reinstatement returns `null`** (FR-1024): `cancelledAt` going from a value to null is not a
 * material change. The notification rule names cancellation and not its reversal, and an attendee
 * whose session comes back has lost nothing by not being told. This is why the first branch
 * checks `after.cancelledAt !== null` rather than `before.cancelledAt !== after.cancelledAt`,
 * which would treat both directions alike.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const materialChangeOf = (
  before: SessionLogistics,
  after: SessionLogistics,
): MaterialChange => {
  if (before.cancelledAt === null && after.cancelledAt !== null) return 'cancelled'
  if (before.startsAt.getTime() !== after.startsAt.getTime()) return 'time'
  if (before.roomId !== after.roomId) return 'room'
  return null
}

/**
 * T016 (014) — **has any attendee engaged with this session?** (FR-1018, FR-1018a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE FOUR TABLES BELOW ARE NOT A LIST SOMEBODY MAINTAINS. `engagement-coverage.test.ts`
 * DERIVES THE SAME SET FROM THE DRIZZLE SCHEMA AND FAILS WHEN THEY DISAGREE.**
 *
 * FR-1018a is explicit about why: *"an enumerated list is a list that ages, and the failure mode
 * is silent — deletions resume destroying attendee data with every existing test still green."*
 * This project has built that mechanism twice already, in `deletion-coverage.test.ts` and
 * `export-coverage.test.ts`, and it has caught something both times.
 *
 * **Every one of these cascades from `sessions.id` today**, which is exactly why FR-1019 exists:
 * one `DELETE` and the database silently destroys four kinds of other people's writing. The
 * cascades are **not removed** — they stay correct for the case FR-1018 still permits, where
 * nothing is attached — and the protection is this refusal plus the `FOR UPDATE` lock its caller
 * takes (research R6), not a change to the referential rules.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **`question_votes` IS ONE HOP AWAY AND IS ENUMERATED EXPLICITLY RATHER THAN REACHED BY
 * CLOSURE** (FR-1018a, research R5).
 *
 * It references `attendees` directly and `sessions` only through `session_questions`. Computing
 * the set by transitive closure over the schema would pick it up — and would also pick up every
 * table that is *merely reachable* from a session through some chain, which is a different and
 * much larger set. Naming the hop keeps the predicate meaning "attendee state about this
 * session" rather than "anything a join can get to".
 *
 * A vote on somebody else's question is still engagement **by the voter**, which is why it counts
 * even when the same session has no saves and no notes: deleting the session would destroy that
 * person's vote, and they never agreed to that.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The tables this predicate covers, in the shape the coverage test compares against.** Exported
 * so the test reads the real value rather than a copy of it — a guard checking its own duplicate
 * of the list would pass while the list it was written about drifted.
 */
export const ENGAGEMENT_TABLES = [
  'saved_sessions',
  'session_notes',
  'session_questions',
  'question_votes',
] as const

/*
 * T148 (014 tranche 2, research R15) — **`hasEngagement` was DELETED here, deliberately.**
 *
 * It named itself the delete predicate and had zero callers and zero importers anywhere in the
 * repository — a header asserting a call relationship that did not exist, which is 013's
 * four-times-found defect class. The live predicate is `countEngagement` in `admin-catalog.ts`,
 * whose boolean is derived by summing the four counts; `ENGAGEMENT_TABLES` above is what the
 * coverage guard reads, and it survives on its own. Restoring a boolean probe would mean two
 * expressions of one predicate again, which is what let them diverge in table coverage before
 * the review composed them into one fragment.
 */

/** One attendee's share of an act: who to interrupt, and which of their saved sessions moved. */
export interface NotifiableAttendee {
  readonly attendeeId: string
  readonly sessionIds: readonly string[]
}

/**
 * T070 (014) — **who to notify about one organizer act, and how many of their sessions it
 * touched** (FR-1028, FR-1028a, FR-1034, research R4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **KEYED ON THE AUDIT ENTRY ID, WHICH IS WHY NOTHING NEW IS STORED TO MAKE COALESCING WORK.**
 *
 * `sessions.last_change_act_id` was stamped with the act's audit entry id inside the act's
 * transaction, so "every session this act materially changed" is one read. Every alternative shape
 * invents an identifier — a batch id, a time bucket, a request id — and the audit entry is already
 * all three.
 *
 * **This used to claim "a single indexed read", and there is no index on `last_change_act_id`.**
 * Rather than add one — a column that is null for almost every row, on the product's hottest
 * edit-time table — the query is **scoped to the conference**, which the caller already holds. That
 * turns a product-wide scan of `sessions` into a lookup inside one conference's programme, served
 * by `sessions_event_room_starts_at_idx`'s leading column, and it is a correctness improvement as
 * well: an act id is unique, so the conference bound cannot exclude a row that should match, and a
 * fan-out that could never reach outside its own conference is a narrower thing to reason about.
 *
 * **Grouped by attendee, not by session**, and that grouping *is* FR-1034: one row out per
 * attendee however many of their saved sessions moved, so the caller cannot accidentally send
 * twelve. Returning a flat list and asking the caller to group would put the requirement in the
 * caller, where a second caller could get it wrong.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE ACTING PRINCIPAL IS EXCLUDED HERE RATHER THAN AT THE DISPATCH** (FR-1028a).
 *
 * An organizer may be registered for their own conference and may have saved the very session
 * they are changing. They already know — they just did it — and being buzzed by your own edit is
 * the kind of thing that makes people turn notifications off.
 *
 * `actorAttendeeId` is null for a platform operator, who has no `attendees` row and therefore
 * cannot be in this set at all. Excluding at the query rather than filtering the result is what
 * makes the marker consistent with the notification: T069's `viewed_at` bump for the actor uses
 * the same predicate, so an organizer sees neither a push nor a marker for their own act.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Runs after the transaction commits** (research R3, R4). The audit entry must be committed
 * before this reads what points at it, or a dispatch could notify about an act that then rolled
 * back — and a fan-out held inside a transaction puts an HTTP push service's hang on a row lock.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **T159 (014 tranche 2) — THE UNION WIDENS THE POPULATION, NOT THE TRIGGER SET, AND THE
 * DISTINCTION IS WRITTEN DOWN NOWHERE ELSE IN THE SHIPPED PRODUCT** (FR-1079, FR-1079a).
 *
 * An attendee holding a PLACE in a session is notified on exactly the same terms as one who
 * saved it — same three material changes, same one-notification-per-act coalescing, same
 * silence for their own act. Without this, taking a place would mean being told LESS than
 * bookmarking, and enrolment replaces saving (FR-1064), so a place-holder would be the only
 * person in the conference told nothing when the room changed.
 *
 * What does NOT move: there are still exactly TWO triggers (a received message; a material
 * change to a session the attendee has saved **or enrolled in**), and the second still means
 * exactly three changes — cancelled, start time, room. Enrolling, withdrawing, enrolment
 * closing, a capacity change and a change of closing offset all dispatch nothing: none of them
 * changes where or whether the attendee must be somewhere, and a third trigger needs another
 * amendment. `trigger-set-pinned.test.ts` asserts both halves over the source, because the
 * module-counting guard cannot see a fourth change added to the predicate.
 *
 * `UNION ALL`, not `UNION`: the two branches cannot produce a duplicate pair — a session's kind
 * decides which commitment exists (FR-1064), so no attendee holds both on one session — and
 * the per-attendee grouping below would absorb one anyway. The mixed attendee — a save on one
 * changed session and a place in another, both touched by one act — is the case the coalescing
 * arithmetic could get wrong silently, and SC-1016a pins it: one notification, count = saves
 * plus places.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const attendeesToNotify = async (
  actId: string,
  actorAttendeeId: string | null,
  eventId: string,
): Promise<NotifiableAttendee[]> => {
  const rows = await getDb().execute<{ attendee_id: string; session_id: string }>(sql`
    SELECT ss.attendee_id, ss.session_id
    FROM ${savedSessions} ss
    JOIN ${sessions} s ON s.id = ss.session_id
    WHERE s.event_id = ${eventId}::uuid
      AND s.last_change_act_id = ${actId}::uuid
      AND (${actorAttendeeId}::uuid IS NULL OR ss.attendee_id <> ${actorAttendeeId}::uuid)
    UNION ALL
    SELECT se.attendee_id, se.session_id
    FROM ${sessionEnrolments} se
    JOIN ${sessions} s ON s.id = se.session_id
    WHERE s.event_id = ${eventId}::uuid
      AND s.last_change_act_id = ${actId}::uuid
      AND (${actorAttendeeId}::uuid IS NULL OR se.attendee_id <> ${actorAttendeeId}::uuid)
    ORDER BY attendee_id, session_id
  `)

  const byAttendee = new Map<string, string[]>()
  for (const row of rows) {
    const list = byAttendee.get(row.attendee_id) ?? []
    list.push(row.session_id)
    byAttendee.set(row.attendee_id, list)
  }

  return [...byAttendee].map(([attendeeId, sessionIds]) => ({ attendeeId, sessionIds }))
}
