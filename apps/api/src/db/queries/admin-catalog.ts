import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'

import {
  assertVerifiedConferenceAuthority,
  auditPrincipalOf,
  type ConferenceAuthorityScope,
} from '../../admin/require-conference-authority.js'
import type { OperatorScope } from '../../admin/scope.js'
import { getDb } from '../client.js'
import { savedSessions, sessionNotes } from '../schema/agenda.js'
import { rooms, sessions, sessionSpeakers, speakers, tracks } from '../schema/catalog.js'
import { events } from '../schema/events.js'
import { organizerAssignments } from '../schema/organizer-assignments.js'
import { questionVotes, sessionQuestions } from '../schema/questions.js'
import { appendAuditEntry } from './admin-audit.js'
import { hasEngagement, materialChangeOf, type MaterialChange } from './session-changes.js'

/**
 * T013 (014) — **the administrative write path into the conference catalog** (FR-1001, FR-1002,
 * FR-1005, FR-1012–FR-1021, FR-1037, research R1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS IS A NEW FILE AND NOT AN ADDITION TO `queries/catalog.ts`.**
 *
 * `catalog.ts` states in its own header that there is no write path in it and there must not be
 * one, and `tests/unit/catalog-read-only.test.ts` asserts it by name-shape over its exports.
 * CLAUDE.md names both among the guards enforcing the reversed prohibition, each of which "must
 * be amended deliberately, never weakened until it stops checking anything".
 *
 * **None of that had to be weakened, and research R1 is why.** The guard turns out to have been
 * asserting the right thing all along: its two subjects are the **attendee-scoped query module**
 * and the **client-facing repository interface**, and authoring belongs to neither. Every
 * function in `catalog.ts` takes an `EventScope`, minted by `requireEventAccess` from an
 * *attendee's registration*; an organizer authoring a conference has no registration and a
 * platform operator has no `attendees` row at all. Widening `catalog.ts` would have forced that
 * conflation, and the name-shape assertion would have had to become a list of permitted write
 * names — the exact "weakened until it stops checking anything" failure its own comment warns of.
 *
 * So: **two modules, two principals, two scope types.** `catalog.ts` keeps its `EventScope`
 * signatures and stays read-only *literally*, and `CatalogRepository` in `packages/data` gains no
 * write method. The invariant "read-only in perpetuity" survives rather than being reinterpreted
 * to mean "until 014".
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY FUNCTION HERE TAKES A `ConferenceAuthorityScope`, NEVER A BARE STRING, AND NEVER AN
 * `OperatorScope`.**
 *
 * The scope can only be produced by `requireConferenceAuthority`, so a handler that skipped the
 * check cannot call anything in this file — not because it would be refused at runtime, but
 * because it does not compile. And an `OperatorScope` will not do: it proves *authentication*,
 * which every administrative route already has, and proves nothing about **this** conference.
 *
 * The one exception is `createConference`, which takes an `OperatorScope` for the obvious reason:
 * there is no conference to hold authority over yet. Its header says so.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY ACT WRITES ITS AUDIT ENTRY IN THE CALLER'S TRANSACTION, AND EVERY FUNCTION TAKES ONE**
 * (FR-1037).
 *
 * This is not a style. 013 shipped `appendAuditEntry` with an executor parameter that **no caller
 * passed**, while the function's own header asserted that every write path did — so a failing
 * entry left the act committed and unrecorded, which is precisely the guarantee FR-994 states. It
 * was that feature's headline post-review fix and it is guarded twice: a source assertion in
 * `tests/unit/authoring-audit-transactional.test.ts` that every call here passes a transaction,
 * and a behavioural test that fails the insert and asserts the act is gone.
 *
 * The `tx` parameter is therefore **required, not defaulted**. A default would make the unsafe
 * call the shorter one to write, which is how the defect happened the first time.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **NOTHING HERE RETURNS AN ATTENDEE IDENTITY** (FR-1025, FR-1042).
 *
 * `engagementCountsFor` returns four integers. There is no function in this module that can name
 * who saved a session, who wrote a note, who asked a question or who voted — and the fan-out that
 * genuinely needs those identifiers lives in `session-changes.ts`, where nothing administrative
 * reads it. `tests/unit/no-attendee-state-disclosure.test.ts` asserts it over the source.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** A transaction. Required by every function here — see the header. */
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

/**
 * The track colour tokens a conference may use (FR-1004).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A CLOSED SET, AND THE PRODUCT OFFERS NO FREE COLOUR INPUT ANYWHERE.**
 *
 * 002 stores a token **name** rather than a colour value, on the reasoning that a colour here
 * would put the palette in two places and let a data change alter the design system without
 * touching the design system. That held trivially while the only writer was a reviewed seed. It
 * stops holding the moment an organizer types into a form — so the rule needs a gate, and this is
 * it.
 *
 * These are the four tokens `apps/web/src/theme/tokens.css` defines, and `track-unknown` is
 * deliberately **not** among them: it is the defined neutral an unrecognised token renders as, so
 * offering it would let an organizer choose the fallback on purpose and make a real typo
 * indistinguishable from a deliberate choice.
 *
 * Adding a fifth is a design-system change: the token, its `-ink` pair, a contrast check against
 * AA, and this list.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const TRACK_COLOR_TOKENS = [
  'track-design',
  'track-product',
  'track-tech',
  'track-keynote',
] as const

export type TrackColorToken = (typeof TRACK_COLOR_TOKENS)[number]

export const isTrackColorToken = (value: string): value is TrackColorToken =>
  (TRACK_COLOR_TOKENS as readonly string[]).includes(value)

/**
 * What an organizer sees when choosing between deleting and cancelling (FR-1025).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **COUNTS ONLY. NO IDENTITY, NO CONTENT, AND THE TYPE IS WHERE THAT IS ENFORCED.**
 *
 * There is no field here that could hold a name, and `engagementCountsFor` has no parameter that
 * could ask for one. The spec records that the aggregate is thin at small scale — at a conference
 * with three registrants, "1 attendee wrote a note on this" is close to a name — and states the
 * mitigation available without an owner decision: present a **threshold** rather than a count.
 * That is the shape to reach for if FR-1025 is ever read as a disclosure; it is a change to this
 * type and its two readers, and to nothing else.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export interface EngagementCounts {
  readonly saved: number
  readonly notes: number
  readonly questions: number
  readonly votes: number
}

export interface SessionRow {
  readonly id: string
  readonly eventId: string
  readonly title: string
  readonly summary: string | null
  readonly startsAt: Date
  readonly endsAt: Date
  readonly trackId: string
  readonly roomId: string
  readonly cancelledAt: Date | null
}

export interface CatalogEntryInput {
  readonly name: string
}

export interface TrackInput extends CatalogEntryInput {
  readonly colorToken: TrackColorToken
}

export interface SpeakerInput extends CatalogEntryInput {
  readonly title: string | null
  readonly company: string | null
}

/**
 * What one session-changing act produced: the row, whether it reached anybody, and its name.
 *
 * `actId` is the audit entry's id and is the **coalescing key** (research R4) — one act, one
 * notification per attendee, however many of their saved sessions it touched. `change` is `null`
 * when the edit was content rather than logistics (FR-1027), which is the caller's signal to
 * dispatch nothing at all.
 */
export interface SessionAct {
  readonly session: SessionRow
  readonly change: MaterialChange
  readonly actId: string
}

export interface SessionInput {
  readonly title: string
  readonly summary: string | null
  readonly startsAt: string
  readonly endsAt: string
  readonly trackId: string
  readonly roomId: string
  readonly speakerIds: readonly string[]
}

/**
 * Why a write was refused, when the refusal carries a reason (contracts).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY VALUE HERE DESCRIBES THE CALLER'S OWN CONFERENCE**, which is the test every explained
 * refusal in this product must pass: *the follow-up question is about the reader.* 008 made
 * proposing a meeting an enumeration oracle by branching on whether the **invitee** was
 * registered; 009 restated the rule; this type is where 014 obeys it.
 *
 * `'not-found'` is the one that carries nothing, and it is the answer to everything the caller
 * has no authority over — indistinguishable from a conference or a session that does not exist
 * (FR-1036).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export type WriteRefusal =
  | 'not-found'
  /** A track or room a session still references (FR-1017). */
  | 'still-referenced'
  /** Deletion refused because somebody has engaged with the session (FR-1019). */
  | 'has-engagement'
  /** The session falls outside the conference's days, in venue-local time (FR-1012). */
  | 'outside-conference-days'
  /** The end is at or before the start (FR-1013). */
  | 'ends-before-start'
  /** A date range that would leave existing sessions outside it (FR-1014). */
  | 'would-orphan-sessions'
  /** A timezone change with sessions already scheduled (FR-1015). */
  | 'timezone-frozen'

export type WriteResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly refusal: WriteRefusal
      /** Names the sessions a date-range change would orphan (FR-1014). Never attendee data. */
      readonly sessions?: readonly { readonly id: string; readonly title: string }[]
      /** The engagement behind a refused deletion (FR-1019, FR-1025). Counts only. */
      readonly engagement?: EngagementCounts
    }

const refused = <T>(
  refusal: WriteRefusal,
  extra: Omit<Extract<WriteResult<T>, { ok: false }>, 'ok' | 'refusal'> = {},
): WriteResult<T> => ({ ok: false, refusal, ...extra })

const ok = <T>(value: T): WriteResult<T> => ({ ok: true, value })

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Tracks, rooms and speakers (T030, T032).
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Creates a track (FR-1001, FR-1004).
 *
 * The colour token is validated by the caller's route schema **and** narrowed by `TrackInput`, so
 * an unrecognised value cannot reach here. That is deliberate belt-and-braces of the kind 009's
 * `trim()` lesson prescribes: two layers, asserted separately, because the weaker one is the last
 * line of defence when the other is bypassed.
 */
export const createTrack = async (
  unverified: ConferenceAuthorityScope,
  input: TrackInput,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [row] = await tx
    .insert(tracks)
    .values({ eventId: scope.eventId, name: input.name, colorToken: input.colorToken })
    .returning({ id: tracks.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'write_catalog', row.id, 'track', tx)
  return ok(row)
}

export const updateTrack = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  input: TrackInput,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  // `AND event_id = scope.eventId` is the authorization, folded into the statement rather than
  // performed as a prior read — 005's rule (FR-231): a separate read is both a race and a
  // distinguishable "no such track", and neither is acceptable.
  const [row] = await tx
    .update(tracks)
    .set({ name: input.name, colorToken: input.colorToken })
    .where(and(eq(tracks.id, id), eq(tracks.eventId, scope.eventId)))
    .returning({ id: tracks.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'write_catalog', row.id, 'track', tx)
  return ok(row)
}

export const createRoom = async (
  unverified: ConferenceAuthorityScope,
  input: CatalogEntryInput,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [row] = await tx
    .insert(rooms)
    .values({ eventId: scope.eventId, name: input.name })
    .returning({ id: rooms.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'write_catalog', row.id, 'room', tx)
  return ok(row)
}

export const updateRoom = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  input: CatalogEntryInput,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [row] = await tx
    .update(rooms)
    .set({ name: input.name })
    .where(and(eq(rooms.id, id), eq(rooms.eventId, scope.eventId)))
    .returning({ id: rooms.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'write_catalog', row.id, 'room', tx)
  return ok(row)
}

export const createSpeaker = async (
  unverified: ConferenceAuthorityScope,
  input: SpeakerInput,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [row] = await tx
    .insert(speakers)
    .values({
      eventId: scope.eventId,
      name: input.name,
      title: input.title,
      company: input.company,
    })
    .returning({ id: speakers.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'write_catalog', row.id, 'speaker', tx)
  return ok(row)
}

/**
 * Updates a speaker (FR-1001) — and **never an attendee's profile** (FR-1006).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * A speaker row is conference content describing a real person who may or may not also hold an
 * attendee account. There is no column here that references `attendees`, no lookup that could
 * find one, and no route from this record to a profile. Where the same human holds both, editing
 * this changes the programme and changes nothing about them.
 *
 * That is standing decision 33's clause verbatim — *conference content is authorable, a person is
 * not* — and `tests/unit/profile-uneditable.test.ts` asserts it over the whole administrative
 * surface rather than trusting this paragraph. Register entry 28 records the open question this
 * leaves: a speaker is personal data about somebody who never signed up, and 014 moves
 * responsibility for it from a reviewed commit to a promoted attendee typing into a form.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const updateSpeaker = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  input: SpeakerInput,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [row] = await tx
    .update(speakers)
    .set({ name: input.name, title: input.title, company: input.company })
    .where(and(eq(speakers.id, id), eq(speakers.eventId, scope.eventId)))
    .returning({ id: speakers.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'write_catalog', row.id, 'speaker', tx)
  return ok(row)
}

/**
 * T032 (014) — deletes a track (FR-1017).
 *
 * **409 with a reason while any session references it**, and the reason is permitted because it
 * describes the caller's own conference: they can see the sessions, and the fix is to move them.
 * A foreign key would refuse this too, as a 500 naming a constraint — which is a refusal the
 * organizer cannot act on.
 */
export const deleteTrack = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<WriteResult<null>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const referencing = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.trackId, id), eq(sessions.eventId, scope.eventId)))
    .limit(1)

  if (referencing.length > 0) return refused('still-referenced')

  const [row] = await tx
    .delete(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.eventId, scope.eventId)))
    .returning({ id: tracks.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'delete_catalog', id, 'track', tx)
  return ok(null)
}

export const deleteRoom = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<WriteResult<null>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const referencing = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.roomId, id), eq(sessions.eventId, scope.eventId)))
    .limit(1)

  if (referencing.length > 0) return refused('still-referenced')

  const [row] = await tx
    .delete(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.eventId, scope.eventId)))
    .returning({ id: rooms.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'delete_catalog', id, 'room', tx)
  return ok(null)
}

/**
 * Deletes a speaker.
 *
 * **No reference check, and that asymmetry with tracks and rooms is correct rather than an
 * omission.** `session_speakers` cascades from `speakers.id`, and a session's speakers are
 * optional by design (FR-138) — removing one leaves a session with one fewer speaker, which is a
 * legitimate programme. A session with no *track* or no *room* cannot exist at all: both columns
 * are `NOT NULL`, which is why those two refuse.
 */
export const deleteSpeaker = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<WriteResult<null>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [row] = await tx
    .delete(speakers)
    .where(and(eq(speakers.id, id), eq(speakers.eventId, scope.eventId)))
    .returning({ id: speakers.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'delete_catalog', id, 'speaker', tx)
  return ok(null)
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Sessions (T031, T047, T048).
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * T031 (014) — creates a session (FR-1001, FR-1005, FR-1012, FR-1013).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE DAY-RANGE CHECK IS EVALUATED BY POSTGRESQL, IN THE CONFERENCE'S TIMEZONE, INSIDE THIS
 * TRANSACTION** (FR-1012, research R9).
 *
 *     (starts_at AT TIME ZONE e.timezone)::date BETWEEN e.starts_on AND e.ends_on
 *
 * It cannot be a `CHECK` constraint: a check cannot reference another table, and the timezone
 * lives on `events`. So the rule is structurally unavailable at the column level and this is the
 * only place it can be enforced — which is why `tests/integration/authoring-validation.test.ts`
 * drives it **with the route bypassed**. 009 found PostgreSQL's `trim()` accepting what the route
 * refused; here the weaker layer is the application, so the test has to prove the write path is
 * not the only thing holding the rule.
 *
 * FR-1013 needs no new mechanism: `sessions_ends_at_after_starts_at` has been a check constraint
 * since 002. It is checked here anyway so the organizer gets a 400 they can act on rather than a
 * constraint violation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The track and room must belong to the same conference** (FR-1005), enforced by the same
 * `AND event_id = scope.eventId` shape as everything else here: a foreign key alone would happily
 * accept another conference's track, because both rows are in the same table.
 */
export const createSession = async (
  unverified: ConferenceAuthorityScope,
  input: SessionInput,
  tx: Tx,
): Promise<WriteResult<SessionRow>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const times = validateTimes(input)
  if (times) return refused(times)

  if (!(await belongsToConference(scope, input, tx))) return refused('not-found')
  if (!(await withinConferenceDays(scope, input, tx))) return refused('outside-conference-days')

  const [row] = await tx
    .insert(sessions)
    .values({
      eventId: scope.eventId,
      title: input.title,
      summary: input.summary,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      trackId: input.trackId,
      roomId: input.roomId,
    })
    .returning()

  if (!row) return refused('not-found')

  await replaceSpeakers(scope, row.id, input.speakerIds, tx)
  await recordCatalogAct(scope, 'write_session', row.id, 'session', tx)
  return ok(row)
}

/**
 * T031, T069 (014) — updates a session, and reports **what materially changed and under which
 * act** (FR-1026, FR-1027).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE COMPARISON, THE AUDIT ENTRY AND THE STAMP ALL HAPPEN HERE, IN ONE TRANSACTION. THE
 * DISPATCH DOES NOT.**
 *
 * That division is research R3's, and both halves of it matter:
 *
 *   - **Deciding** whether an edit was material is a property of the two rows, and only this
 *     function ever holds both. A route comparing them would need the before-row handed to it,
 *     which is a value it could forget to ask for — and the failure mode is silence: nobody is
 *     told their session moved.
 *   - **Dispatching** must not happen here. The query layer would then take a `PushService`, and
 *     a write path that can send is harder to reason about than a route that writes then sends.
 *     It also has to run *after* the commit, or a rolled-back act notifies anyway.
 *
 * So this returns `change` and `actId`, and `routes/admin/catalog.ts` — the second and only other
 * entry in `DISPATCH_CALLERS` — does the fan-out once the transaction has committed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const updateSession = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  input: SessionInput,
  tx: Tx,
): Promise<WriteResult<SessionAct>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const times = validateTimes(input)
  if (times) return refused(times)

  const before = await readSession(scope, id, tx)
  if (!before) return refused('not-found')

  if (!(await belongsToConference(scope, input, tx))) return refused('not-found')
  if (!(await withinConferenceDays(scope, input, tx))) return refused('outside-conference-days')

  const [after] = await tx
    .update(sessions)
    .set({
      title: input.title,
      summary: input.summary,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      trackId: input.trackId,
      roomId: input.roomId,
    })
    .where(and(eq(sessions.id, id), eq(sessions.eventId, scope.eventId)))
    .returning()

  if (!after) return refused('not-found')

  await replaceSpeakers(scope, id, input.speakerIds, tx)

  const actId = await recordCatalogAct(scope, 'write_session', id, 'session', tx)
  const change = materialChangeOf(before, after)
  if (change !== null) await stampMaterialChange(scope, id, actId, tx)

  return ok({ session: after, change, actId })
}

/**
 * T047 (014) — **deletes a session, and only while nobody has touched it** (FR-1018, FR-1019,
 * FR-1019a, research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`SELECT … FOR UPDATE` ON THE SESSION ROW, INSIDE THIS TRANSACTION, BEFORE THE ENGAGEMENT
 * CHECK. THAT ORDERING IS THE WHOLE REQUIREMENT.**
 *
 * `FOR UPDATE` on the parent row **conflicts with the `FOR KEY SHARE` a child insert takes** when
 * PostgreSQL validates its foreign key. So an attendee saving this session mid-delete **blocks**
 * until this transaction ends, and then either succeeds against a session that survived or fails
 * against one that is gone. In no interleaving is a committed row destroyed.
 *
 * **Checking before the transaction is the race FR-1019a exists to close**, not a fix for it: the
 * gap between reading zero and committing the delete is exactly where the save lands, and the
 * four cascades from `sessions.id` destroy it silently.
 *
 * This is **009's FR-714 mechanism**, cited rather than rediscovered — there the parent was a
 * question and the child a vote; here the parent is a session and the children are four tables.
 * It is also the one property no layer above a real database can test, which is why
 * `tests/integration/delete-engagement-race.test.ts` holds a transaction open against a real
 * `postgres:17` rather than doubling anything.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The refusal carries counts** (FR-1025) so the organizer is told what to do instead — cancel —
 * rather than being told no. Counts, never identity.
 */
export const deleteSession = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<WriteResult<null>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  // The lock. `FOR UPDATE` rather than `FOR NO KEY UPDATE`, because only the stronger mode
  // conflicts with the `FOR KEY SHARE` a child insert takes — the weaker one would compile,
  // return the same row, and close nothing.
  const locked = await tx.execute<{ id: string }>(sql`
    SELECT ${sessions.id} AS id FROM ${sessions}
    WHERE ${sessions.id} = ${id}::uuid AND ${sessions.eventId} = ${scope.eventId}::uuid
    FOR UPDATE
  `)

  if (locked.length === 0) return refused('not-found')

  if (await hasEngagement(id, tx)) {
    return refused('has-engagement', { engagement: await countEngagement(id, tx) })
  }

  await tx.delete(sessions).where(eq(sessions.id, id))
  await recordCatalogAct(scope, 'delete_session', id, 'session', tx)
  return ok(null)
}

/**
 * T048 (014) — cancels a session (FR-1020, FR-1021).
 *
 * **Stored state, and every engagement record survives untouched.** There is no delete here and
 * no cascade fires: the saved-session rows, private notes, questions and votes attached to this
 * session are exactly as they were, and remain readable by the attendees who wrote them.
 *
 * Idempotent by predicate: cancelling an already-cancelled session matches nothing and returns
 * `not-found`, which the route reports as the same 404 as everything else. The alternative —
 * silently succeeding — would re-stamp `logistics_changed_at` and dispatch a second notification
 * for a cancellation that already happened.
 */
export const cancelSession = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<WriteResult<SessionAct>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const before = await readSession(scope, id, tx)
  if (!before || before.cancelledAt !== null) return refused('not-found')

  const [after] = await tx
    .update(sessions)
    .set({ cancelledAt: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.eventId, scope.eventId)))
    .returning()

  if (!after) return refused('not-found')

  const actId = await recordCatalogAct(scope, 'cancel_session', id, 'session', tx)
  // Always material — `materialChangeOf` is called rather than assumed, so the one function that
  // defines the trigger set stays the one function that defines it. A future change to what
  // counts as material reaches this path without anybody remembering to edit it.
  const change = materialChangeOf(before, after)
  if (change !== null) await stampMaterialChange(scope, id, actId, tx)

  return ok({ session: after, change, actId })
}

/**
 * T048 (014) — reinstates a cancelled session (FR-1024).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **DISPATCHES NOTHING, AND THE ASYMMETRY IS A DECISION RATHER THAN AN OVERSIGHT.**
 *
 * `materialChangeOf` returns `null` for a cancellation being lifted, so no caller can accidentally
 * notify on it. The notification rule names cancellation and not its reversal, and an attendee
 * whose session comes back has lost nothing by not being told — whereas an attendee told their
 * session is back may go to a room they had already written off. The marker is not set either, for
 * the same reason: there is nothing they need to do.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const reinstateSession = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<WriteResult<SessionRow>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [after] = await tx
    .update(sessions)
    .set({ cancelledAt: null })
    .where(
      and(
        eq(sessions.id, id),
        eq(sessions.eventId, scope.eventId),
        sql`${sessions.cancelledAt} is not null`,
      ),
    )
    .returning()

  if (!after) return refused('not-found')

  // Audited like every other act, and **not stamped**: `logistics_changed_at` is left alone, so
  // no marker appears and `attendeesToNotify` finds nothing pointing at this entry (FR-1024).
  await recordCatalogAct(scope, 'reinstate_session', id, 'session', tx)
  return ok(after)
}

/**
 * T049 (014) — how many attendees have engaged with this session (FR-1025).
 *
 * **Four counts, no identity, no content.** This is the only figure any administrative surface
 * ever sees about attendee state, and there is deliberately no variant of it that takes a
 * `limit`, returns rows, or names anybody.
 *
 * Takes an executor because the refusal path calls it inside the deleting transaction, where the
 * session row is already locked — reading on the pool there would read outside the lock and could
 * report a count that had already changed.
 */
export const engagementCountsFor = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  tx: Pick<ReturnType<typeof getDb>, 'execute'>,
): Promise<EngagementCounts> => {
  assertVerifiedConferenceAuthority(unverified)
  return countEngagement(id, tx)
}

const countEngagement = async (
  id: string,
  tx: Pick<ReturnType<typeof getDb>, 'execute'>,
): Promise<EngagementCounts> => {
  const rows = await tx.execute<{
    saved: number
    notes: number
    questions: number
    votes: number
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM ${savedSessions}
        WHERE ${savedSessions.sessionId} = ${id}::uuid) AS saved,
      (SELECT count(*)::int FROM ${sessionNotes}
        WHERE ${sessionNotes.sessionId} = ${id}::uuid) AS notes,
      (SELECT count(*)::int FROM ${sessionQuestions}
        WHERE ${sessionQuestions.sessionId} = ${id}::uuid) AS questions,
      (SELECT count(*)::int FROM ${questionVotes}
        JOIN ${sessionQuestions} ON ${sessionQuestions.id} = ${questionVotes.questionId}
        WHERE ${sessionQuestions.sessionId} = ${id}::uuid) AS votes
  `)

  const row = rows[0]
  return {
    saved: row?.saved ?? 0,
    notes: row?.notes ?? 0,
    questions: row?.questions ?? 0,
    votes: row?.votes ?? 0,
  }
}

/**
 * T069 (014) — stamps a material change onto the session and names the act that made it.
 *
 * Called by the route **inside the act's transaction**, after the write and after the audit entry
 * that produced `actId`. Two columns, one statement: `logistics_changed_at` is half the marker
 * predicate (the other half is `saved_sessions.viewed_at`), and `last_change_act_id` is what the
 * fan-out coalesces on.
 *
 * **Not set by a title, summary, track or speaker edit** (FR-1027) — the caller only reaches here
 * when `materialChangeOf` returned something.
 */
export const stampMaterialChange = async (
  unverified: ConferenceAuthorityScope,
  id: string,
  actId: string,
  tx: Tx,
): Promise<void> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  await tx
    .update(sessions)
    .set({ logisticsChangedAt: new Date(), lastChangeActId: actId })
    .where(and(eq(sessions.id, id), eq(sessions.eventId, scope.eventId)))

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **THE ACTING ORGANIZER'S OWN ROW IS MARKED VIEWED IN THE SAME TRANSACTION, AND FR-1028a IS
  // WHY — THE NOTIFICATION HALF ALONE IS NOT THE REQUIREMENT.**
  //
  // `attendeesToNotify` already excludes the acting principal, so an organizer who saved the
  // session they just cancelled receives no push. But `logistics_changed_at` is a property of the
  // **session**, not of a reader, so without this their own Agenda row would still carry a
  // "Changed" marker — and they would have been deliberately not interrupted and then told
  // anyway, by a surface they cannot dismiss.
  //
  // The marker and the notification must agree. Stamping `viewed_at` is the honest way to say it:
  // they have seen this change, because they made it.
  //
  // A platform operator has no `attendees` row (FR-901), so there is nothing to stamp and the
  // guard below is the whole of that case.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (scope.attendeeId !== null) {
    await tx
      .update(savedSessions)
      .set({ viewedAt: new Date() })
      .where(and(eq(savedSessions.sessionId, id), eq(savedSessions.attendeeId, scope.attendeeId)))
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The conference itself (T050, T083).
// ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ConferencePatch {
  readonly name?: string
  readonly location?: string
  readonly startsOn?: string
  readonly endsOn?: string
  readonly timezone?: string
}

/**
 * T050 (014) — edits the conference itself (FR-1014, FR-1015).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWO REFUSALS HERE ARE FR-1012 READ BACKWARDS, AND THE SECOND EXISTS BECAUSE OF THE
 * FIRST.**
 *
 * FR-1012 forbids a session outside its conference's days. FR-1014 is the same rule from the
 * other end: shrinking the range must not orphan sessions that were legal when they were written.
 * It **names them**, which is permitted because they are the caller's own content and the refusal
 * is otherwise unactionable — an organizer told only "no" has to guess which of forty sessions is
 * in the way.
 *
 * FR-1015 freezes the timezone once any session exists, and that is what makes the first check
 * sufficient. Without it a timezone edit could push sessions outside the range **without touching
 * either the range or the sessions**: the same instants land on different venue-local dates. It
 * also sidesteps a question v4.2.0 N1 would otherwise raise — whether shifting every displayed
 * local time counts as "the start time changed" and therefore notifies everybody. Structurally no
 * instant moves; freezing is the answer that needs no new rule.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const patchConference = async (
  unverified: ConferenceAuthorityScope,
  patch: ConferencePatch,
  tx: Tx,
): Promise<WriteResult<{ id: string }>> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const [current] = await tx.select().from(events).where(eq(events.id, scope.eventId)).limit(1)

  if (!current) return refused('not-found')

  const startsOn = patch.startsOn ?? current.startsOn
  const endsOn = patch.endsOn ?? current.endsOn
  const timezone = patch.timezone ?? current.timezone

  if (timezone !== current.timezone) {
    const existing = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.eventId, scope.eventId))
      .limit(1)

    if (existing.length > 0) return refused('timezone-frozen')
  }

  if (startsOn !== current.startsOn || endsOn !== current.endsOn) {
    // Evaluated in the conference's timezone, exactly as `withinConferenceDays` evaluates the
    // forward rule — the two must agree, and they agree by being the same expression.
    const orphans = await tx.execute<{ id: string; title: string }>(sql`
      SELECT ${sessions.id} AS id, ${sessions.title} AS title
      FROM ${sessions}
      WHERE ${sessions.eventId} = ${scope.eventId}::uuid
        AND (${sessions.startsAt} AT TIME ZONE ${timezone})::date
            NOT BETWEEN ${startsOn}::date AND ${endsOn}::date
      ORDER BY ${sessions.startsAt}
    `)

    if (orphans.length > 0) {
      return refused('would-orphan-sessions', {
        sessions: orphans.map((row) => ({ id: row.id, title: row.title })),
      })
    }
  }

  const [row] = await tx
    .update(events)
    .set({
      name: patch.name ?? current.name,
      location: patch.location ?? current.location,
      startsOn,
      endsOn,
      timezone,
    })
    .where(eq(events.id, scope.eventId))
    .returning({ id: events.id })

  if (!row) return refused('not-found')
  await recordCatalogAct(scope, 'update_conference', scope.eventId, 'conference', tx)
  return ok(row)
}

export interface ConferenceInput {
  readonly name: string
  readonly location: string
  readonly startsOn: string
  readonly endsOn: string
  readonly timezone: string
}

/**
 * T083, T084 (014) — creates a conference (FR-1007, FR-1008, FR-1009, FR-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONLY FUNCTION HERE THAT TAKES AN `OperatorScope`, BECAUSE THERE IS NO CONFERENCE TO HOLD
 * AUTHORITY OVER YET.**
 *
 * v4.2.0's N3 makes this the **one product-wide capability a conference organizer holds**, and it
 * is stated in the constitution rather than inferred precisely because decision 32's *"authority
 * reaches only the conferences they are assigned"* cannot describe the act of creating one.
 *
 * Two bounds keep that clause true in substance, and both are visible here:
 *
 *   - **The creator is assigned to what they create, in this transaction** (FR-1008). Not
 *     afterwards, not by a second request — a conference that exists with no organizer because
 *     the second write failed is the `unassigned` state arriving by accident.
 *   - **Creating grants nothing else** (FR-1010). One row in `organizer_assignments`, for this
 *     conference, and no `operators` row: creating is **not a promotion path**, and an organizer
 *     who creates ten conferences still cannot promote anybody or read a report.
 *
 * `assigned_by` is the acting principal. For a platform operator that is their own id; for an
 * organizer creating their own conference there is no operator to name, which the column forbids
 * — see the note at the assignment insert.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE JOIN CODE IS MINTED HERE AND RETRIED ON COLLISION RATHER THAN PRE-CHECKED** (FR-1009).
 *
 * `events.join_code` is `UNIQUE`, so a pre-check is both a race and a second source of truth for a
 * question the constraint already answers. Retrying on the violation is the standard shape and is
 * what 013 used for report resolutions: the database decides, and the loop is bounded so a
 * genuinely broken generator fails loudly rather than spinning.
 *
 * Managing codes — rotating, revoking, viewing — is **015's**, per brainstorm #09. 014 mints one
 * because `join_code` is `NOT NULL` and a conference cannot exist without it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const createConference = async (
  operator: OperatorScope,
  input: ConferenceInput,
  tx: Tx,
): Promise<WriteResult<{ id: string; joinCode: string }>> => {
  if (input.endsOn < input.startsOn) return refused('ends-before-start')

  const created = await insertWithMintedCode(input, tx)
  if (!created) return refused('not-found')

  if (operator.tier === 'organizer' && operator.attendeeId !== null) {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **`assigned_by` names an operator and an organizer is not one**, so the self-assignment a
    // creating organizer receives has no platform operator behind it — there was none involved.
    // The column is `NOT NULL` and references `operators`, so the honest options were to widen
    // the column or to record the grant differently.
    //
    // Neither is taken here: the assignment is written with `assigned_by` pointing at **the
    // platform operator identity the seed guarantees exists**, and if none does the creation is
    // refused rather than fabricating an ungoverned assignment. See `platformGrantor`.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const grantor = await platformGrantor(tx)
    if (!grantor) return refused('not-found')

    await tx.insert(organizerAssignments).values({
      attendeeId: operator.attendeeId,
      eventId: created.id,
      assignedBy: grantor,
    })
  }

  await appendAuditEntry(
    {
      ...(operator.operatorId !== null
        ? { operatorId: operator.operatorId }
        : { actorAttendeeId: operator.attendeeId as string }),
      action: 'create_conference',
      subjectResourceId: created.id,
      subjectKind: 'conference',
    },
    tx,
  )

  return ok(created)
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The programme read (T033).
// ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ProgrammeSession extends SessionRow {
  readonly speakerIds: readonly string[]
  readonly engagement: EngagementCounts
}

export interface Programme {
  readonly conference: {
    readonly id: string
    readonly name: string
    readonly location: string
    readonly startsOn: string
    readonly endsOn: string
    readonly timezone: string
    readonly joinCode: string
    readonly timezoneEditable: boolean
  }
  readonly tracks: readonly { id: string; name: string; colorToken: string }[]
  readonly rooms: readonly { id: string; name: string }[]
  readonly speakers: readonly {
    id: string
    name: string
    title: string | null
    company: string | null
  }[]
  readonly sessions: readonly ProgrammeSession[]
}

/**
 * The whole programme of one conference, for the editor (FR-1001, FR-1025).
 *
 * Everything in one read rather than five, because the editor needs all of it to render a session
 * form at all — a track picker, a room picker and a speaker list are not separate screens. The
 * engagement counts travel with each session so the delete-versus-cancel decision needs no second
 * request at the moment the organizer is making it.
 *
 * **The join code is included**, which is a disclosure to somebody who already holds authority
 * over the conference and needs it to invite anybody (FR-1009). It is not a credential
 * (`schema/events.ts` says so at length) and possessing it grants registration and nothing else.
 */
export const readProgramme = async (
  unverified: ConferenceAuthorityScope,
): Promise<Programme | null> => {
  const scope = assertVerifiedConferenceAuthority(unverified)
  const db = getDb()

  const [conference] = await db.select().from(events).where(eq(events.id, scope.eventId)).limit(1)
  if (!conference) return null

  const [trackRows, roomRows, speakerRows, sessionRows, speakerLinks] = await Promise.all([
    db
      .select({ id: tracks.id, name: tracks.name, colorToken: tracks.colorToken })
      .from(tracks)
      .where(eq(tracks.eventId, scope.eventId))
      .orderBy(asc(tracks.name)),
    db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .where(eq(rooms.eventId, scope.eventId))
      .orderBy(asc(rooms.name)),
    db
      .select({
        id: speakers.id,
        name: speakers.name,
        title: speakers.title,
        company: speakers.company,
      })
      .from(speakers)
      .where(eq(speakers.eventId, scope.eventId))
      .orderBy(asc(speakers.name)),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.eventId, scope.eventId))
      .orderBy(asc(sessions.startsAt), asc(sessions.id)),
    db
      .select({ sessionId: sessionSpeakers.sessionId, speakerId: sessionSpeakers.speakerId })
      .from(sessionSpeakers)
      .innerJoin(speakers, eq(speakers.id, sessionSpeakers.speakerId))
      .where(eq(speakers.eventId, scope.eventId)),
  ])

  const bySession = new Map<string, string[]>()
  for (const link of speakerLinks) {
    const list = bySession.get(link.sessionId) ?? []
    list.push(link.speakerId)
    bySession.set(link.sessionId, list)
  }

  // One aggregate read for the whole conference rather than one per session: an organizer opening
  // a forty-session programme must not issue forty count queries.
  const counts = await db.execute<{
    session_id: string
    saved: number
    notes: number
    questions: number
    votes: number
  }>(sql`
    SELECT s.id AS session_id,
      (SELECT count(*)::int FROM ${savedSessions} WHERE ${savedSessions.sessionId} = s.id) AS saved,
      (SELECT count(*)::int FROM ${sessionNotes} WHERE ${sessionNotes.sessionId} = s.id) AS notes,
      (SELECT count(*)::int FROM ${sessionQuestions}
        WHERE ${sessionQuestions.sessionId} = s.id) AS questions,
      (SELECT count(*)::int FROM ${questionVotes}
        JOIN ${sessionQuestions} ON ${sessionQuestions.id} = ${questionVotes.questionId}
        WHERE ${sessionQuestions.sessionId} = s.id) AS votes
    FROM ${sessions} s
    WHERE s.event_id = ${scope.eventId}::uuid
  `)

  const engagementBySession = new Map<string, EngagementCounts>(
    counts.map((row) => [
      row.session_id,
      { saved: row.saved, notes: row.notes, questions: row.questions, votes: row.votes },
    ]),
  )

  const zero: EngagementCounts = { saved: 0, notes: 0, questions: 0, votes: 0 }

  return {
    conference: {
      id: conference.id,
      name: conference.name,
      location: conference.location,
      startsOn: conference.startsOn,
      endsOn: conference.endsOn,
      timezone: conference.timezone,
      joinCode: conference.joinCode,
      // Surfaced rather than left for the client to infer from the session list, so the control
      // is disabled for the same reason the server would refuse (FR-1015).
      timezoneEditable: sessionRows.length === 0,
    },
    tracks: trackRows,
    rooms: roomRows,
    speakers: speakerRows,
    sessions: sessionRows.map((row) => ({
      ...row,
      speakerIds: bySession.get(row.id) ?? [],
      engagement: engagementBySession.get(row.id) ?? zero,
    })),
  }
}

/**
 * T041 (014) — sessions already in this room at an overlapping time (FR-1016).
 *
 * **Permitted, and warned about.** Conferences genuinely overlap sessions during changeover, and
 * refusing would be a rule the product invented rather than one the domain has. So this returns
 * what the organizer should look at before confirming, and refuses nothing.
 *
 * Overlap is `starts < other.ends AND ends > other.starts` — half-open, so a session beginning
 * exactly when another ends is not an overlap and produces no warning anybody would learn to
 * ignore.
 */
export const overlappingInRoom = async (
  unverified: ConferenceAuthorityScope,
  input: { roomId: string; startsAt: string; endsAt: string; excludeSessionId?: string },
): Promise<{ id: string; title: string }[]> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  const rows = await getDb()
    .select({ id: sessions.id, title: sessions.title })
    .from(sessions)
    .where(
      and(
        eq(sessions.eventId, scope.eventId),
        eq(sessions.roomId, input.roomId),
        // Bound as ISO strings with an explicit cast, for the reason `withinConferenceDays`
        // records: a `Date` inside a `sql` fragment has no column to tell postgres.js how to
        // encode it.
        sql`${sessions.startsAt} < ${input.endsAt}::timestamptz`,
        sql`${sessions.endsAt} > ${input.startsAt}::timestamptz`,
        sql`${sessions.cancelledAt} is null`,
        input.excludeSessionId ? ne(sessions.id, input.excludeSessionId) : undefined,
      ),
    )
    .orderBy(asc(sessions.startsAt))

  return rows
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Internals.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Writes the audit entry for a catalog act, in the caller's transaction (FR-1037, FR-1038).
 *
 * One helper rather than eleven copies, and it is the reason `auditPrincipalOf` exists: an
 * organizer's act belongs in `actor_attendee_id` and an operator's in `operator_id`, and eleven
 * call sites each deciding that is eleven chances to write the wrong column. 013's review found
 * exactly that shape of mistake four times over.
 *
 * **The entry is not returned.** Catalog acts do not coalesce a notification — only session acts
 * do, and those call `appendAuditEntry` directly so they hold the id.
 */
const recordCatalogAct = async (
  scope: ConferenceAuthorityScope,
  action: AuthoringAction,
  resourceId: string,
  kind: string,
  tx: Tx,
): Promise<string> =>
  appendAuditEntry(
    {
      ...auditPrincipalOf(scope),
      action,
      subjectResourceId: resourceId,
      subjectKind: kind,
    },
    tx,
  )

/** The eight acts 014 adds to the closed action set in `schema/admin-audit.ts`. */
type AuthoringAction =
  | 'create_conference'
  | 'update_conference'
  | 'write_catalog'
  | 'delete_catalog'
  | 'write_session'
  | 'cancel_session'
  | 'reinstate_session'
  | 'delete_session'

const validateTimes = (input: SessionInput): WriteRefusal | null => {
  const starts = new Date(input.startsAt)
  const ends = new Date(input.endsAt)
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return 'not-found'
  return ends > starts ? null : 'ends-before-start'
}

/**
 * Whether the track and room named by an input belong to **this** conference (FR-1005).
 *
 * A foreign key cannot express this: `tracks.id` is a valid track whichever conference it belongs
 * to. Two `EXISTS` probes in one statement, so a session cannot be assembled out of two
 * conferences' parts.
 */
const belongsToConference = async (
  scope: ConferenceAuthorityScope,
  input: SessionInput,
  tx: Tx,
): Promise<boolean> => {
  const rows = await tx.execute<{ valid: boolean }>(sql`
    SELECT (
      EXISTS (
        SELECT 1 FROM ${tracks}
        WHERE ${tracks.id} = ${input.trackId}::uuid
          AND ${tracks.eventId} = ${scope.eventId}::uuid
      )
      AND EXISTS (
        SELECT 1 FROM ${rooms}
        WHERE ${rooms.id} = ${input.roomId}::uuid AND ${rooms.eventId} = ${scope.eventId}::uuid
      )
    ) AS valid
  `)

  return rows[0]?.valid === true
}

/** FR-1012, evaluated by PostgreSQL in the conference's own timezone. See `createSession`. */
const withinConferenceDays = async (
  scope: ConferenceAuthorityScope,
  input: SessionInput,
  tx: Tx,
): Promise<boolean> => {
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **The instants are bound as ISO strings with an explicit `::timestamptz` cast, never as
  // `Date` objects.** A raw `execute` hands parameters straight to postgres.js, which encodes a
  // `Date` only where a column type tells it to — inside a raw statement there is no column, and
  // it throws `The "string" argument must be of type string`. Drizzle's query builder does the
  // conversion because it knows the column; this is the one place that knowledge is absent.
  //
  // The same class of mistake as 010's `sql<Date>\`now()\``, which was an assertion to the type
  // checker rather than a conversion and arrived as a string.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const rows = await tx.execute<{ inside: boolean }>(sql`
    SELECT (
      (${input.startsAt}::timestamptz AT TIME ZONE e.timezone)::date
        BETWEEN e.starts_on AND e.ends_on
      AND (${input.endsAt}::timestamptz AT TIME ZONE e.timezone)::date
        BETWEEN e.starts_on AND e.ends_on
    ) AS inside
    FROM ${events} e
    WHERE e.id = ${scope.eventId}::uuid
  `)

  return rows[0]?.inside === true
}

/**
 * Replaces a session's speakers.
 *
 * Delete-then-insert rather than a diff, because the set is small and a diff is a second place for
 * the same rule to be wrong. Every speaker is re-scoped to the conference in the insert's
 * `SELECT`, so a speaker from another conference is silently dropped rather than joined — the
 * same-event rule `session_speakers` cannot express as a foreign key (002, data-model.md).
 */
const replaceSpeakers = async (
  scope: ConferenceAuthorityScope,
  sessionId: string,
  speakerIds: readonly string[],
  tx: Tx,
): Promise<void> => {
  await tx.delete(sessionSpeakers).where(eq(sessionSpeakers.sessionId, sessionId))
  if (speakerIds.length === 0) return

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **`inArray` rather than an interpolated `ARRAY[...]` literal.** The identifiers arrive from
  // the client, and building the list with `sql.raw` would put caller-supplied text into the
  // statement — the one shape in this codebase that is genuinely an injection. Every other
  // interpolation in these files is a bound parameter; `sql.raw` is not, and it appears nowhere
  // in this module for that reason.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const permitted = await tx
    .select({ id: speakers.id })
    .from(speakers)
    .where(and(eq(speakers.eventId, scope.eventId), inArray(speakers.id, [...speakerIds])))

  if (permitted.length === 0) return

  await tx
    .insert(sessionSpeakers)
    .values(permitted.map((row) => ({ sessionId, speakerId: row.id })))
    .onConflictDoNothing()
}

const readSession = async (
  scope: ConferenceAuthorityScope,
  id: string,
  tx: Tx,
): Promise<SessionRow | null> => {
  const [row] = await tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.eventId, scope.eventId)))
    .limit(1)

  return row ?? null
}

/**
 * The characters a join code is drawn from, and the reason the set is not the whole alphabet.
 *
 * A code is read off a badge or a slide and typed by hand, so `0`/`O` and `1`/`I`/`l` are omitted:
 * a code nobody can transcribe is a conference nobody can join. Matches the shape the seed's codes
 * already take, so a minted code and a seeded one are indistinguishable to the join flow.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

const mintJoinCode = (): string => {
  const bytes = new Uint8Array(CODE_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

/**
 * Inserts the conference, retrying on a join-code collision (FR-1009).
 *
 * Bounded at five attempts. With a 31-character alphabet and eight characters the space is ~8.5e11,
 * so five collisions in a row means the generator is broken rather than unlucky — and failing
 * loudly is better than a loop that spins while an organizer waits.
 */
const insertWithMintedCode = async (
  input: ConferenceInput,
  tx: Tx,
): Promise<{ id: string; joinCode: string } | null> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = mintJoinCode()
    const rows = await tx.execute<{ id: string }>(sql`
      INSERT INTO ${events} (name, location, starts_on, ends_on, timezone, join_code)
      VALUES (${input.name}, ${input.location}, ${input.startsOn}::date, ${input.endsOn}::date,
              ${input.timezone}, ${joinCode})
      ON CONFLICT (join_code) DO NOTHING
      RETURNING id
    `)

    const row = rows[0]
    if (row) return { id: row.id, joinCode }
  }

  return null
}

/**
 * The platform operator an organizer's self-assignment is recorded against.
 *
 * `organizer_assignments.assigned_by` is `NOT NULL` and references `operators`, because 013 built
 * it for promotion — where a platform operator always performs the grant. An organizer creating
 * their own conference has no such person, and three options were available:
 *
 *   - **Make the column nullable.** It would then be nullable for promotions too, where a missing
 *     grantor is exactly the unaccountable state FR-933 exists to prevent.
 *   - **Give organizers an `operators` row.** The change `schema/operators.ts` names as collapsing
 *     two tiers into one table with a flag.
 *   - **Name the seeded platform identity** — this. The grant is genuinely product-level: it is
 *     v4.2.0's N3 that permits it, not any individual operator's decision, and the audit entry
 *     beside it records the actual actor in `actor_attendee_id`.
 *
 * Returns null when no platform operator exists at all, and creation is refused rather than
 * inventing an assignment nobody granted. That state is only reachable in a database that has
 * never been seeded, which is not a state the product runs in.
 */
const platformGrantor = async (tx: Tx): Promise<string | null> => {
  const rows = await tx.execute<{ id: string }>(sql`
    SELECT id FROM operators WHERE deactivated_at IS NULL ORDER BY created_at LIMIT 1
  `)
  return rows[0]?.id ?? null
}
