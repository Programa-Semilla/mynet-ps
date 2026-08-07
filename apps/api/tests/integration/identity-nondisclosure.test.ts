import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_EVENTS,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T114 (004) — **no refusal distinguishes existence from non-existence** (FR-388).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE DELIBERATE EXCEPTION IS SIGN-UP, AND IT IS ASSERTED AS AN EXCEPTION.**
 *
 * FR-303 accepts that sign-up discloses whether an address is registered, because it cannot
 * avoid it alongside FR-306: a new address signs the person in and an existing one does not, so
 * the two outcomes differ whatever the wording says. A requirement to hide it would have been
 * satisfied on paper and defeated in practice.
 *
 * Everything else hides it, and this file compares responses **to each other** rather than
 * checking each is a 404 — because "both are 404" proves nothing if one carries a helpful
 * message and the other does not.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('refusals disclose nothing about existence (FR-388)', () => {
  let app: FastifyInstance
  let ada: string
  let graceId: string
  let sharedEventId: string

  const NOBODY = '00000000-0000-4000-8000-000000000000'

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    const attendees = await getDb().execute<{ id: string; email: string }>(sql`
      SELECT id, email FROM attendees
    `)
    graceId = attendees.find((row) => row.email === GRACE)?.id as string

    const events = await getDb().execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM events
    `)
    sharedEventId = events.find((row) => row.name === SEED_EVENTS[0].name)?.id as string
  })

  afterAll(async () => {
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

  const as = () => ({ cookie: cookieHeader(ada) })

  it('answers a reset request identically for a known and an unknown address (FR-327)', async () => {
    const known = await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: ADA },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'definitely-nobody@example.com' },
    })

    expect(known.statusCode).toBe(unknown.statusCode)
    expect(known.body).toEqual(unknown.body)
    expect(known.headers['retry-after']).toEqual(unknown.headers['retry-after'])
  })

  it('answers sign-in identically for a wrong password and an unknown address (FR-030)', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: 'not-the-right-one' },
    })
    await clearThrottle()
    const unknownAddress = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'definitely-nobody@example.com', password: 'not-the-right-one' },
    })

    expect(wrongPassword.statusCode).toBe(401)
    expect(wrongPassword.body).toEqual(unknownAddress.body)
  })

  it('answers a dead verification link identically to an unknown one (FR-321)', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { token: 'never-issued-by-anybody' },
    })
    const alsoUnknown = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { token: 'also-never-issued' },
    })

    expect(unknown.statusCode).toBe(410)
    expect(unknown.body).toEqual(alsoUnknown.body)
  })

  it('answers a dead reset link identically to an unknown one, and to a verification token', async () => {
    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: 'never-issued', password: 'a-perfectly-good-passphrase' },
    })
    const verification = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { token: 'never-issued' },
    })

    // Both are `link_expired`, from one factory. A caller cannot learn which kind of link they
    // are holding, nor that it ever existed.
    expect(reset.statusCode).toBe(410)
    expect(reset.json()).toMatchObject({ code: 'link_expired' })
    expect(verification.json()).toMatchObject({ code: 'link_expired' })
  })

  it('answers a hidden co-attendee identically to one who does not exist (FR-361)', async () => {
    await getDb().execute(sql`
      UPDATE attendees SET discoverable = false WHERE id = ${graceId}::uuid
    `)

    const hidden = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees/${graceId}`,
      headers: as(),
    })
    const nobody = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees/${NOBODY}`,
      headers: as(),
    })

    expect(hidden.statusCode).toBe(404)
    expect(hidden.body).toEqual(nobody.body)

    await getDb().execute(sql`
      UPDATE attendees SET discoverable = true WHERE id = ${graceId}::uuid
    `)
  })

  it('answers an unrecognised join code identically however it is wrong (FR-313)', async () => {
    const nonsense = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: as(),
      payload: { joinCode: 'DEFINITELY-NOT-A-CODE' },
    })
    const nearMiss = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: as(),
      payload: { joinCode: `${SEED_EVENTS[0].joinCode}X` },
    })

    expect(nonsense.statusCode).toBe(404)
    expect(nonsense.body).toEqual(nearMiss.body)
  })

  it('answers a conference the attendee is not in identically to one that does not exist', async () => {
    const events = await getDb().execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM events WHERE name = ${SEED_EVENTS[2].name}
    `)

    const notMine = await app.inject({
      method: 'GET',
      url: `/events/${events[0]?.id}/sessions`,
      headers: as(),
    })
    const noSuch = await app.inject({
      method: 'GET',
      url: `/events/${NOBODY}/sessions`,
      headers: as(),
    })

    expect(notMine.statusCode).toBe(404)
    expect(notMine.body).toEqual(noSuch.body)
  })

  it('DOES disclose on sign-up — and that is the one accepted exception (FR-303)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Asserted rather than omitted, because an exception nobody wrote a test for is
    // indistinguishable from a defect. If a later change made this hide the difference, that
    // would be a *behaviour* change on the product's most public route and it should fail here
    // rather than pass silently.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const existing = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: ADA, displayName: 'Somebody', password: SEED_PASSWORD },
    })
    await clearThrottle()
    const fresh = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `brand-new-${Math.random().toString(36).slice(2)}@example.com`,
        displayName: 'Somebody',
        password: SEED_PASSWORD,
      },
    })

    expect(existing.statusCode).toBe(409)
    expect(fresh.statusCode).toBe(204)
    expect(
      existing.body,
      'FR-303: the disclosure is accepted because it is unavoidable alongside auto-sign-in. ' +
        'Rate limiting is what defends enumeration (FR-307).',
    ).not.toEqual(fresh.body)
  })
})
