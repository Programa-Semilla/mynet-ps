import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { citext } from '../types.js'

/**
 * T020 — the person. Identified product-wide by email (FR-025a).
 */
export const attendees = pgTable('attendees', {
  id: uuid('id').primaryKey().defaultRandom(),

  /**
   * UNIQUE **globally, not per event** (FR-025a). This is what makes one account work across
   * every event, and it is the whole basis of the event switcher — a per-event unique
   * constraint would give the same person a separate identity per conference.
   */
  email: citext('email').notNull().unique(),

  /** Shown in the shell so the attendee can see who they are signed in as (FR-032). */
  displayName: text('display_name').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * T020 — credential material, deliberately in its own table.
 *
 * Not a column on `attendees`. The attendee row is read on nearly every request to render
 * identity; the credential hash is read only during sign-in. Separating them means the hash
 * cannot ride along in a general attendee query and so cannot be accidentally serialised into
 * a response. That is a structural defence for FR-031, not a stylistic preference
 * (data-model.md).
 *
 * **Deliberately absent**: any recovery token, security question, or password history. There
 * is no recovery flow in this slice, and spec Open Question 1 (the attendee identity model)
 * has to be settled by the client before one can be designed. Storing fields for a flow that
 * does not exist would violate FR-042.
 */
export const attendeeCredentials = pgTable('attendee_credentials', {
  attendeeId: uuid('attendee_id')
    .primaryKey()
    .references(() => attendees.id, { onDelete: 'cascade' }),

  /**
   * An Argon2id encoded hash, including its parameters and salt (research.md D8). The
   * plaintext credential is never stored, never logged (FR-031), and never written to
   * `sign_in_attempts` (FR-031c).
   */
  passwordHash: text('password_hash').notNull(),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const attendeesRelations = relations(attendees, ({ one }) => ({
  credentials: one(attendeeCredentials, {
    fields: [attendees.id],
    references: [attendeeCredentials.attendeeId],
  }),
}))

export type Attendee = typeof attendees.$inferSelect
export type NewAttendee = typeof attendees.$inferInsert
export type AttendeeCredential = typeof attendeeCredentials.$inferSelect
