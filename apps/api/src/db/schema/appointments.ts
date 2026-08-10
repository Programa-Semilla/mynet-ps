import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { events } from './events.js'

/**
 * T008–T012 (008) — a time and a place at a specific conference, and the grid of times it can
 * be chosen from (FR-623–FR-639a, data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: PER-EVENT, FOR BOTH TABLES IN THIS FILE.**
 *
 * Neither rule is a default that may be assumed (standing decision 7), so both tables state
 * their own below rather than inheriting one from this header — but the reasoning is the same
 * in each case, and it is decision 7 read literally: **an appointment is a time and a place at
 * a specific conference**, and a slot belongs to a conference day. Neither means anything
 * outside the event that scheduled it.
 *
 * The predicate is enforced by the mechanism 002 established and every per-event table since
 * has used: every function in `queries/appointments.ts` demands the branded `EventScope` that
 * only `requireEventAccess` can construct, and the routes sit beneath `/events/:eventId`.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ROUTE SHAPE IS A SECURITY DECISION, AND IT IS THE OPPOSITE OF `cards.ts`'s**
 * (research R2, contracts/network.md).
 *
 * 007's own comments predicted that *"008's appointments are the first feature that will
 * inherit"* the participation guard, on the belief that they were cross-event. They are not,
 * and 008 corrects that prediction where it was written. Because appointments are per-event,
 * registering them as `/events/:eventId/appointments` puts them **inside the guarantee that
 * already exists** — `event-scope-audit.test.ts` examines them and demands `requireEventAccess`.
 *
 * Registering them as `/appointments/:id` instead would name no conference, and that audit
 * would **silently pass** them: the exact hole `cards.ts` needs a third audit to close. The
 * nesting is load-bearing, not cosmetic. Do not "tidy" it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The four **stored** statuses (FR-630).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T011 — `lapsed` IS DELIBERATELY NOT ONE OF THEM** (FR-634, research R8).
 *
 * A proposal whose slot instant has passed can no longer be accepted, and the read path reports
 * it as lapsed — but it is **derived from the slot instant at read time and stored nowhere**.
 *
 * That is what keeps this feature free of background work entirely. A stored `lapsed` would need
 * a sweep to maintain it, and `RETENTION_SWEEPS` in `maintenance.ts` is the only scheduled
 * machinery in the product: it exists for personal data no cascade can reach, which this is not.
 * Adding a second reason for it to exist would be a decision, not a convenience.
 *
 * The other half of the argument is the one `conversations` records for its absent `status`
 * column: a stored value can disagree with the facts it summarises, and on the day it does, the
 * one that gets read is the one deciding whether a meeting can still be accepted.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'declined', 'cancelled'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

/** `"col" IN ('a', 'b')` — for a NOT NULL column, so unlike `profiles`' there is no null branch. */
const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`("${column}" IN (${values.map((value) => `'${value}'`).join(', ')}))`)

/**
 * The seeded grid of times a meeting may be proposed for (FR-623, FR-624, research R3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SEEDED CONFERENCE CONTENT, WITH NO WRITE PATH AT ANY PRIVILEGE.**
 *
 * No route creates, edits or deletes a slot, and `tests/unit/network-absences.test.ts` asserts
 * that absence twice over — once at the route table ("exposes NO write route against the
 * meeting-slot grid") and once over the source ("writes meeting_slots from the seed and from
 * nowhere else"), because a query module could write without a route to notice it. This is Principle III at the schema: an interface for authoring the grid would be
 * organizer administration, which is out of scope by construction — and seed data must not
 * become a route around that exclusion.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Scoping: per-event.** A slot belongs to a conference day and is seeded with it.
 *
 * **Rows rather than a generated arithmetic series** (research R3). A definition on the event —
 * start, end, duration — stores less, but then every consumer must generate identically, and
 * FR-625's availability becomes generate-then-subtract in application code instead of a set
 * difference the database does well. The seed is committed and versioned either way, so the
 * saving is not real.
 *
 * **Coverage**: holds no attendee data, so it is classified in `NOT_ATTENDEE_DATA` in
 * `tests/unit/deletion-coverage.test.ts` **with a stated reason** (FR-654). A new table fails
 * that guard by existing until it is classified, which is the point of it.
 */
export const meetingSlots = pgTable(
  'meeting_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),

    /**
     * **Absolute instants**, derived from the venue's timezone once at seed time (FR-624).
     *
     * 002's rule, unchanged and applied to a second kind of scheduled thing: times are stored as
     * instants and every venue-local rendering is computed at display time. The seed does the
     * conversion exactly once, using the event's own zone, exactly as the session catalog does.
     */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    /**
     * One slot per instant per conference. The seed is idempotent against this, and it is also
     * what stops a re-seed doubling the grid — which would make every slot appear twice in the
     * scheduling dialog.
     */
    unique('meeting_slots_event_starts_at_unique').on(table.eventId, table.startsAt),

    /**
     * The availability query's driving read: this conference's slots, in time order. The unique
     * constraint above already provides an index on exactly these columns in this order, so this
     * is declared for the query's sake and Postgres will use whichever it prefers — kept
     * explicit because the *reason* the ordering exists must survive a future edit to the
     * constraint.
     */
    index('meeting_slots_event_starts_at_idx').on(table.eventId, table.startsAt),
  ],
)

/**
 * A proposed, accepted, declined or cancelled meeting between two attendees at one conference.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **PROPOSED, THEN ACCEPTED OR DECLINED — AND THE ASYMMETRY WITH CARDS IS DELIBERATE**
 * (constitution v3.2.0, N2).
 *
 * A card is one-directional and needs no acceptance; an appointment **claims a slot of somebody
 * else's time**, which a message and a card do not. That is the whole reason this table has a
 * status column and `shared_cards` has none.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Deletion**: both attendee references cascade (FR-652), so either party's departure removes
 * the appointment for both. **Export**: appointments in both roles, with slot, topic, status and
 * event (FR-653).
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * **The scoping predicate** (FR-639). Every read is filtered by the `EventScope`'s event.
     *
     * Stored here rather than reached through `slot_id`, unlike `saved_sessions` which reaches
     * its event through `sessions`. The difference is what the column is *for*: there it would
     * have been a denormalisation of the session's own event, with two sources able to disagree
     * about which the authorization read consults. Here the event is what the appointment *is* —
     * both participants are registered for it, and the partial unique below needs the scope
     * without a join.
     */
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),

    slotId: uuid('slot_id')
      .notNull()
      .references(() => meetingSlots.id, { onDelete: 'cascade' }),

    /** Who asked. May cancel a confirmed appointment; may **not** accept or decline (FR-635). */
    proposerId: uuid('proposer_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /** Who answers. The only party who may accept or decline (FR-635). */
    inviteeId: uuid('invitee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /** What the meeting is about — short, and never blank (FR-628, FR-629). */
    topic: text('topic').notNull(),

    status: text('status').$type<AppointmentStatus>().notNull().default('pending'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** When it was accepted, declined or cancelled. Null while pending. */
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (table) => [
    check('appointments_status', oneOf('status', APPOINTMENT_STATUSES)),

    /** You cannot propose a meeting with yourself. */
    check('appointments_not_self', sql`${table.proposerId} <> ${table.inviteeId}`),

    /**
     * **FR-629's server-side backstop.**
     *
     * The client keeps the confirm control *disabled* until a slot and a non-blank topic are
     * present — FR-629 makes that the mechanism, and a post-submit error the failure it exists to
     * avoid. This is the database refusing to store what the client must never send, independent
     * of the route schema that also refuses it, in case a second write path ever appears.
     *
     * `btrim` rather than `length`, because "   " is a topic the client must not send and a
     * length check alone would happily store it.
     */
    check('appointments_topic_not_blank', sql`btrim(${table.topic}) <> ''`),

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **ONE LIVE CLAIM PER PROPOSER PER SLOT — AND THIS IS WHAT MAKES FR-625's EXCLUSION SOUND.**
     *
     * Availability subtracts the reader's own pending proposals and confirmed appointments from
     * the grid. That subtraction is only meaningful if the database cannot hold two live rows for
     * the same proposer and slot, which two concurrent proposals would otherwise produce — the
     * window between "the query said the slot was free" and "the insert landed".
     *
     * **Partial**, over `pending` and `confirmed` only. A declined or cancelled appointment
     * releases the slot (FR-633), and must not block the proposer from asking again — so the
     * constraint has to stop applying the moment the row stops being a live claim, which a plain
     * unique cannot express.
     *
     * Keyed on the **proposer**, not on the invitee. Keying it on the invitee would let one
     * attendee's proposal consume a slot in another attendee's grid, which is precisely the
     * anti-griefing property SC-608a exists to guarantee cannot happen.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    uniqueIndex('appointments_live_claim_per_proposer_slot')
      .on(table.proposerId, table.slotId)
      .where(sql`${table.status} IN ('pending', 'confirmed')`),

    /**
     * The two reads the appointments view makes, both scoped by event first because that is the
     * authorization predicate and therefore always present in the `WHERE`.
     *
     * Two indexes rather than one on `(event_id, proposer_id, invitee_id)`: the query asks for
     * rows where the reader is *either* party, which is a union of two lookups rather than one
     * composite. **Postgres does not create an index for a foreign key**, so without these each
     * read scans the table.
     */
    index('appointments_event_proposer_idx').on(table.eventId, table.proposerId),
    index('appointments_event_invitee_idx').on(table.eventId, table.inviteeId),
  ],
)

export type MeetingSlot = typeof meetingSlots.$inferSelect
export type Appointment = typeof appointments.$inferSelect
