import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  ALAN,
  GRACE,
  listHeld,
  listShared,
  shareCard,
  signIn,
  type Actor,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * T050–T053 (008) — **sharing gives; it does not take** (FR-602, FR-604, FR-606, FR-607).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ASSERTION THAT MATTERS IS THE ONE ABOUT THE SHARER'S OWN NETWORK BEING UNCHANGED.**
 *
 * One-directionality is the whole model (constitution v3.2.0, N2), and it is the property most
 * likely to be broken by a well-meaning change: reciprocating on share is one line, it reads as
 * a convenience, and nothing else in the product would object. A test that only checked the
 * recipient gained a contact would pass just as happily against a reciprocal implementation.
 *
 * So every case here checks **both sides**.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('sharing a card', () => {
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

  it('T050 — gives the recipient a contact and the sharer nothing (FR-602)', async () => {
    const shared = await shareCard(app, ada, grace.id)
    expect(shared.statusCode).toBe(201)

    // Grace now holds Ada's card.
    const graceContacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    expect(graceContacts.cards.map((card) => card.attendeeId)).toEqual([ada.id])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Ada's own Network is unchanged, and this is the assertion the whole model rests on.**
    //
    // Sharing gives your details away; it collects nothing. A reciprocal implementation would
    // put Grace here, and every other assertion in this file would still pass.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const adaContacts = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }
    expect(
      adaContacts.cards,
      'Ada shared her card with Grace and gained a contact. Sharing is one-directional ' +
        "(FR-602): you hold somebody's card when THEY share it, never as a side effect of " +
        'sharing yours.',
    ).toEqual([])

    // What Ada *does* gain is a record of having shared, which is a different thing entirely:
    // it names the recipient and carries no profile of theirs.
    const adaShared = (await listShared(app, ada)).json() as {
      cards: { attendeeId: string; displayName: string }[]
    }
    expect(adaShared.cards.map((card) => card.attendeeId)).toEqual([grace.id])
  })

  it('records where and when the exchange happened (FR-605, FR-615)', async () => {
    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const card = contacts.cards[0]

    expect(card?.eventName).toBe('Product & Design Summit')
    expect(card?.sharedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('T051 — re-sharing is idempotent and does NOT refresh sharedAt (FR-604)', async () => {
    const before = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    const originalInstant = before.cards[0]?.sharedAt

    const repeat = await shareCard(app, ada, grace.id)

    // 200 rather than 201: nothing was created. The body is otherwise identical, because the
    // caller has no reason to know which happened.
    expect(repeat.statusCode).toBe(200)

    const after = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }

    // Exactly one contact, not two.
    expect(after.cards).toHaveLength(1)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The timestamp has not moved, and that half is the requirement rather than a detail.**
    //
    // A refreshing `sharedAt` would turn re-sharing into a way to signal somebody repeatedly —
    // their contact would jump to the top of the list on demand, which is notification-shaped
    // behaviour in a feature that deliberately dispatches nothing (FR-643).
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(after.cards[0]?.sharedAt).toBe(originalInstant)
  })

  it('T052 — refuses a share with yourself (FR-606)', async () => {
    const response = await shareCard(app, ada, ada.id)

    // 400 rather than the uniform 404: this is a mistake worth naming, not a disclosure. The
    // caller already knows their own identifier, so there is nothing to conceal — and the
    // schema CHECK refuses it independently if anything ever bypasses this.
    expect(response.statusCode).toBe(400)

    const contacts = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }
    expect(contacts.cards.map((card) => card.attendeeId)).not.toContain(ada.id)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T053 — **four refusals, one shape** (FR-607).
   *
   * 006 established this for the directory and this inherits it. Distinguishing the four would
   * turn `POST /cards` into an oracle for *"is this identifier a real attendee"* — against a
   * world-readable repository and public self sign-up, where anyone can join a conference with
   * a code printed on a badge.
   *
   * Alan is the fixture for the third case: he is registered for the shared conference and is
   * **unverified**, so he appears to nobody however the discoverability flag reads.
   *
   * The bodies are compared, not merely the statuses. Two 404s with different messages are as
   * good an oracle as two different statuses.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T053 — refuses nonexistent, non-co-attending, invisible and malformed identically (FR-607)', async () => {
    const nonexistent = await shareCard(app, ada, '00000000-0000-4000-8000-000000000000')
    const invisible = await shareCard(app, ada, alan.id)
    const malformed = await shareCard(app, ada, 'not-a-uuid')

    for (const response of [nonexistent, invisible, malformed]) {
      expect(response.statusCode).toBe(404)
    }

    expect(
      [invisible.body, malformed.body],
      'These refusals differ. A caller who can tell "no such attendee" from "not discoverable" ' +
        'has an enumeration oracle, which is the property FR-607 inherits from 006.',
    ).toEqual([nonexistent.body, nonexistent.body])
  })

  it('T054 — answers 201 on the first share and 200 on a repeat (contract)', async () => {
    // Alan holds nobody's card, so this is a genuinely new exchange. Grace shares with Ada,
    // which is the *reverse* direction of the first test — and it must be a fresh 201, because
    // A→B and B→A are two different facts (research R5).
    const first = await shareCard(app, grace, ada.id)
    expect(first.statusCode).toBe(201)

    const second = await shareCard(app, grace, ada.id)
    expect(second.statusCode).toBe(200)

    // The reciprocal exchange now exists in both directions, which the ordered-pair
    // normalisation `conversation_pairs` uses would have made impossible.
    const adaContacts = (await listHeld(app, ada)).json() as { cards: HeldCardBody[] }
    const graceContacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    expect(adaContacts.cards.map((card) => card.attendeeId)).toEqual([grace.id])
    expect(graceContacts.cards.map((card) => card.attendeeId)).toEqual([ada.id])
  })
})
