import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { conversations } from './conversations.js'

/**
 * T006 (007) — what was actually said (FR-509–FR-517, data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: CROSS-EVENT.** A message belongs to a conversation, and FR-507 makes
 * conversations permanent and independent of the active event. Scoping messages per-event
 * would mean a thread that emptied itself on switching conference — the precise failure the
 * cross-event rule exists to prevent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **This is the product's second attendee-authored free-text column**, after 005's session
 * notes, and the first one another person reads. Principle VIII's "collect only what a
 * requirement names" is why there is no `edited_at`, no `read_at`, no delivery status, no
 * attachment, no reply-to and no reaction here. None is named by a requirement.
 *
 * **`edited_at` is absent for a stronger reason than that.** FR-516 says a message cannot be
 * edited or deleted once sent, and the implementation of that requirement is an *absence* — no
 * column, no route. `tests/unit/no-message-mutation-routes.test.ts` (T050a) is what stops the
 * absence eroding, on the same reasoning `no-report-read-surface` uses for FR-548.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **THIS CASCADE IS THE WHOLE OF M3, AND IT IS THE FEATURE'S DELETION DECISION.**
     *
     * Deleting an attendee removes their messages from **every conversation they participated
     * in — including from the other person's view** (FR-570). The counterpart is left with a
     * surviving, one-sided, read-only thread containing their own messages and nothing else
     * (FR-572); nothing renders the departed attendee because nothing retains them (FR-573).
     *
     * That is a real trade and it was made deliberately: the alternative — keeping a departed
     * person's words in someone else's thread under a tombstone like "deleted user" — retains
     * both their authored content and the fact of their having been here, which is what the
     * erasure right forecloses. The cost is that the survivor's thread loses half of a
     * conversation they remember having, and `Thread.tsx` renders that honestly rather than
     * hiding it (FR-519a).
     *
     * Schema-level rather than application-level, so no future deletion path can forget it.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    authorId: uuid('author_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    body: text('body').notNull(),

    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **One constraint carrying both bounds** (research R12).
     *
     * The lower bound is **FR-512's whitespace-only refusal made structural**. The body is
     * trimmed before insert, so an all-whitespace message trims to the empty string and cannot
     * reach the table at all — "no message" has exactly one representation, and no later write
     * path can invent a blank one.
     *
     * The upper bound is 2,000 characters (FR-517, research R12), enforced here independently
     * of the route schema that also enforces it and of the composer's counter that surfaces it.
     * Principle VIII: client-side presentation of a limit is never the enforcement of it.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    check('messages_body_length', sql`length(${table.body}) BETWEEN 1 AND 2000`),

    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **The keyset page of research R6, in its easy form.**
     *
     * `sent_at` is immutable — a message is never edited (FR-516) and never moves — so this
     * cursor has **no duplicates and no omissions**. That is worth stating explicitly because
     * it is *unlike* 006's directory cursor, whose guarantee is deliberately asymmetric: a
     * relevance score can fall below the cursor between pages, so the directory permits
     * omissions and forbids duplicates. Nothing here can change rank, so nothing here can be
     * skipped.
     *
     * `id DESC` breaks ties between messages sent in the same millisecond, which is the same
     * hazard that made `last_read_message_id` a row pointer rather than a timestamp (R13).
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    index('messages_conversation_sent_at_idx').on(
      table.conversationId,
      table.sentAt.desc(),
      table.id.desc(),
    ),

    /**
     * The M3 cascade's own index. Deleting an account must find every message that attendee
     * authored, across every conversation — and **Postgres does not create an index for a
     * foreign key**, so without this each account deletion sequentially scans the whole table.
     *
     * This is exactly the finding 004's review left unclaimed on `identity_tokens`, recorded
     * in CLAUDE.md as unfixed. It is not repeated here.
     */
    index('messages_author_id_idx').on(table.authorId),
  ],
)

export type Message = typeof messages.$inferSelect
