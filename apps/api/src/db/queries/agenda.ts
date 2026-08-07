import { and, asc, eq, sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'
import { savedSessions, sessionNotes } from '../schema/agenda.js'
import { sessions } from '../schema/catalog.js'

/**
 * T007, T008 (005) — reads and writes of the attendee's own agenda (FR-184–FR-214, FR-229).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FUNCTION HERE TAKES AN `EventScope` AS ITS FIRST PARAMETER, NEVER A BARE STRING —
 * AND NONE TAKES AN ATTENDEE IDENTIFIER AT ALL.**
 *
 * Both halves matter and they carry different requirements.
 *
 * The scope is the 002 pattern unchanged (FR-229): it can only be produced by
 * `requireEventAccess`, so a handler that skipped verification has nothing to pass and does
 * not compile. Verification is a precondition of the operation rather than a step a writer may
 * omit.
 *
 * The **absence** of an attendee parameter is this feature's own addition (FR-190, FR-208,
 * FR-227). The attendee comes out of the scope, which came out of the sign-in session. There
 * is no expression anybody could write here that reads or modifies another attendee's saves or
 * notes, because there is no argument in which to name them. That is what makes the isolation
 * structural instead of a rule every future handler has to remember.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T008 — a session identifier from the client is never trusted to belong to the conference,
 * and the check is folded into the statement rather than performed before it** (FR-231).
 *
 * Every write below carries `WHERE EXISTS (SELECT 1 FROM sessions WHERE id = … AND event_id =
 * scope.eventId)`. Reading the session first and then writing would be wrong twice over:
 *
 *   1. **It is a race.** The gap between the read and the write is a window in which the
 *      answer can change.
 *   2. **It leaks existence.** A separate read gives the handler a distinguishable "no such
 *      session" to report, which is exactly the difference between a 403 and a 404 that
 *      FR-231 forbids. Folded in, the statement simply affects no rows, and every caller
 *      reports the one refusal.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export type NoteRow = {
  readonly sessionId: string
  readonly body: string
  readonly updatedAt: string
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A malformed session identifier is refused exactly like a well-formed one that is not in
 * this conference** (FR-231).
 *
 * Matched here rather than declared as `format: uuid` on the route, and rather than left to
 * PostgreSQL's cast, because both alternatives leak. A schema `format` produces a 400 with a
 * validation body before the handler runs; a failed `::uuid` cast produces a 500. Either one
 * separates "not a uuid" from "not in this conference" — a smaller disclosure than existence,
 * but still a difference an attacker can read, and the same reason `requireEventAccess`
 * matches the event id rather than parsing it.
 *
 * It lives in the query layer so it cannot be forgotten by a route added later.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The session ids this attendee has saved in this conference (FR-188).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Identifiers, not whole sessions.** The programme is fetched and cached separately;
 * returning full sessions here would be a second source of truth for session data that could
 * disagree with the first (contracts/agenda-api.md).
 *
 * Joined through `sessions` and filtered on the scope's event, because `saved_sessions`
 * deliberately does not store `event_id` — denormalising it would create exactly the second
 * source of truth this paragraph is about, and the one that disagreed would be the one
 * authorization read (data-model.md).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * An attendee who has saved nothing gets `[]` — a valid answer that the client renders as an
 * explicit empty state, never a failure (FR-195).
 */
export const listSavedSessionIds = async (unverified: EventScope): Promise<string[]> => {
  // Membership, not merely shape. A value can satisfy `EventScope` and still never have been
  // through the guard; this is the check that makes the guarantee true at runtime, not only in
  // the type system.
  const scope = assertVerifiedScope(unverified)

  const rows = await getDb()
    .select({ sessionId: savedSessions.sessionId })
    .from(savedSessions)
    .innerJoin(sessions, eq(sessions.id, savedSessions.sessionId))
    .where(and(eq(savedSessions.attendeeId, scope.attendeeId), eq(sessions.eventId, scope.eventId)))
    // A total order, so two reads cannot disagree and a diff of the response is meaningful.
    .orderBy(asc(savedSessions.sessionId))

  return rows.map((row) => row.sessionId)
}

/**
 * Save a session. **Idempotent** (FR-187).
 *
 * `ON CONFLICT DO NOTHING` against the composite primary key, so saving twice cannot create a
 * second row — the schema enforces it and this expresses it. A double-tap on a slow connection
 * is simply the same request twice.
 *
 * Returns whether the pairing is now saved, which is **not** the same as whether a row was
 * inserted: an already-saved session reports `true` having inserted nothing. The caller needs
 * to distinguish "this session is not in this conference" (refuse) from "already saved"
 * (succeed), and only the first is a refusal.
 */
export const saveSession = async (unverified: EventScope, sessionId: string): Promise<boolean> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return false

  // ───────────────────────────────────────────────────────────────────────────────────────
  // The session-belongs-to-this-conference check IS the `SELECT` feeding the insert. There is
  // no separate read, so no window and no distinguishable "no such session" (T008, FR-231).
  //
  // `RETURNING` cannot answer the caller's question here, because `ON CONFLICT DO NOTHING`
  // returns no row for an already-saved session — indistinguishable from a session that does
  // not belong to the conference. The existence probe below is a separate statement rather
  // than a smarter one, and it is safe to be: it reads only `sessions`, which is not
  // attendee-scoped, and it runs *after* the write has already been constrained.
  // ───────────────────────────────────────────────────────────────────────────────────────
  await getDb().execute(sql`
    INSERT INTO ${savedSessions} (attendee_id, session_id)
    SELECT ${scope.attendeeId}::uuid, ${sessionId}::uuid
    WHERE EXISTS (
      SELECT 1 FROM ${sessions}
      WHERE ${sessions.id} = ${sessionId}::uuid AND ${sessions.eventId} = ${scope.eventId}::uuid
    )
    ON CONFLICT (attendee_id, session_id) DO NOTHING
  `)

  return sessionBelongsToScope(scope, sessionId)
}

/**
 * Unsave a session. **Idempotent** — succeeds whether or not it was saved (research D6).
 *
 * Scoped identically to `saveSession`: the delete cannot reach a row whose session is not in
 * this conference, and it cannot reach another attendee's row because `attendee_id` comes from
 * the scope rather than from an argument.
 */
export const unsaveSession = async (
  unverified: EventScope,
  sessionId: string,
): Promise<boolean> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return false

  await getDb().execute(sql`
    DELETE FROM ${savedSessions}
    WHERE attendee_id = ${scope.attendeeId}::uuid
      AND session_id = ${sessionId}::uuid
      AND EXISTS (
        SELECT 1 FROM ${sessions}
        WHERE ${sessions.id} = ${sessionId}::uuid AND ${sessions.eventId} = ${scope.eventId}::uuid
      )
  `)

  return sessionBelongsToScope(scope, sessionId)
}

/**
 * Every note this attendee has written in this conference.
 *
 * Returned as a set rather than per session, so opening the detail panel needs no additional
 * request and the whole set caches as one entry (data-model.md, `resource: notes`).
 *
 * **Nothing here can read a note the requester did not write** — `attendee_id` comes from the
 * scope, and there is no parameter in which to name anyone else (FR-208).
 */
export const listNotes = async (unverified: EventScope): Promise<NoteRow[]> => {
  const scope = assertVerifiedScope(unverified)

  const rows = await getDb()
    .select({
      sessionId: sessionNotes.sessionId,
      body: sessionNotes.body,
      updatedAt: sessionNotes.updatedAt,
    })
    .from(sessionNotes)
    .innerJoin(sessions, eq(sessions.id, sessionNotes.sessionId))
    .where(and(eq(sessionNotes.attendeeId, scope.attendeeId), eq(sessions.eventId, scope.eventId)))
    .orderBy(asc(sessionNotes.sessionId))

  return rows.map((row) => ({
    sessionId: row.sessionId,
    body: row.body,
    // An absolute instant over the wire, as everywhere else in this product (FR-124).
    updatedAt: row.updatedAt.toISOString(),
  }))
}

/**
 * Write or replace this attendee's note against a session.
 *
 * `INSERT … ON CONFLICT DO UPDATE`, so the caller never has to know whether a note already
 * existed — and **the last confirmed write wins** (FR-214). No merge is attempted and no
 * conflict is detected; conflict resolution is a separately recorded decision the constitution
 * requires, and this feature does not take one.
 *
 * Returns `null` when the session does not belong to this conference, so the route can refuse
 * with wording that discloses nothing (FR-231). The over-length and empty cases never reach
 * here — the route schema refuses them first, and the column's CHECK refuses them again if a
 * second write path ever appears (FR-213, research D9).
 *
 * `updatedAt` is returned because it is what lets the client's status enter `saved` **from a
 * confirmed response** rather than from a keystroke — the property that keeps the autosave
 * non-optimistic (FR-210, research D5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`updatedAt` is formatted to ISO-8601 in the database, not parsed on the way out.**
 *
 * A raw `execute` hands back the driver's own text for a `timestamptz` —
 * `2026-08-07 13:37:37.693025+00` — which is neither what the route schema declares
 * (`format: date-time`) nor what every other instant in this product sends (FR-124).
 * Reconstructing it in JavaScript would mean parsing a space separator and a two-digit offset,
 * which `new Date` does not accept reliably. `to_char` below produces exactly what
 * `Date#toISOString` produces, so this route and the catalog's cannot drift apart in what an
 * instant looks like on the wire. An integration test caught the difference.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const upsertNote = async (
  unverified: EventScope,
  sessionId: string,
  body: string,
): Promise<{ updatedAt: string } | null> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return null

  const rows = await getDb().execute<{ updated_at: string }>(sql`
    INSERT INTO ${sessionNotes} (attendee_id, session_id, body, updated_at)
    SELECT ${scope.attendeeId}::uuid, ${sessionId}::uuid, ${body}, now()
    WHERE EXISTS (
      SELECT 1 FROM ${sessions}
      WHERE ${sessions.id} = ${sessionId}::uuid AND ${sessions.eventId} = ${scope.eventId}::uuid
    )
    ON CONFLICT (attendee_id, session_id)
      DO UPDATE SET body = excluded.body, updated_at = now()
    RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
  `)

  // ───────────────────────────────────────────────────────────────────────────────────────
  // No row means the `WHERE EXISTS` refused: the session is not in this conference. Here
  // `RETURNING` *is* conclusive, unlike in `saveSession` — `DO UPDATE` always returns a row,
  // so the only way to get none is for the guard to have excluded the insert.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const row = rows[0]
  if (!row) return null

  return { updatedAt: row.updated_at }
}

/**
 * Remove this attendee's note against a session. **Idempotent** — succeeds whether or not one
 * existed.
 *
 * This is the path FR-212 takes: clearing the text does not write an empty note, it deletes.
 * Together with the column's `length(body) > 0` constraint, "no note" has exactly one
 * representation in the database.
 */
export const deleteNote = async (unverified: EventScope, sessionId: string): Promise<boolean> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return false

  await getDb().execute(sql`
    DELETE FROM ${sessionNotes}
    WHERE attendee_id = ${scope.attendeeId}::uuid
      AND session_id = ${sessionId}::uuid
      AND EXISTS (
        SELECT 1 FROM ${sessions}
        WHERE ${sessions.id} = ${sessionId}::uuid AND ${sessions.eventId} = ${scope.eventId}::uuid
      )
  `)

  return sessionBelongsToScope(scope, sessionId)
}

/**
 * Whether a session is part of the conference this scope verifies.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is not the authorization check** — the authorization check is folded into each
 * statement above and has already run by the time this is called. This exists only so an
 * idempotent write can tell "nothing to do" from "not yours", which the statements themselves
 * cannot express: a `DELETE` that matched no row and a `DELETE` refused by the `EXISTS` guard
 * are the same zero.
 *
 * It reads `sessions` alone. That table is conference content, not attendee data, and it is
 * already filtered to the verified event — so this discloses nothing that the caller has not
 * already been granted, and the caller turns a `false` into the same refusal every other cause
 * produces (FR-231).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const sessionBelongsToScope = async (scope: EventScope, sessionId: string): Promise<boolean> => {
  const rows = await getDb()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.eventId, scope.eventId)))
    .limit(1)

  return rows.length > 0
}
