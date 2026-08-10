import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { clearThrottle, cookieHeader, resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  answer,
  block,
  eventIdNamed,
  GRACE,
  listAppointments,
  listHeld,
  listShared,
  propose,
  readHeld,
  shareCard,
  SHARED_EVENT,
  signIn,
  slotsFor,
  unblock,
  type Actor,
  type AppointmentBody,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * T117–T122 (008) — **ending a relationship** (FR-608, FR-637, FR-637a, FR-651–FR-653).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **BLOCKING SUSPENDS A RELATIONSHIP AND ENDS A COMMITMENT, AND THOSE ARE DIFFERENT THINGS.**
 *
 * A card is severed **read-side**, by a join, so lifting the block restores the contact with no
 * write anywhere. An appointment is **cancelled**, by a write, and lifting the block does *not*
 * bring it back.
 *
 * That asymmetry is the specification's (FR-637a) rather than an inconsistency, and T118 is the
 * test that pins it: it is the only assertion in the suite that would pass under either a
 * read-side or a write-side treatment of *cards*, and fail under a read-side treatment of
 * *appointments*. Read-time filtering for appointments was considered and rejected exactly
 * because it would resurrect a cancelled meeting.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('blocking, and deleting an account', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor
  let eventId: string

  const firstSlot = async (actor: Actor, withId: string): Promise<string> => {
    const response = await slotsFor(app, actor, eventId, withId)
    const slots = (response.json() as { slots: { slotId: string }[] }).slots
    return slots[0]?.slotId as string
  }

  const appointmentsFor = async (actor: Actor): Promise<AppointmentBody[]> =>
    ((await listAppointments(app, actor, eventId)).json() as { appointments: AppointmentBody[] })
      .appointments

  const contactsFor = async (actor: Actor): Promise<HeldCardBody[]> =>
    ((await listHeld(app, actor)).json() as { cards: HeldCardBody[] }).cards

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)
    eventId = await eventIdNamed(app, ada, SHARED_EVENT)
  })

  afterAll(async () => {
    await teardown(app)
  })

  /**
   * T117 — a block stops card resolution **in both directions** (FR-608).
   *
   * The rows are directional and the *question* is not: A blocking B severs the relationship
   * whichever way each card was given. Both sides are checked, because a read that filtered on
   * one direction only would leave the blocker still reading the profile of somebody they had
   * refused contact from.
   */
  it('T117 — a block severs held cards in BOTH directions, and refuses sharing (FR-608)', async () => {
    await shareCard(app, ada, grace.id)
    await shareCard(app, grace, ada.id)

    expect((await contactsFor(ada)).map((card) => card.attendeeId)).toEqual([grace.id])
    expect((await contactsFor(grace)).map((card) => card.attendeeId)).toEqual([ada.id])

    await block(app, grace, ada.id)

    // Neither side resolves. Grace blocked Ada, and Grace loses the contact too — a block is a
    // refusal of the relationship, not a one-way mute.
    expect(await contactsFor(grace)).toEqual([])
    expect(
      await contactsFor(ada),
      'The blocked attendee can still resolve the blocker as a contact. A block severs the card ' +
        'in both directions (FR-608) — leaving one side readable would let somebody keep reading ' +
        'the live profile of a person who has refused contact from them.',
    ).toEqual([])

    // The single read is subject to the same condition, and refuses indistinguishably from a
    // card that never existed (FR-616, FR-642).
    expect((await readHeld(app, ada, grace.id)).statusCode).toBe(404)

    // The record of having shared is gone from both lists too — continuing to list somebody
    // under a heading saying you gave them your details would be neither useful nor honest.
    expect(((await listShared(app, ada)).json() as { cards: unknown[] }).cards).toEqual([])

    // Sharing again is refused with a REASONLESS 409 (FR-608).
    await clearThrottle()
    const refused = await shareCard(app, ada, grace.id)
    expect(refused.statusCode).toBe(409)
    expect(`${refused.body}`.toLowerCase()).not.toContain('block')

    await unblock(app, grace, ada.id)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T118, T119 — **lifting a block restores the contact and leaves the appointment cancelled**
   * (FR-637a).
   *
   * This is the sharpest test in the feature, and it is the one that would pass under a
   * plausible wrong implementation of either half:
   *
   *   - if **cards** were severed by a write, lifting the block would leave the contact gone,
   *     and somebody would have to build an undo path that does not exist;
   *   - if **appointments** were filtered at read time, lifting the block would resurrect a
   *     meeting both parties had seen cancelled — which FR-637a forbids outright.
   *
   * Blocking suspends a relationship and ends a commitment. The asymmetry is deliberate.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T118, T119 — a block cancels live meetings and frees their slots; lifting it restores the contact but NOT the meeting (FR-637a)', async () => {
    await shareCard(app, ada, grace.id)
    await shareCard(app, grace, ada.id)

    // One confirmed appointment and one pending proposal, so both live states are covered.
    const confirmedSlot = await firstSlot(ada, grace.id)
    await clearThrottle()
    const toConfirm = (
      await propose(app, ada, eventId, {
        inviteeId: grace.id,
        slotId: confirmedSlot,
        topic: 'Confirmed, then blocked.',
      })
    ).json() as AppointmentBody
    await answer(app, grace, eventId, toConfirm.appointmentId, 'accept')

    const pendingSlot = await firstSlot(ada, grace.id)
    await clearThrottle()
    const stillPending = (
      await propose(app, ada, eventId, {
        inviteeId: grace.id,
        slotId: pendingSlot,
        topic: 'Pending, then blocked.',
      })
    ).json() as AppointmentBody

    await block(app, grace, ada.id)

    // T119 — both are cancelled, not hidden. The distinction matters: a hidden meeting is one
    // the other party may still be expecting to attend.
    const afterBlock = await appointmentsFor(ada)
    const confirmedRow = afterBlock.find((row) => row.appointmentId === toConfirm.appointmentId)
    const pendingRow = afterBlock.find((row) => row.appointmentId === stillPending.appointmentId)

    expect(confirmedRow?.status).toBe('cancelled')
    expect(pendingRow?.status).toBe('cancelled')

    // And their slots are free again — a cancelled meeting is not a live claim.
    const freed = (
      (await slotsFor(app, ada, eventId, grace.id)).json() as { slots: { slotId: string }[] }
    ).slots.map((slot) => slot.slotId)
    expect(freed).toContain(confirmedSlot)
    expect(freed).toContain(pendingSlot)

    // Scheduling is refused while blocked, reasonlessly (FR-637).
    await clearThrottle()
    const refused = await propose(app, ada, eventId, {
      inviteeId: grace.id,
      slotId: confirmedSlot,
      topic: 'Not while blocked.',
    })
    expect(refused.statusCode).toBe(409)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // T118 — **lift the block. The two halves diverge here, and that is the point.**
    // ─────────────────────────────────────────────────────────────────────────────────────
    await unblock(app, grace, ada.id)

    expect(
      (await contactsFor(grace)).map((card) => card.attendeeId),
      'Lifting the block did not restore the contact. Card severance is read-side precisely so ' +
        'that it reverses with no write and no repair path (FR-608, FR-637a).',
    ).toEqual([ada.id])
    expect((await contactsFor(ada)).map((card) => card.attendeeId)).toEqual([grace.id])

    const afterUnblock = await appointmentsFor(ada)
    expect(
      afterUnblock.find((row) => row.appointmentId === toConfirm.appointmentId)?.status,
      'Lifting the block resurrected a cancelled meeting. FR-637a forbids that outright — which ' +
        'is why blocking WRITES into appointments rather than filtering them at read time ' +
        '(research R6). Both parties saw this meeting cancelled; it must stay cancelled.',
    ).toBe('cancelled')
    expect(
      afterUnblock.find((row) => row.appointmentId === stillPending.appointmentId)?.status,
    ).toBe('cancelled')
  })

  it('leaves a PAST confirmed meeting alone, because cancelling it would rewrite history', async () => {
    const slotId = await firstSlot(ada, grace.id)
    await clearThrottle()
    const past = (
      await propose(app, ada, eventId, {
        inviteeId: grace.id,
        slotId,
        topic: 'A meeting that already happened.',
      })
    ).json() as AppointmentBody
    await answer(app, grace, eventId, past.appointmentId, 'accept')

    // Moved into the past directly: the grid has no write path at any privilege (FR-623).
    await getDb().execute(sql`
      UPDATE meeting_slots
      SET starts_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes'
      WHERE id = ${slotId}::uuid
    `)

    await block(app, grace, ada.id)

    const row = (await appointmentsFor(ada)).find(
      (entry) => entry.appointmentId === past.appointmentId,
    )
    expect(
      row?.status,
      'Blocking cancelled a meeting that had already taken place. It happened; recording ' +
        'otherwise is a rewrite of history, which is the same reason blocking deletes no message ' +
        '(FR-538).',
    ).toBe('confirmed')

    await unblock(app, grace, ada.id)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **WITHDRAWING FROM A CONFERENCE CANCELS THE MEETINGS YOU HAD AT IT.**
   *
   * `data-model.md` carried this over as an open item — *"the surface stops offering actions on
   * it… confirm during implementation; it needs an integration test either way"* — and the
   * confirmation is that leaving it alone was **not** safe.
   *
   * The record is per-event and the account still exists, so nothing cascades. But every read of
   * it passes through `requireEventAccess`, which the departing attendee now fails: they cannot
   * see the meeting, cannot cancel it, and **the other party can still accept it** and turn up to
   * meet somebody who has left. That is FR-637a's failure — *a meeting you would otherwise turn
   * up to must be ended rather than hidden* — arriving through a second door.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('cancels live meetings when a participant withdraws from the conference (data-model.md, R4)', async () => {
    await shareCard(app, ada, grace.id)

    const slotId = await firstSlot(ada, grace.id)
    await clearThrottle()
    const proposal = (
      await propose(app, ada, eventId, {
        inviteeId: grace.id,
        slotId,
        topic: 'Cancelled when Ada leaves.',
      })
    ).json() as AppointmentBody
    await answer(app, grace, eventId, proposal.appointmentId, 'accept')

    // Ada leaves the conference.
    const left = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/registration`,
      headers: { cookie: cookieHeader(ada.cookie) },
    })
    expect(left.statusCode).toBeLessThan(300)

    // Grace — who is still there — sees it cancelled rather than confirmed, and cannot accept
    // anything further on it.
    const row = (await appointmentsFor(grace)).find(
      (entry) => entry.appointmentId === proposal.appointmentId,
    )
    expect(
      row?.status,
      'The meeting survived the other party leaving the conference. They can no longer see it — ' +
        '`requireEventAccess` refuses them — so nobody can cancel it, and Grace would turn up to ' +
        'meet somebody who has left.',
    ).toBe('cancelled')

    // The slot is free again for the party who remains.
    const freed = (
      (await slotsFor(app, grace, eventId, ada.id)).json() as { slots: { slotId: string }[] }
    ).slots.map((slot) => slot.slotId)
    expect(freed).toContain(slotId)

    // Ada rejoins, so the rest of the file runs against the registration it expects.
    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(ada.cookie) },
      payload: { joinCode: 'PDS-2026' },
    })

    // And the cancellation stands: rejoining is not an undo, exactly as lifting a block is not.
    const afterRejoin = (await appointmentsFor(ada)).find(
      (entry) => entry.appointmentId === proposal.appointmentId,
    )
    expect(afterRejoin?.status).toBe('cancelled')
  })

  /**
   * T120 — **deleting an account removes the contact entirely, with no nameless entry**
   * (FR-651, SC-609).
   *
   * The deliberate opposite of 007's conversations, where the survivor keeps a one-sided
   * read-only thread with `counterpart: null`. A conversation holds the survivor's **own words**,
   * which are theirs to keep; a card whose subject is gone has nothing left to preserve, and
   * rendering it as a nameless row would be an entry the reader can neither use nor remove.
   */
  it('T120 — deleting an account removes the contact entirely, not as a nameless entry (FR-651, SC-609)', async () => {
    await shareCard(app, ada, grace.id)
    await shareCard(app, grace, ada.id)
    expect(await contactsFor(grace)).toHaveLength(1)

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(ada.cookie) },
    })
    expect(deleted.statusCode).toBeLessThan(300)

    const survivors = await contactsFor(grace)
    expect(
      survivors,
      "A contact survived the other party's account deletion. Unlike a conversation — which " +
        "holds the survivor's own words — a card whose subject is gone has nothing to preserve, " +
        'so the row is removed for both by cascade (FR-651).',
    ).toEqual([])

    // T121 — and every appointment between them, in both roles (FR-652).
    const rows = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM appointments
      WHERE proposer_id = ${ada.id}::uuid OR invitee_id = ${ada.id}::uuid
    `)
    expect(rows[0]?.count, 'Appointments survived an account deletion (FR-652).').toBe(0)

    // Nothing of the departed attendee is retained anywhere in this feature's tables.
    const cards = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM shared_cards
      WHERE sharer_id = ${ada.id}::uuid OR recipient_id = ${ada.id}::uuid
    `)
    expect(cards[0]?.count).toBe(0)
  })

  /**
   * T121 — the cascade needs no code, and this proves it rather than assuming it (T128).
   *
   * Both tables reference `attendees` twice with `ON DELETE CASCADE`, so `deleteAccount` names
   * neither of them. `deletion-coverage.test.ts` asserts the *declaration*; this asserts the
   * *behaviour* against a real database, which is the division those two guards were built for.
   */
  it('T121, T128 — the deletion cascade covers both tables with no code in deleteAccount (FR-652)', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(new URL('../../src/db/queries/account.ts', import.meta.url).pathname, 'utf8'),
    )

    // `deleteAccount` is one `DELETE FROM attendees` plus the storage object and 007's empty
    // conversation sweep. If a `DELETE FROM shared_cards` ever appears, either a cascade has
    // been lost or somebody has written code the schema already does.
    const deleteAccountBody = source.slice(source.indexOf('export const deleteAccount'))
    expect(
      /DELETE FROM shared_cards|DELETE FROM appointments/i.test(deleteAccountBody),
      'deleteAccount now deletes a 008 table explicitly. Both tables cascade from `attendees` ' +
        'on all four references, so this is either dead code or the sign that a cascade was ' +
        'dropped — and the second would fail `deletion-coverage.test.ts` too.',
    ).toBe(false)
  })
})
