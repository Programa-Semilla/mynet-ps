import { foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { registrations } from './events.js'

/**
 * T007 (002) — which conference an attendee is currently working in (FR-100, FR-101).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Scoping: CROSS-EVENT.** Required by the constitution, which lets neither rule be assumed.
 *
 * It names an event but it belongs to the *attendee* — there is exactly one per attendee, not
 * one per event, and it must survive a change of device (FR-100). Scoping it per-event would
 * mean an attendee could be "active" in several conferences at once, which is not what an
 * active event is.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The composite foreign key is the point of this table.**
 *
 * `(attendee_id, event_id)` references `registrations (attendee_id, event_id)`, so the row
 * *cannot* name an event the attendee is not registered for — under any sequence of events,
 * which is what FR-101 actually asks for. That is a database guarantee rather than a rule every
 * read path has to remember, and it is what makes the requirement structural instead of
 * conventional.
 *
 * `ON DELETE CASCADE` is the other half: when a registration is removed the selection row
 * disappears with it and the attendee falls back to derivation — no application logic, no
 * stale pointer, and no window in which the active event is one the attendee may no longer
 * read. US4 scenario 4 asks for exactly that behaviour and gets it for free.
 *
 * The reference needs a unique target and already has one: `registrations_attendee_event_unique`.
 *
 * **`attendee_id` is the primary key**, which gives FR-100's "at most one selection per
 * attendee" structurally, so no application check enforces singularity.
 *
 * **Absent by design**: no history of past selections and no first-activation timestamp.
 * Neither is named by a requirement, and Principle VIII says collect only what a requirement
 * names.
 *
 * **No row means "never chosen"**, not "no active event". The active event is then derived in
 * SQL over the attendee's registrations (FR-102, FR-103, research D4) — see
 * `db/queries/active-event.ts`. Once an attendee chooses, the choice is honoured indefinitely
 * (FR-104): it is not re-derived when the chosen conference ends.
 */
export const activeEventSelections = pgTable(
  'active_event_selections',
  {
    attendeeId: uuid('attendee_id')
      .primaryKey()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    eventId: uuid('event_id').notNull(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.attendeeId, table.eventId],
      foreignColumns: [registrations.attendeeId, registrations.eventId],
      name: 'active_event_selections_registration_fk',
    }).onDelete('cascade'),
  ],
)

export type ActiveEventSelection = typeof activeEventSelections.$inferSelect
export type NewActiveEventSelection = typeof activeEventSelections.$inferInsert
