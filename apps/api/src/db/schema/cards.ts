import { sql } from 'drizzle-orm'
import { check, index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { events } from './events.js'

/**
 * T005–T007, T012 (008) — **the exchange, not the person** (FR-602, FR-604–FR-606, FR-615,
 * data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: CROSS-EVENT.**
 *
 * The constitution makes neither rule a default that may be assumed (standing decision 7), so
 * this table states its own and does not inherit one. Decision 7 names exchanged cards among
 * the relationships that **persist across events**, and durability is not a side effect here —
 * it is the entire purpose of the feature. Constitution v3.2.0 (N1) makes the same point from
 * the other direction: a contact is somebody whose card you hold, and holding is not something
 * a conference ending can revoke.
 *
 * `event_id` is therefore **a historical fact and never a predicate**. It records *where the
 * exchange happened*, which FR-615 shows on the contact. **No query may filter contacts by the
 * active event** — doing so would reintroduce, in one `WHERE` clause, exactly the per-event
 * disappearance this scoping decision exists to prevent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ROUTES OVER THIS TABLE NAME NO CONFERENCE, WHICH MAKES THEM INVISIBLE TO THE EVENT
 * AUDIT** (research R1, FR-641).
 *
 * `tests/unit/event-scope-audit.test.ts` examines a route only if it names an event, and
 * **reports success otherwise**. Cards name none — correctly — so that audit walks straight
 * past them. That is the same hole 007 found for conversations, met a second time, and it is
 * why `plugins/card-access.ts` and `tests/unit/card-audit.test.ts` exist as a **third** branded
 * scope and a **third** route audit rather than as a widening of either existing one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **No copy of the sharer is stored** (FR-611). Name, avatar, company, role, headline and
 * interests resolve from the sharer's *current* profile at read time. A snapshot would duplicate
 * another person's personal data, outlive their own edits, and create a second source of truth
 * for one human being.
 */

/**
 * One attendee has given their card to another. **Directional**, and one row per direction.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THERE IS NO ORDERED-PAIR NORMALISATION HERE, UNLIKE `conversation_pairs`** (T007,
 * research R5, data-model.md).
 *
 * The neighbouring table normalises to `(lower, higher)` with a check constraint enforcing the
 * ordering, because **a conversation is symmetric**: A–B and B–A are the same conversation, and
 * without the ordering its unique index would permit both rows and the pair would have two
 * conversations.
 *
 * **A card is directional** (FR-602). A→B and B→A are two different, both-valid facts: each
 * person has shared with the other, and the second share is what makes an exchange *reciprocal*.
 * Copying the ordered-pair trick would therefore not be merely unnecessary — it would make a
 * reciprocal exchange **impossible**, collapsing the two facts into one and silently deciding
 * that holding somebody's card means they hold yours.
 *
 * The neighbouring table looks like a precedent and is not. `attendee_blocks` sits one file over
 * with the *same* directional treatment for its own reasons, which is why each of the three says
 * which it is and why.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Deletion**: both attendee references cascade, so either party's departure removes the row
 * for both (FR-651). Unlike 007's conversations there is deliberately **no one-sided survivor**
 * — a conversation holds the survivor's own words, which are theirs to keep, whereas a card
 * whose subject is gone has nothing left to preserve and would render as a nameless entry.
 *
 * **Export**: appears twice, as *cards you have shared* and *cards you hold* (FR-653).
 */
export const sharedCards = pgTable(
  'shared_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Whose card it is. The profile this row resolves to at read time. */
    sharerId: uuid('sharer_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /** Who holds it — the attendee whose Network lists the sharer as a contact. */
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /**
     * Where they met (FR-615).
     *
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **A historical fact, never a scoping predicate.** See the file header. No `onDelete`
     * behaviour is declared because none is wanted: an event is seeded content that is not
     * deleted in the product, and a cascade here would silently destroy contacts if one ever
     * were. If a conference is ever removed by hand, this constraint is the thing that should
     * stop it and ask a human.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),

    /**
     * When the card first moved. **Set once and never refreshed** (FR-604).
     *
     * A repeat share answers 200 with this value unchanged rather than touching it. Refreshing
     * it would turn re-sharing into a way to signal somebody repeatedly — a notification-shaped
     * behaviour in a feature that deliberately dispatches nothing (FR-643).
     */
    sharedAt: timestamp('shared_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * **FR-604's idempotency, and it is the constraint rather than a read-then-write check.**
     *
     * Sharing twice cannot create a second row, so a double-tap on a slow connection is the
     * same request twice rather than a state the read path has to de-duplicate. The insert is
     * `ON CONFLICT DO NOTHING` and the existing row is returned, which is what keeps `shared_at`
     * intact without anybody having to remember not to update it.
     *
     * **Directional by construction**: `(sharer, recipient)` in that order, unnormalised. See
     * the docblock above for why normalising would be a bug rather than a tidy-up.
     */
    unique('shared_cards_sharer_recipient_unique').on(table.sharerId, table.recipientId),

    /**
     * FR-606 — you cannot share your card with yourself, enforced **in the schema** and not only
     * in the route.
     *
     * The route refuses it with a 400 for a better message; this is the last line of defence,
     * independent of the route, precisely in case a second write path ever appears. `profiles`
     * and `session_notes` set that precedent and the argument is unchanged.
     */
    check('shared_cards_not_self', sql`${table.sharerId} <> ${table.recipientId}`),

    /**
     * The contacts list — "whose cards do I hold" — which is the destination's landing query.
     *
     * Explicit, **because Postgres does not create an index for a foreign key**. That is the
     * finding 004's review left unclaimed on its two token tables, and 007 recorded it twice
     * more; it is not re-learned here.
     */
    index('shared_cards_recipient_id_idx').on(table.recipientId),

    /**
     * The reverse direction, for two readers: `GET /cards/shared`, and the deletion cascade,
     * which asks "which rows name this attendee as sharer" on every account deletion.
     */
    index('shared_cards_sharer_id_idx').on(table.sharerId),
  ],
)

export type SharedCard = typeof sharedCards.$inferSelect
