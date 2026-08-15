import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  ALAN,
  eventIdNamed,
  GRACE,
  GRACE_ONLY_EVENT,
  listHeld,
  listShared,
  shareCard,
  SHARED_EVENT,
  signIn,
  switchTo,
  type Actor,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * T031, T033a (016) — **one act, two cards** (FR-1021, FR-1023, FR-1024, FR-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE ASSERTED THE OPPOSITE UNTIL 016, AND THE INVERSION IS RATIFIED RATHER THAN
 * PREFERRED.**
 *
 * From 008 until now its header read *"sharing gives; it does not take"*, and its central case
 * asserted that the sharer's own Network was **unchanged** — describing that as "the property
 * most likely to be broken by a well-meaning change" and warning that reciprocating on share
 * "is one line, reads as a convenience, and nothing else in the product would object."
 *
 * Constitution **v5.0.0 (C1)** is that objection, and it is an amendment rather than a
 * convenience: it retracts v3.2.0 (N2) and the sentence *"nothing about a person may become
 * durable without that person's own act."* The client asked for it independently (REQ-046) and
 * the owner ratified it before any code changed.
 *
 * **The old test was right to be emphatic and is not being weakened — it is being reversed.**
 * So every case here still checks **both sides**; what changed is which answer is correct.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The ground C1 was argued from is NOT the physical-card metaphor**, which was equally
 * available to N2 and cannot therefore be what unmakes it. It is that a card resolves only what
 * its owner had already published to co-attendees under decision 16's single visibility
 * decision — so the exchange moves *when* those fields are seen, not *whether*. That is why
 * FR-1053's discoverability guard is load-bearing and has its own file, `cards-guard.test.ts`.
 */
describe('exchanging cards', () => {
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

  afterAll(async () => {
    await teardown(app)
  })

  const heldBy = async (actor: Actor): Promise<string[]> => {
    const body = (await listHeld(app, actor)).json() as { cards: HeldCardBody[] }
    return body.cards.map((card) => card.attendeeId)
  }

  it('T031 — gives BOTH parties the other’s card, with the recipient doing nothing (FR-1021, FR-1023)', async () => {
    const shared = await shareCard(app, ada, grace.id)
    expect(shared.statusCode).toBe(201)

    // The recipient's half, which was true before 016 too.
    expect(await heldBy(grace)).toEqual([ada.id])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The sharer's half, which is the reversal.**
    //
    // Grace has not signed in since, has not been asked, and has taken no action of any kind —
    // FR-1023 forbids requiring one, and there is no pending state for her to resolve. A
    // one-directional implementation would leave this empty, and every other assertion in this
    // file would still pass, which is why it is stated as its own case with its own message.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(
      await heldBy(ada),
      'Ada shared with Grace, so Ada must now hold Grace’s card as well (FR-1021). Under the ' +
        'model this replaced, sharing collected nothing and this list was empty.',
    ).toEqual([grace.id])
  })

  it('records where and when the exchange happened (FR-605, FR-615)', async () => {
    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const card = contacts.cards[0]

    expect(card?.eventName).toBe('Product & Design Summit')
    expect(card?.sharedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('T033a — carries the SAME conference on both records (FR-1024)', async () => {
    const graceCards = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const adaCards = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }

    expect(
      adaCards.cards[0]?.eventId,
      'Both records arise from one act at one place, so the reciprocal row records the ' +
        'originating conference rather than being re-derived from the recipient’s own ' +
        'registrations.',
    ).toBe(graceCards.cards[0]?.eventId)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T033a's second half — **recorded by the conference, never scoped by it** (FR-1024).
   *
   * Standing decision 7 forbids assuming either scoping rule, so this is asserted rather than
   * inherited from the fact that cards were cross-event before. `event_id` is a historical
   * fact; a query that filtered contacts by the active conference would reintroduce, in one
   * `WHERE` clause, exactly the per-event disappearance the scoping decision exists to prevent.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T033a — both records still resolve after switching to another conference (FR-1024)', async () => {
    const elsewhere = await eventIdNamed(app, grace, GRACE_ONLY_EVENT)
    expect(elsewhere, `no conference named ${GRACE_ONLY_EVENT}`).toBeTruthy()

    await switchTo(app, grace, elsewhere)

    try {
      expect(
        await heldBy(grace),
        'A held card resolves at a conference the sharer has never attended (FR-614, FR-1024). ' +
          'Ada is not registered for this one, and Grace still holds her card.',
      ).toEqual([ada.id])
    } finally {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **RESTORED WHATEVER HAPPENS, AND THE OMISSION WAS A REAL DEFECT** (review finding T4).
      //
      // A share is recorded at the **sharer's** active conference and FR-1053 requires the
      // recipient registered there. Leaving Grace at a conference Ada does not attend therefore
      // silently disarmed the next case: Grace's reverse share was **refused by the guard**, the
      // insert loop never ran, and its 200 came from the read-back finding the pre-existing row.
      // It asserted idempotency while exercising the refusal path — green against a `recordCard`
      // that had lost its `ON CONFLICT DO NOTHING`.
      //
      // `cards-guard.test.ts` already restores in a `finally` for the same reason. A conference
      // switch is process-wide state, so it belongs to the case that made it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await switchTo(app, grace, await eventIdNamed(app, grace, SHARED_EVENT))
    }
  })

  it('T031 — re-sharing creates no duplicate and does NOT refresh sharedAt (FR-1025)', async () => {
    const before = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const originalInstant = before.cards[0]?.sharedAt

    const repeat = await shareCard(app, ada, grace.id)

    // 200 rather than 201: nothing was created. The body is otherwise identical, because the
    // caller has no reason to know which happened.
    expect(repeat.statusCode).toBe(200)

    const after = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const adaAfter = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }

    // Exactly one contact on each side, not two.
    expect(after.cards).toHaveLength(1)
    expect(adaAfter.cards).toHaveLength(1)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The timestamp has not moved, and that half is the requirement rather than a detail.**
    //
    // A refreshing `sharedAt` would turn re-sharing into a way to signal somebody repeatedly —
    // their contact would jump to the top of the list on demand, which is notification-shaped
    // behaviour in a feature that deliberately dispatches nothing (FR-1029).
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(after.cards[0]?.sharedAt).toBe(originalInstant)
  })

  it('T031 — a share in the reverse direction is idempotent too, not a second exchange (FR-1025)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **THIS IS THE ONLY CASE THAT EXERCISES `ON CONFLICT DO NOTHING` ON THE *RECIPROCAL*
    // WRITE, WHICH IS WHY ITS PRECONDITIONS ARE ASSERTED** (review finding T4).
    //
    // Grace shares back, having already been given Ada's card by Ada's own act. Both rows exist,
    // so both inserts must land on the conflict clause and affect nothing. For that to be what
    // happens, FR-1053's guard has to **pass**: Grace's active conference must be the one Ada is
    // registered for. When it was not, this case still answered 200 — from the read-back — while
    // the insert loop was skipped entirely, so a reciprocal write that had lost its conflict
    // clause would have raised a unique violation nowhere near this test.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const before = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const adaBefore = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }
    expect(
      before.cards[0]?.eventId,
      'Grace is not at the conference this exchange was recorded at, so the guard will refuse ' +
        'and the insert loop will not run — the preceding case must restore her active ' +
        'conference before this one can mean anything.',
    ).toBe(await eventIdNamed(app, grace, SHARED_EVENT))

    const back = await shareCard(app, grace, ada.id)
    expect(back.statusCode).toBe(200)

    expect(await heldBy(ada)).toEqual([grace.id])
    expect(await heldBy(grace)).toEqual([ada.id])

    // Two rows in total, still — one per direction. A reciprocal insert without
    // `ON CONFLICT (sharer_id, recipient_id) DO NOTHING` cannot reach here at all: it raises a
    // unique violation inside the transaction and the request answers 500.
    const rows = await getDb().execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM shared_cards`,
    )
    expect(rows[0]?.count, 'A reverse share duplicated the pair rather than absorbing.').toBe(2)

    // And neither timestamp moved — FR-1025's second half, from the other direction. `DO NOTHING`
    // leaves `shared_at` alone; an `ON CONFLICT … DO UPDATE` "fix" would pass every assertion
    // above and fail here.
    const after = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const adaAfter = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }
    expect(after.cards[0]?.sharedAt).toBe(before.cards[0]?.sharedAt)
    expect(adaAfter.cards[0]?.sharedAt).toBe(adaBefore.cards[0]?.sharedAt)
  })

  it('refuses a share with yourself (FR-606)', async () => {
    const response = await shareCard(app, ada, ada.id)

    // 400 rather than the uniform 404: this is a mistake worth naming, not a disclosure. The
    // caller already knows their own identifier, so there is nothing to conceal — and the
    // schema CHECK refuses it independently if anything ever bypasses this.
    expect(response.statusCode).toBe(400)

    expect(await heldBy(ada)).not.toContain(ada.id)
  })

  it('T041 — “cards you have shared” now answers “people who hold your card” (FR-1051)', async () => {
    const adaShared = (await listShared(app, ada)).json() as {
      cards: { attendeeId: string; displayName: string }[]
    }

    expect(
      adaShared.cards.map((card) => card.attendeeId),
      'The query is unchanged and still returns rows where the reader is the sharer. What ' +
        'changed is what that means: under mutual exchange these are people who hold Ada’s ' +
        'card, some of whom obtained it by sharing first rather than by Ada choosing to give it.',
    ).toEqual([grace.id])
  })

  it('leaves an attendee nobody has exchanged with holding nothing', async () => {
    expect(
      await heldBy(alan),
      'Mutual exchange must not become "everybody at the conference holds everybody’s card". ' +
        'Alan took part in no exchange, so he holds none and appears in nobody’s contacts.',
    ).toEqual([])
  })
})
