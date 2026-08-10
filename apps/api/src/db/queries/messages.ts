import { sql } from 'drizzle-orm'

import { assertVerifiedParticipation, type ConversationScope } from '../../plugins/participation.js'
import { getDb } from '../client.js'

/**
 * T041 (007) — writing and reading what was actually said (FR-511–FR-518, research R6, R12).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FUNCTION HERE TAKES A `ConversationScope`, NEVER A BARE CONVERSATION IDENTIFIER —
 * AND NONE TAKES AN ATTENDEE IDENTIFIER AT ALL.**
 *
 * This is `queries/agenda.ts`'s construction with a different predicate, and both halves carry
 * the same weight they do there.
 *
 * The scope can only be produced by `requireParticipation`, so a handler that skipped the guard
 * has nothing to pass and does not compile (FR-523). Verification is a precondition of reading
 * somebody's correspondence rather than a step a writer may omit — which matters more here than
 * it did for events, because a conversation identifier appears in a URL, gets shared, and ends
 * up in logs and browser history.
 *
 * The **absence** of an attendee parameter is what makes the author of a message the session's
 * attendee by construction (FR-525): there is no expression anybody could write in this file that
 * attributes a message to somebody else, because there is no argument in which to name them.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The upper bound on a message body, **after trimming** (FR-517, research R12).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Stated here once and enforced in three places that cannot disagree, because each covers what
 * the others cannot:
 *
 *   1. **`CHECK (length(body) BETWEEN 1 AND 2000)` on the column** — the last line, surviving any
 *      write path that has not been written yet.
 *   2. **The route schema** — refuses before a transaction is opened, so a caller pasting a novel
 *      does not cost a connection.
 *   3. **The composer's counter** (FR-517) — the only one an attendee actually experiences.
 *
 * Two thousand rather than a larger number partly because of research R12 and partly because a
 * Web Push payload is about 4 KB once encrypted: M7 puts message content in the notification, so
 * a limit far above this would make truncation the normal case rather than the exception.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const MESSAGE_MAX_LENGTH = 2_000

/** Default page of history. Fifty is roughly two screens on a phone. */
export const MESSAGE_PAGE_SIZE = 50

/** The most a caller may ask for, so nobody can request a whole thread in one request. */
export const MESSAGE_MAX_PAGE_SIZE = 200

export interface StoredMessage {
  readonly messageId: string
  readonly sentAt: string
}

/**
 * The canonical form of a body, applied **before** anything measures it.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TRIMMING FIRST IS WHAT MAKES FR-512'S LOWER BOUND STRUCTURAL.**
 *
 * `'   '` is three characters, so a length check on what arrived accepts it. Trimmed, it is the
 * empty string, and the column's CHECK cannot accept that — so an all-whitespace message has no
 * representation in the database at all, rather than being refused by a rule somebody has to
 * remember to write on every write path.
 *
 * The upper bound is measured against the trimmed value for a smaller but real reason: an
 * attendee who typed exactly the limit and pasted a trailing newline has not written a message
 * that is too long, and telling them they have would be a refusal they cannot act on.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const normaliseBody = (body: string): string => body.trim()

/** Whether a body is one the store will accept. Shared by both routes that take one. */
export const isSendableBody = (body: string): boolean => {
  const normalised = normaliseBody(body)
  return normalised.length >= 1 && normalised.length <= MESSAGE_MAX_LENGTH
}

/**
 * Appends a message to a conversation the caller participates in (FR-511, FR-514).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The insert and `last_message_at` are one transaction, and that is the whole reason the
 * denormalisation is safe** (schema/conversations.ts). The conversation list orders by that
 * column; if it were written separately there would be a window in which a thread with a new
 * message sorted as though it had none, and a failure between the two statements would leave the
 * column permanently wrong with nothing to notice.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Returns the stored identifier and the **server's** instant. The client renders a message as
 * sent only from this resolved value — a phone with a wrong clock must not be able to place its
 * own message out of order in a thread, and rendering from the keystroke instead would be the
 * optimistic update the constitution requires a separate recorded decision for.
 */
export const appendMessage = async (
  unverified: ConversationScope,
  body: string,
): Promise<StoredMessage | null> => {
  // Membership, not merely shape. A value can satisfy `ConversationScope` and never have been
  // through the guard; this is what makes the guarantee true at runtime rather than only in the
  // type system.
  const scope = assertVerifiedParticipation(unverified)

  const normalised = normaliseBody(body)
  if (!isSendableBody(normalised)) return null

  return getDb().transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; sent_at: string }>(sql`
      INSERT INTO messages (conversation_id, author_id, body)
      VALUES (${scope.conversationId}::uuid, ${scope.attendeeId}::uuid, ${normalised})
      RETURNING id, to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at
    `)

    const row = rows[0]
    if (!row) return null

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Set from the message's own `sent_at` rather than a second `now()`. Two calls to `now()`
    // inside one transaction do return the same value in PostgreSQL — but relying on that makes
    // the ordering column depend on a transaction-time guarantee rather than on the row it
    // summarises, and a future edit that moved this outside the transaction would break it
    // silently.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await tx.execute(sql`
      UPDATE conversations
      SET last_message_at = (SELECT sent_at FROM messages WHERE id = ${row.id}::uuid)
      WHERE id = ${scope.conversationId}::uuid
    `)

    return { messageId: row.id, sentAt: row.sent_at }
  })
}

/** Thrown for a cursor this server did not issue. The route maps it to the uniform refusal. */
export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is not one this server issued.')
    this.name = 'InvalidCursorError'
  }
}

export interface MessageRow {
  readonly messageId: string
  readonly body: string
  readonly sentAt: string
  /**
   * **The only thing said about authorship, and deliberately so.**
   *
   * The counterpart is already established by the conversation, so an identifier per message
   * would add nothing and widen the surface. There is no `readAt`, no delivery status, no
   * `editedAt` and no reactions either — FR-516 makes a sent message immutable, and M5 puts read
   * receipts, delivery ticks, typing indicators and presence out of scope entirely.
   */
  readonly mine: boolean
}

/**
 * Who else is in this conversation, or `null` when they have deleted their account (FR-573).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN ADDITION TO THE CONTRACT AS WRITTEN, AND IT IS RECORDED RATHER THAN SLIPPED IN.**
 *
 * `contracts/messages-api.md` gives this page `{ messages, nextCursor, state }`. The thread needs
 * one thing more: **who it is with**. The desktop layout declaration requires the top bar to carry
 * the other participant's name, the block and report dialogs have to name a person and act on an
 * identifier, and a departed counterpart has to be rendered as *closed* rather than as a blank.
 *
 * The two alternatives were worse:
 *
 *   - **Read the conversation list and find the row.** One extra request per thread open, and it
 *     transfers every counterpart's name and face to render one header — precisely the cost the
 *     contract avoided when it gave Home's unread dot its own address.
 *   - **A second per-conversation route.** A route whose only job is to answer a question this
 *     one already knows the answer to.
 *
 * `null` carries no name, no avatar and no identifier, which is FR-573 by construction: there is
 * nothing retained to send.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface CounterpartRow {
  readonly attendeeId: string
  readonly displayName: string
  readonly avatarObjectKey: string | null
}

export interface MessagePageRows {
  readonly messages: readonly MessageRow[]
  readonly nextCursor: string | null
  readonly state: 'open' | 'one_sided' | 'blocked'
  readonly counterpart: CounterpartRow | null
}

/**
 * T058 (007) — a keyset page of history, **newest first** (FR-518, research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS CURSOR GUARANTEES NO DUPLICATES *AND* NO OMISSIONS, UNLIKE 006'S.**
 *
 * The directory's cursor is deliberately asymmetric — an attendee's relevance score can fall
 * below a position the reader has already passed, so it permits omissions and forbids repeats.
 * Nothing here can change rank: `sent_at` is immutable because a message is never edited
 * (FR-516) and never moves, and `(sent_at, id)` is a total order. So a reader scrolling back
 * through a thread sees every message exactly once, and that is a property of the data rather
 * than of the query.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Newest first, and the client reverses for display.** A thread opens at its most recent
 * message, so the first page must be the last messages — asking for them oldest-first would mean
 * either transferring the whole history or paging from the wrong end.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE CURSOR CARRIES A MICROSECOND INSTANT, WHILE THE RESPONSE CARRIES A MILLISECOND ONE, AND
 * THE DIFFERENCE IS A DEFECT THIS QUERY ALREADY HAD.**
 *
 * `sentAt` on the wire is milliseconds, because that is what `Date#toISOString` produces and what
 * every instant in this product looks like (FR-124). PostgreSQL stores `timestamptz` to
 * **microseconds** — so a cursor built from the millisecond string rounds the bound *down*, and
 * `(sent_at, id) < (bound, id)` then excludes every row sharing the page boundary's millisecond,
 * including rows the reader has not seen.
 *
 * That is not a rare edge. A burst of messages, or any batch insert, shares a millisecond
 * routinely, and the symptom is **silent omission** rather than an error. `message-paging.test.ts`
 * caught it by paging a thousand messages with deliberately tied timestamps — and it failed
 * *intermittently* before the fix, because the loss only bites when the stored microseconds happen
 * to be non-zero, which depends on the clock. An intermittent test is what a precision bug looks
 * like from the outside.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const listMessages = async (
  unverified: ConversationScope,
  query: { readonly cursor?: string | undefined; readonly limit?: number | undefined } = {},
): Promise<MessagePageRows> => {
  const scope = assertVerifiedParticipation(unverified)

  const limit = Math.min(Math.max(query.limit ?? MESSAGE_PAGE_SIZE, 1), MESSAGE_MAX_PAGE_SIZE)
  const bound = query.cursor ? decodeCursor(query.cursor) : null

  const rows = await getDb().execute<{
    id: string
    body: string
    sent_at: string
    cursor_at: string
    mine: boolean
  }>(sql`
    SELECT
      m.id,
      m.body,
      to_char(m.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at,
      -- A SECOND, HIGHER-PRECISION RENDERING OF THE SAME INSTANT, FOR THE CURSOR ONLY.
      -- See the note above this query; the short version is that a millisecond bound silently
      -- skips every row sharing the page boundary's millisecond, because PostgreSQL stores
      -- microseconds.
      to_char(m.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
      (m.author_id = ${scope.attendeeId}::uuid) AS mine
    FROM messages m
    WHERE m.conversation_id = ${scope.conversationId}::uuid
    ${
      bound ? sql`AND (m.sent_at, m.id) < (${bound.sentAt}::timestamptz, ${bound.id}::uuid)` : sql``
    }
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT ${limit + 1}
  `)

  // Resolved alongside the page rather than after it: the composer's availability and the
  // header's name are needed by the same render, and two requests for one screen is the shape
  // the contract's own reasoning rejects.
  const [state, counterpart] = await Promise.all([conversationState(scope), counterpartOf(scope)])

  // One more than asked for, so "is there another page" is answered without a second count.
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]

  return {
    messages: page.map((row) => ({
      messageId: row.id,
      body: row.body,
      sentAt: row.sent_at,
      mine: row.mine,
    })),
    nextCursor: hasMore && last ? encodeCursor(last.cursor_at, last.id) : null,
    state,
    counterpart,
  }
}

/**
 * The other participant, resolved from the participant rows.
 *
 * A conversation has exactly two (FR-501), so "the row that is not mine" is unambiguous — and
 * when the counterpart has deleted their account there is no row at all, which is why this
 * returns `null` rather than a placeholder.
 */
const counterpartOf = async (scope: ConversationScope): Promise<CounterpartRow | null> => {
  const rows = await getDb().execute<{
    attendee_id: string
    display_name: string
    avatar_object_key: string | null
  }>(sql`
    SELECT a.id AS attendee_id, a.display_name, a.avatar_object_key
    FROM conversation_participants p
    JOIN attendees a ON a.id = p.attendee_id
    WHERE p.conversation_id = ${scope.conversationId}::uuid
      AND p.attendee_id <> ${scope.attendeeId}::uuid
    LIMIT 1
  `)

  const row = rows[0]
  return row
    ? {
        attendeeId: row.attendee_id,
        displayName: row.display_name,
        avatarObjectKey: row.avatar_object_key,
      }
    : null
}

/**
 * What the conversation currently permits, derived from the participant count and the caller's
 * own blocks (data-model, State transitions).
 *
 * **Carried on the page so the composer's availability needs no second request.** A thread that
 * rendered its history and then discovered separately that it could not be replied to would show
 * an enabled composer for a frame — and the attendee would type into it.
 */
export const conversationState = async (
  scope: ConversationScope,
): Promise<'open' | 'one_sided' | 'blocked'> => {
  const rows = await getDb().execute<{ participants: number; blocked: boolean }>(sql`
    SELECT
      (SELECT count(*) FROM conversation_participants p
       WHERE p.conversation_id = ${scope.conversationId}::uuid) AS participants,
      EXISTS (
        SELECT 1
        FROM conversation_participants other
        JOIN attendee_blocks b
          ON b.blocker_id = ${scope.attendeeId}::uuid AND b.blocked_id = other.attendee_id
        WHERE other.conversation_id = ${scope.conversationId}::uuid
          AND other.attendee_id <> ${scope.attendeeId}::uuid
      ) AS blocked
  `)

  const participants = Number(rows[0]?.participants ?? 0)
  // One-sided wins over blocked, for the reason `queries/conversations.ts` records: an unblock
  // action for somebody who no longer exists is an affordance that changes nothing.
  if (participants < 2) return 'one_sided'
  return rows[0]?.blocked === true ? 'blocked' : 'open'
}

/**
 * Opaque to every caller, and **a position rather than a scope**.
 *
 * It encodes only where the previous page stopped. The conversation comes from the branded scope
 * and never from here, so even a perfectly-formed cursor lifted from somebody else's thread reads
 * the caller's own — the same property 006 recorded for the directory's cursor.
 *
 * **The instant it carries is microsecond-precision**, unlike the one on the wire. See the query
 * above: a millisecond bound silently skips every row sharing the page boundary's millisecond.
 */
const encodeCursor = (sentAt: string, id: string): string =>
  Buffer.from(`${sentAt}|${id}`, 'utf8').toString('base64url')

const decodeCursor = (cursor: string): { sentAt: string; id: string } => {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const separator = decoded.lastIndexOf('|')
  if (separator <= 0) throw new InvalidCursorError()

  const sentAt = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)
  if (!Number.isFinite(Date.parse(sentAt)) || !UUID.test(id)) throw new InvalidCursorError()

  return { sentAt, id }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Formats a `timestamptz` to exactly what `Date#toISOString` produces.
 *
 * A raw `execute` hands back the driver's own text — `2026-08-07 13:37:37.693025+00` — which is
 * neither what the route schema declares (`format: date-time`) nor what every other instant in
 * this product sends (FR-124). 005 recorded this at length in `queries/agenda.ts` after an
 * integration test caught the difference; it is reproduced here rather than re-derived.
 */
export const isoColumn = (expression: string): ReturnType<typeof sql.raw> =>
  sql.raw(`to_char(${expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)
