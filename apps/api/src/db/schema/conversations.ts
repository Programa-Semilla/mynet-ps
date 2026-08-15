import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { messages } from './messages.js'

/**
 * T005 (007) — the exchange itself, who is in it, and the constraint that there is only one of
 * it per pair (FR-502, FR-507, FR-523, data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: CROSS-EVENT, FOR ALL THREE TABLES IN THIS FILE.**
 *
 * The constitution makes neither rule a default that may be assumed, so each table states its
 * own reasoning rather than inheriting one from this header — but the reasoning is the same
 * one in each case, and it is standing decision 7: conversations are *relationships*, and
 * relationships persist across events. FR-507 is explicit that a contact made at one
 * conference must not vanish at the next.
 *
 * The consequence is structural and it is the largest thing this feature changes. **Every
 * prior per-attendee table in this product is reached through `EventScope`**, the branded value
 * only `requireEventAccess` can construct. Nothing here can be: there is no event to scope by.
 * The predicate is *participation* instead — see `conversationParticipants` below, and
 * `plugins/participation.ts` for the guard that is its enforcement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Co-attendance appears exactly once in the whole model** — as an `EXISTS` at conversation
 * creation (FR-504) — and is never stored, never re-evaluated, and never a column here. Once
 * open, a conversation stays open (FR-505), including after the shared event ends and after
 * either attendee stops attending anything the other does.
 */

/**
 * The exchange. **Deliberately almost empty**: no title, no topic, no membership list, and
 * above all **no participant identifiers**.
 *
 * That emptiness is the point rather than an omission. After both participants delete their
 * accounts a row here would name nobody, which is what makes FR-573 — nothing of a departed
 * attendee is retained — true of this table by construction instead of by a deletion routine
 * remembering to visit it. It is still removed rather than left behind (FR-575), because an
 * unreferenced row is litter rather than a record.
 *
 * **There is no `status` column, and that is a decision** (data-model.md, State transitions).
 * Every lifecycle state is derivable from the participant count: two rows means open to
 * sending, one means one-sided and read-only, none means the conversation is removed. A stored
 * status can disagree with the rows it summarises, and on the day it does, the one that gets
 * read is the one that decides whether a departed attendee's thread still accepts messages.
 */
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

  /**
   * When the most recent message arrived, for FR-508's ordering.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The one denormalisation in this model, and it cannot drift.** It is written in the same
   * transaction as the message insert — see `queries/messages.ts` — so there is no window in
   * which it disagrees with `messages`, and no second write path that could open one.
   *
   * Ordering the conversation list by a correlated subquery over `messages` is correct and was
   * the first shape considered. It pages badly: every page of the list re-derives a maximum
   * per conversation, and the list is the destination's landing view.
   *
   * Null only in the instant between the conversation insert and its first message, inside one
   * transaction — FR-503a means a conversation never exists without a message, so no reader
   * outside that transaction observes null.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
})

/**
 * FR-502's uniqueness constraint — exactly one conversation per pair of attendees — **given a
 * row of its own so that it can also be cascaded** (research R10).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Why this is a table rather than a `pair_key` column on `conversations`.**
 *
 * The obvious shape is a unique column on `conversations` holding both identifiers. It works,
 * and it breaches FR-573: when one attendee deletes their account, the surviving conversation
 * still contains the departed person's identifier, forever, in the column that enforces
 * uniqueness. Nothing could remove it without also destroying the constraint.
 *
 * Here the pair row cascades away with *either* attendee and nothing is left behind. The
 * surviving participant keeps their conversation; the constraint simply no longer applies to a
 * conversation that can never be re-opened as a pair.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Scoping: cross-event**, necessarily — it is a property of the conversation it constrains.
 */
export const conversationPairs = pgTable(
  'conversation_pairs',
  {
    conversationId: uuid('conversation_id')
      .primaryKey()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    /**
     * The numerically smaller of the two attendee identifiers.
     *
     * **Ordering the pair is what makes the constraint direction-independent.** An attempt by A
     * to open a conversation with B produces the same `(lower, higher)` as an attempt by B with
     * A, so the second collides with the first — which is exactly FR-502. Without the ordering
     * the unique index would permit one A–B row and one B–A row, and the pair would have two
     * conversations.
     */
    lowerAttendeeId: uuid('lower_attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    higherAttendeeId: uuid('higher_attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),
  },
  (table) => [
    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **THE UNIQUE VIOLATION *IS* THE ENFORCEMENT. There is no read-then-write check.**
     *
     * `createConversationWithFirstMessage` inserts and catches the violation, rather than
     * asking whether a conversation exists and then creating one. The difference matters under
     * the edge case the specification names: two attendees composing a first message to each
     * other at the same moment. A check-then-insert has a window between the two statements in
     * which both callers see no conversation, and both create one — leaving the pair with two,
     * permanently, which is the state FR-502 exists to make impossible.
     *
     * Here the loser of the race gets a constraint violation and appends to the winner's
     * conversation instead. The database arbitrates, so there is no window to lose.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    unique('conversation_pairs_ordered_pair_key').on(table.lowerAttendeeId, table.higherAttendeeId),

    /**
     * Enforces the ordering the unique constraint above depends on — and, with no extra
     * machinery, **FR-506's refusal of a conversation with oneself**: no identifier is less
     * than itself, so a self-pair cannot satisfy this.
     *
     * Both properties from one constraint, at the last line of defence, independent of the
     * query layer that also orders the pair before inserting.
     */
    check('conversation_pairs_ordered', sql`${table.lowerAttendeeId} < ${table.higherAttendeeId}`),

    /**
     * The reverse lookup. The PK's leading column is `conversation_id`, but the question the
     * send path asks is "does a conversation already exist for this pair" — answered by the
     * unique index above — and the question deletion asks is "which pairs involve this
     * attendee", which needs `higher_attendee_id` reachable on its own.
     *
     * **Postgres does not create an index for a foreign key**, which is the finding 004's
     * review left unclaimed on its two token tables. `lower_attendee_id` leads the unique
     * index and so is already covered; `higher_attendee_id` is not.
     */
    index('conversation_pairs_higher_attendee_id_idx').on(table.higherAttendeeId),
  ],
)

/**
 * One attendee's presence in one conversation, and their own read position.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS TABLE IS THE SCOPING PREDICATE FOR THE ENTIRE FEATURE** (FR-523).
 *
 * Every authorization decision in Messages resolves to the existence of a row here. Not the
 * event, not discoverability, not co-attendance — participation, and nothing else. A caller
 * who has a row may read the conversation and its messages and may send into it; a caller who
 * does not is refused with **404 rather than 403** (FR-524), because a 403 confirms that the
 * conversation exists and a message identifier is guessable.
 *
 * `plugins/participation.ts` turns that into something a route cannot forget: the query layer
 * accepts only a branded `ConversationScope`, which only the guard can construct.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Scoping: cross-event**, with `conversations`. A participation that lapsed on event switch
 * would make the conversation unreadable at the next conference, which is precisely what
 * FR-507 forbids.
 *
 * **A participant row is private.** FR-530 forbids disclosing a read position to the other
 * participant, so no read path anywhere projects another attendee's `last_read_message_id` —
 * "seen" is deliberately not a feature of this product.
 */
export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    /**
     * **Cascade, and it is half of M3** (FR-571). When an attendee deletes their account their
     * participation disappears, which is what turns the counterpart's conversation one-sided
     * and read-only rather than leaving a thread addressed to nobody.
     */
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * The newest message this attendee has read, or null until they have read any (FR-526).
     *
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **A message identifier rather than a timestamp** (research R13). Two messages sent in the
     * same millisecond are indistinguishable to a `last_read_at`, so a reader who opened the
     * thread between them would have one silently marked read. Pointing at a row instead makes
     * the read position exact, and the unread count is then "messages after this one" over the
     * same `(sent_at DESC, id DESC)` ordering the keyset page already uses.
     *
     * **`ON DELETE SET NULL`, deliberately not cascade.** The message this points at may be the
     * departed counterpart's, and vanish under M3's `messages.author_id` cascade. That must
     * reset the pointer — not delete the participation, which would evict the surviving
     * attendee from their own conversation as a side effect of the other person leaving.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    lastReadMessageId: uuid('last_read_message_id').references((): AnyPgColumn => messages.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    /** One participation per attendee per conversation. */
    primaryKey({ columns: [table.conversationId, table.attendeeId] }),

    /**
     * The conversation-list read — "every conversation this attendee is in" — which is the
     * destination's landing query and the one behind Home's unread indicator.
     *
     * Explicit, **because Postgres does not create an index for a foreign key** and the PK's
     * leading column is `conversation_id`, so `attendee_id` is not reachable on its own without
     * this. Same finding as `conversation_pairs` above.
     */
    index('conversation_participants_attendee_id_idx').on(table.attendeeId),
  ],
)

export type Conversation = typeof conversations.$inferSelect
export type ConversationPair = typeof conversationPairs.$inferSelect
export type ConversationParticipant = typeof conversationParticipants.$inferSelect
