import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T103 (004) — **every session, on every device, immediately** (FR-369).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The edge case the specification names outright: *an attendee deletes their account while
 * signed in on a second device. The second session must stop working; it must not present a
 * signed-in shell for an attendee who no longer exists.*
 *
 * That second half is the failure mode worth naming. A client whose session token still
 * resolves would keep rendering a workspace — a greeting, a conference, an agenda — for an
 * account that has been deleted, and every request it made would 500 rather than refuse
 * cleanly. Somebody who has just asked to be forgotten would be looking at their own name.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('deletion ends every session on every device (FR-369)', () => {
  let app: FastifyInstance
  let phone: string
  let laptop: string
  let kiosk: string

  const EMAIL = 'three-devices@example.com'
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
      payload: { email: EMAIL, displayName: 'Three Devices', password: PASSWORD },
    })
    phone = sessionCookieFrom(created) as string

    const signIn = async () =>
      sessionCookieFrom(
        await app.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: { email: EMAIL, password: PASSWORD },
        }),
      ) as string

    laptop = await signIn()
    kiosk = await signIn()
  })

  const me = (token: string) =>
    app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader(token) } })

  it('has three independent sessions before deletion — one row per sign-in (FR-029)', async () => {
    expect(new Set([phone, laptop, kiosk]).size, 'three distinct tokens').toBe(3)

    for (const token of [phone, laptop, kiosk]) {
      expect((await me(token)).statusCode).toBe(200)
    }
  })

  it('stops all three the moment the account is deleted', async () => {
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/account',
          headers: { cookie: cookieHeader(phone) },
        })
      ).statusCode,
    ).toBe(204)

    // Immediately: the very next request from each device, with no intervening step.
    for (const [name, token] of [
      ['phone', phone],
      ['laptop', laptop],
      ['kiosk', kiosk],
    ] as const) {
      expect((await me(token)).statusCode, `${name} still authenticates`).toBe(401)
    }
  })

  it('refuses cleanly rather than failing — no signed-in shell for a deleted attendee', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(phone) },
    })

    // 401 rather than 500, and with the API's own error vocabulary. A client seeing a server
    // fault would show a "something went wrong" state rather than signing the person out.
    const response = await me(laptop)
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ code: 'not_authenticated' })
  })

  it('refuses every other surface too, not only identity', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(phone) },
    })

    for (const url of ['/profile', '/events', '/workspace/active-event', '/profile/export']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: cookieHeader(laptop) },
      })
      expect(response.statusCode, `${url} answered ${response.statusCode}`).toBe(401)
    }
  })

  it('clears the cookie on the device that asked (FR-368)', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(phone) },
    })

    // The lesser half of ending a session — revocation is what ends it — but it is what stops
    // the browser sending a token the server has already destroyed.
    const cleared = response.cookies.find((cookie) => cookie.name === 'mynet_session')
    expect(cleared?.value).toBe('')
  })

  it('leaves no session row at all, rather than revoked ones', async () => {
    const before = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM auth_sessions s
      JOIN attendees a ON a.id = s.attendee_id WHERE a.email = ${EMAIL}
    `)
    expect(Number(before[0]?.count)).toBe(3)

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(phone) },
    })

    // Revoked-and-kept would be a record of when this attendee was using MyNet, surviving the
    // account it belonged to. The cascade removes the rows outright (FR-365).
    const after = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM auth_sessions WHERE attendee_id IS NOT NULL
        AND attendee_id NOT IN (SELECT id FROM attendees)
    `)
    expect(after[0]?.count).toBe('0')
  })

  it('does not sign anybody else out', async () => {
    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: 'grace@example.com', password: PASSWORD },
      }),
    ) as string

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(phone) },
    })

    expect((await me(grace)).statusCode).toBe(200)
  })
})
