import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

  /**
   * T005 (004) — when the address was proven reachable, or null (FR-319).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A nullable timestamp rather than a boolean**, deliberately: it answers "is it verified"
   * *and* "since when" with one column, and there is no state in which the two could
   * disagree. A `verified boolean` plus a `verified_at timestamptz` can, and the day they do,
   * the one that is read is the one that decides visibility.
   *
   * **This column is load-bearing for visibility, not merely informational** (FR-359,
   * FR-325a). An unverified attendee uses the product fully — joins conferences, authors a
   * profile, saves sessions, writes notes — and appears to *nobody*, whatever
   * `discoverable` says. That is what stops a person signing up under an address they do not
   * own and appearing in a professional directory as its owner (SC-304a), and it is the one
   * thing verification gates (FR-325).
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

  /**
   * T005 (004) — whether co-attendees may find this attendee (FR-359, FR-360).
   *
   * **All-or-nothing by decision.** Per-field visibility was considered in brainstorm #04 and
   * rejected; FR-360 requires a recorded decision to reintroduce it. There is deliberately no
   * second visibility column here, and adding one would be that reintroduction.
   *
   * **Defaults on, and that is safe only because it is not sufficient.** A networking product
   * where everyone is invisible by default does not function (Assumptions), and FR-359 also
   * requires a verified address — so an account defaulted to discoverable appears to nobody
   * until its owner proves they can receive mail at the address they signed up with.
   */
  discoverable: boolean('discoverable').notNull().default(true),

  /**
   * T005 (004) — the `StorageService` key for this attendee's avatar, or null (FR-346).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A key, not a URL.** A URL would bind this row to whichever provider is behind
   * `StorageService` today, and register entry 11 has not chosen one — so the column would
   * have to be rewritten for every row the day it is answered. The key is provider-neutral
   * and the adapter resolves it.
   *
   * **The bytes it names are the one piece of attendee personal data no foreign key can
   * reach** (research D10). Deleting this row does not delete them, which is precisely why
   * FR-370's structural guard is a requirement rather than a note, and why the delete path
   * removes the object *first* and the row second: a failure then leaves a row pointing at
   * missing bytes — recoverable, and it renders the fallback — rather than bytes no row
   * references, which no audit could ever find.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  avatarObjectKey: text('avatar_object_key'),

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
 * **Deliberately absent**: any recovery token, security question, or password history.
 *
 * 004 added a recovery flow, and this note is *more* true afterwards rather than less. Reset
 * material lives in `attendee_password_resets` — its own table, with its own lifetime and its
 * own sweep — and not as a column here, for the same reason the hash is not a column on
 * `attendees`: a table read on the credential path must not be able to carry a live credential
 * along with it. Password history remains absent because no requirement names it (FR-042).
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
