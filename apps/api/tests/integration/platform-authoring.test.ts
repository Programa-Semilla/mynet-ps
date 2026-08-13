import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  platformSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, setupTestApp, teardown } from './helpers.js'

/**
 * T029 (014) — **a platform operator authors a conference they hold no assignment for, on the
 * same terms as an assigned organizer** (FR-1002).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **"THE SAME TERMS" IS THE ASSERTION, AND IT CUTS BOTH WAYS.**
 *
 * FR-1002 gives the platform tier the authoring capability over **every** conference. It does not
 * give them a *different* capability: no extra route, no bypass of the engagement refusal, no
 * ability to edit a profile. A tier that could do more than an organizer here would be a
 * privilege nobody wrote down, and the natural place for one to appear is exactly this —
 * "platform operators can always do it" is an easy branch to add.
 *
 * So the assertions are that they can do what an organizer can (over a conference nobody assigned
 * them) and **cannot do what an organizer cannot**.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('platform-tier authoring (T029, FR-1002)', () => {
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
    cookie = await platformSession(app)
  })

  /** The conference the seeded organizer runs — and which the operator is NOT assigned to. */
  const at = (rest: string): string => `/admin/conferences/${fixture.unassigned.eventId}${rest}`

  it('holds no assignment for the conference it is about to author', async () => {
    // The premise, asserted rather than assumed. Without it the whole file could pass because
    // the fixture quietly assigned the operator, and FR-1002 would be untested.
    const assignments = await getDb()
      .select({ id: organizerAssignments.id })
      .from(organizerAssignments)
      .where(eq(organizerAssignments.eventId, fixture.unassigned.eventId))

    expect(assignments).toEqual([])
  })

  it('reads the programme of an unassigned conference', async () => {
    const response = await app.inject({ method: 'GET', url: at('/programme'), headers: { cookie } })
    expect(response.statusCode).toBe(200)
  })

  it('creates a session in an unassigned conference', async () => {
    const response = await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.unassigned),
    })

    expect(response.statusCode).toBe(201)
  })

  it('records the act against the OPERATOR, not against an attendee', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The two principals land in two columns, and this is the half an organizer's act cannot
    // exercise. A platform operator has no `attendees` row at all (FR-901), so an entry naming
    // them in `actor_attendee_id` would be a dangling reference to somebody who does not exist.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.unassigned),
    })

    const entries = await getDb()
      .select({
        action: adminAuditEntries.action,
        operatorId: adminAuditEntries.operatorId,
        actorAttendeeId: adminAuditEntries.actorAttendeeId,
      })
      .from(adminAuditEntries)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.action).toBe('write_session')
    expect(entries[0]?.operatorId).toBe(fixture.operatorId)
    expect(entries[0]?.actorAttendeeId).toBeNull()
  })

  it('is refused the same things an organizer is refused — the tier is not a bypass', async () => {
    // FR-1005's scoping applies identically. A platform operator authoring conference B may not
    // reach into conference A's tracks either: the rule is about the conference, not the tier.
    const response = await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.unassigned, { trackId: fixture.assigned.trackId }),
    })

    expect(
      response.statusCode,
      'A platform operator assembled a session from two conferences. Product-wide authority ' +
        'means they may author every conference, not that a conference stops being a boundary ' +
        '(FR-1002, FR-1005).',
    ).toBe(404)
  })

  it('is refused a conference that does not exist, like anybody else', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/conferences/00000000-0000-4000-8000-000000000000/programme',
      headers: { cookie },
    })

    expect(response.statusCode).toBe(404)
  })
})
