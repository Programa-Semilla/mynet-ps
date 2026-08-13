import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import {
  buildAuthoringFixture,
  organizerSession,
  platformSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'
import { eq } from 'drizzle-orm'

/**
 * T012 (014) — **an organizer reaching a conference they do not run is indistinguishable from
 * reaching one that does not exist** (FR-1035, FR-1036, SC-1007).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE REFUSAL BEING THE SAME IS THE REQUIREMENT, NOT A CONSEQUENCE OF IT BEING CONVENIENT.**
 *
 * A 403 would tell an organizer that a conference exists and that somebody else runs it. That is
 * an **enumeration oracle over the conference list**, reachable by anybody holding a promoted
 * account and a UUID — and it is the same reasoning that put a 404 on the report queue for the
 * wrong tier, and the reasoning 008 had to apply after making a meeting proposal an oracle for
 * another attendee's presence.
 *
 * So the assertions compare the **whole shape** of the two responses — status and body — rather
 * than checking each is "not a 200". Two 404s with different messages are still distinguishable.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('authority over a conference (T012, FR-1035, FR-1036)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA)
  })

  const asOrganizer = (): Promise<string> => organizerSession(app, ADA, SEED_PASSWORD)

  const readProgramme = (cookie: string, eventId: string) =>
    app.inject({
      method: 'GET',
      url: `/admin/conferences/${eventId}/programme`,
      headers: { cookie },
    })

  it('lets an assigned organizer read the programme of their conference', async () => {
    const cookie = await asOrganizer()
    const response = await readProgramme(cookie, fixture.assigned.eventId)

    expect(response.statusCode).toBe(200)
    expect(response.json().conference.id).toBe(fixture.assigned.eventId)
  })

  it('refuses a conference they are not assigned to, identically to one that does not exist', async () => {
    const cookie = await asOrganizer()

    const unassigned = await readProgramme(cookie, fixture.unassigned.eventId)
    const nonexistent = await readProgramme(cookie, '00000000-0000-4000-8000-000000000000')

    expect(unassigned.statusCode).toBe(404)
    expect(
      unassigned.json(),
      'The refusal for a conference somebody else runs differs from the refusal for one that ' +
        'does not exist. That difference is an enumeration oracle over the conference list, ' +
        'reachable by anybody holding a promoted account and a UUID (FR-1036, SC-1007).',
    ).toEqual(nonexistent.json())
    expect(unassigned.statusCode).toBe(nonexistent.statusCode)
  })

  it('refuses a WRITE to another conference identically too', async () => {
    // The read above is the cheap half. A write is what actually matters, and it is a separate
    // code path — the guard runs before the handler, but a handler that reached the write layer
    // with the wrong scope would produce a different failure entirely.
    const cookie = await asOrganizer()

    const write = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.unassigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.unassigned),
    })

    const nonexistent = await app.inject({
      method: 'POST',
      url: `/admin/conferences/00000000-0000-4000-8000-000000000000/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.unassigned),
    })

    expect(write.statusCode).toBe(404)
    expect(write.json()).toEqual(nonexistent.json())
  })

  it('lets a platform operator reach every conference, assigned or not (FR-1002)', async () => {
    const cookie = await platformSession(app)

    for (const conference of [fixture.assigned, fixture.unassigned]) {
      const response = await readProgramme(cookie, conference.eventId)
      expect(
        response.statusCode,
        'A platform operator holds the same authoring capability over every conference ' +
          '(FR-1002). There is no assignment to check, and requiring one would make the tier ' +
          'weaker than the one it supervises.',
      ).toBe(200)
    }
  })

  it('ends authority the moment an assignment is revoked, not at the next sign-in', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Decision 39: **authority must not outlive the access it depends on.** The guard re-reads
    // the assignment on every request rather than capturing it at sign-in, so a demotion takes
    // effect immediately — with the session still live and the cookie still valid.
    //
    // Asserted on the SAME cookie, before and after, which is the only way to tell "the guard
    // re-reads" from "signing in again failed".
    // ───────────────────────────────────────────────────────────────────────────────────────
    const cookie = await asOrganizer()
    expect((await readProgramme(cookie, fixture.assigned.eventId)).statusCode).toBe(200)

    await getDb()
      .update(organizerAssignments)
      .set({ revokedAt: new Date() })
      .where(eq(organizerAssignments.attendeeId, fixture.organizerId))

    const after = await readProgramme(cookie, fixture.assigned.eventId)
    expect(
      after.statusCode,
      'A revoked organizer still reached the conference on their existing session. Authority ' +
        'must not outlive the access it depends on (decision 39), which is why the guard reads ' +
        'the assignment on every request rather than trusting the session row.',
    ).not.toBe(200)
  })

  it('refuses an attendee session outright — it is not an administrative principal', async () => {
    // An attendee cookie is the wrong store, the wrong name and the wrong principal. Asserted
    // because "the attendee product has no admin surface" is about the client; this is the
    // server half, and it is what makes FR-1003's absence more than a routing decision.
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })

    const attendeeCookie = signIn.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const response = await readProgramme(attendeeCookie, fixture.assigned.eventId)

    expect(response.statusCode).toBe(401)
  })
})
