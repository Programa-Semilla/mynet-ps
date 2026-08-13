import { describe, expect, it } from 'vitest'

import { payloadFor } from '../../src/routes/admin/catalog.js'
import type { SessionAct } from '../../src/db/queries/admin-catalog.js'

/**
 * T072 (014) — **the two notification shapes, and the one aggregate this feature may produce**
 * (FR-1029, FR-1034, FR-1034a, FR-1034b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE COALESCED BRANCH IS UNREACHABLE THROUGH ANY ROUTE 014 REGISTERS, WHICH IS WHY IT IS
 * ASSERTED HERE RATHER THAN IN THE INTEGRATION SUITE.**
 *
 * There is no bulk edit and no bulk cancel, and the two conference-level acts that could touch
 * many sessions at once are both **refused** while sessions exist (FR-1014, FR-1015). So the
 * multi-session case is a property of the fan-out and the payload builder rather than of any
 * request the product currently offers — `dispatch-coalescing.test.ts` covers the fan-out against
 * a real database, and this covers the shape somebody's phone would actually show.
 *
 * Asserting it now is what makes 015's bulk edit, if it ever exists, correct on the day it ships
 * rather than the day somebody notices twelve notifications.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const act = (change: SessionAct['change']): SessionAct => ({
  session: {
    id: 'session-1',
    eventId: 'event-1',
    title: 'Opening Keynote',
    summary: null,
    startsAt: new Date('2027-03-01T09:00:00.000Z'),
    endsAt: new Date('2027-03-01T10:00:00.000Z'),
    trackId: 'track-1',
    roomId: 'room-1',
    cancelledAt: null,
  },
  change,
  actId: 'act-1',
})

describe('the notification payload (T072, FR-1029, FR-1034)', () => {
  it('names the session, and carries no count, when ONE changed (FR-1029)', () => {
    const payload = payloadFor(act('cancelled'), ['session-1'], 'event-1')

    expect(payload.kind).toBe('session-change')
    expect(payload.sessionId).toBe('session-1')
    expect(
      payload.count,
      'A single-session notification carried a count. The count exists to make a coalesced ' +
        'interruption legible; on one session it is noise, and it is the one aggregate this ' +
        'feature may produce at all (FR-1034a).',
    ).toBeUndefined()
    expect(payload.title).toBe('Opening Keynote')
  })

  it('says WHAT changed, in the body, for each of the three material changes', () => {
    // The three v4.2.0's N1 enumerates. An attendee reading a lock screen needs to know whether
    // to go somewhere else or not to go at all, and "a session changed" answers neither.
    expect(payloadFor(act('cancelled'), ['session-1'], 'event-1').body).toMatch(/cancelled/i)
    expect(payloadFor(act('time'), ['session-1'], 'event-1').body).toMatch(/time/i)
    expect(payloadFor(act('room'), ['session-1'], 'event-1').body).toMatch(/room/i)
  })

  it('carries a COUNT and NO session when several changed (FR-1034, FR-1034b)', () => {
    const payload = payloadFor(act('time'), ['a', 'b', 'c', 'd'], 'event-1')

    expect(payload.count).toBe(4)
    expect(
      payload.sessionId,
      'A coalesced notification named a session. Activating it must open Agenda, where the ' +
        'changed rows carry their individual markers — never one of the four arbitrarily, and ' +
        'never a list of changes, which is the surface FR-1031 forbids (FR-1034b).',
    ).toBeUndefined()
    expect(payload.eventId).toBe('event-1')
    expect(payload.body).toMatch(/4/)
  })

  it('carries the conference on both shapes, so activation can find the right Agenda', () => {
    expect(payloadFor(act('room'), ['session-1'], 'event-1').eventId).toBe('event-1')
    expect(payloadFor(act('room'), ['a', 'b'], 'event-1').eventId).toBe('event-1')
  })

  it('names no attendee, on either shape (FR-1042)', () => {
    // The payload leaves the product for a surface nobody here controls. Principle VIII's
    // collect-only-what-a-requirement-names applied to a notification: there is no field that
    // could hold an identity, and this is what notices if one appears.
    const single = JSON.stringify(payloadFor(act('cancelled'), ['session-1'], 'event-1'))
    const coalesced = JSON.stringify(payloadFor(act('time'), ['a', 'b'], 'event-1'))

    for (const body of [single, coalesced]) {
      expect(body).not.toMatch(/attendee/i)
      expect(body).not.toMatch(/operator/i)
    }
  })
})
