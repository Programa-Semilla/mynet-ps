import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { events } from '../../src/db/schema/events.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T046 (014) — **shrinking a conference must not orphan its sessions, and the timezone freezes
 * once one exists** (FR-1014, FR-1015).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THESE ARE ONE RULE READ IN TWO DIRECTIONS, AND THE SECOND EXISTS BECAUSE OF THE FIRST.**
 *
 * FR-1012 forbids a session outside its conference's days. FR-1014 is that rule from the other
 * end: a range change must not make an existing session illegal retrospectively. FR-1015 is what
 * makes the pair sufficient — **without freezing the timezone, a timezone edit could push
 * sessions outside the range while touching neither the range nor the sessions**, because the
 * same instants land on different venue-local dates.
 *
 * It also sidesteps a question v4.2.0's N1 would otherwise raise: is shifting every displayed
 * local time a "change of start time", and therefore a notification to everybody? Structurally no
 * instant moves. Freezing is the answer that needs no new rule, and the spec records it as an
 * assumption rather than deriving it.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('conference date range and timezone (T046, FR-1014, FR-1015)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    // Nothing cascades to `events`, so a fixture conference left behind blocks the NEXT file's
    // `seed()` — and the symptom lands there rather than here. See `clearAuthoringFixture`.
    await clearAuthoringFixture()
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const patch = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/admin/conferences/${fixture.assigned.eventId}`,
      headers: { cookie },
      payload,
    })

  const addSession = (overrides = {}) =>
    app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, overrides),
    })

  const conference = async () =>
    (await getDb().select().from(events).where(eq(events.id, fixture.assigned.eventId)))[0]

  it('edits name, location and dates while nothing is in the way', async () => {
    const response = await patch({
      name: 'Renamed Conference',
      location: 'Another Venue',
      startsOn: '2027-03-01',
      endsOn: '2027-03-05',
    })

    expect(response.statusCode).toBe(200)
    expect(await conference()).toMatchObject({
      name: 'Renamed Conference',
      location: 'Another Venue',
      endsOn: '2027-03-05',
    })
  })

  it('refuses a range that would orphan a session, and NAMES it (FR-1014)', async () => {
    await addSession({
      title: 'Day Three Closer',
      startsAt: '2027-03-03T09:00:00.000Z',
      endsAt: '2027-03-03T10:00:00.000Z',
    })

    const response = await patch({ endsOn: '2027-03-02' })

    expect(response.statusCode).toBe(409)

    const named = response.json().sessions as { id: string; title: string }[]
    expect(
      named.map((session) => session.title),
      'The refusal does not name the sessions in the way. They are the caller’s own content, and ' +
        'an organizer told only "no" has to guess which of forty sessions is the problem ' +
        '(FR-1014). Moving or cancelling them first is their act, not the system’s.',
    ).toEqual(['Day Three Closer'])
  })

  it('leaves the conference unchanged when it refuses', async () => {
    await addSession({ startsAt: '2027-03-03T09:00:00.000Z', endsAt: '2027-03-03T10:00:00.000Z' })
    await patch({ name: 'Should not stick', endsOn: '2027-03-02' })

    const after = await conference()
    expect(after?.name).toBe('Assigned Conference')
    expect(after?.endsOn).toBe('2027-03-03')
  })

  it('accepts the same range once the session has been moved out of the way', async () => {
    // The path the organizer actually takes. Without this, a check that refused every range
    // change would satisfy the assertion above.
    const created = await addSession({
      startsAt: '2027-03-03T09:00:00.000Z',
      endsAt: '2027-03-03T10:00:00.000Z',
    })
    const sessionId = created.json().id as string

    await app.inject({
      method: 'PATCH',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${sessionId}`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned),
    })

    expect((await patch({ endsOn: '2027-03-02' })).statusCode).toBe(200)
  })

  it('permits a timezone change while the conference has no sessions (FR-1015)', async () => {
    const response = await patch({ timezone: 'Europe/Madrid' })

    expect(response.statusCode).toBe(200)
    expect((await conference())?.timezone).toBe('Europe/Madrid')
  })

  it('freezes the timezone once any session exists (FR-1015)', async () => {
    await addSession()

    const response = await patch({ timezone: 'Europe/Madrid' })

    expect(response.statusCode).toBe(409)
    expect(
      response.json().message,
      'The refusal does not explain itself. It describes the caller’s own conference, and the ' +
        'reason is not obvious: no instant moves, but every displayed local time shifts.',
    ).toMatch(/timezone|session/i)
    expect((await conference())?.timezone).toBe('UTC')
  })

  it('still permits other edits while the timezone is frozen', async () => {
    // The freeze is on one field, not on the conference. An implementation that refused the whole
    // PATCH once sessions existed would pass the assertion above and make a conference
    // uneditable the moment it had a programme — which is the opposite of this feature.
    await addSession()

    const response = await patch({ name: 'Still editable', location: 'Still editable' })
    expect(response.statusCode).toBe(200)
  })

  it('reports whether the timezone is still editable, so the control matches the server', async () => {
    const before = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${fixture.assigned.eventId}/programme`,
      headers: { cookie },
    })
    expect(before.json().conference.timezoneEditable).toBe(true)

    await addSession()

    const after = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${fixture.assigned.eventId}/programme`,
      headers: { cookie },
    })

    expect(
      after.json().conference.timezoneEditable,
      'The programme does not say whether the timezone may still be changed, so the client has ' +
        'to infer it from the session list — a second place the rule is decided, and the one ' +
        'that would drift.',
    ).toBe(false)
  })
})
