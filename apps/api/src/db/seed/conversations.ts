import { sql } from 'drizzle-orm'

import { conversations } from '../schema/conversations.js'
import type { SeedContext, SeedModule } from './index.js'

/**
 * T144 (007) — one seeded conversation, so the destination is not empty on a fresh clone.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FIRST TIME THIS PRODUCT SEEDS ATTENDEE-AUTHORED CONTENT, AND THE PRECEDENT IT
 * BREAKS WAS SET DELIBERATELY.**
 *
 * 005 seeded nothing attendee-authored and `schema/agenda.ts` records why: fabricating data
 * attributed to a real identity is wrong, and leaving it empty means **the empty states are what
 * a reviewer sees first** — the states most likely to be skipped are the ones on screen at first
 * run.
 *
 * Both halves of that still hold, and this is reconcilable with them rather than an exception to
 * them:
 *
 *   - The two accounts are **fixtures, not people**. 004 already crossed the "attributed to a
 *     real identity" line when it seeded profiles for them (FR-342), on exactly this reasoning.
 *   - **The empty states are still reachable at first run**, and that is why this seeds *one*
 *     conversation rather than several. Alan has none, so a reviewer signing in as him sees the
 *     empty destination; the block list, the closed thread and the no-matches states are all
 *     still empty for everybody.
 *
 * The alternative was a destination whose only demonstrable state is "no conversations yet",
 * which is the mirror of the problem 005 was avoiding — and 006 made the same call for the
 * directory.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Written with raw statements rather than through the route layer**, because a seed must not
 * depend on HTTP being up — and because the ordered-pair invariant is the *database's* to
 * enforce, so exercising it here is a small daily proof that the constraint works.
 *
 * **Unread on one side and read on the other**, deliberately: it is the only fixture that makes
 * Home's indicator (FR-531) and the list's marker visible at first run, and both are states a
 * reviewer would otherwise have to construct by hand with two browser profiles.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Who talks to whom. Ada and Grace share `Product & Design Summit`, which is what FR-504 needs. */
const BETWEEN = ['ada@example.com', 'grace@example.com'] as const

/**
 * The exchange, oldest first. Short, ordinary, and about the conference — a seed is also a
 * writing sample for everybody who reads it, and filler text reads as a product nobody finished.
 */
const EXCHANGE: readonly { from: string; body: string }[] = [
  {
    from: 'grace@example.com',
    body: 'Enjoyed your talk on documentation as an interface — the bit about error messages especially.',
  },
  {
    from: 'ada@example.com',
    body: 'Thank you! That section nearly did not make it in. Are you around tomorrow afternoon?',
  },
  {
    from: 'grace@example.com',
    body: 'I am, after the platform engineering session. Coffee somewhere near the main hall?',
  },
]

export const conversationSeed: SeedModule = {
  name: 'conversations',

  async clear(db) {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `conversations` is cleared explicitly because **nothing cascades to it** — it holds no
    // attendee foreign key at all, which is research R10's whole point. Deleting it takes the
    // pair, the participants and the messages with it, so those need no lines here.
    //
    // This is the same exception `tests/integration/helpers.ts` records, and it cost a flaky
    // suite to find: orphaned conversations accumulated one per reset until it was added.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await db.delete(conversations)
  },

  async run(db, context: SeedContext) {
    const [first, second] = BETWEEN.map((email) => {
      const id = context.attendeeIds.get(email)
      // A typo above would otherwise insert nothing and leave a silently under-populated
      // fixture, which shows up much later as a test passing for the wrong reason.
      if (!id) throw new Error(`Seed: no attendee "${email}" — check attendees.ts`)
      return id
    }) as [string, string]

    const [lower, higher] = [first, second].sort()

    const created = await db.execute<{ id: string }>(sql`
      INSERT INTO conversations DEFAULT VALUES RETURNING id
    `)
    const conversationId = created[0]?.id
    if (!conversationId) throw new Error('Seed: conversation insert returned no row')

    // Ordered, because the CHECK constraint requires it — and because ordering is what makes
    // FR-502's uniqueness direction-independent.
    await db.execute(sql`
      INSERT INTO conversation_pairs (conversation_id, lower_attendee_id, higher_attendee_id)
      VALUES (${conversationId}::uuid, ${lower}::uuid, ${higher}::uuid)
    `)

    await db.execute(sql`
      INSERT INTO conversation_participants (conversation_id, attendee_id)
      VALUES (${conversationId}::uuid, ${lower}::uuid), (${conversationId}::uuid, ${higher}::uuid)
    `)

    const written: { id: string; author: string }[] = []

    for (const [index, message] of EXCHANGE.entries()) {
      const authorId = context.attendeeIds.get(message.from)
      if (!authorId) throw new Error(`Seed: no attendee "${message.from}"`)

      // Spaced a minute apart, ascending, so the thread reads as a conversation rather than as
      // three simultaneous messages — and so the keyset ordering has something real to order.
      const rows = await db.execute<{ id: string }>(sql`
        INSERT INTO messages (conversation_id, author_id, body, sent_at)
        VALUES (
          ${conversationId}::uuid,
          ${authorId}::uuid,
          ${message.body},
          now() - make_interval(mins => ${EXCHANGE.length - index})
        )
        RETURNING id
      `)
      const id = rows[0]?.id
      if (!id) throw new Error('Seed: message insert returned no row')
      written.push({ id, author: authorId })
    }

    const last = written[written.length - 1]
    if (!last) throw new Error('Seed: the exchange is empty')

    await db.execute(sql`
      UPDATE conversations SET last_message_at = (
        SELECT sent_at FROM messages WHERE id = ${last.id}::uuid
      ) WHERE id = ${conversationId}::uuid
    `)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Read for the last speaker, unread for the other.** Grace wrote the last message, so it
    // is unread for Ada — which is what puts Home's indicator (FR-531) and the list's marker on
    // screen at first run rather than leaving both states unreachable without two browser
    // profiles and a stopwatch.
    //
    // Grace's own position is advanced to her own message, because a sender has read what they
    // wrote — and because leaving it null would make the conversation read as unread for her
    // too, which is the FR-529 failure this feature exists to avoid.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE conversation_participants
      SET last_read_message_id = ${last.id}::uuid
      WHERE conversation_id = ${conversationId}::uuid AND attendee_id = ${last.author}::uuid
    `)
  },
}
