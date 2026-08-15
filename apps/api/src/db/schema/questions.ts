import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { sessions } from './catalog.js'

/**
 * T007–T010 (009) — audience questions on a session, and the upvotes that rank them
 * (FR-701–FR-726, FR-760–FR-765).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: PER-EVENT, FOR BOTH TABLES IN THIS FILE.**
 *
 * The constitution makes neither per-event nor cross-event a default that may be assumed
 * (standing decision 7), so each table states its own reasoning below rather than inheriting one
 * from this header.
 *
 * The predicate is 002's, unchanged and *not* extended: every function in `queries/questions.ts`
 * demands the branded `EventScope` that only `requireEventAccess` can construct. **This feature
 * introduces no fourth branded scope and no fourth route audit**, and that is an outcome rather
 * than a saving — 007 needed `ConversationScope` because a conversation is cross-event with two
 * owners, and 008 needed `CardScope` because a card names no conference. A question always
 * belongs to a session and a session belongs to exactly one event, so `EventScope` reaches it
 * **provided every address says so**, which is FR-742 and is why `routes/events/questions.ts`
 * names `:eventId` on routes that do not strictly need it to find the row.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE EVENT IS REACHED THROUGH `sessions` AND IS DELIBERATELY NOT DENORMALISED**, for both
 * tables (spec, Feature Declarations — event scoping; there is no FR for it, which is why it is
 * stated here and in `data-model.md` rather than cited).
 *
 * A stored `event_id` here would be a second source of truth that could disagree with
 * `sessions.event_id` — and the one that disagreed would be the one authorization read. Every
 * query joins through `sessions` and filters on the `EventScope`'s event instead. 005 recorded
 * exactly this for `saved_sessions` and `session_notes`; nothing about questions changes it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE PRODUCT'S FIRST MANY-TO-MANY SURFACE, AND ITS VISIBILITY IS AN EXCEPTION THE
 * CONSTITUTION HAD TO RECORD** (constitution v3.3.0, ratified 2026-08-10).
 *
 * A question is visible to **every attendee registered for the event**, under a real name, with
 * **no opt-out** — including an attendee who has turned discoverability off. That is the second
 * recorded exception to Principle VIII's "private content stays private", and it was recorded by
 * amendment rather than derived by entailment, because Principle VIII requires an exception to be
 * *recorded*. Three consequences travel with it and each is implemented elsewhere in this
 * feature: verification is not consulted (FR-735), the name is not a route into the profile
 * (FR-736), and the attendee is told before they publish (FR-739).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Nothing here is seeded** (FR-762), following 005: the empty state is what a reviewer sees at
 * first run, and the states most likely to be skipped are the ones on screen first.
 */

/**
 * One attendee's question against one session.
 *
 * **Scoping: per-event.** A question is asked against a session, and a session exists only within
 * one conference; there is no cross-conference notion of "the same session" — 002 already records
 * that the same human speaking at two conferences is two unrelated records, and the same
 * reasoning applies to the sessions they speak at and to the questions asked at them.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Retention: the cascade from `attendees` IS owner decision 1** (FR-760).
 *
 * Constitution v3.2.0 closed register entry 9 by making audience questions attributed, and left
 * one problem explicitly open for this phase: what happens to a departing attendee's question
 * that other people have upvoted. The answer is that it goes, and their votes go with it
 * (see `questionVotes` below). **Nothing survives de-attributed** — no placeholder, no "deleted
 * attendee", no tombstone. 007's answer for conversations does not transfer: a conversation
 * holds the survivor's own words, and a question by somebody who has left holds nobody's.
 *
 * The cost is stated rather than hidden: other attendees lose a question they backed. It is
 * accepted because the alternative is retaining one person's words after they exercised erasure,
 * on the strength of other people's interest in them.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const sessionQuestions = pgTable(
  'session_questions',
  {
    /**
     * A real key, unlike `session_notes` — which is identified by its composite pair alone —
     * because `question_votes` references it and the withdrawal route names it in an address.
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The scoping path **and** the re-seed path (FR-763, research R11).
     *
     * `CASCADE` is not a convenience here. `DELETE FROM events` is how the seed clears itself,
     * and 008 met exactly this trap: `shared_cards.event_id` was `ON DELETE NO ACTION`, so a
     * surviving card refused the delete and broke the re-seed **with an error naming neither
     * table**. A question referencing a session with anything else would reproduce it precisely.
     */
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),

    /** The author. This cascade **is** owner decision 1 — see the docblock above. */
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    body: text('body').notNull(),

    /** The ordering tiebreak (FR-726), and the only instant this feature stores about a question. */
    askedAt: timestamp('asked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **BOTH HALVES OF FR-703, AT THE LAST LINE OF DEFENCE** (research R10).
     *
     * `length(btrim(body, …)) > 0` is what makes FR-703's whitespace rule **structural**: a body
     * of whitespace cannot exist as a row, so "no question" has exactly one representation and a
     * later write path cannot invent a second by storing `'   '`.
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **`btrim` WITH AN EXPLICIT CHARACTER SET, NOT BARE `trim()` — AND THE DIFFERENCE IS A
     * DEFECT THIS FEATURE SHIPPED FOR AN HOUR.**
     *
     * PostgreSQL's one-argument `trim()`/`btrim()` strips **spaces only**. A body of
     * `"\n\t  \n"` therefore trims to `"\n\t\n"`, whose length is 3, and the constraint accepts
     * it — while the route, which uses JavaScript's Unicode-aware `String.prototype.trim`,
     * refuses the identical payload. The two layers disagreed, and the weaker one was the last
     * line of defence.
     *
     * `tests/integration/questions-validation.test.ts` found it by writing straight to the
     * table with the route bypassed, which is exactly why that file tests the two layers
     * separately instead of driving the route twice.
     * ─────────────────────────────────────────────────────────────────────────────────────
     *
     * `length(body) <= 500` is the limit independent of the route schema that also enforces it
     * and of the composer that surfaces it. Principle VIII: client-side presentation of a limit
     * is never the enforcement of it. `session_notes` establishes the two-sided pattern.
     *
     * **500, not 10,000.** A note is an essay to yourself; a question is one sentence to a room,
     * and a list of 2,000-character questions is not scannable. Do not copy notes' bound here.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    check(
      'session_questions_body_length',
      sql`length(btrim(${table.body}, E' \\t\\n\\r')) > 0 AND length(${table.body}) <= 500`,
    ),

    /** Every read is "this session's questions", and Postgres creates no index for a foreign key. */
    index('session_questions_session_id_idx').on(table.sessionId),

    /**
     * For the deletion cascade and the export, both of which scan by author.
     *
     * **004's review left exactly this index missing on two token tables and it is a recorded
     * unclaimed defect** — every account deletion cascade-scans them. Not repeating it costs one
     * line, and this is that line.
     */
    index('session_questions_attendee_id_idx').on(table.attendeeId),
  ],
)

/**
 * The fact that one attendee upvoted one question.
 *
 * **Scoping: per-event**, inherited through the question to its session. No `event_id` here
 * either, for the reason the file header gives.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE VOTE COUNT IS NOT A COLUMN, AND MUST NOT BECOME ONE** (research R6).
 *
 * It is `count(*)` over these rows at read time. A denormalised counter is a second source of
 * truth for a number the rows already answer, and the one that drifted would be the one
 * displayed. 008 records the same reasoning for `lapsed`, which is derived rather than stored.
 * At the volumes this product sees — a session's questions, bounded by its audience — an
 * aggregate is not the expensive part of the request.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Nothing here records who voted in any surface** (FR-721, FR-769). The rows exist; no route,
 * repository method or response field names a voter other than the reader themselves, and
 * `tests/unit/qa-absences.test.ts` fails the build if one appears.
 */
export const questionVotes = pgTable(
  'question_votes',
  {
    questionId: uuid('question_id')
      .notNull()
      .references(() => sessionQuestions.id, { onDelete: 'cascade' }),

    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /** Exported (FR-764); never displayed. */
    votedAt: timestamp('voted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **THIS COMPOSITE PRIMARY KEY *IS* FR-718.**
     *
     * One vote per attendee per question, enforced by the schema rather than by handler logic —
     * so a double-tap on a slow connection is simply the same request twice, and **no code path
     * exists that could produce a duplicate by forgetting to check**. `saved_sessions`
     * establishes the pattern and `queries/questions.ts` expresses it as `ON CONFLICT DO
     * NOTHING`.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    primaryKey({ columns: [table.questionId, table.attendeeId] }),

    /**
     * The deletion and export path. The primary key already serves the count-by-question read,
     * so **no second index on `question_id` is added** — it would make every write pay for a
     * query nobody makes.
     */
    index('question_votes_attendee_id_idx').on(table.attendeeId),
  ],
)

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWO CASCADES ON `question_votes` DO DIFFERENT WORK AND BOTH ARE LOAD-BEARING**
 * (FR-761).
 *
 * From `attendees` it removes the **voter's own** votes wherever they were cast. From
 * `session_questions` it removes **everybody's** votes when the question goes — which is the
 * mechanism behind owner decision 1's stated cost, and it is why deleting an author takes other
 * people's votes with it. Neither is redundant: without the first, a departing voter's marks
 * would outlive them; without the second, a deleted question's votes would be orphan rows
 * counting toward nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

export type SessionQuestion = typeof sessionQuestions.$inferSelect
export type QuestionVote = typeof questionVotes.$inferSelect
