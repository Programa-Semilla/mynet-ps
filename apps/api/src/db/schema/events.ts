import { relations } from 'drizzle-orm'
import { check, date, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { attendees } from './attendees.js'

/**
 * T022 — a conference.
 *
 * **No stored day counter.** The prototype shows "day N of M"; that is derived from
 * `startsOn`, `endsOn`, and the current date. Storing it would go stale the moment the clock
 * moved — one of the prototype artifacts CLAUDE.md flags as not to be carried forward.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    location: text('location').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // `ends_on >= starts_on` (data-model.md). A table check rather than a validation rule, so
    // a conference that ends before it begins cannot exist regardless of which code path
    // inserts it.
    check('events_ends_on_after_starts_on', sql`${table.endsOn} >= ${table.startsOn}`),
  ],
)

/**
 * T022 — the attendee-attends-event relationship. Determines which events appear in the
 * workspace (FR-040).
 *
 * This table is the entire access-control story for `events` in this slice: an event is
 * reachable only through the authenticated attendee's registrations (data-model.md scoping
 * rule). `GET /events` takes no attendee identifier, so there is no way to express another
 * attendee's registrations — which is what makes FR-036 structural.
 */
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // An attendee attends an event once.
    unique('registrations_attendee_event_unique').on(table.attendeeId, table.eventId),
    // Every read of this table is "the authenticated attendee's registrations".
    index('registrations_attendee_id_idx').on(table.attendeeId),
  ],
)

export const eventsRelations = relations(events, ({ many }) => ({
  registrations: many(registrations),
}))

export const registrationsRelations = relations(registrations, ({ one }) => ({
  attendee: one(attendees, {
    fields: [registrations.attendeeId],
    references: [attendees.id],
  }),
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
}))

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
export type Registration = typeof registrations.$inferSelect
