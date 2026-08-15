import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterEach, afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendees, clearThrottle, resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  ADA_ONLY_EVENT,
  ALAN,
  eventIdNamed,
  GRACE,
  listHeld,
  shareCard,
  SHARED_EVENT,
  signIn,
  switchTo,
  type Actor,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * T033 (016) — **the condition that keeps C1's licence true** (FR-1053, FR-1028).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS GUARD IS LOAD-BEARING FOR THE AMENDMENT, NOT CONVENTION INHERITED FROM THE OLD MODEL.**
 *
 * Constitution v5.0.0 (C1) permits taking somebody's card without asking them on exactly one
 * ground: **a card resolves only what its owner already published to co-attendees** under
 * decision 16's single visibility decision. The exchange therefore moves *when* those fields are
 * seen, not *whether*.
 *
 * Against a recipient who is **not discoverable that ground does not exist.** They published
 * nothing, so an exchange would disclose something discoverability had not already disclosed —
 * which is the thing C1 was argued to *not* do. Removing this condition would need another
 * amendment rather than a change of mind, and that is why it has a file of its own instead of
 * being a case inside `cards-share.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **AND WHEN IT REFUSES, NEITHER RECORD IS WRITTEN** (FR-1053's second half).
 *
 * A guard that stopped the forward row while letting the reciprocal one through would hand the
 * sharer a contact they were not entitled to — the exact disclosure the condition exists to
 * prevent, arriving from the other direction. The guard is evaluated **once** and governs both
 * inserts; `cards-atomicity.test.ts` covers the case where a write fails after it passed.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('a mutual exchange is refused where the recipient is not reachable (FR-1053)', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor
  let alan: Actor

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)
    alan = await signIn(app, ALAN)
  })

  afterEach(async () => {
    // Put Grace back to discoverable and clear any exchange, so each case starts from the same
    // place regardless of which ones ran.
    await getDb().update(attendees).set({ discoverable: true }).where(eq(attendees.id, grace.id))
    await getDb().execute(sql`DELETE FROM shared_cards`)

    // And the throttle counter with them. `card_share` counts **every** request rather than only
    // refused ones — which is the point of it — and this file is nothing but refused requests
    // against one identifier. Without this, a case added at the bottom would eventually meet a
    // 429 and fail for a reason unrelated to what it asserts.
    await clearThrottle()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const heldBy = async (actor: Actor): Promise<string[]> => {
    const body = (await listHeld(app, actor)).json() as { cards: HeldCardBody[] }
    return body.cards.map((card) => card.attendeeId)
  }

  const cardRowCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM shared_cards`,
    )
    return rows[0]?.count ?? 0
  }

  it('refuses where the recipient is not discoverable, and writes NEITHER record', async () => {
    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, grace.id))

    const response = await shareCard(app, ada, grace.id)
    expect(response.statusCode).toBe(404)

    expect(
      await cardRowCount(),
      'A refused exchange must write nothing at all. One row would be worse than two: it would ' +
        'give the sharer a contact whose owner published nothing to them, which is precisely ' +
        'the disclosure FR-1053 exists to prevent.',
    ).toBe(0)

    expect(await heldBy(ada)).toEqual([])
    expect(await heldBy(grace)).toEqual([])
  })

  it('refuses where the recipient has not verified their address, and writes NEITHER record', async () => {
    const response = await shareCard(app, ada, alan.id)
    expect(response.statusCode).toBe(404)
    expect(await cardRowCount()).toBe(0)
  })

  /**
   * The guard requires **both** attendees registered for the conference the share is issued
   * against, which is the sharer's active one. The seed has three attendees and no fourth who
   * shares nothing with Ada, so the fixture is built from the *conference* side instead: Ada
   * switches to a conference of her own, where Grace — discoverable and verified throughout — is
   * simply not present.
   *
   * That is a better fixture than a stranger would have been. It isolates the registration
   * condition from the other two, since nothing about Grace changes.
   *
   * **This case owns the "writes NEITHER record" half only.** Its *body* is compared against the
   * other four refusals in the FR-1028 case below, which is where it belongs and where it was
   * missing (review finding T-m8) — asserting a status here and nothing else is what let it be
   * the one refusal held to the weaker standard.
   */
  it('refuses where the recipient is not registered for the conference', async () => {
    const adaOnly = await eventIdNamed(app, ada, ADA_ONLY_EVENT)
    await switchTo(app, ada, adaOnly)

    try {
      const response = await shareCard(app, ada, grace.id)
      expect(response.statusCode).toBe(404)
      expect(await cardRowCount()).toBe(0)
    } finally {
      // Restored whatever happens, because every later case shares against the common conference.
      await switchTo(app, ada, await eventIdNamed(app, ada, SHARED_EVENT))
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FIVE REFUSALS, ONE SHAPE** (FR-1028).
   *
   * 006 established this for the directory and cards inherited it. Distinguishing them would
   * turn `POST /cards` into an oracle for *"is this identifier a real attendee"* — against a
   * world-readable repository and public self sign-up, where anyone can join a conference with
   * a code printed on a badge.
   *
   * **The bodies are compared, not merely the statuses.** Two 404s with different messages are
   * as good an oracle as two different statuses, and that is the failure mode this shape of
   * assertion exists to catch.
   *
   * **And all five are in the comparison, which they were not** (review finding T-m8). The
   * not-registered case used to be asserted a few lines above on its **status alone**, so the
   * header's claim was true of four of the five it named — and the one held to the weaker
   * standard was the one whose refusal comes from a different branch of the guard than the other
   * two conditions. Nothing else in this file would have noticed it acquiring a message of its
   * own. It is built here rather than reused from that case because it needs the conference
   * switched *and* restored around one request.
   *
   * Self-share is deliberately **excluded** from the comparison and asserted separately: it is
   * the one refusal that carries a reason, because the caller already knows their own identifier
   * and there is nothing to conceal. That is the "differ only where a reason is deliberately
   * given" half of the requirement.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('makes all five reachability refusals indistinguishable from each other (FR-1028)', async () => {
    // The throttle counts every request including refused ones, and this case issues five in a
    // row against one identifier — past `card_share`'s free allowance. A 429 among them would be
    // a sixth shape, and it would fail this test for a reason that has nothing to do with
    // indistinguishability, so the counter is cleared before each.
    const refusalOf = async (attendeeId: string) => {
      await clearThrottle()
      return shareCard(app, ada, attendeeId)
    }

    // Taken first, while Grace is still discoverable and verified: the conference condition on
    // its own. Ada moves to a conference of her own where Grace simply is not present, so nothing
    // about Grace changes and this isolates the registration join from the other two conditions.
    // Restored in a `finally`, because every refusal after it needs the shared conference back.
    const refusalFromAnotherConference = async () => {
      await switchTo(app, ada, await eventIdNamed(app, ada, ADA_ONLY_EVENT))
      try {
        return await refusalOf(grace.id)
      } finally {
        await switchTo(app, ada, await eventIdNamed(app, ada, SHARED_EVENT))
      }
    }

    const notRegistered = await refusalFromAnotherConference()

    await getDb().update(attendees).set({ discoverable: false }).where(eq(attendees.id, grace.id))

    const undiscoverable = await refusalOf(grace.id)
    const unverified = await refusalOf(alan.id)
    const nonexistent = await refusalOf('00000000-0000-4000-8000-000000000000')
    const malformed = await refusalOf('not-a-uuid')

    const refusals = [notRegistered, undiscoverable, unverified, nonexistent, malformed]

    for (const response of refusals) {
      expect(response.statusCode).toBe(404)
    }

    expect(
      refusals.map((response) => response.body),
      'These refusals differ. A caller who can tell "not discoverable" from "no such attendee" ' +
        'has an enumeration oracle, and under mutual exchange it is worse than it was: the same ' +
        'request now also reveals whether a *successful* call would have handed them a contact.',
    ).toEqual(refusals.map(() => nonexistent.body))
  })

  it('gives the self-share its own answer, which is the one refusal that carries a reason', async () => {
    const response = await shareCard(app, ada, ada.id)

    expect(
      response.statusCode,
      'Distinct from the uniform 404 on purpose: the caller already knows their own identifier, ' +
        'so naming the mistake discloses nothing and hiding it would only be confusing.',
    ).toBe(400)
  })

  it('permits the exchange as soon as the recipient is discoverable again', async () => {
    const response = await shareCard(app, ada, grace.id)

    expect(response.statusCode).toBe(201)
    expect(await heldBy(ada)).toEqual([grace.id])
    expect(await heldBy(grace)).toEqual([ada.id])
  })
})
