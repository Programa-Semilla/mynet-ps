import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { RETENTION_SWEEPS } from '../../src/maintenance.js'
import { clearThrottle, cookieHeader, resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  ALAN,
  answer,
  eventIdNamed,
  GRACE,
  listAppointments,
  propose,
  SHARED_EVENT,
  signIn,
  slotsFor,
  type Actor,
  type AppointmentBody,
} from './network-fixtures.js'

/**
 * T092–T099 (008) — **answering a proposal** (FR-631–FR-636, SC-608a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SLOT-FREEING ASSERTIONS ARE ASYMMETRIC ON PURPOSE, AND THE ASYMMETRY IS THE DESIGN.**
 *
 * Declining frees the slot **for the proposer only** — the invitee never lost it, because a
 * received proposal consumes nothing (SC-608a). Cancelling a confirmed appointment frees it
 * **for both**, because a confirmed meeting was a commitment on two diaries.
 *
 * A test suite that checked only "the slot comes back" would pass against an implementation that
 * freed the wrong number of people, and the wrong direction is the one that matters: an invitee
 * whose day is silently consumed by proposals they declined is the griefing SC-608a forbids.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('answering a proposal', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor
  let alan: Actor
  let eventId: string

  const slotIdsFor = async (actor: Actor, withId: string): Promise<string[]> => {
    const response = await slotsFor(app, actor, eventId, withId)
    return (response.json() as { slots: { slotId: string }[] }).slots.map((slot) => slot.slotId)
  }

  const proposeFrom = async (
    proposer: Actor,
    invitee: Actor,
    slotId: string,
    topic = 'A meeting.',
  ): Promise<AppointmentBody> => {
    await clearThrottle()
    const response = await propose(app, proposer, eventId, { inviteeId: invitee.id, slotId, topic })
    expect(response.statusCode).toBe(201)
    return response.json() as AppointmentBody
  }

  const appointmentsFor = async (actor: Actor): Promise<AppointmentBody[]> =>
    ((await listAppointments(app, actor, eventId)).json() as { appointments: AppointmentBody[] })
      .appointments

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)
    alan = await signIn(app, ALAN)
    eventId = await eventIdNamed(app, ada, SHARED_EVENT)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('T092 — accepting confirms it for BOTH parties (FR-631)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const proposal = await proposeFrom(ada, grace, slots[0] as string, 'Confirmed by Grace.')

    // Both see it pending first, in their own role. Checked before accepting, because "both
    // parties see it" is half of FR-631 and would otherwise be assumed.
    const adaPending = (await appointmentsFor(ada)).find(
      (row) => row.appointmentId === proposal.appointmentId,
    )
    const gracePending = (await appointmentsFor(grace)).find(
      (row) => row.appointmentId === proposal.appointmentId,
    )
    expect(adaPending).toMatchObject({ status: 'pending', role: 'proposer' })
    expect(gracePending).toMatchObject({ status: 'pending', role: 'invitee' })

    const accepted = await answer(app, grace, eventId, proposal.appointmentId, 'accept')
    expect(accepted.statusCode).toBe(200)

    for (const actor of [ada, grace]) {
      const row = (await appointmentsFor(actor)).find(
        (entry) => entry.appointmentId === proposal.appointmentId,
      )
      expect(row?.status).toBe('confirmed')
      expect(row?.answeredAt).not.toBeNull()
    }
  })

  /**
   * T093 — **declining frees the slot for the proposer ONLY** (FR-633).
   *
   * The invitee's set is checked too, and must be unchanged — not because declining should take
   * something from them, but because it must not have *given* them anything either. Their
   * availability was never touched.
   */
  it('T093 — declining frees the slot for the PROPOSER, who was the only one it was unavailable to (FR-633)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const slotId = slots[0] as string

    const graceBefore = await slotIdsFor(grace, ada.id)

    const proposal = await proposeFrom(ada, grace, slotId, 'Declined by Grace.')

    // Ada has claimed it; Grace's availability is untouched by receiving it (SC-608a).
    expect(await slotIdsFor(ada, grace.id)).not.toContain(slotId)
    expect(await slotIdsFor(grace, ada.id)).toEqual(graceBefore)

    const declined = await answer(app, grace, eventId, proposal.appointmentId, 'decline')
    expect(declined.statusCode).toBe(200)
    expect((declined.json() as AppointmentBody).status).toBe('declined')

    // The slot returns to the proposer.
    expect(
      await slotIdsFor(ada, grace.id),
      'Declining did not free the slot for the proposer. A declined proposal is no longer a live ' +
        'claim (FR-633), so the proposer must be able to offer that time to somebody else.',
    ).toContain(slotId)

    // And the invitee's set is still exactly what it was, twice over.
    expect(await slotIdsFor(grace, ada.id)).toEqual(graceBefore)
  })

  it('T094 — cancelling a confirmed appointment frees the slot for BOTH (FR-633)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const slotId = slots[0] as string

    const proposal = await proposeFrom(ada, grace, slotId, 'Cancelled later.')
    await answer(app, grace, eventId, proposal.appointmentId, 'accept')

    // Confirmed: now genuinely unavailable to both, which is what makes the asymmetry with
    // decline observable rather than asserted.
    expect(await slotIdsFor(ada, grace.id)).not.toContain(slotId)
    expect(await slotIdsFor(grace, ada.id)).not.toContain(slotId)

    // Either party may cancel; Grace does here, and the proposer's cancel is covered below.
    const cancelled = await answer(app, grace, eventId, proposal.appointmentId, 'cancel')
    expect(cancelled.statusCode).toBe(200)
    expect((cancelled.json() as AppointmentBody).status).toBe('cancelled')

    expect(await slotIdsFor(ada, grace.id)).toContain(slotId)
    expect(await slotIdsFor(grace, ada.id)).toContain(slotId)
  })

  it('lets the PROPOSER cancel a confirmed appointment too (FR-632)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const proposal = await proposeFrom(ada, grace, slots[0] as string, 'Cancelled by the proposer.')
    await answer(app, grace, eventId, proposal.appointmentId, 'accept')

    // Either party, deliberately: a meeting one person can no longer attend is not a meeting,
    // and requiring the other to withdraw would leave somebody bound to a slot with no way out.
    const cancelled = await answer(app, ada, eventId, proposal.appointmentId, 'cancel')
    expect(cancelled.statusCode).toBe(200)
    expect((cancelled.json() as AppointmentBody).status).toBe('cancelled')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T095 — **FR-633a: acceptance is refused when the invitee has since acquired a conflict, and
   * the message describes THEIR OWN schedule.**
   *
   * This case exists *because* of the two privacy properties, not despite them. Availability
   * ignores the invitee entirely (FR-626) and a received proposal consumes nothing (SC-608a), so
   * a proposal may perfectly well arrive for a time the invitee is already busy. The design puts
   * the cost here, at the moment they choose.
   *
   * The wording assertion is the sharp half: it must describe the reader to the reader and
   * **never mention the proposer's** schedule, which would be a fact about somebody else.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T095 — refuses acceptance on a conflict, describing only the invitee’s own schedule (FR-633a)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const contested = slots[0] as string

    // Ada proposes slot X to Grace, and Alan proposes the same slot to Grace as well.
    const fromAda = await proposeFrom(ada, grace, contested, 'Ada wants this slot.')
    const fromAlan = await proposeFrom(alan, grace, contested, 'Alan wants this slot too.')

    // Grace confirms Alan's first. Her own diary now holds that time.
    const acceptedAlan = await answer(app, grace, eventId, fromAlan.appointmentId, 'accept')
    expect(acceptedAlan.statusCode).toBe(200)

    // Ada's proposal can no longer be accepted.
    const refused = await answer(app, grace, eventId, fromAda.appointmentId, 'accept')
    expect(refused.statusCode).toBe(409)

    const message = (refused.json() as { message: string }).message

    // It explains — unlike the reasonless 409 a block produces — because it is a fact about the
    // reader that the reader can already see.
    expect(message.length).toBeGreaterThan(10)

    // And it says nothing about the proposer. Their name, and any hint that the clash involves
    // another person's arrangements, would be a disclosure about somebody else.
    expect(
      message.toLowerCase(),
      'The conflict message names the proposer or their schedule. It must describe the ' +
        "INVITEE's own diary to the invitee (FR-633a) — that is what makes explaining it " +
        'disclose nothing, and it is why this 409 carries a reason where the block 409s do not.',
    ).not.toContain('ada')
    expect(message.toLowerCase()).not.toContain('alan')

    // Nothing was confirmed by the refusal.
    const row = (await appointmentsFor(grace)).find(
      (entry) => entry.appointmentId === fromAda.appointmentId,
    )
    expect(row?.status).toBe('pending')

    // Cleared, so later cases start from a free grid.
    await answer(app, grace, eventId, fromAlan.appointmentId, 'cancel')
    await answer(app, grace, eventId, fromAda.appointmentId, 'decline')
  })

  it('T096 — only the invitee may accept or decline (FR-635)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const proposal = await proposeFrom(ada, grace, slots[0] as string, 'Ada cannot answer this.')

    for (const action of ['accept', 'decline'] as const) {
      const response = await answer(app, ada, eventId, proposal.appointmentId, action)

      // **403, not 404, and the difference is deliberate**: Ada is a participant and can already
      // see this appointment and its state, so concealing why would make a legible situation
      // look broken. The indistinguishability FR-636 requires is about appointments the caller
      // is NOT party to.
      expect(response.statusCode).toBe(403)
    }

    // Still pending — the refusal changed nothing.
    const row = (await appointmentsFor(grace)).find(
      (entry) => entry.appointmentId === proposal.appointmentId,
    )
    expect(row?.status).toBe('pending')

    await answer(app, grace, eventId, proposal.appointmentId, 'decline')
  })

  /**
   * T097 — **a third party gets a response indistinguishable from one that does not exist**
   * (FR-636).
   *
   * Alan is registered for this conference, so `requireEventAccess` passes for him — which is
   * exactly why the participant condition has to live in the query. The guard proves he is at
   * the conference and nothing more.
   */
  it('T097 — a third party cannot tell an appointment from a nonexistent one (FR-636)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const proposal = await proposeFrom(ada, grace, slots[0] as string, 'Private to Ada and Grace.')

    const real = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/appointments/${proposal.appointmentId}/accept`,
      headers: { cookie: cookieHeader(alan.cookie) },
    })
    const imaginary = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/appointments/00000000-0000-4000-8000-000000000000/accept`,
      headers: { cookie: cookieHeader(alan.cookie) },
    })

    expect(real.statusCode).toBe(404)
    expect(
      real.body,
      'A third party can tell a real appointment from an imaginary one. That confirms two ' +
        'specific people have a meeting, to somebody holding nothing but an identifier (FR-636).',
    ).toEqual(imaginary.body)

    // It is also absent from their list entirely — the participant condition applies to reads
    // as well as to answers.
    const alanList = await appointmentsFor(alan)
    expect(alanList.map((row) => row.appointmentId)).not.toContain(proposal.appointmentId)

    await answer(app, grace, eventId, proposal.appointmentId, 'decline')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T098 — **a proposal whose slot has passed reports as `lapsed` and cannot be accepted**
   * (FR-634).
   *
   * The slot is moved into the past directly, because there is no route that could do it — the
   * grid is seeded content with no write path at any privilege (FR-623), which is itself a
   * requirement. Waiting for real time to pass is not an option, and adding a route to make the
   * test convenient would breach the thing the test sits beside.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T098 — a proposal whose slot has passed is lapsed and cannot be accepted (FR-634)', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const slotId = slots[0] as string
    const proposal = await proposeFrom(ada, grace, slotId, 'Overtaken by events.')

    await getDb().execute(sql`
      UPDATE meeting_slots
      SET starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes'
      WHERE id = ${slotId}::uuid
    `)

    const row = (await appointmentsFor(grace)).find(
      (entry) => entry.appointmentId === proposal.appointmentId,
    )
    expect(
      row?.status,
      'A pending proposal whose slot has passed still reports as pending. It must be derived as ' +
        'lapsed at read time (FR-634), or the surface offers an Accept control that must fail.',
    ).toBe('lapsed')

    const refused = await answer(app, grace, eventId, proposal.appointmentId, 'accept')
    expect(refused.statusCode).toBe(403)

    // The **stored** status is untouched: `lapsed` is derived and never written.
    const stored = await getDb().execute<{ status: string }>(sql`
      SELECT status FROM appointments WHERE id = ${proposal.appointmentId}::uuid
    `)
    expect(
      stored[0]?.status,
      '`lapsed` was written to the database. It is derived from the slot instant on every read ' +
        '(FR-634) — storing it would require a scheduled sweep to maintain, and this feature ' +
        'deliberately introduces no background job.',
    ).toBe('pending')
  })

  /**
   * T099 — **`lapsed` is derived, and no sweep exists for it.**
   *
   * Two assertions, because the requirement has two halves and the second is the one a future
   * feature would breach in good faith: somebody adding a nightly "expire old proposals" job
   * would satisfy every behavioural test in this file while introducing exactly the background
   * work research R8 chose to avoid.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE CONFLICT CHECK MUST SEE THE INVITEE'S OWN SENT PROPOSAL, NOT ONLY CONFIRMED ONES.**
   *
   * Availability subtracts the reader's *sent* pending proposals from their own offered set, and
   * the acceptance check originally looked only for `confirmed` rows. That left a reachable
   * sequence in which one attendee ends up confirmed twice at the same instant — and the partial
   * unique index cannot catch it, because it is keyed on the proposer and the two proposers
   * differ.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses acceptance that would clash with the invitee’s OWN sent proposal (FR-633a)', async () => {
    const slots = await slotIdsFor(grace, ada.id)
    const contested = slots[0] as string

    // Grace claims the slot by proposing into it herself…
    const graceSent = await proposeFrom(grace, ada, contested, 'Grace asked first.')
    expect(graceSent.status).toBe('pending')

    // …and Alan proposes the same slot to Grace.
    const toGrace = await proposeFrom(alan, grace, contested, 'Alan wants the same slot.')

    const refused = await answer(app, grace, eventId, toGrace.appointmentId, 'accept')
    expect(
      refused.statusCode,
      'Grace accepted a meeting at a time she had already claimed with her own pending proposal. ' +
        'Availability subtracts that claim, so the acceptance check must see it too — otherwise ' +
        'she can be confirmed twice at one instant.',
    ).toBe(409)

    await answer(app, ada, eventId, graceSent.appointmentId, 'decline')
    await answer(app, grace, eventId, toGrace.appointmentId, 'decline')
  })

  /**
   * **An answer that changed nothing must not report success** (the guard's row count).
   *
   * Each mutation carries `AND status = '<expected>'` to close the window between the read and
   * the write. Discarding the affected-row count reopened it in the *answer*: a decline landing
   * in that window left the update matching zero rows while the route still replied 200
   * "accepted", handing back a declined appointment.
   */
  it('refuses a second answer rather than reporting the first one’s result as its own', async () => {
    const slots = await slotIdsFor(ada, grace.id)
    const proposal = await proposeFrom(ada, grace, slots[0] as string, 'Answered once.')

    const declined = await answer(app, grace, eventId, proposal.appointmentId, 'decline')
    expect(declined.statusCode).toBe(200)

    // The same proposal, answered again. Nothing to update, so nothing to report as done.
    const again = await answer(app, grace, eventId, proposal.appointmentId, 'accept')
    expect(
      again.statusCode,
      'Accepting an already-declined proposal answered 200. The status guard on the UPDATE is ' +
        'what closes the concurrent-answer window, and discarding its row count means the guard ' +
        'changes the database without changing the reply.',
    ).toBe(403)

    const row = (await appointmentsFor(grace)).find(
      (entry) => entry.appointmentId === proposal.appointmentId,
    )
    expect(row?.status).toBe('declined')
  })

  it('T099 — `lapsed` is not a stored status, and no retention sweep maintains it', () => {
    const schema = readFileSync(
      fileURLToPath(new URL('../../src/db/schema/appointments.ts', import.meta.url)),
      'utf8',
    )

    // The stored enum is exactly four values. A fifth is a schema change, and it is this line
    // that makes it a visible one.
    const declared = /APPOINTMENT_STATUSES = \[([^\]]+)\]/.exec(schema)?.[1] ?? ''
    expect(declared).toContain("'pending'")
    expect(declared).toContain("'confirmed'")
    expect(declared).toContain("'declined'")
    expect(declared).toContain("'cancelled'")
    expect(
      declared,
      '`lapsed` has been added to the stored statuses. It is derived from the slot instant ' +
        '(FR-634); storing it needs a sweep to maintain, and RETENTION_SWEEPS exists for data no ' +
        'cascade can reach, which this is not.',
    ).not.toContain('lapsed')

    expect(
      RETENTION_SWEEPS.map((sweep) => sweep.table),
      'A retention sweep now covers an appointments table. This feature introduces NO background ' +
        'job (research R8) — every row it writes is reachable by cascade, and `lapsed` is derived.',
    ).not.toContain('appointments')
    expect(RETENTION_SWEEPS.map((sweep) => sweep.table)).not.toContain('meeting_slots')
    expect(RETENTION_SWEEPS.map((sweep) => sweep.table)).not.toContain('shared_cards')
  })
})
