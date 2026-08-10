import { sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'

/**
 * T017–T019 (009) — reads and writes of a session's audience questions
 * (FR-701–FR-732, FR-741–FR-745).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FUNCTION HERE TAKES AN `EventScope` AS ITS FIRST PARAMETER, NEVER A BARE STRING —
 * AND NONE TAKES AN ATTENDEE IDENTIFIER AT ALL.**
 *
 * This is 005's rule in `queries/agenda.ts`, unchanged, and both halves still matter. The scope
 * can only be produced by `requireEventAccess`, so a handler that skipped verification has
 * nothing to pass and does not compile. The **absence** of an attendee parameter is what makes
 * "the reader is whoever signed in" structural: there is no expression anybody could write here
 * that votes as somebody else or withdraws another attendee's question, because there is no
 * argument in which to name them (FR-741).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A SESSION OR QUESTION IDENTIFIER FROM THE CLIENT IS NEVER TRUSTED TO BELONG TO THE
 * CONFERENCE, AND THE CHECK IS FOLDED INTO THE STATEMENT RATHER THAN PERFORMED BEFORE IT**
 * (FR-743).
 *
 * Every statement below carries its own `event_id = scope.eventId` predicate, reached through
 * `sessions`. Reading first and then writing would be wrong twice over — it is a race, and it
 * hands the handler a distinguishable "no such session" to report, which is exactly the
 * difference between a 403 and a 404 that the indistinguishable-refusal rule forbids. 005
 * records this at length for the agenda; nothing about questions changes it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY WRITE RETURNS THE FULL, FRESHLY-ORDERED LIST** (research R5).
 *
 * This is the one place this feature departs from the "write, then re-read" shape used
 * elsewhere, and it is the only shape that satisfies three requirements at once:
 *
 *   - **FR-730** — the reader's own action updates immediately, because the response *is* the
 *     new state. There is no second request and no interval in which the count is wrong.
 *   - **FR-726** — the order comes from this file's `ORDER BY`, so it is the same order every
 *     other reader sees. A client-side re-sort would have to reimplement the tiebreak and could
 *     drift from it silently.
 *   - **FR-780** — with the list arriving whole, the client keys rows on the question id and
 *     React *moves* the DOM node rather than unmounting it, so the control the reader just
 *     activated keeps focus as its row rises.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * A malformed identifier is refused exactly like a well-formed one that is not in this
 * conference (FR-743).
 *
 * Matched here rather than declared as `format: uuid` on the route, for the reason 005 states in
 * `queries/agenda.ts`: a schema `format` produces a 400 with a validation body before the handler
 * runs, and a failed `::uuid` cast produces a 500. Either one separates "not a uuid" from "not in
 * this conference" — a smaller disclosure than existence, but still a difference an attacker can
 * read. It lives in the query layer so a route added later cannot forget it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ISO-8601 with milliseconds, in UTC, produced by the database rather than by JavaScript.
 *
 * The same formatting `queries/cards.ts` and `queries/blocks.ts` use, and for the reason 005
 * learned from an integration test: a raw `execute` hands back the driver's own text for a
 * `timestamptz` — `2026-08-10 13:37:37.693025+00` — which is neither what the route schema
 * declares (`format: date-time`) nor what every other instant in this product sends (FR-124).
 */
const isoInstant = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

/** One question, as the list produces it for one particular reader. */
export interface QuestionRow {
  readonly id: string
  readonly body: string
  readonly askedAt: string
  readonly authorId: string
  readonly authorDisplayName: string
  /** Computed at read time. **Never stored** — see `schema/questions.ts`. */
  readonly votes: number
  /** The reader's own state, and the only vote fact any surface reveals (FR-721). */
  readonly votedByMe: boolean
  readonly canWithdraw: boolean
}

/**
 * Declared as a type alias rather than an interface on purpose: `db.execute<T>` constrains `T` to
 * `Record<string, unknown>`, and only a type alias carries the implicit index signature that
 * satisfies it. `queries/cards.ts` and `queries/active-event.ts` both record this trap — changing
 * it to an `interface` breaks the build with an error whose cause is not obvious from the message.
 */
type ListRow = {
  id: string
  body: string
  asked_at: string
  author_id: string
  display_name: string
  votes: number
  voted_by_me: boolean
  can_withdraw: boolean
}

/**
 * The list, as **one query per session** (research R6, R7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE AUTHOR JOIN READS `display_name` AND NOTHING ELSE, AND APPLIES NONE OF THE DIRECTORY'S
 * THREE CONDITIONS** (FR-734, FR-735, FR-737).
 *
 * Not discoverability, not verification, not a registration join. `listDirectory` in the
 * neighbouring file has all three — `a.discoverable = true AND a.email_verified_at IS NOT NULL`
 * plus a `JOIN registrations` — so a reader arriving from that file will see this one as
 * incomplete. **It is not.** Each absence is the feature:
 *
 *   - **No discoverability condition** (FR-734). A question is published to the conference under
 *     the author's real name, with no opt-out; that is the exception constitution v3.3.0 records.
 *     Blanking the name of an attendee who has turned discoverability off would leave an
 *     unattributable question on a public list, which is the one outcome attribution rules out.
 *   - **No verification condition** (FR-735). The constitution's standing invariant is that
 *     verification gates *exactly one thing: discoverability*, and no feature may use it for
 *     anything else. This is that rule obeyed, not an omission.
 *   - **No registration join.** The reader's registration is already proven by the `EventScope`,
 *     and the *author's* is irrelevant: somebody who asked a question and later withdrew from the
 *     conference still asked it. 008's card resolution differs here — it crosses events — and the
 *     difference is worth noticing rather than copying.
 *
 * What it must **not** grow is any other profile column. `display_name` is the whole of FR-737,
 * and adding company or role here would turn a question list into a directory that skips the
 * directory's conditions.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **`votes` is `count(*)`, never a stored counter** (research R6), and `votedByMe` is an
 * `EXISTS` over the reader alone — there is no column, alias or expression here that names any
 * other voter (FR-721, FR-769).
 *
 * **Unpaginated, permissively** (FR-732). A session's questions are bounded by its audience.
 * Adding a cursor later needs no requirement change, but it must preserve FR-726's order.
 */
const questionSelect = (readerId: string) => sql`
  SELECT
    q.id                                   AS id,
    q.body                                 AS body,
    ${sql.raw(isoInstant('q.asked_at'))}   AS asked_at,
    a.id                                   AS author_id,
    a.display_name                         AS display_name,
    count(v.attendee_id)::int              AS votes,
    EXISTS (
      SELECT 1 FROM question_votes mine
      WHERE mine.question_id = q.id AND mine.attendee_id = ${readerId}::uuid
    )                                      AS voted_by_me,
    (
      a.id = ${readerId}::uuid AND count(v.attendee_id) = 0
    )                                      AS can_withdraw
  FROM session_questions q
  JOIN attendees a ON a.id = q.attendee_id
  LEFT JOIN question_votes v ON v.question_id = q.id
  -- ═════════════════════════════════════════════════════════════════════════════════════════
  -- T069 (009) — **THE BIDIRECTIONAL BLOCK FILTER, READ-SIDE ONLY** (FR-785, FR-786, research
  -- R7). Mirrors queries/cards.ts exactly, and inherits both halves of 008's reasoning.
  --
  -- **The pair is NEVER ordered.** attendee_blocks rows are directional and A-blocks-B is a
  -- different fact from B-blocks-A; this asks whether *either* row exists. queries/blocks.ts
  -- carries a warning about collapsing the two directions that applies here verbatim.
  --
  -- **Nothing is written and nothing is cancelled**, which is what makes FR-786's reversibility
  -- free: lifting a block restores the questions with no repair path, no undo table and no
  -- second write to get wrong. That is the deliberate opposite of what a block does to an
  -- appointment, which is *cancelled* by a write and stays cancelled — because somebody would
  -- otherwise turn up. A question is a thing on a page; nobody turns up to it.
  --
  -- **It removes rows from ONE reader's list and enters no aggregate** (FR-787). The count above
  -- is computed over question_votes without reference to blocks, so every other reader's
  -- totals are untouched and a vote the blocker already cast still counts. Filtering the votes
  -- as well would let one attendee silently change what a whole conference sees.
  -- ═════════════════════════════════════════════════════════════════════════════════════════
  WHERE NOT EXISTS (
    SELECT 1 FROM attendee_blocks b
    WHERE (b.blocker_id = ${readerId}::uuid AND b.blocked_id = q.attendee_id)
       OR (b.blocker_id = q.attendee_id AND b.blocked_id = ${readerId}::uuid)
  )
`

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE BLOCK FILTER IS ON THE READ AND DELIBERATELY NOT ON THE WRITES** (FR-785, FR-787).
 *
 * `voteOnQuestion`, `unvoteQuestion` and `withdrawQuestion` do not consult `attendee_blocks`,
 * and that is the specification's shape rather than an omission. FR-787 requires a block to
 * change **no count at all**, including a vote the blocker had already cast — so votes and
 * blocks are decoupled by design. Refusing a write against a question the reader can no longer
 * see would be the same rule applied inconsistently: it would leave the existing vote counting
 * while forbidding its removal.
 *
 * The practical reach of a write is bounded anyway, because a blocked question is absent from
 * every list the reader can obtain — so acting on one requires an identifier they kept from
 * before the block, and the only thing they can do with it is add or remove **their own** vote.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The ordering, in one place so no caller can express a different one (FR-725, FR-726).
 *
 * **Deterministic, and never the count alone.** Two questions on the same count would otherwise
 * come back in whatever order the plan happened to produce, so two readers looking at the same
 * data could see different lists — and the same reader could see the order change under them for
 * no reason they could perceive. `asked_at` ascending breaks the tie toward the question that was
 * asked first, which is the answer a room would give.
 */
const ORDERING = sql`ORDER BY votes DESC, q.asked_at ASC, q.id ASC`

const toQuestion = (row: ListRow): QuestionRow => ({
  id: row.id,
  body: row.body,
  askedAt: row.asked_at,
  authorId: row.author_id,
  authorDisplayName: row.display_name,
  votes: row.votes,
  votedByMe: row.voted_by_me,
  canWithdraw: row.can_withdraw,
})

/**
 * Whether a session is part of the conference this scope verifies.
 *
 * **Not the authorization check** — that is folded into each statement below and has already run
 * by the time this is called. This exists only so a caller can tell "this session has no
 * questions" from "this session is not yours", which the statements themselves cannot express:
 * an empty list and a refused read are the same zero rows. It reads `sessions` alone, which is
 * conference content already filtered to the verified event, so it discloses nothing the caller
 * has not been granted. 005's `sessionBelongsToScope` is the same function for the same reason.
 */
const sessionInScope = async (scope: EventScope, sessionId: string): Promise<boolean> => {
  const rows = await getDb().execute<{ id: string }>(sql`
    SELECT id FROM sessions
    WHERE id = ${sessionId}::uuid AND event_id = ${scope.eventId}::uuid
    LIMIT 1
  `)
  return rows.length > 0
}

/**
 * Every question on a session, ordered (FR-725, FR-726).
 *
 * Returns `null` when the session is not part of this conference, does not exist, or was named
 * with a malformed identifier — all three indistinguishable, and the route turns every one into
 * the same 404 (FR-743).
 *
 * An empty array is a **valid answer**, not a refusal: a session nobody has asked about renders
 * the empty state that invites the first question (FR-727).
 */
export const listQuestions = async (
  unverified: EventScope,
  sessionId: string,
): Promise<QuestionRow[] | null> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return null
  if (!(await sessionInScope(scope, sessionId))) return null

  // `AND`, not `WHERE` — `questionSelect` already opens the clause with the block filter, which
  // is deliberate: a fragment that ended before the `WHERE` would let a caller assemble a read
  // with no block condition on it at all, and the omission would look like ordinary SQL.
  const rows = await getDb().execute<ListRow>(sql`
    ${questionSelect(scope.attendeeId)}
    AND q.session_id = ${sessionId}::uuid
    GROUP BY q.id, a.id
    ${ORDERING}
  `)

  return rows.map(toQuestion)
}

/**
 * Ask a question, and answer with the session's whole list (FR-701, FR-730).
 *
 * `null` when the session is not in this conference — the insert's `WHERE EXISTS` refuses it, so
 * there is no window between checking and writing and no distinguishable cause to report.
 *
 * The body arrives already bounded by the route schema and is bounded **again** by the column's
 * `CHECK`, which is where a whitespace-only question becomes unrepresentable rather than merely
 * rejected (FR-703, FR-705). Trimmed here so what is stored is what the reader sees, and so the
 * lower bound cannot be satisfied by padding.
 */
export const askQuestion = async (
  unverified: EventScope,
  sessionId: string,
  body: string,
): Promise<QuestionRow[] | null> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(sessionId)) return null

  await getDb().execute(sql`
    INSERT INTO session_questions (session_id, attendee_id, body)
    SELECT ${sessionId}::uuid, ${scope.attendeeId}::uuid, ${body.trim()}
    WHERE EXISTS (
      SELECT 1 FROM sessions
      WHERE id = ${sessionId}::uuid AND event_id = ${scope.eventId}::uuid
    )
  `)

  return listQuestions(scope, sessionId)
}

/**
 * What a withdrawal resolved to. Three outcomes because two of them are different refusals
 * (FR-713, FR-714, FR-743).
 */
export type WithdrawOutcome =
  | { readonly outcome: 'withdrawn'; readonly questions: QuestionRow[] }
  /** Somebody upvoted it. **This refusal carries its reason** — see below. */
  | { readonly outcome: 'has-votes' }
  /** Not the caller's, in another conference, or gone. Indistinguishable, deliberately. */
  | { readonly outcome: 'not-found' }

/**
 * Withdraw a question the caller asked, while nobody has upvoted it (FR-712–FR-715).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE "NO VOTES" CONDITION IS RE-CHECKED INSIDE THE SAME TRANSACTION AS THE DELETE, AND THE
 * ROW IS LOCKED FIRST. CHECKING BEFORE THE TRANSACTION IS THE RACE FR-714 EXISTS TO CLOSE.**
 *
 * `SELECT … FOR UPDATE` on the question is what makes the re-check authoritative rather than
 * merely re-run: inserting a vote takes a `FOR KEY SHARE` lock on the referenced question row,
 * and `FOR UPDATE` conflicts with it. So a vote arriving between the reader seeing "you can
 * withdraw this" and pressing the control **blocks until this transaction ends**, and is then
 * either counted by the check below or refused by the foreign key against a question that is
 * already gone. Without the lock, the vote and the delete could interleave and produce a
 * withdrawn question that somebody had backed.
 *
 * The authorship condition is in the same `SELECT`, so it is enforced **server-side regardless
 * of what any interface offered** (FR-715). `canWithdraw` on the list is presentation; this is
 * the enforcement, and the two are deliberately not the same code.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const withdrawQuestion = async (
  unverified: EventScope,
  questionId: string,
): Promise<WithdrawOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(questionId)) return { outcome: 'not-found' }

  const sessionId = await getDb().transaction(async (tx) => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Authorship, conference membership and the lock, in one statement. `FOR UPDATE OF q` names
    // the question alone: locking the joined `sessions` row as well would serialise every
    // withdrawal on a session against every other for no benefit.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const owned = await tx.execute<{ session_id: string }>(sql`
      SELECT q.session_id
      FROM session_questions q
      JOIN sessions s ON s.id = q.session_id
      WHERE q.id = ${questionId}::uuid
        AND q.attendee_id = ${scope.attendeeId}::uuid
        AND s.event_id = ${scope.eventId}::uuid
      FOR UPDATE OF q
    `)

    const row = owned[0]
    if (!row) return null

    const voted = await tx.execute<{ voted: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM question_votes WHERE question_id = ${questionId}::uuid
      ) AS voted
    `)
    if (voted[0]?.voted === true) return 'has-votes' as const

    await tx.execute(sql`DELETE FROM session_questions WHERE id = ${questionId}::uuid`)
    return row.session_id
  })

  if (sessionId === null) return { outcome: 'not-found' }
  if (sessionId === 'has-votes') return { outcome: 'has-votes' }

  // Read after the transaction commits, so the list the caller receives is the one every other
  // reader would now get rather than this transaction's private view of it.
  const questions = await listQuestions(scope, sessionId)
  return { outcome: 'withdrawn', questions: questions ?? [] }
}

/**
 * Whether a driver error is PostgreSQL's foreign-key violation (`23503`).
 *
 * Walks the cause chain because the ORM wraps the driver's error, and reads `code` from whatever
 * link carries it — `tests/integration/questions-validation.test.ts` records the same lesson for
 * the constraint name, which the two drivers spell differently.
 */
const isForeignKeyViolation = (cause: unknown): boolean => {
  let current: unknown = cause
  while (current instanceof Error) {
    if ((current as { code?: unknown }).code === '23503') return true
    current = current.cause
  }
  return false
}

/** What an upvote resolved to. */
export type VoteOutcome =
  | { readonly outcome: 'counted'; readonly questions: QuestionRow[] }
  /** The caller wrote it. **This refusal carries its reason** (FR-722). */
  | { readonly outcome: 'own-question' }
  | { readonly outcome: 'not-found' }

/**
 * What an un-vote resolved to. **Narrower than `VoteOutcome` by one case, deliberately.**
 *
 * There is no `own-question` here because there is nothing to refuse: the author has no vote to
 * remove, so the delete simply matches nothing. Declaring the wider type and never producing the
 * extra case would oblige every caller to handle a branch that cannot occur — and the compiler
 * caught exactly that when the route tried to read `questions` off it.
 */
export type UnvoteOutcome =
  | { readonly outcome: 'counted'; readonly questions: QuestionRow[] }
  | { readonly outcome: 'not-found' }

/**
 * The question's session and author, if it is reachable from this scope at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE FOLLOW-UP QUESTION THIS ASKS IS ABOUT THE READER, WHICH IS WHAT MAKES IT SAFE.**
 *
 * It resolves a question inside a conference the caller has already been granted, and the only
 * branch taken on the answer is "did *you* write this". 008's enumeration-oracle defect was the
 * opposite shape — asking whether the *invitee* was registered, to choose between two statuses,
 * with the caller controlling every other variable. Nothing here branches on a fact about
 * another attendee.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const questionInScope = async (
  scope: EventScope,
  questionId: string,
): Promise<{ sessionId: string; authorId: string } | null> => {
  const rows = await getDb().execute<{ session_id: string; attendee_id: string }>(sql`
    SELECT q.session_id, q.attendee_id
    FROM session_questions q
    JOIN sessions s ON s.id = q.session_id
    WHERE q.id = ${questionId}::uuid AND s.event_id = ${scope.eventId}::uuid
    LIMIT 1
  `)

  const row = rows[0]
  return row ? { sessionId: row.session_id, authorId: row.attendee_id } : null
}

/**
 * Upvote a question (FR-717–FR-722).
 *
 * **Idempotent by the composite primary key** (FR-718), expressed here as `ON CONFLICT DO
 * NOTHING`: a double-tap on a slow connection is the same request twice, and the count cannot be
 * inflated by repetition because the schema has no room for a second row.
 *
 * An attendee cannot vote on their own question (FR-722), and that refusal **explains itself** —
 * it describes the reader's own authorship, which they already know.
 */
export const voteOnQuestion = async (
  unverified: EventScope,
  questionId: string,
): Promise<VoteOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(questionId)) return { outcome: 'not-found' }

  const question = await questionInScope(scope, questionId)
  if (!question) return { outcome: 'not-found' }
  if (question.authorId === scope.attendeeId) return { outcome: 'own-question' }

  try {
    await getDb().execute(sql`
      INSERT INTO question_votes (question_id, attendee_id)
      VALUES (${questionId}::uuid, ${scope.attendeeId}::uuid)
      ON CONFLICT (question_id, attendee_id) DO NOTHING
    `)
  } catch (cause: unknown) {
    // ═════════════════════════════════════════════════════════════════════════════════════
    // **A VOTE THAT RACES A WITHDRAWAL IS A 404, NOT A 500** (FR-743).
    //
    // `ON CONFLICT` absorbs a duplicate; it does **not** absorb a foreign-key violation. The
    // withdrawal above takes `FOR UPDATE` on the question, which blocks this insert's implicit
    // `FOR KEY SHARE` request — and then releases it onto a row that has been deleted. The
    // insert therefore raises `23503` against a question that no longer exists.
    //
    // Left unhandled it reached the error plugin as an unhandled fault: a **500** with a
    // correlation id, and an operator log entry, for the ordinary outcome "somebody withdrew
    // their question a moment before you backed it". FR-743 requires a question that does not
    // exist to answer with the same uniform 404 as every other absence, which is exactly what
    // this caller already produces for the non-racing case.
    // ═════════════════════════════════════════════════════════════════════════════════════
    if (isForeignKeyViolation(cause)) return { outcome: 'not-found' }
    throw cause
  }

  const questions = await listQuestions(scope, question.sessionId)
  return { outcome: 'counted', questions: questions ?? [] }
}

/**
 * Take an upvote back (FR-719).
 *
 * **Idempotent in the other direction** — succeeds whether or not a vote existed, because the
 * caller does not need to know which and telling them would leak nothing useful. A question that
 * loses its last vote becomes withdrawable again, which is the schema doing it rather than any
 * code here noticing.
 *
 * The own-question refusal is **not** repeated here: there is no vote of the author's to remove,
 * so this is simply a delete that matches nothing.
 */
export const unvoteQuestion = async (
  unverified: EventScope,
  questionId: string,
): Promise<UnvoteOutcome> => {
  const scope = assertVerifiedScope(unverified)
  if (!UUID.test(questionId)) return { outcome: 'not-found' }

  const question = await questionInScope(scope, questionId)
  if (!question) return { outcome: 'not-found' }

  await getDb().execute(sql`
    DELETE FROM question_votes
    WHERE question_id = ${questionId}::uuid AND attendee_id = ${scope.attendeeId}::uuid
  `)

  const questions = await listQuestions(scope, question.sessionId)
  return { outcome: 'counted', questions: questions ?? [] }
}
