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

    /**
     * T006 (002) — the IANA zone of the **venue**, e.g. `Europe/Madrid` (FR-120, research D5).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * On the event and not on each session, because the timezone is a property of where the
     * conference is held rather than of each item on its programme; sessions inherit it. The
     * limit of that assumption is recorded in the spec — a satellite session in another city
     * would break it, and none is in scope.
     *
     * This is what makes "day N of M" correct for an attendee reading from another timezone.
     * A device-local computation is right for the venue's own visitors and wrong for everyone
     * else, which is the whole reason FR-120 exists.
     *
     * **No default, deliberately** (research D11). The migration adds the column with
     * `DEFAULT 'UTC'` so existing rows stay valid and then drops the default in the same
     * migration — a column that keeps a silent default is how a wrong day number ships
     * unnoticed.
     *
     * **The real zones come from the seed, not from the migration.** An earlier version of this
     * comment claimed the migration back-filled them; it does not, and the distinction matters:
     * a database migrated but not re-seeded keeps every conference at `'UTC'`, with a wrong day
     * number and nothing to detect it. `db:migrate` is always followed by `db:seed` in this
     * project's own setup, quickstart and end-to-end harness, which is what closes the gap
     * today.
     *
     * Validity is enforced at the seed boundary, not by a CHECK: `pg_timezone_names` is not
     * usable in one, and a wrong-but-valid zone would satisfy such a constraint anyway.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    timezone: text('timezone').notNull(),

    /**
     * T006 (004) — the value an attendee types to register for this conference (FR-311, D7).
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * **THIS IS NOT A CREDENTIAL, AND IT MUST NEVER BE TREATED AS ONE** (FR-317a).
     *
     * That is a decision, taken on 2026-08-07 and recorded here because this is where a later
     * reader arrives. Real codes are committed in the seed, and this repository is public
     * (register entry 16) — which is **accepted rather than worked around**.
     *
     * It is stored in plain text for two reasons that both follow from that. Hashing it would
     * imply a confidentiality property the specification explicitly disclaims, and it would
     * defeat the `UNIQUE` constraint below, which is what stops two conferences seeding the
     * same code and joining resolving to whichever row the planner returned first.
     *
     * **What possessing a code gets you: registration, and nothing else.** No capability over
     * this conference's content, none over its attendees, and no visibility into any profile
     * — every profile sits behind *both* the shared-registration condition (FR-357) and its
     * owner's discoverability setting (FR-359). What the code prevents is a person landing in
     * a conference they have no business being in by guessing a URL. It is not what keeps
     * anyone's data private.
     *
     * A registration is therefore evidence of **presence, not of vetting** (FR-317b). No
     * requirement, now or later, may read holding one as identity assurance. Open Question 10
     * records the trigger for revisiting this: if a future feature ever makes registration
     * itself confer access to something private, the reasoning above stops holding.
     *
     * **Written by the seed only.** No attendee action and no product surface creates,
     * changes or deletes one, and the route audit's no-write-path assertions cover the
     * conference content around it.
     * ═════════════════════════════════════════════════════════════════════════════════════
     *
     * **No default, deliberately** — the same treatment `timezone` above received, and for the
     * same reason. The migration adds the column with a temporary placeholder so existing rows
     * stay valid and **drops that default in the same migration**; the real codes come from
     * the seed. A database migrated but not re-seeded therefore has placeholder codes and no
     * conference can be joined, which is the intended failure: a column that keeps a silent
     * default is how a wrong value ships unnoticed.
     *
     * Compared after `trim().toLowerCase()`, following `normaliseEmail`'s precedent, because a
     * code read off a badge or a slide arrives with arbitrary case and stray whitespace.
     */
    joinCode: text('join_code').notNull().unique(),

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
    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **T014 (006) — this comment used to read "Every read of this table is 'the authenticated
     * attendee's registrations'", AND THAT IS NO LONGER TRUE.**
     *
     * 006's directory reads this table **by conference**: "who else is registered for the event
     * I am looking at". That is the opposite access path, and neither existing index serves it —
     * this one leads with `attendee_id`, and so does the composite unique above, so a
     * conference-wide read scans.
     *
     * Both indexes are kept because both reads exist. This one still serves every 001–005 read;
     * `registrations_event_id_idx` below is the directory's primary access path (research D11).
     * A later feature adding a third access path should add a third index rather than
     * repurposing either, and should correct this comment again if it stops being true.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    index('registrations_attendee_id_idx').on(table.attendeeId),
    // T014 (006) — the directory's primary access path: every attendee at one conference.
    index('registrations_event_id_idx').on(table.eventId),
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
