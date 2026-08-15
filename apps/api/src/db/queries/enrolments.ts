import { sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'
import { sessionEnrolments } from '../schema/agenda.js'
import { sessions } from '../schema/catalog.js'

/**
 * T135, T136, T140 (014 tranche 2) — taking, holding and releasing a place in an optional
 * session (FR-1063, FR-1067, FR-1068, FR-1069, FR-1070, research R12).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **T128 — THE SESSION-ROW LOCK, DOCUMENTED ONCE, FOR ALL FOUR CALLERS.**
 *
 * Four paths take `SELECT … FOR UPDATE` on a row of `sessions`, and they take the SAME mode on
 * the SAME row for the SAME reason — one lock, one mode, four callers:
 *
 *   1. **Enrolment** (`takePlace`, below) — the only shape that can express a *cardinality*
 *      bound. A unique index enforces a key, not a count; the throttle's insert-then-judge
 *      admits an over-count under commit reordering and would then need to delete a committed
 *      row, which FR-1068 forbids by name ("no interval in which both appear to have
 *      succeeded"); and a denormalised counter is forbidden by an invariant recorded three
 *      times ("the one that drifted would be the one displayed" — and FR-1070 displays it).
 *   2. **Capacity reduction** (`admin-catalog.ts`, FR-1061a) — the held count is read inside
 *      the updating transaction with the row locked, or a place is taken over the new cap.
 *   3. **Kind change** (`admin-catalog.ts`, FR-1065) — a save or enrolment landing between
 *      check and write is exactly the saved-optional state FR-1064 says has no route.
 *   4. **Deletion** (`admin-catalog.ts`, shipped by tranche 1, FR-1019a; tranche 2 adds the
 *      held-places re-read, FR-1077b).
 *
 *  `FOR UPDATE`, never `FOR NO KEY UPDATE`: only the stronger mode conflicts with the
 * `FOR KEY SHARE` a child insert takes to validate its foreign key — the weaker one would
 * compile, return the same row, and close nothing. Two enrolments are not mutually exclusive
 * through that implicit lock (`FOR KEY SHARE` does not conflict with itself), which is why
 * `takePlace` upgrades to the explicit one.
 *
 * **THE ORDERING RULE, stated as a constraint on future edits**: an enrolling transaction locks
 * exactly one session row, so no cycle is constructible and 016's deadlock shape cannot recur.
 * Any future transaction that locks MORE than one session row must sort them by id first.
 *
 * **THE CRITICAL SECTION IS EXACTLY THREE STATEMENTS** — the lock, the count, the insert — and
 * nothing that does its own I/O. The throttle, the response shaping and every refusal that can
 * be answered without the lock stay outside. **Never collapse it into one CTE**: in READ
 * COMMITTED every part of one statement shares one snapshot, and `FOR UPDATE`'s post-wait
 * re-check re-qualifies only the locked row in its own scan node — a sibling CTE's count reads
 * the pre-lock snapshot, so two serialised enrolments would compute the same stale figure.
 * The count must be a separate statement issued after the lock is granted.
 *
 * **A lock wait that outlives `lock_timeout` surfaces as a 500 with a correlation id, and it
 * must NEVER be classified as `full` or `closed`** (T138): telling somebody the session is full
 * when the server never decided anything is a settled outcome the client will render. Nothing
 * here catches database errors, which is what makes that structural — the outcome union below
 * has no member for "we do not know". The `session_enrol` throttle bounds the rate that can
 * produce the wait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERYTHING TIME-SHAPED HERE IS SQL AGAINST THE DATABASE CLOCK, IN snake_case** (FR-1071,
 * FR-1072, research R14). The closing derivation must be evaluated by PostgreSQL at the moment
 * of the request — a device or process clock is the provenance defect 002 recorded — and it is
 * written as one exported helper in column-name case so no consumer ever spells the comparison
 * in a form the time-driven guard's patterns read as a reminder.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * FR-1071/FR-1071a — whether enrolment on `alias` is open, as SQL text.
 *
 * `isoInstant`'s shape (one exported helper, consumers name only the helper): the single change
 * point for the derivation, which is what lets a rescheduled session carry its deadline with it
 * and needs no repair step. Zero hours means open until the session starts (REQ-083).
 */
export const enrolmentOpen = (alias: string): string =>
  `(${alias}.starts_at - make_interval(hours => ${alias}.enrolment_closing_offset_hours) > now())`

export type EnrolOutcome =
  | 'enrolled'
  /** The caller already holds this place. Resolves BEFORE `session-full` (R12): a double-tap on
   * a full session must be told about the place they hold, not about a fullness that does not
   * apply to them. */
  | 'already-enrolled'
  | 'session-full'
  | 'enrolment-closed'
  /** A mandatory session has no places; saving is its commitment (FR-1063). */
  | 'not-optional'
  | 'not-found'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface SessionFacts {
  readonly kind: string
  readonly capacity: number | null
  readonly open: boolean
  readonly held: number
  readonly mine: boolean
}

/**
 * T136 — the advisory pre-check, OUTSIDE any transaction, deciding refusals only.
 *
 * The three refusals that repeat under a stampede — already enrolled, closed, obviously full —
 * are answered here so the common path under contention never takes the exclusive lock
 * (`admin-catalog`'s own recorded lesson: the refusal path is the common one, and it was the
 * branch holding the lock longest). It never decides SUCCESS: a stale "open with places" is
 * re-checked under the lock, where the answer is authoritative. A stale refusal is momentary
 * and safe — the state it reports was true when read and is re-reachable by retrying.
 */
const factsFor = async (
  scope: { attendeeId: string; eventId: string },
  sessionId: string,
): Promise<SessionFacts | null> => {
  const rows = await getDb().execute<{
    kind: string
    capacity: number | null
    open: boolean
    held: number
    mine: boolean
  }>(sql`
    SELECT s.kind, s.capacity, ${sql.raw(enrolmentOpen('s'))} AS open,
           (SELECT count(*)::int FROM ${sessionEnrolments} e WHERE e.session_id = s.id) AS held,
           EXISTS (
             SELECT 1 FROM ${sessionEnrolments} e2
             WHERE e2.session_id = s.id AND e2.attendee_id = ${scope.attendeeId}::uuid
           ) AS mine
    FROM ${sessions} s
    WHERE s.id = ${sessionId}::uuid AND s.event_id = ${scope.eventId}::uuid
  `)

  return rows[0] ?? null
}

/** The refusal order, shared by the pre-check and the locked re-check so they cannot disagree. */
const refusalFor = (facts: SessionFacts): Exclude<EnrolOutcome, 'enrolled'> | null => {
  if (facts.kind !== 'optional') return 'not-optional'
  if (facts.mine) return 'already-enrolled'
  if (!facts.open) return 'enrolment-closed'
  if (facts.capacity !== null && facts.held >= facts.capacity) return 'session-full'
  return null
}

/**
 * T135 — takes a place (FR-1063, FR-1068).
 *
 * The write path: advisory pre-check, then the three-statement critical section the file header
 * documents. `ON CONFLICT … DO NOTHING` on the composite primary key is the last line of
 * defence for a same-attendee race the lock already serialises — the double-tap is the same
 * request twice, and no code path can hold two places for one attendee.
 */
export const takePlace = async (
  unverified: EventScope,
  sessionId: string,
): Promise<EnrolOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return 'not-found'

  const advisory = await factsFor(scope, sessionId)
  if (!advisory) return 'not-found'
  const advisoryRefusal = refusalFor(advisory)
  if (advisoryRefusal) return advisoryRefusal

  return getDb().transaction(async (tx) => {
    // Statement 1: the lock. Everything after this reads a settled world.
    const locked = await tx.execute<{ kind: string; capacity: number | null; open: boolean }>(sql`
      SELECT s.kind, s.capacity, ${sql.raw(enrolmentOpen('s'))} AS open
      FROM ${sessions} s
      WHERE s.id = ${sessionId}::uuid AND s.event_id = ${scope.eventId}::uuid
      FOR UPDATE
    `)
    const row = locked[0]
    if (!row) return 'not-found'

    // Statement 2: the count and the already-held check, AFTER the lock is granted — a
    // separate statement, never a sibling CTE (see the header for why the collapse is wrong).
    const counted = await tx.execute<{ held: number; mine: boolean }>(sql`
      SELECT count(*)::int AS held,
             coalesce(bool_or(attendee_id = ${scope.attendeeId}::uuid), false) AS mine
      FROM ${sessionEnrolments}
      WHERE session_id = ${sessionId}::uuid
    `)
    const tally = counted[0] ?? { held: 0, mine: false }

    const refusal = refusalFor({
      kind: row.kind,
      capacity: row.capacity,
      open: row.open,
      held: tally.held,
      mine: tally.mine,
    })
    if (refusal) return refusal

    // Statement 3: the insert.
    await tx.execute(sql`
      INSERT INTO ${sessionEnrolments} (attendee_id, session_id)
      VALUES (${scope.attendeeId}::uuid, ${sessionId}::uuid)
      ON CONFLICT (attendee_id, session_id) DO NOTHING
    `)

    return 'enrolled'
  })
}

/**
 * T140 — releases a place (FR-1067). **Idempotent**, mirroring `unsaveSession`: succeeds
 * whether or not a place was held, and the place returns to availability the moment the delete
 * commits — no sweep, no delay. Withdrawal remains available after enrolment closes
 * (FR-1071b): the deadline governs TAKING a place, and this is not that. A place released
 * after closing does not become takeable, which falls out of the deadline governing the insert
 * alone — releasing is honest about the seat, not an invitation to fill it.
 */
export const releasePlace = async (unverified: EventScope, sessionId: string): Promise<boolean> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return false

  await getDb().execute(sql`
    DELETE FROM ${sessionEnrolments}
    WHERE attendee_id = ${scope.attendeeId}::uuid
      AND session_id = ${sessionId}::uuid
      AND EXISTS (
        SELECT 1 FROM ${sessions}
        WHERE ${sessions.id} = ${sessionId}::uuid AND ${sessions.eventId} = ${scope.eventId}::uuid
      )
  `)

  const rows = await getDb().execute<{ id: string }>(sql`
    SELECT id FROM ${sessions}
    WHERE id = ${sessionId}::uuid AND event_id = ${scope.eventId}::uuid AND kind = 'optional'
    LIMIT 1
  `)
  return rows.length > 0
}

/**
 * T209's server half — the remaining-places figure, LIVE (FR-1070, FR-1070b, v5.3.0 O3).
 *
 * Derived at read time and stored nowhere: capacity minus a live count, plus whether enrolment
 * is open, against the database clock at the moment of the request. Null for a session that is
 * not optional or not in this conference — the route turns that into the uniform 404, because
 * a mandatory session has no places and the refusal discloses nothing about why.
 *
 * This figure is a fact about ONE session's availability at the moment of deciding (FR-1070a).
 * It is not the count of changes N2 forbids, and no read exists that aggregates it across
 * sessions — the query takes one session id and cannot be asked anything wider.
 */
export const remainingPlaces = async (
  unverified: EventScope,
  sessionId: string,
): Promise<{ remaining: number; open: boolean } | null> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return null

  const rows = await getDb().execute<{ remaining: number; open: boolean }>(sql`
    SELECT greatest(
             s.capacity - (SELECT count(*)::int FROM ${sessionEnrolments} e
                           WHERE e.session_id = s.id),
             0
           )::int AS remaining,
           ${sql.raw(enrolmentOpen('s'))} AS open
    FROM ${sessions} s
    WHERE s.id = ${sessionId}::uuid
      AND s.event_id = ${scope.eventId}::uuid
      AND s.kind = 'optional'
  `)

  return rows[0] ?? null
}
