import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'

/**
 * T007 (007) — one attendee's refusal of contact from another (FR-535–FR-541a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: CROSS-EVENT.**
 *
 * The contact being refused is itself cross-event — conversations persist across conferences
 * (FR-507) and anyone sharing *any* event can open one (FR-504). So a block that lapsed on
 * event switch would not be a block: the attendee would be reachable again at the next
 * conference by the person they had refused, which is the state the feature exists to end.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **This table is why open send is shippable.** 007 lets anyone sharing an event message
 * anyone else with no request and no acceptance step, and once open a conversation stays open
 * forever. That combination creates a contact path the recipient cannot otherwise close, in a
 * product with public self sign-up and no moderator by construction. Blocking is the close.
 */
export const attendeeBlocks = pgTable(
  'attendee_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **DIRECTIONAL, AND DELIBERATELY *NOT* ORDERED LIKE `conversation_pairs`.**
     *
     * The neighbouring table orders its pair so that A–B and B–A are the same row. Doing that
     * here would be a bug, and a serious one: A blocking B and B blocking A are two independent
     * facts (FR-540), and collapsing them into one row would mean **unblocking one releases
     * both** — so an attendee who relented would silently restore the other person's block
     * against them, re-opening a channel that person had closed.
     *
     * The two tables sit next to each other with opposite treatments of the same shape, which
     * is exactly why each says which it is and why.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    primaryKey({ columns: [table.blockerId, table.blockedId] }),

    /**
     * **The composite primary key is also FR-535's idempotency.** Blocking twice cannot create
     * a second row, so a double-tap on a slow connection is the same request twice rather than
     * a state the unblock path has to know how to unwind.
     */
    check('attendee_blocks_not_self', sql`${table.blockerId} <> ${table.blockedId}`),

    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **The send path asks the reverse question, on every single message.**
     *
     * Not "who have I blocked" — which the PK's leading `blocker_id` answers — but *"does the
     * recipient block me?"* (FR-536). That reads `blocked_id` first, and **Postgres does not
     * create an index for a foreign key**, so without this every message send scans the table.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    index('attendee_blocks_blocked_id_idx').on(table.blockedId),
  ],
)

export type AttendeeBlock = typeof attendeeBlocks.$inferSelect
