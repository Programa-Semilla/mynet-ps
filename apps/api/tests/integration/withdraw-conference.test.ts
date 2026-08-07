import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_EVENTS,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T105 (004) — withdrawing from a conference (FR-317c, FR-317d, research D7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE GAP THIS FILE EXISTS FOR IS INVISIBLE IN THE SCHEMA.**
 *
 * `saved_sessions` and `session_notes` reference `sessions`, not `registrations`. So removing a
 * registration **does not** cascade to either: an attendee who left a conference would keep
 * their saves and their private notes for it, indefinitely, with no surface that shows them and
 * no way to remove them.
 *
 * Nothing about the foreign keys looks wrong. It is exactly the kind of gap FR-370's structural
 * guard exists to catch — and it is caught here by having been written down (research D7)
 * rather than by the guard, because the rows *are* cascade-reachable from `attendees`; they are
 * simply not reachable from the thing being deleted.
 *
 * The opposite case needs no code at all: `active_event_selections` carries a composite foreign
 * key to `registrations (attendee_id, event_id)` with `ON DELETE CASCADE`, which 002 declared
 * deliberately. This is the first path to exercise it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('withdrawing from a conference (FR-317c)', () => {
  let app: FastifyInstance
  let token: string
  let attendeeId: string
  let firstEventId: string
  let secondEventId: string

  const EMAIL = 'withdrawing@example.com'
  const PASSWORD = 'correct-horse-battery-staple'

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    await getDb().execute(sql`DELETE FROM attendees WHERE email = ${EMAIL}`)

    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: EMAIL, displayName: 'Withdrawing', password: PASSWORD },
    })
    token = sessionCookieFrom(created) as string

    const rows = await getDb().execute<{ id: string }>(sql`
      SELECT id FROM attendees WHERE email = ${EMAIL}
    `)
    attendeeId = rows[0]?.id as string

    const join = async (code: string) => {
      const joined = await app.inject({
        method: 'POST',
        url: '/events/join',
        headers: { cookie: cookieHeader(token) },
        payload: { joinCode: code },
      })
      return (joined.json() as { event: { id: string } }).event.id
    }

    firstEventId = await join(SEED_EVENTS[0].joinCode)
    secondEventId = await join(SEED_EVENTS[1].joinCode)

    // Per-conference state in BOTH, so the assertions can tell "removed the right one" from
    // "removed everything".
    for (const eventId of [firstEventId, secondEventId]) {
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
        payload: { body: `A note for ${eventId}.` },
      })
    }

    await app.inject({
      method: 'PUT',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(token) },
      payload: { eventId: firstEventId },
    })

    // A profile, so the "untouched" assertion has something to be about.
    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(token) },
      payload: { company: 'Still Employed Ltd', interests: ['Still interested'] },
    })
  })

  const withdraw = (eventId: string) =>
    app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/registration`,
      headers: { cookie: cookieHeader(token) },
    })

  const countFor = async (table: string, eventId: string): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql.raw(`
        SELECT count(*)::text AS count FROM ${table} t
        JOIN sessions s ON s.id = t.session_id
        WHERE t.attendee_id = '${attendeeId}' AND s.event_id = '${eventId}'
      `),
    )
    return Number(rows[0]?.count)
  }

  it('removes the registration', async () => {
    expect((await withdraw(firstEventId)).statusCode).toBe(204)

    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(token) },
    })

    const remaining = (events.json() as Array<{ id: string }>).map((event) => event.id)
    expect(remaining).not.toContain(firstEventId)
    expect(remaining).toContain(secondEventId)
  })

  it("removes that conference's saved sessions and notes — which do NOT cascade (D7)", async () => {
    expect(await countFor('saved_sessions', firstEventId)).toBe(1)
    expect(await countFor('session_notes', firstEventId)).toBe(1)

    await withdraw(firstEventId)

    expect(
      await countFor('saved_sessions', firstEventId),
      'These reference `sessions`, not `registrations`, so nothing removes them automatically. ' +
        'Left behind, they are private notes for a conference the attendee has left, with no ' +
        'surface that shows them and no way to remove them (research D7).',
    ).toBe(0)
    expect(await countFor('session_notes', firstEventId)).toBe(0)
  })

  it("leaves the OTHER conference's saved sessions and notes alone", async () => {
    await withdraw(firstEventId)

    expect(await countFor('saved_sessions', secondEventId)).toBe(1)
    expect(await countFor('session_notes', secondEventId)).toBe(1)
  })

  it('removes the active-conference selection through the composite key 002 declared', async () => {
    const before = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM active_event_selections
      WHERE attendee_id = ${attendeeId}::uuid AND event_id = ${firstEventId}::uuid
    `)
    expect(before[0]?.count).toBe('1')

    await withdraw(firstEventId)

    const after = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM active_event_selections
      WHERE attendee_id = ${attendeeId}::uuid
    `)
    expect(
      after[0]?.count,
      'No statement removes this — the composite foreign key to `registrations` does, with ' +
        'ON DELETE CASCADE. 002 built that deliberately and this is the first path to use it.',
    ).toBe('0')
  })

  it('leaves the attendee coherent, on another conference (FR-317d)', async () => {
    await withdraw(firstEventId)

    const active = await app.inject({
      method: 'GET',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(token) },
    })

    // Falls back to derivation over the remaining registrations. Not an empty conference, not a
    // pointer at the one they just left, and no explicit action required of them.
    expect(active.statusCode).toBe(200)
    expect((active.json() as { id: string }).id).toBe(secondEventId)
  })

  it('leaves the attendee coherent with NO conferences left (FR-317d, FR-308)', async () => {
    await withdraw(firstEventId)
    await withdraw(secondEventId)

    const active = await app.inject({
      method: 'GET',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(token) },
    })

    // 204, which the client renders as the invitation to join rather than an empty conference.
    expect(active.statusCode).toBe(204)
  })

  it('does not touch the profile, which is cross-event (FR-317c)', async () => {
    await withdraw(firstEventId)
    await withdraw(secondEventId)

    const profile = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(token) },
    })

    // A profile describes the person, not their presence at one conference. Leaving every
    // conference is not leaving the product.
    expect(profile.json()).toMatchObject({
      company: 'Still Employed Ltd',
      interests: ['Still interested'],
    })
  })

  it('does not delete the account', async () => {
    await withdraw(firstEventId)

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(token) },
    })
    expect(me.statusCode).toBe(200)
  })

  it('refuses a conference the attendee never joined, indistinguishably (FR-148)', async () => {
    await withdraw(firstEventId)

    const again = await withdraw(firstEventId)
    const never = await app.inject({
      method: 'DELETE',
      url: '/events/00000000-0000-4000-8000-000000000000/registration',
      headers: { cookie: cookieHeader(token) },
    })

    expect(again.statusCode).toBe(404)
    expect(never.statusCode).toBe(404)
    expect(again.body).toEqual(never.body)
  })

  it('refuses an unauthenticated caller', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/events/${firstEventId}/registration`,
    })
    expect(response.statusCode).toBe(401)
  })

  it('cannot withdraw somebody else — you can only leave what you joined', async () => {
    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: 'grace@example.com', password: PASSWORD },
      }),
    ) as string

    // Grace is not registered for Frontend Horizons, so the guard cannot build a scope for her.
    const response = await app.inject({
      method: 'DELETE',
      url: `/events/${secondEventId}/registration`,
      headers: { cookie: cookieHeader(grace) },
    })
    expect(response.statusCode).toBe(404)

    // …and the withdrawing attendee's own registration is untouched by the attempt.
    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(token) },
    })
    expect((events.json() as Array<{ id: string }>).map((e) => e.id)).toContain(secondEventId)
  })
})
