import { sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'
import type { AppointmentStatus } from '../schema/appointments.js'

/**
 * T081–T086, T100–T104, T124 (008) — proposing a meeting, answering one, and the availability
 * that decides what may be proposed (FR-625–FR-639a, research R10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FUNCTION HERE TAKES AN `EventScope`, WHICH ONLY `requireEventAccess` CAN CONSTRUCT.**
 *
 * Appointments are per-event (standing decision 7), so unlike `queries/cards.ts` next door this
 * module is inside the guarantee 002 built: a handler that skipped the guard has nothing to pass
 * and does not compile, and `assertVerifiedScope` checks membership rather than merely shape.
 *
 * The reader always comes from the scope, never from an argument — the same removal of a failure
 * mode `listDirectory` records: a second parameter could only ever agree with the scope or
 * disagree with it, and the disagreeing case would authorize against one identity while acting
 * on another.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** ISO-8601 with milliseconds, in UTC, produced by the database. See `queries/cards.ts`. */
const isoInstant = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

export interface MeetingSlotRow {
  readonly slotId: string
  readonly startsAt: string
  readonly endsAt: string
}

/**
 * A meeting as a reader sees it. `status` may be `lapsed`, which no row ever holds — see
 * `deriveStatus`.
 */
export interface AppointmentRow {
  readonly appointmentId: string
  readonly role: 'proposer' | 'invitee'
  readonly counterpartId: string
  readonly counterpartName: string
  readonly slot: MeetingSlotRow
  readonly topic: string
  readonly status: AppointmentStatus | 'lapsed'
  readonly createdAt: string
  readonly answeredAt: string | null
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T081 — SLOTS THE READER MAY OFFER. EVERY INPUT IS KEYED TO THE READER, AND NOTHING ABOUT
 * THE INVITEE ENTERS THIS QUERY** (FR-625, FR-626, research R10).
 *
 *     meeting_slots for the event
 *       MINUS slots overlapping the READER's saved sessions
 *       MINUS slots of the READER's own pending proposals they SENT
 *       MINUS slots of the READER's confirmed appointments (either role)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T082 — AN INVITEE-DERIVED INPUT IS FORBIDDEN, AND THE REASON IS THAT IT LEAKS BY OMISSION.**
 *
 * The tempting version of this feature filters out slots the invitee is already busy in. It
 * would be more convenient and it is a **Principle VIII disclosure**: the reader would learn,
 * from which options vanished, exactly when the invitee has sessions saved and meetings booked.
 * Nobody typed that anywhere; it would be inferred from an absence, which is why constitution
 * v3.2.0 (N2) names it *a leak by omission* and forbids it outright.
 *
 * SC-605 measures it: for a fixed reader the offered set must be **byte-identical** regardless of
 * what the invitee has saved or booked. Writing the query with only reader-keyed inputs makes
 * that structural — a later `AND` against invitee state would have to be *added deliberately*
 * rather than reached by accident, which is a thing review can see.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A RECEIVED PROPOSAL CONTRIBUTES NOTHING, AND THAT IS LOAD-BEARING** (SC-608a).
 *
 * Only proposals the reader **sent** are subtracted. If a received one were, anyone could consume
 * a stranger's entire day by proposing into every slot of it — and the throttle would bound that
 * without preventing it, because the bound is per-actor and there are many actors.
 *
 * So no attendee's availability can be reduced by another attendee's action, at all. Double
 * booking is caught later instead, at acceptance, on the invitee's own terms (FR-633a).
 *
 * **T074 and T075 test these two properties separately and must stay separate.** They read alike
 * and guard opposite failures: one is about what the reader can *learn*, the other about what
 * somebody else can *do to them*.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Past slots are excluded**, on the same clock as everything else — the database's `now()`,
 * never the API process's (the provenance lesson 002 records for `resolveActiveEvent`). A slot
 * that has already started cannot be proposed, which is the same fact `lapsed` reports from the
 * other end.
 */
export const listOfferableSlots = async (unverified: EventScope): Promise<MeetingSlotRow[]> => {
  const scope = assertVerifiedScope(unverified)

  const rows = await getDb().execute<{ slot_id: string; starts_at: string; ends_at: string }>(sql`
    SELECT
      s.id                                  AS slot_id,
      ${sql.raw(isoInstant('s.starts_at'))} AS starts_at,
      ${sql.raw(isoInstant('s.ends_at'))}   AS ends_at
    FROM meeting_slots s
    WHERE s.event_id = ${scope.eventId}::uuid
      AND s.starts_at > now()
      -- The reader's own programme. Overlap rather than equality: a session need not start on a
      -- slot boundary to make that slot unusable.
      AND NOT EXISTS (
        SELECT 1
        FROM saved_sessions ss
        JOIN sessions sess ON sess.id = ss.session_id
        WHERE ss.attendee_id = ${scope.attendeeId}::uuid
          AND sess.event_id = ${scope.eventId}::uuid
          AND sess.starts_at < s.ends_at
          AND sess.ends_at > s.starts_at
      )
      -- The reader's own live claims. **proposer_id for pending** — a received proposal is
      -- deliberately absent, see the header — and either role once confirmed, because a
      -- confirmed meeting is a commitment whichever side asked for it.
      AND NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.slot_id = s.id
          AND (
            (a.status = 'pending' AND a.proposer_id = ${scope.attendeeId}::uuid)
            OR (a.status = 'confirmed'
                AND (a.proposer_id = ${scope.attendeeId}::uuid
                     OR a.invitee_id = ${scope.attendeeId}::uuid))
          )
      )
    ORDER BY s.starts_at ASC
  `)

  return rows.map((row) => ({
    slotId: row.slot_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }))
}

/** What `proposeAppointment` resolved to, so the route can answer without a second read. */
export type ProposeOutcome =
  | { readonly outcome: 'proposed'; readonly appointment: AppointmentRow }
  | { readonly outcome: 'unreachable' }
  | { readonly outcome: 'refused' }
  | { readonly outcome: 'invalid' }
  | { readonly outcome: 'slot-unavailable' }

/**
 * T083 — propose a meeting (FR-628, FR-629, FR-637, FR-639a).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The invitee must be registered for this conference**, and the refusal is the same 404 as a
 * nonexistent appointment. That is also why the client offers no scheduling action at all for a
 * contact absent from the active event (FR-639a): the surface reflects the rule rather than
 * discovering it.
 *
 * **No discoverability condition, unlike sharing a card.** Proposing a meeting requires holding
 * the invitee's card, which is a stronger predicate — they gave it to you by hand. Requiring
 * discoverability as well would let a global directory setting silently cancel an individual
 * decision, which is precisely the standing consent `queries/cards.ts` protects.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const proposeAppointment = async (
  unverified: EventScope,
  inviteeId: string,
  slotId: string,
  topic: string,
): Promise<ProposeOutcome> => {
  const scope = assertVerifiedScope(unverified)

  if (!UUID.test(inviteeId) || !UUID.test(slotId)) return { outcome: 'unreachable' }
  if (inviteeId === scope.attendeeId) return { outcome: 'unreachable' }

  // FR-629's server-side backstop. The client keeps its confirm control disabled, so reaching
  // this means something bypassed it — and the column CHECK would refuse it anyway.
  const trimmed = topic.trim()
  if (trimmed.length === 0 || trimmed.length > TOPIC_MAX_LENGTH) return { outcome: 'invalid' }

  const db = getDb()

  // The block check, before anything is written (FR-637). Bidirectional though the rows are not,
  // and answered with the same reasonless 409 as a blocked card share — see `queries/cards.ts`.
  const blocked = await db.execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM attendee_blocks
      WHERE (blocker_id = ${scope.attendeeId}::uuid AND blocked_id = ${inviteeId}::uuid)
         OR (blocker_id = ${inviteeId}::uuid AND blocked_id = ${scope.attendeeId}::uuid)
    ) AS blocked
  `)
  if (blocked[0]?.blocked === true) return { outcome: 'refused' }

  // ───────────────────────────────────────────────────────────────────────────────────────
  // **The slot must still be offerable to the reader, and that is re-asked inside the INSERT.**
  //
  // The client chose from a list that was true when it was fetched. Between then and now the
  // reader may have saved a session over it or had another proposal confirmed — so the same
  // exclusion the availability query applies is folded in here as an `EXISTS`, with no window
  // between the check and the write.
  //
  // The partial unique index on `(proposer_id, slot_id)` is the last line of defence for the
  // concurrent case, and it is what makes FR-625's subtraction sound rather than merely likely.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO appointments (event_id, slot_id, proposer_id, invitee_id, topic)
    SELECT ${scope.eventId}::uuid, ${slotId}::uuid, ${scope.attendeeId}::uuid,
           ${inviteeId}::uuid, ${trimmed}
    WHERE EXISTS (
      SELECT 1 FROM meeting_slots s
      WHERE s.id = ${slotId}::uuid
        AND s.event_id = ${scope.eventId}::uuid
        AND s.starts_at > now()
        AND NOT EXISTS (
          SELECT 1 FROM saved_sessions ss
          JOIN sessions sess ON sess.id = ss.session_id
          WHERE ss.attendee_id = ${scope.attendeeId}::uuid
            AND sess.event_id = ${scope.eventId}::uuid
            AND sess.starts_at < s.ends_at
            AND sess.ends_at > s.starts_at
        )
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.slot_id = s.id
            AND (
              (a.status = 'pending' AND a.proposer_id = ${scope.attendeeId}::uuid)
              OR (a.status = 'confirmed'
                  AND (a.proposer_id = ${scope.attendeeId}::uuid
                       OR a.invitee_id = ${scope.attendeeId}::uuid))
            )
        )
    )
    -- The invitee must be at this conference (FR-639a).
    AND EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.attendee_id = ${inviteeId}::uuid AND r.event_id = ${scope.eventId}::uuid
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `)

  const id = inserted[0]?.id
  if (!id) {
    // ═════════════════════════════════════════════════════════════════════════════════════
    // **THE FOLLOW-UP QUESTION IS ASKED ABOUT THE READER, NEVER ABOUT THE INVITEE — AND THAT
    // CORRECTION CLOSED AN ENUMERATION ORACLE.**
    //
    // This used to ask whether the *invitee* was registered, and answer 400 when they were and
    // 404 when they were not. The caller controls the slot half of the insert's guard
    // completely — pass any well-formed UUID that is not a slot of this event — so the branch
    // was selected **solely by the invitee's registration state**. That made this route a clean
    // probe: 400 means "this person is at this conference", 404 means they are not, no row
    // written and nobody notified.
    //
    // It is exactly the disclosure Discover refuses (`queries/directory.ts` excludes an
    // attendee who has set `discoverable = false`), and exactly the shape `queries/blocks.ts`
    // records having closed once already on its own route.
    //
    // So the question is now asked of the reader's own availability, which is a fact about
    // themselves: is this slot still offerable to *them*? Every other zero-row cause — invitee
    // not registered, invitee nonexistent, slot not of this event — collapses into the same
    // indistinguishable 404 (FR-607, FR-642).
    // ═════════════════════════════════════════════════════════════════════════════════════
    const offerable = await db.execute<{ ok: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM meeting_slots s
        WHERE s.id = ${slotId}::uuid
          AND s.event_id = ${scope.eventId}::uuid
          AND s.starts_at > now()
          AND NOT EXISTS (
            SELECT 1 FROM saved_sessions ss
            JOIN sessions sess ON sess.id = ss.session_id
            WHERE ss.attendee_id = ${scope.attendeeId}::uuid
              AND sess.event_id = ${scope.eventId}::uuid
              AND sess.starts_at < s.ends_at
              AND sess.ends_at > s.starts_at
          )
          AND NOT EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.slot_id = s.id
              AND (
                (a.status = 'pending' AND a.proposer_id = ${scope.attendeeId}::uuid)
                OR (a.status = 'confirmed'
                    AND (a.proposer_id = ${scope.attendeeId}::uuid
                         OR a.invitee_id = ${scope.attendeeId}::uuid))
              )
          )
      ) AS ok
    `)

    // The slot IS still offerable to the reader, so the insert failed for a reason that is not
    // about their schedule — the invitee. Indistinguishable 404.
    if (offerable[0]?.ok === true) return { outcome: 'unreachable' }

    // The slot is genuinely no longer free for the reader. A fact about their own diary, told
    // to them, which is why this one may carry a reason at all.
    return { outcome: 'slot-unavailable' }
  }

  const appointment = await readAppointment(scope, id)
  return appointment
    ? { outcome: 'proposed', appointment }
    : /* c8 ignore next */ { outcome: 'unreachable' }
}

/** The route schema enforces this too; the column CHECK enforces non-blankness independently. */
export const TOPIC_MAX_LENGTH = 200

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T103 — `lapsed` IS DERIVED HERE, ON EVERY READ, AND IS STORED NOWHERE** (FR-634).
 *
 * A pending proposal whose slot has already started can no longer be accepted. Reporting it as
 * still *pending* would offer an Accept control that must then fail; storing a fifth status
 * would need a scheduled sweep to maintain it, and this feature deliberately introduces **no
 * background job** (research R8).
 *
 * Only `pending` lapses. A confirmed meeting in the past is a meeting that happened, and a
 * declined or cancelled one is already answered — relabelling either would destroy information.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const deriveStatus = (status: AppointmentStatus, lapsed: boolean): AppointmentStatus | 'lapsed' =>
  status === 'pending' && lapsed ? 'lapsed' : status

type AppointmentDbRow = {
  appointment_id: string
  role: 'proposer' | 'invitee'
  counterpart_id: string
  counterpart_name: string
  slot_id: string
  starts_at: string
  ends_at: string
  topic: string
  status: AppointmentStatus
  lapsed: boolean
  created_at: string
  answered_at: string | null
}

/**
 * The projection every appointment read shares.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T086 — THE PARTICIPANT CONDITION IS INSIDE THE QUERY, AND IT PRODUCES 404 RATHER THAN 403**
 * (FR-636, research R2).
 *
 * `requireEventAccess` proves the caller is registered for the conference. It does **not** prove
 * they are party to this appointment — every attendee at the conference passes it. So the second
 * half is here, as a `WHERE`, and an appointment that exists but is not the caller's produces no
 * row **exactly as** one that does not exist produces no row.
 *
 * That indistinguishability is by construction rather than by two careful call sites: there is
 * one query, and no code path could later make the two differ without adding a second query that
 * nobody makes. A 403 would confirm that two specific people have a meeting.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const appointmentSelect = (scope: EventScope) => sql`
  SELECT
    a.id AS appointment_id,
    CASE WHEN a.proposer_id = ${scope.attendeeId}::uuid THEN 'proposer' ELSE 'invitee' END AS role,
    other.id AS counterpart_id,
    other.display_name AS counterpart_name,
    s.id AS slot_id,
    ${sql.raw(isoInstant('s.starts_at'))} AS starts_at,
    ${sql.raw(isoInstant('s.ends_at'))} AS ends_at,
    a.topic,
    a.status,
    (s.starts_at <= now()) AS lapsed,
    ${sql.raw(isoInstant('a.created_at'))} AS created_at,
    ${sql.raw(isoInstant('a.answered_at'))} AS answered_at
  FROM appointments a
  JOIN meeting_slots s ON s.id = a.slot_id
  -- The other party, joined LIVE. There is no stored copy of a name or a face here, for the same
  -- reason shared_cards stores none (FR-611).
  JOIN attendees other
    ON other.id = CASE WHEN a.proposer_id = ${scope.attendeeId}::uuid
                       THEN a.invitee_id ELSE a.proposer_id END
  WHERE a.event_id = ${scope.eventId}::uuid
    -- The participant condition. See the header: this is FR-636, and it is why a third party
    -- gets a response indistinguishable from an appointment that does not exist.
    AND (a.proposer_id = ${scope.attendeeId}::uuid OR a.invitee_id = ${scope.attendeeId}::uuid)
`

const toAppointment = (row: AppointmentDbRow): AppointmentRow => ({
  appointmentId: row.appointment_id,
  role: row.role,
  counterpartId: row.counterpart_id,
  counterpartName: row.counterpart_name,
  slot: { slotId: row.slot_id, startsAt: row.starts_at, endsAt: row.ends_at },
  topic: row.topic,
  status: deriveStatus(row.status, row.lapsed),
  createdAt: row.created_at,
  answeredAt: row.answered_at,
})

/** Every meeting the reader is party to at this conference, in both roles (FR-631). */
export const listAppointments = async (unverified: EventScope): Promise<AppointmentRow[]> => {
  const scope = assertVerifiedScope(unverified)

  const rows = await getDb().execute<AppointmentDbRow>(sql`
    ${appointmentSelect(scope)}
    ORDER BY s.starts_at ASC, a.id ASC
  `)

  return rows.map(toAppointment)
}

/** One appointment, or null when the caller is not party to it — indistinguishable (FR-636). */
export const readAppointment = async (
  unverified: EventScope,
  appointmentId: string,
): Promise<AppointmentRow | null> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(appointmentId)) return null

  const rows = await getDb().execute<AppointmentDbRow>(sql`
    ${appointmentSelect(scope)}
    AND a.id = ${appointmentId}::uuid
    LIMIT 1
  `)

  const row = rows[0]
  return row ? toAppointment(row) : null
}

/** What an answer resolved to. `conflict` carries FR-633a's explanation. */
export type AnswerOutcome =
  | { readonly outcome: 'answered'; readonly appointment: AppointmentRow }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'not-allowed' }
  | { readonly outcome: 'conflict' }

/**
 * T100, T101 — accept a proposal. **Invitee only** (FR-635).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T101 — THE CONFLICT CHECK, AND IT IS THE ONE PLACE THIS FEATURE DOUBLE-BOOKS ANYBODY**
 * (FR-633a).
 *
 * Availability deliberately ignores everything about the invitee (FR-626), and a received
 * proposal consumes none of their day (SC-608a). Both are privacy and anti-griefing properties,
 * and together they mean **a proposal may perfectly well arrive for a time the invitee is
 * already busy**. That is not a gap in the design; it is where the design puts the cost.
 *
 * So the check happens here, at the moment the invitee chooses — against **their own**
 * commitments, at their own request, disclosing nothing to anybody.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T102 — WHY THIS 409 CARRIES A REASON WHILE THE BLOCK 409s DO NOT.**
 *
 * A blocked share or proposal is answered with a reasonless 409, because any explanation would
 * confirm a fact about **somebody else** — that they blocked you (FR-608, FR-637).
 *
 * This one is the opposite: it is a fact about **the reader's own schedule, told to the reader**.
 * They can already see the clashing commitment in their own Agenda and their own appointments
 * list, so explaining it discloses nothing at all — and leaving them to guess would make a
 * refusal look like a fault. The route's message therefore describes the invitee's own diary and
 * **never mentions the proposer's**.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const acceptAppointment = async (
  unverified: EventScope,
  appointmentId: string,
): Promise<AnswerOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(appointmentId)) return { outcome: 'not-found' }

  const existing = await readAppointment(scope, appointmentId)
  if (!existing) return { outcome: 'not-found' }
  // A proposer attempting to accept their own proposal, or an already-answered or lapsed one.
  // `not-allowed` rather than `not-found`: the caller is a participant and can see the state, so
  // there is nothing to conceal — concealing it would make a legible situation look broken.
  if (existing.role !== 'invitee' || existing.status !== 'pending')
    return { outcome: 'not-allowed' }

  const conflict = await getDb().execute<{ clash: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM meeting_slots s
      WHERE s.id = (SELECT slot_id FROM appointments WHERE id = ${appointmentId}::uuid)
        AND (
          EXISTS (
            SELECT 1 FROM saved_sessions ss
            JOIN sessions sess ON sess.id = ss.session_id
            WHERE ss.attendee_id = ${scope.attendeeId}::uuid
              AND sess.event_id = ${scope.eventId}::uuid
              AND sess.starts_at < s.ends_at
              AND sess.ends_at > s.starts_at
          )
          OR EXISTS (
            -- ═══════════════════════════════════════════════════════════════════════════
            -- **THIS PREDICATE MUST MIRROR listOfferableSlots EXACTLY.**
            --
            -- It used to test status = 'confirmed' only, which left the reader's own SENT
            -- pending proposal invisible here while availability subtracts it. That gap was
            -- reachable: R proposes slot X to P; Q proposes slot X to R; R accepts Q's — no
            -- confirmed clash exists yet, so it succeeded — and P later accepts R's, leaving
            -- R confirmed twice at one instant. The partial unique index cannot catch it
            -- because it is keyed on the proposer and the proposers differ.
            -- ═══════════════════════════════════════════════════════════════════════════
            SELECT 1 FROM appointments other
            WHERE other.slot_id = s.id
              AND other.id <> ${appointmentId}::uuid
              AND (
                (other.status = 'pending' AND other.proposer_id = ${scope.attendeeId}::uuid)
                OR (other.status = 'confirmed'
                    AND (other.proposer_id = ${scope.attendeeId}::uuid
                         OR other.invitee_id = ${scope.attendeeId}::uuid))
              )
          )
        )
    ) AS clash
  `)

  if (conflict[0]?.clash === true) return { outcome: 'conflict' }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // **THE GUARD'S ROW COUNT IS THE ANSWER, NOT DECORATION.**
  //
  // `AND status = 'pending'` exists to close the window between the read above and this write.
  // Discarding the count reopened it in the answer: a decline landing in that window made the
  // update affect zero rows, and the route still replied 200 "accepted" while handing back a
  // *declined* appointment. `RETURNING id` is what makes the guard decide the outcome.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const updated = await getDb().execute<{ id: string }>(sql`
    UPDATE appointments
    SET status = 'confirmed', answered_at = now()
    WHERE id = ${appointmentId}::uuid
      AND invitee_id = ${scope.attendeeId}::uuid
      AND status = 'pending'
    RETURNING id
  `)

  if (updated.length === 0) return { outcome: 'not-allowed' }

  const answered = await readAppointment(scope, appointmentId)
  return answered ? { outcome: 'answered', appointment: answered } : { outcome: 'not-found' }
}

/**
 * T100 — decline a proposal. **Invitee only** (FR-635).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Frees the slot for the PROPOSER, who was the only party it was ever unavailable to**
 * (FR-633).
 *
 * That happens with no statement of its own: availability subtracts *live* claims only, and the
 * partial unique index applies only to `pending` and `confirmed`, so moving the status to
 * `declined` releases both at once. The invitee never lost the slot in the first place — a
 * received proposal consumes nothing (SC-608a) — which is why this is asymmetric with `cancel`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const declineAppointment = async (
  unverified: EventScope,
  appointmentId: string,
): Promise<AnswerOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(appointmentId)) return { outcome: 'not-found' }

  const existing = await readAppointment(scope, appointmentId)
  if (!existing) return { outcome: 'not-found' }
  if (existing.role !== 'invitee' || existing.status !== 'pending')
    return { outcome: 'not-allowed' }

  // The guard decides the outcome — see `acceptAppointment` for what discarding it cost.
  const updated = await getDb().execute<{ id: string }>(sql`
    UPDATE appointments
    SET status = 'declined', answered_at = now()
    WHERE id = ${appointmentId}::uuid
      AND invitee_id = ${scope.attendeeId}::uuid
      AND status = 'pending'
    RETURNING id
  `)

  if (updated.length === 0) return { outcome: 'not-allowed' }

  const answered = await readAppointment(scope, appointmentId)
  return answered ? { outcome: 'answered', appointment: answered } : { outcome: 'not-found' }
}

/**
 * T100 — cancel. **Either party, on a confirmed appointment** (FR-632).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Frees the slot for BOTH**, which is the asymmetry with `decline` above (FR-633): a confirmed
 * meeting was a commitment on two diaries, so ending it returns two slots. Again with no
 * statement of its own — availability and the partial unique both key on live statuses only.
 *
 * Either party may, deliberately. A meeting one person can no longer attend is not a meeting,
 * and requiring the *proposer* to withdraw would leave an invitee bound to a slot they cannot
 * make with no way out but ignoring it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const cancelAppointment = async (
  unverified: EventScope,
  appointmentId: string,
): Promise<AnswerOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(appointmentId)) return { outcome: 'not-found' }

  const existing = await readAppointment(scope, appointmentId)
  if (!existing) return { outcome: 'not-found' }
  if (existing.status !== 'confirmed') return { outcome: 'not-allowed' }

  // The guard decides the outcome — see `acceptAppointment`.
  const updated = await getDb().execute<{ id: string }>(sql`
    UPDATE appointments
    SET status = 'cancelled', answered_at = now()
    WHERE id = ${appointmentId}::uuid
      AND (proposer_id = ${scope.attendeeId}::uuid OR invitee_id = ${scope.attendeeId}::uuid)
      AND status = 'confirmed'
    RETURNING id
  `)

  if (updated.length === 0) return { outcome: 'not-allowed' }

  const answered = await readAppointment(scope, appointmentId)
  return answered ? { outcome: 'answered', appointment: answered } : { outcome: 'not-found' }
}

/**
 * T124 (008) — **cancel everything live between two attendees, because one has blocked the
 * other** (FR-637a, research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONE FUNCTION 008 EXPORTS FOR A FILE 007 OWNS TO CALL**, and it is called from
 * exactly one place: `db/queries/blocks.ts`, immediately after a block is created.
 *
 * **Blocking WRITES here, where it only READS in `queries/cards.ts`, and the asymmetry is the
 * specification's rather than an inconsistency** (FR-637a):
 *
 *   - a **card** is severed read-side, by a join, so **lifting the block restores the contact**
 *     with no write and no repair path;
 *   - an **appointment** is **cancelled**, permanently, and lifting the block does **not**
 *     resurrect it.
 *
 * Read-time filtering was considered for appointments and rejected on two grounds: it leaves
 * stored state disagreeing with displayed state, and it would make a lifted block bring a
 * cancelled meeting back — which FR-637a forbids outright. Blocking *suspends a relationship*
 * and *ends a commitment*; those are different things, and this is where the difference lives.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Future confirmed appointments and all pending proposals**, in both directions. A confirmed
 * meeting that has already happened is a fact about the past and is left alone — cancelling it
 * retroactively would rewrite history, which is the same reason blocking deletes no message
 * (FR-538).
 *
 * Takes plain identifiers rather than a scope: it is called from a block route that names no
 * conference, and it deliberately operates across **every** event the pair share. A block is
 * cross-event, so meetings it ends are too.
 */
export const cancelAppointmentsBetween = async (
  attendeeA: string,
  attendeeB: string,
): Promise<void> => {
  if (!UUID.test(attendeeA) || !UUID.test(attendeeB)) return

  await getDb().execute(sql`
    UPDATE appointments
    SET status = 'cancelled', answered_at = now()
    WHERE status IN ('pending', 'confirmed')
      AND (status = 'pending' OR slot_id IN (SELECT id FROM meeting_slots WHERE starts_at > now()))
      AND (
        (proposer_id = ${attendeeA}::uuid AND invitee_id = ${attendeeB}::uuid)
        OR (proposer_id = ${attendeeB}::uuid AND invitee_id = ${attendeeA}::uuid)
      )
  `)
}
