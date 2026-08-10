import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { clearThrottle, cookieHeader, resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  block,
  eventIdNamed,
  GRACE,
  propose,
  shareCard,
  SHARED_EVENT,
  signIn,
  slotsFor,
  unblock,
  type Actor,
} from './network-fixtures.js'

/**
 * T073–T077 (008) — **availability, and the two privacy properties that read alike and guard
 * opposite failures** (FR-625–FR-629, FR-637, SC-605, SC-608a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T074 AND T075 MUST STAY SEPARATE. THEY LOOK LIKE THE SAME TEST AND THEY ARE NOT.**
 *
 * Both compare an offered set before and after somebody else does something, and both expect it
 * unchanged. What differs is *whose failure they catch*:
 *
 *   - **T074 (SC-605) is the disclosure property.** If the invitee's saved sessions changed the
 *     reader's options, the reader could **learn** the invitee's schedule from which options
 *     vanished — a Principle VIII leak *by omission*, forbidden outright by constitution v3.2.0
 *     (N2). The victim is the invitee's privacy.
 *
 *   - **T075 (SC-608a) is the anti-griefing property.** If a *received* proposal consumed a
 *     slot, anyone could **destroy** a stranger's whole day by proposing into every slot of it.
 *     The victim is the invitee's availability.
 *
 * A single merged test would pass while one of the two failed, because a change that fixes one
 * can break the other: excluding the invitee's commitments closes nothing and opens the leak;
 * excluding received proposals looks like tidy double-book prevention and opens the griefing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('slots the reader may offer', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor
  let eventId: string

  const slotIdsFor = async (actor: Actor, withId: string): Promise<string[]> => {
    const response = await slotsFor(app, actor, eventId, withId)
    expect(response.statusCode).toBe(200)
    return (response.json() as { slots: { slotId: string }[] }).slots.map((slot) => slot.slotId)
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)
    eventId = await eventIdNamed(app, ada, SHARED_EVENT)

    // The exchange that makes them contacts. Not required by the server to propose — holding a
    // card is a client-side affordance — but it is the real journey, and it keeps this fixture
    // honest about how somebody actually arrives at the scheduling dialog.
    await shareCard(app, ada, grace.id)
    await shareCard(app, grace, ada.id)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('offers the seeded grid for this conference', async () => {
    const slots = await slotIdsFor(ada, grace.id)

    // A gate that cannot fail is not a gate: every assertion below compares sets, and an empty
    // grid would satisfy all of them while checking nothing.
    expect(
      slots.length,
      'No slots were offered at all. Every comparison in this file would then be trivially ' +
        'true — check that migration 0007 was applied and the seed re-run (quickstart.md).',
    ).toBeGreaterThan(0)
  })

  /**
   * T073 — the reader's own commitments are subtracted (FR-625).
   *
   * Saving a session that overlaps a slot removes exactly that slot. Overlap rather than
   * equality is what is being checked: the seeded programme does not start on slot boundaries,
   * so a query comparing start times alone would leave the slot on offer.
   */
  it('T073 — excludes slots overlapping the READER’s own saved sessions (FR-625)', async () => {
    const before = await slotIdsFor(ada, grace.id)

    const sessions = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(ada.cookie) },
    })
    const programme = sessions.json() as { id: string; startsAt: string; endsAt: string }[]

    // The slot grid is future-relative and the seeded conferences are in the future, so every
    // session here is a candidate. Save them all: at least one must overlap a 30-minute slot.
    for (const session of programme) {
      await app.inject({
        method: 'PUT',
        url: `/events/${eventId}/agenda/saved/${session.id}`,
        headers: { cookie: cookieHeader(ada.cookie) },
      })
    }

    const after = await slotIdsFor(ada, grace.id)

    expect(
      after.length,
      'Saving the whole programme removed no slots. Availability must subtract slots ' +
        "overlapping the reader's own saved sessions (FR-625) — and the comparison is an " +
        'OVERLAP, not an equal start time.',
    ).toBeLessThan(before.length)

    // Undone, so the rest of this file starts from the full grid.
    for (const session of programme) {
      await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/agenda/saved/${session.id}`,
        headers: { cookie: cookieHeader(ada.cookie) },
      })
    }
  })

  it('T073 — excludes slots the reader has already claimed with a pending proposal (FR-625)', async () => {
    const before = await slotIdsFor(ada, grace.id)
    const claimed = before[0] as string

    await clearThrottle()
    const proposed = await propose(app, ada, eventId, {
      inviteeId: grace.id,
      slotId: claimed,
      topic: 'A slot Ada has now claimed.',
    })
    expect(proposed.statusCode).toBe(201)

    const after = await slotIdsFor(ada, grace.id)
    expect(after).not.toContain(claimed)
    expect(after.length).toBe(before.length - 1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T074 — **SC-605: the disclosure property.**
   *
   * Grace saves sessions across the whole programme. Ada's offered set must be **identical**,
   * element for element and in the same order — not merely the same length, because a set that
   * swapped one slot for another would be just as much of a disclosure.
   *
   * If this fails, the reader can infer the invitee's Agenda from which options disappeared.
   * Nobody typed that anywhere; it would be inferred from an absence, which is exactly what
   * makes it a leak *by omission*.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T074 — SC-605: the offered set is IDENTICAL regardless of the invitee’s saved sessions (FR-626)', async () => {
    const before = await slotIdsFor(ada, grace.id)

    const sessions = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(grace.cookie) },
    })
    const programme = sessions.json() as { id: string }[]

    // **A gate that cannot fail is not a gate**, and this file says so in its first test. Without
    // this, an empty programme would skip the loop entirely and the assertion below would compare
    // two unchanged sets — passing while proving nothing about the property it names.
    expect(
      programme.length,
      'The seeded programme is empty, so nothing about the invitee changed and T074 would ' +
        'compare an unchanged set with itself.',
    ).toBeGreaterThan(0)

    for (const session of programme) {
      await app.inject({
        method: 'PUT',
        url: `/events/${eventId}/agenda/saved/${session.id}`,
        headers: { cookie: cookieHeader(grace.cookie) },
      })
    }

    const after = await slotIdsFor(ada, grace.id)

    expect(
      after,
      "The invitee's saved sessions changed what the reader is offered. That is a Principle " +
        'VIII disclosure by omission (FR-626, SC-605, constitution v3.2.0 N2): the reader learns ' +
        "the invitee's schedule from which options vanished. Availability may be computed ONLY " +
        "from the reader's own commitments.",
    ).toEqual(before)

    for (const session of programme) {
      await app.inject({
        method: 'DELETE',
        url: `/events/${eventId}/agenda/saved/${session.id}`,
        headers: { cookie: cookieHeader(grace.cookie) },
      })
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T075 — **SC-608a: the anti-griefing property, which is a DIFFERENT guarantee.**
   *
   * Grace proposes into every slot Ada has left. Ada's offered set must be unchanged — a
   * *received* proposal consumes nothing.
   *
   * Without this, one attendee empties another's day at will. The throttle bounds how fast a
   * single account can do it and bounds nothing at all about how many accounts try, so the
   * property has to be structural: received proposals simply never enter the computation.
   *
   * **Read this beside T074 above.** They are near-identical in shape and neither implies the
   * other.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T075 — SC-608a: a RECEIVED proposal removes no slot from the invitee (FR-625)', async () => {
    const adaBefore = await slotIdsFor(ada, grace.id)
    const graceSlots = await slotIdsFor(grace, ada.id)

    // Same vacuity guard as T074, plus the half specific to this one: the slots Grace proposes
    // into must actually be slots Ada is offered, or a received proposal could not have consumed
    // anything even in a broken implementation.
    expect(graceSlots.length).toBeGreaterThanOrEqual(3)
    expect(
      graceSlots.slice(0, 3).some((slotId) => adaBefore.includes(slotId)),
      "None of the proposed slots is in Ada's offered set, so this test could not detect a " +
        'received proposal consuming one.',
    ).toBe(true)

    // Grace proposes into as many of Ada's remaining slots as the throttle comfortably allows.
    // Three is plenty: if a received proposal consumed anything, one would prove it.
    for (const slotId of graceSlots.slice(0, 3)) {
      await clearThrottle()
      const proposed = await propose(app, grace, eventId, {
        inviteeId: ada.id,
        slotId,
        topic: 'A proposal Ada has not answered.',
      })
      expect(proposed.statusCode).toBe(201)
    }

    const adaAfter = await slotIdsFor(ada, grace.id)

    expect(
      adaAfter,
      "Proposals RECEIVED by the reader reduced the reader's own availability. That lets any " +
        "attendee consume a stranger's whole day by proposing into it (SC-608a). Only proposals " +
        'the reader SENT may be subtracted; double-booking is caught at acceptance instead ' +
        '(FR-633a).',
    ).toEqual(adaBefore)
  })

  it('T076 — refuses a proposal with a REASONLESS 409 while blocked (FR-637)', async () => {
    const slots = await slotIdsFor(ada, grace.id)

    await block(app, grace, ada.id)

    await clearThrottle()
    const refused = await propose(app, ada, eventId, {
      inviteeId: grace.id,
      slotId: slots[0] as string,
      topic: 'A proposal that will not be delivered.',
    })

    expect(refused.statusCode).toBe(409)

    const body = refused.json() as { code: string; message: string }
    // The word must not appear anywhere in the response. A sender who could tell a block from a
    // fault would know they had been blocked, which is the disclosure FR-637 closes.
    expect(
      `${body.code} ${body.message}`.toLowerCase(),
      'The refusal mentions blocking. FR-637 forbids disclosing that a block exists — the ' +
        'refusal must be indistinguishable from any other conflict on this route.',
    ).not.toContain('block')

    await unblock(app, grace, ada.id)
  })

  /**
   * T077 — the server refuses a whitespace-only topic (FR-629's backstop).
   *
   * The client keeps its confirm control **disabled** until a topic is present, so reaching this
   * means something bypassed it. Both this and the column CHECK exist because client-side
   * presentation of a rule is never its enforcement.
   */
  it('T077 — refuses a whitespace-only topic server-side (FR-629)', async () => {
    const slots = await slotIdsFor(ada, grace.id)

    await clearThrottle()
    const refused = await propose(app, ada, eventId, {
      inviteeId: grace.id,
      slotId: slots[0] as string,
      topic: '     ',
    })

    // 400, not 404: this is a fact about the caller's own request rather than about anybody
    // else, so naming it discloses nothing.
    expect(refused.statusCode).toBe(400)
  })

  it('refuses an invitee who is not registered for this conference (FR-639a)', async () => {
    const slots = await slotIdsFor(ada, grace.id)

    await clearThrottle()
    const refused = await propose(app, ada, eventId, {
      inviteeId: '00000000-0000-4000-8000-000000000000',
      slotId: slots[0] as string,
      topic: 'A meeting with nobody.',
    })

    // Indistinguishable from an appointment that does not exist. It is also why the client
    // offers no scheduling action at all for a contact absent from the active conference.
    expect(refused.statusCode).toBe(404)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A REFUSED PROPOSAL MUST NOT REVEAL WHETHER THE INVITEE IS AT THIS CONFERENCE** (FR-607,
   * FR-642).
   *
   * The caller controls the slot completely, so a slot that cannot succeed holds the reader's
   * half constant — and any remaining difference between the two answers is a fact about the
   * *invitee*. An earlier implementation answered 400 when the invitee was registered and 404
   * when they were not, which made this route a clean probe for "is this person here", usable
   * against somebody who had turned discoverability off.
   *
   * Both the status and the body are compared: two 404s with different messages are as good an
   * oracle as two different statuses.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses a nonexistent slot identically whether or not the invitee is here (FR-607)', async () => {
    const absentSlot = '00000000-0000-4000-8000-00000000beef'

    await clearThrottle()
    const registeredInvitee = await propose(app, ada, eventId, {
      inviteeId: grace.id,
      slotId: absentSlot,
      topic: 'Grace is at this conference.',
    })

    await clearThrottle()
    const absentInvitee = await propose(app, ada, eventId, {
      inviteeId: '00000000-0000-4000-8000-000000000000',
      slotId: absentSlot,
      topic: 'This person is not.',
    })

    expect(
      registeredInvitee.statusCode,
      'Proposing into a slot that cannot succeed answers differently depending on whether the ' +
        "invitee is registered. That is an enumeration oracle for another attendee's presence, " +
        'reachable by anybody holding a UUID (FR-607, FR-642).',
    ).toBe(absentInvitee.statusCode)
    expect(registeredInvitee.body).toEqual(absentInvitee.body)
  })

  it('names the invitee in the query string without letting it change the answer (FR-626)', async () => {
    // The identifier exists so the dialog can be titled. Asking for the same reader's slots
    // "with" two different people must give the same answer — which is SC-605 again, from the
    // cheapest possible angle: no fixture, no state change, just the parameter.
    const withGrace = await slotIdsFor(ada, grace.id)
    const withNobody = await slotIdsFor(ada, '00000000-0000-4000-8000-000000000000')

    expect(withNobody).toEqual(withGrace)
  })
})
