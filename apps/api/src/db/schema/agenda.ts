import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { sessions } from './catalog.js'

/**
 * T004 (005) — the attendee's own agenda: saved sessions, held places and personal notes
 * (FR-184–FR-214; enrolment added by 014 tranche 2, FR-1060–FR-1084).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: PER-EVENT, FOR EVERY TABLE IN THIS FILE.**
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
 * One of the two commitments an attendee can hold on a session — the bookmark.
 *
 * **T119 (014 tranche 2)** — this header used to open "The fact that one attendee intends to
 * attend one session", and that sentence stopped being the whole story when enrolment arrived:
 * saving is now one of **two** commitments, and it covers **mandatory sessions alone**
 * (FR-1063, FR-1066a). An optional session is committed to by taking a place in
 * `session_enrolments` below — enrolment *replaces* saving there, so "saved an optional
 * session while holding no place" is a state with no route (FR-1064). The sentence is
 * rewritten rather than deleted because the comment is the record.
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
 * T113 (014 tranche 2) — the other commitment: **a held place in an optional session**
 * (FR-1063, v5.3.0 O1/O2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ATTENDEE DATA, PER-EVENT.** A session belongs to exactly one conference, so a place in it
 * cannot mean anything at another (standing decision 7) — deliberately the opposite of a held
 * card, which is cross-event because it describes a relationship rather than a presence. It
 * cascades from the attendee and from the session, appears in the personal-data export, and
 * is **additionally released by withdrawal from the conference by hand** (FR-1081), because
 * nothing cascades from a registration and that gap is invisible in the schema.
 *
 * **DELIBERATELY NOT ENGAGEMENT** (v5.3.0 O2, FR-1077). This table references both `sessions`
 * and `attendees`, so it fails `engagement-coverage.test.ts` by existing until classified —
 * and it is classified into `NOT_ENGAGEMENT`, never into the four. A session with places held
 * stays deletable; the cost (held places destroyed with no notification, no marker, no trace)
 * is ratified, recorded at the classification site, and register entry 31 is open against it.
 *
 * **`viewed_at` is the marker's other half for a held place** (FR-1080), exactly as
 * `saved_sessions.viewed_at` is for a save: an enrolled attendee holds **no saved row**
 * (FR-1064), so without its own viewed state a holder would be notified of a room change and
 * then see no marker and have nothing to clear. `NOT NULL DEFAULT now()` for the same
 * recorded reason as above — the initial value is the enrolment instant, so a change that
 * predates the attendee's interest never marks.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Absent by design**: no waitlist (FR-1082 — a queue that must notify somebody when it
 * moves is a third trigger), no released-place history (O1 licenses the roster, not its
 * past), no attendance or check-in record (FR-1084), and no stored open/closed or remaining
 * count — all derived at read time from capacity, the offset and the database clock.
 */
export const sessionEnrolments = pgTable(
  'session_enrolments',
  {
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),

    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),

    /** See the header: FR-1080's marker clock for a held place. */
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * The composite primary key IS the idempotency of taking a place: `ON CONFLICT … DO
     * NOTHING` infers it (column order in the conflict target is immaterial), so a double-tap
     * is the same request twice and no code path can hold two places for one attendee.
     *
     * Leads with `attendee_id`, mirroring `saved_sessions` exactly: it serves the commitment
     * read ("this attendee's places", unioned into `listSaved`) and the deletion cascade from
     * `attendees` — the two reads that would otherwise scan, which is 004's token-table
     * defect shape.
     */
    primaryKey({ columns: [table.attendeeId, table.sessionId] }),

    /**
     * The reverse access path: **the `count(*)` that runs inside the enrolment transaction's
     * exclusive session-row lock** (R12), and the organizer's roster read. PostgreSQL creates
     * no index for a foreign key, and an unindexed count inside that lock is a sequential
     * scan paid for by everyone queued behind it — `saved_sessions_session_id_idx`'s own
     * argument, one table over.
     */
    index('session_enrolments_session_id_idx').on(table.sessionId),
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
     * scan, so a predicate on `session_id` alone cannot use it. 014 added such predicates —
     * the delete refusal's counts and the programme read's per-session counts, both expressions
     * of `engagementCountsFor` in `queries/admin-catalog.ts` —
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
export type SessionEnrolment = typeof sessionEnrolments.$inferSelect
export type SessionNote = typeof sessionNotes.$inferSelect
