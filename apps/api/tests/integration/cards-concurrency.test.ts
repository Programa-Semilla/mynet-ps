import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { clearThrottle, resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  GRACE,
  listHeld,
  shareCard,
  signIn,
  type Actor,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * **BOTH ATTENDEES SHARE WITH EACH OTHER AT THE SAME MOMENT** (spec edge case, FR-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS DEADLOCKED, AND THE SPECIFICATION NAMES THE CASE IT BROKE.**
 *
 * The edge case is written down: *"Both attendees share a card with each other at the same
 * moment. The result is one relationship in each direction, not duplicates, and **neither share
 * fails**."* The first implementation of mutual exchange failed it, and no other test could see
 * it because every other test shares from one side at a time.
 *
 * **The mechanism.** Each insert takes a lock on its own key in the `(sharer_id, recipient_id)`
 * unique index. Writing the rows in the *caller's* order means A's transaction takes `(A,B)` and
 * then waits for `(B,A)`, while B's takes `(B,A)` and then waits for `(A,B)` — a cycle.
 * PostgreSQL detects it and aborts one transaction with **40P01**, so one attendee's perfectly
 * ordinary share answers 500.
 *
 * `shareCard` now sorts the pair before writing, so both transactions acquire the same two locks
 * in the same order and the second waits rather than deadlocking.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This needs a real database and cannot be demonstrated any other way.** Lock ordering is a
 * property of the storage engine; a double, a mock or a single-threaded happy path all report
 * success against the broken version. It is the same reasoning `cards-atomicity.test.ts`
 * records for inducing its failure with a trigger rather than a stub.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('two attendees sharing with each other at the same moment', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)
  })

  beforeEach(async () => {
    await getDb().execute(sql`DELETE FROM shared_cards`)
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const heldBy = async (actor: Actor): Promise<string[]> => {
    const body = (await listHeld(app, actor)).json() as { cards: HeldCardBody[] }
    return body.cards.map((card) => card.attendeeId)
  }

  it('completes both shares, with neither failing (FR-1025)', async () => {
    // Issued together rather than in sequence. Both transactions are open at once, which is the
    // only arrangement in which the lock cycle can form.
    const [oneWay, theOther] = await Promise.all([
      shareCard(app, ada, grace.id),
      shareCard(app, grace, ada.id),
    ])

    for (const response of [oneWay, theOther]) {
      expect(
        response.statusCode,
        `A simultaneous mutual share failed with ${response.statusCode}. A 500 here is the ` +
          'deadlock: two transactions took the same two unique-index keys in opposite orders. ' +
          'The specification requires neither share to fail.',
      ).toBeLessThan(500)
    }

    // One relationship in each direction, not duplicates.
    expect(await heldBy(ada)).toEqual([grace.id])
    expect(await heldBy(grace)).toEqual([ada.id])
  })

  it('writes exactly two rows however the race resolves', async () => {
    await Promise.all([shareCard(app, ada, grace.id), shareCard(app, grace, ada.id)])

    const rows = await getDb().execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM shared_cards`,
    )

    expect(
      rows[0]?.count,
      'Two simultaneous shares produced something other than the two rows of one exchange.',
    ).toBe(2)
  })

  it('survives repeated simultaneous attempts, which is where a lock cycle shows up', async () => {
    // A deadlock is timing-dependent, so one attempt passing proves less than several do. Each
    // round starts from an empty table so every attempt is a genuine first exchange rather than
    // an `ON CONFLICT` no-op that never takes a second lock.
    for (let round = 0; round < 5; round += 1) {
      await getDb().execute(sql`DELETE FROM shared_cards`)
      await clearThrottle()

      const outcomes = await Promise.all([
        shareCard(app, ada, grace.id),
        shareCard(app, grace, ada.id),
      ])

      for (const response of outcomes) {
        expect(
          response.statusCode,
          `round ${round} failed with ${response.statusCode}`,
        ).toBeLessThan(500)
      }
    }
  })
})
