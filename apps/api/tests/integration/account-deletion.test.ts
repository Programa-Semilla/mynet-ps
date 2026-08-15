import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  ensureInterestOptions,
  resetDatabase,
  SEED_EVENTS,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T100 (004) — **zero rows, asserted by direct database query** (FR-364, FR-366, FR-371,
 * SC-306).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FR-371 IS SPECIFIC: "ASSERTING ABSENCE OF ROWS RATHER THAN ABSENCE OF ERRORS."**
 *
 * A deletion test that checks the route answered 204 proves the route answered 204. This
 * queries every table in data-model.md by hand, after deleting an attendee who had data in all
 * of them, and requires every count to be zero.
 *
 * It is also **the moment 005's cascade becomes real**. `saved_sessions` and `session_notes`
 * have declared `ON DELETE CASCADE` since 005 shipped, on a retention commitment that has been
 * operationally unreachable ever since, because no route could delete an account. 005's own
 * `agenda-deletion.test.ts` had to delete the attendee row directly to test it. This is the
 * first time the product itself can.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('deleting an account removes every row attributable to it (SC-306)', () => {
  let app: FastifyInstance
  let token: string
  let attendeeId: string

  const EMAIL = 'leaving@example.com'
  const PASSWORD = 'correct-horse-battery-staple'

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    // T174 (014 tranche 2) — FR-1088: the interest this suite attributes before deleting is
    // written through the route, so it has to be choosable.
    await ensureInterestOptions(['Leaving'])
  })

  afterAll(async () => {
    await teardown(app)
  })

  /** An attendee with data across four features, which is what US7's independent test asks for. */
  beforeEach(async () => {
    await clearThrottle()
    await getDb().execute(sql`DELETE FROM attendees WHERE email = ${EMAIL}`)

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: EMAIL, displayName: 'Leaving Soon', password: PASSWORD },
    })
    token = sessionCookieFrom(created) as string

    const rows = await getDb().execute<{ id: string }>(sql`
      SELECT id FROM attendees WHERE email = ${EMAIL}
    `)
    attendeeId = rows[0]?.id as string

    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })
    const eventId = (joined.json() as { event: { id: string } }).event.id

    const sessions = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(token) },
    })
    const sessionId = (sessions.json() as Array<{ id: string }>)[0]?.id as string

    await app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/saved/${sessionId}`,
      headers: { cookie: cookieHeader(token) },
    })
    await app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/notes/${sessionId}`,
      headers: { cookie: cookieHeader(token) },
      payload: { body: 'Something private.' },
    })
    await app.inject({
      method: 'PUT',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(token) },
      payload: { eventId },
    })
    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(token) },
      payload: { company: 'Soon To Be Gone', interests: ['Leaving'] },
    })
    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: EMAIL },
    })

    const image = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer()
    await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(token) },
      payload: { image: image.toString('base64') },
    })
  })

  const countIn = async (table: string, column = 'attendee_id'): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql.raw(`SELECT count(*)::text AS count FROM ${table} WHERE ${column} = '${attendeeId}'`),
    )
    return Number(rows[0]?.count)
  }

  const remove = () =>
    app.inject({ method: 'DELETE', url: '/account', headers: { cookie: cookieHeader(token) } })

  it('the fixture really does have data everywhere — otherwise this proves nothing', async () => {
    // The guard that stops every assertion below passing vacuously: deleting an attendee with
    // no data would satisfy every "zero rows" check without the cascade doing anything at all.
    for (const table of [
      'attendee_credentials',
      'auth_sessions',
      'registrations',
      'active_event_selections',
      'saved_sessions',
      'session_notes',
      'attendee_profiles',
      'attendee_interests',
      'attendee_verifications',
      'attendee_password_resets',
    ]) {
      expect(await countIn(table), `${table} must hold a row before deletion`).toBeGreaterThan(0)
    }

    expect(await countIn('attendees', 'id')).toBe(1)
  })

  it('leaves ZERO rows in every table, by direct query (FR-371, SC-306)', async () => {
    expect((await remove()).statusCode).toBe(204)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Every table data-model.md lists, checked one by one rather than by a helper that could
    // silently iterate an empty list. `saved_sessions` and `session_notes` are 005's cascade,
    // reachable for the first time.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(await countIn('attendees', 'id')).toBe(0)
    expect(await countIn('attendee_credentials')).toBe(0)
    expect(await countIn('auth_sessions')).toBe(0)
    expect(await countIn('registrations')).toBe(0)
    expect(await countIn('active_event_selections')).toBe(0)
    expect(await countIn('saved_sessions')).toBe(0)
    expect(await countIn('session_notes')).toBe(0)
    expect(await countIn('attendee_profiles')).toBe(0)
    expect(await countIn('attendee_interests')).toBe(0)
    expect(await countIn('attendee_verifications')).toBe(0)
    expect(await countIn('attendee_password_resets')).toBe(0)
  })

  it('touches nobody else', async () => {
    const before = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email <> ${EMAIL}
    `)

    await remove()

    const after = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email <> ${EMAIL}
    `)

    expect(after[0]?.count).toBe(before[0]?.count)

    // …and the conference itself survives. Leaving is not deleting what you left.
    const events = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM events
    `)
    expect(Number(events[0]?.count)).toBe(SEED_EVENTS.length)
  })

  it('frees the address for re-registration, with a genuinely new and empty account', async () => {
    await remove()
    await clearThrottle()

    // Hard deletion plus a unique constraint means the address is free. Retaining it to prevent
    // reuse would be a tombstone by another name, which FR-365 forbids (Assumptions).
    const again = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: EMAIL, displayName: 'Back Again', password: PASSWORD },
    })
    expect(again.statusCode).toBe(204)

    const fresh = sessionCookieFrom(again) as string
    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(fresh) },
    })

    // Inheriting nothing (Assumptions). A profile carried over would mean the deletion left
    // something behind.
    expect(profile.json()).toMatchObject({
      displayName: 'Back Again',
      company: null,
      interests: [],
      hasAvatar: false,
      emailVerified: false,
    })

    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(fresh) },
    })
    expect(events.json()).toEqual([])
  })

  it('refuses an unauthenticated caller (FR-386)', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/account' })
    expect(response.statusCode).toBe(401)
  })

  it('has no address in which another attendee could be named (FR-385)', async () => {
    // The strongest form of "MUST NOT trust a client-supplied identifier" is a route with
    // nowhere to put one. A query parameter must delete the caller, not the named attendee.
    const grace = await getDb().execute<{ id: string }>(sql`
      SELECT id FROM attendees WHERE email = 'grace@example.com'
    `)

    await app.inject({
      method: 'DELETE',
      url: `/account?attendeeId=${grace[0]?.id}`,
      headers: { cookie: cookieHeader(token) },
    })

    const survivors = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email = 'grace@example.com'
    `)
    expect(survivors[0]?.count, 'Grace must still exist').toBe('1')
  })
})
