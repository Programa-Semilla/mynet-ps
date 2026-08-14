import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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

    /**
     * T003 (014) — **when this attendee last looked at this session** (FR-1030, R7).
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * **ATTENDEE DATA**, unlike the three columns 014 adds to `sessions`, which are conference
     * content. It cascades from `attendees` and from `sessions` through the keys above — the
     * column adds no new reachability problem — and it appears in the personal-data export
     * alongside the saved session it belongs to. `export-coverage.test.ts` derives from the
     * schema, so it fails by existing until declared.
     *
     * The second half of the marker predicate: a saved session is marked when
     * `sessions.logistics_changed_at > viewed_at`. Updated when the attendee opens the
     * session, which is what clears the marker.
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **`NOT NULL DEFAULT now()` IS LOAD-BEARING AND IS NOT A CONVENIENCE.**
     *
     * This table is `(attendee_id, session_id)` plus `saved_at`, and the default makes the
     * initial value **the save instant**. Without it — defaulting to null, or to the epoch —
     * an attendee saving a session that moved last week would immediately see a marker for a
     * change that predates their interest in it. The marker would be answering "has this ever
     * changed" instead of "has this changed since I looked", which is a different and much
     * less useful question.
     *
     * `saved_at` is not used for this. It could be, today, because the two are written
     * together — but they diverge on the first view, and a predicate reading `saved_at` would
     * then be a marker that never clears.
     * ─────────────────────────────────────────────────────────────────────────────────────
     * ═════════════════════════════════════════════════════════════════════════════════════
     */
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **The composite primary key IS FR-187's idempotency.**
     *
     * Saving twice cannot create a second row, and that is enforced by the schema rather than
     * by handler logic — so a double-tap on a slow connection is simply the same request
     * twice, and no code path exists that could produce a duplicate by forgetting to check.
     *
     * It also serves the only read 005 makes of the table: "this attendee's saves, for this
     * conference".
     */
    primaryKey({ columns: [table.attendeeId, table.sessionId] }),

    /**
     * T004 (014) — **"who saved this session", which 005 said no query would ever ask.**
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * The comment above this index used to end: *"No secondary index on `session_id` is added
     * — no query here asks 'who saved this session', and adding one would anticipate a feature
     * nobody has specified while making every write pay for it."* That was right when it was
     * written and 014 is the feature it was waiting for, so the sentence is replaced rather
     * than left standing beside a contradiction.
     *
     * **This is the notification fan-out's access path, and it runs on every material change.**
     * The primary key is `(attendee_id, session_id)`, which answers *what has this attendee
     * saved* and cannot answer the reverse — so without this index, cancelling one session
     * sequentially scans every saved session in the product, inside an organizer's request.
     *
     * The same shape as the two unclaimed defects from 004's review, where neither token table
     * indexed `attendee_id` because **PostgreSQL creates no index for a foreign key**. This
     * one is added with the query that needs it rather than discovered later.
     * ═════════════════════════════════════════════════════════════════════════════════════
     */
    index('saved_sessions_session_id_idx').on(table.sessionId),
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
    /*
     * T-review (014) — **the non-leading `session_id` needs its own index.**
     *
     * The composite primary key leads with `attendee_id`, and PostgreSQL 17 has no btree skip
     * scan, so a predicate on `session_id` alone cannot use it. 014 added three such predicates —
     * `hasEngagement`, the delete refusal's counts, and the programme read's per-session counts —
     * and this table is **not event-scoped**: it holds every attendee's notes for every conference,
     * so each probe was a full scan of all of it.
     *
     * The scalar subquery in the programme read is not decorrelated, so a 500-session conference
     * re-executed it 500 times per read, and `ProgrammeEditor` re-reads the programme after every
     * write. Two of the probes also run inside `deleteSession`'s `FOR UPDATE`, where the cost is
     * paid by the attendees whose saves are blocked.
     *
     * Its three siblings were all covered — `saved_sessions_session_id_idx` by 014 itself,
     * `session_questions_session_id_idx` by 009, and `question_votes`' primary key leads with
     * `question_id` — which is what makes this an omission rather than a position.
     */
    index('session_notes_session_id_idx').on(table.sessionId),

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
