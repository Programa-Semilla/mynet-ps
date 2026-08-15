import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  attendeeIdsByEmail,
  createDirectoryPopulation,
  eventIdsByName,
  OTHER_EVENT,
  removeDirectoryPopulation,
  SHARED_EVENT,
} from './directory-fixtures.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T042 (006) — the directory is bounded to one conference, on both sides (FR-401, FR-401a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TWO SEPARATE BOUNDS, AND ONLY ONE OF THEM IS ENFORCED BY THE GUARD.**
 *
 * The *reader's* registration is proven by the branded `EventScope`, which only
 * `requireEventAccess` can construct and which `tests/unit/event-scope-audit.test.ts` fails the
 * build for omitting. That half needs no test here to be safe — but it gets one anyway, because
 * a passing audit and a working route are different claims.
 *
 * The *target's* registration is a join inside the query, and nothing structural enforces it.
 * A query that joined `attendees` without `registrations` would return every attendee in the
 * product to anyone registered for any conference — the largest possible failure of Principle
 * VIII, produced by one missing line. That is what the second half of this file is for.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const HERE = 'scoped-here@example.test'
const THERE = 'scoped-there@example.test'
const FIXTURES = [HERE, THERE]

describe('the directory is bounded to the conference in its address (FR-401)', () => {
  let app: FastifyInstance
  let ada: string
  let sharedEventId: string
  let otherEventId: string
  let ids: Map<string, string>

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    const eventIds = await eventIdsByName()
    sharedEventId = eventIds.get(SHARED_EVENT) as string
    otherEventId = eventIds.get(OTHER_EVENT) as string

    ids = await createDirectoryPopulation([
      {
        email: HERE,
        displayName: 'Hector Here',
        company: 'This Conference Ltd',
        interests: ['Design systems'],
      },
      {
        email: THERE,
        displayName: 'Theodora There',
        company: 'That Conference Ltd',
        event: OTHER_EVENT,
        interests: ['Design systems'],
      },
    ])
  })

  afterAll(async () => {
    await removeDirectoryPopulation(FIXTURES)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
  })

  const list = (eventId: string, token = ada) =>
    app.inject({
      method: 'GET',
      url: `/events/${eventId}/attendees`,
      headers: { cookie: cookieHeader(token) },
    })

  it('returns only attendees registered for the conference in the path', async () => {
    const response = await list(sharedEventId)

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('Hector Here')
    expect(
      response.body,
      'An attendee registered for a different conference must not appear, in any field. A query ' +
        'missing the registrations join returns the entire product to everybody.',
    ).not.toContain('Theodora There')
    expect(response.body).not.toContain(ids.get(THERE) as string)
  })

  it('refuses a conference the reader is not registered for, identically to one that does not exist', async () => {
    // Ada is not registered for `Systems & Scale`; Grace is. The refusal must not tell Ada
    // which of those two facts is true, nor that the conference exists at all.
    const notRegistered = await list(otherEventId)
    const nonexistent = await list('00000000-0000-4000-8000-000000000000')

    expect(notRegistered.statusCode).toBe(404)
    expect(nonexistent.statusCode).toBe(404)
    expect(
      notRegistered.body,
      'A 403 for "exists but not yours" and a 404 for "does not exist" would let an attendee ' +
        'enumerate every conference in the product (FR-148).',
    ).toEqual(nonexistent.body)
  })

  it('refuses a malformed conference identifier the same way', async () => {
    const malformed = await list('not-a-uuid')
    const nonexistent = await list('00000000-0000-4000-8000-000000000000')

    expect(malformed.statusCode).toBe(404)
    expect(malformed.body).toEqual(nonexistent.body)
  })

  it('gives two readers of the same conference the same directory', async () => {
    await clearThrottle()
    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: GRACE, password: SEED_PASSWORD },
      }),
    ) as string

    const asAda = (await list(sharedEventId)).json().attendees as { attendeeId: string }[]
    const asGrace = (await list(sharedEventId, grace)).json().attendees as { attendeeId: string }[]

    // Each reader is excluded from their own directory, so the sets differ by exactly the two
    // readers. Everything else must be identical: the directory is a property of the
    // conference, not of who is looking.
    const adaSees = new Set(asAda.map((entry) => entry.attendeeId))
    const graceSees = new Set(asGrace.map((entry) => entry.attendeeId))

    expect(adaSees.has(ids.get(HERE) as string)).toBe(true)
    expect(graceSees.has(ids.get(HERE) as string)).toBe(true)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The sets are actually compared** — this used to assert only that each contained one
    // known attendee, which would pass if Grace's directory were an arbitrary superset or
    // subset of Ada's: exactly the failure the sentence above names.
    //
    // They differ by exactly the two readers, each excluded from their own directory.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const byEmail = await attendeeIdsByEmail()
    const adaId = byEmail.get(ADA) as string
    const graceId = byEmail.get(GRACE) as string

    expect([...adaSees].filter((id) => id !== graceId).sort()).toEqual(
      [...graceSees].filter((id) => id !== adaId).sort(),
    )
  })

  /**
   * FR-401a's server-side half. The client re-renders on switch; this asserts there is nothing
   * for it to carry over — the conference in the address decides the whole result, with no
   * server-side notion of "the active conference" involved.
   */
  it('takes the conference from the address, never from an ambient active-conference state', async () => {
    // Ada's active conference is whatever `resolveActiveEvent` picks. Reading a *different*
    // conference she is registered for must answer about that one.
    const frontendHorizons = (await eventIdsByName()).get('Frontend Horizons') as string

    const response = await list(frontendHorizons)

    expect(response.statusCode).toBe(200)
    expect(
      response.body,
      'The conference is a path parameter carrying its own guard. A route that consulted the ' +
        "reader's active conference instead would answer the wrong question after a switch.",
    ).not.toContain('Hector Here')
  })
})
