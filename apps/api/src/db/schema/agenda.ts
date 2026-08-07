import { sql } from 'drizzle-orm'
import { check, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { sessions } from './catalog.js'

/**
 * T004 (005) — the attendee's own agenda: saved sessions and personal notes (FR-184–FR-214).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: PER-EVENT, FOR BOTH TABLES IN THIS FILE.**
 *
 * The constitution makes neither per-event nor cross-event a default that may be assumed, so
 * each table states its own reasoning below rather than inheriting one from this header.
 *
 * The predicate is enforced server-side by the same mechanism 002 established: every function
 * in `queries/agenda.ts` demands the branded `EventScope` that only `requireEventAccess` can
 * construct. There is no path to anything in this file that does not pass through it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS IS ATTENDEE STATE ABOUT CONFERENCE CONTENT, NOT CONFERENCE CONTENT.**
 *
 * That distinction is why these tables live here and not in `catalog.ts`, and why nothing in
 * this feature adds a write method to `CatalogRepository`. The catalog is seeded programme
 * data with no write path at any privilege (FR-132, FR-134, FR-191); a save is something the
 * attendee authored *about* a session, which they own outright.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The seed is untouched entirely** (FR-235), and nothing here is seeded (data-model.md). Saved sessions and notes are attendee-authored,
 * and seeding them would fabricate personal data attributed to a real identity. The consequence
 * is deliberate: both seeded demo attendees begin with an empty agenda, so the **empty states
 * are what a reviewer sees first** — the states most likely to be skipped are the ones on
 * screen at first run (FR-195, FR-225).
 */

/**
 * The fact that one attendee intends to attend one session.
 *
 * **Scoping: per-event.** A saved session references a `session`, and sessions exist only
 * within one conference, so the set must swap when the attendee switches (FR-185, US1 scenario
 * 5). There is no cross-conference notion of "the same session" that could make this
 * cross-event — 002 already records that the same human speaking at two conferences is two
 * unrelated records, and the same reasoning applies to the sessions they speak at.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The event is reached through the session and is not stored again.** Denormalising
 * `event_id` onto this table would create a second source of truth that could disagree with
 * `sessions.event_id` — and the one that disagreed would be the one authorization read. Every
 * query joins through `sessions` and filters on the `EventScope`'s event instead.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Retention.** `ON DELETE CASCADE` from `attendees` is the mechanism behind the narrow
 * commitment the specification declares — saves are deleted with the account. It is
 * schema-level rather than application-level precisely so a future deletion path cannot forget
 * it (Principle VIII; register entry 6 records what remains open).
 */
export const savedSessions = pgTable(
  'saved_sessions',
  {
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),

    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **The composite primary key IS FR-187's idempotency.**
     *
     * Saving twice cannot create a second row, and that is enforced by the schema rather than
     * by handler logic — so a double-tap on a slow connection is simply the same request
     * twice, and no code path exists that could produce a duplicate by forgetting to check.
     *
     * It also serves the only read this feature makes of the table: "this attendee's saves,
     * for this conference". **No secondary index on `session_id` is added** — no query here
     * asks "who saved this session", and adding one would anticipate a feature nobody has
     * specified while making every write pay for it.
     */
    primaryKey({ columns: [table.attendeeId, table.sessionId] }),
  ],
)

/**
 * One attendee's private free text against one session.
 *
 * **This is the product's first attendee-authored personal content**, which is why US5 exists
 * and why the specification carries a retention declaration.
 *
 * **Scoping: per-event**, for exactly the same reason as `saved_sessions`: a note is written
 * against a session, not against a person or a topic, and it has no meaning outside the
 * conference that scheduled that session.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Privacy is structural, not conventional.** No column here identifies any attendee other
 * than the author, and the query layer *cannot express* a read of someone else's note: every
 * function takes the `EventScope`, which carries the authenticated attendee and is the only
 * source of the identifier the `WHERE` clause uses (FR-208).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Absent by design**: no history of revisions, no author display name, no shared-with
 * column, no sentiment or tag. None is named by a requirement, and Principle VIII says collect
 * only what a requirement names — which matters more here than anywhere else in the product,
 * because this is the free-text column.
 */
export const sessionNotes = pgTable(
  'session_notes',
  {
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),

    body: text('body').notNull(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * One note per attendee per session (Assumptions). An attendee at a repeated session sees
     * one note; no requirement suggests otherwise and the prototype has a single note field.
     */
    primaryKey({ columns: [table.attendeeId, table.sessionId] }),

    /**
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **This one constraint carries both halves of FR-212 and FR-213.**
     *
     * `length(body) > 0` means an emptied note cannot exist as a blank row. Clearing the text
     * **deletes** the row, so "no note" has exactly one representation in the database — and a
     * later reader cannot invent a second by writing `''` from some new path.
     *
     * `length(body) <= 10000` is research D9's limit at the last line of defence, independent
     * of the route schema that also enforces it and of the editor that surfaces it. Principle
     * VIII: client-side presentation of a limit is never the enforcement of it. The column
     * constrains independently precisely in case a second write path ever appears.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    check(
      'session_notes_body_length',
      sql`length(${table.body}) > 0 AND length(${table.body}) <= 10000`,
    ),
  ],
)

export type SavedSession = typeof savedSessions.$inferSelect
export type SessionNote = typeof sessionNotes.$inferSelect
