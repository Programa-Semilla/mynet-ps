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
 * T038 (004) — the address is unique **product-wide, not per conference** (FR-302).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **This is the assertion that keeps the event switcher meaningful.**
 *
 * A per-conference unique constraint would give the same person a separate identity at each
 * conference — separate saved sessions, separate notes, a separate profile — and the switcher
 * would be switching between strangers who happen to share an address. 001 chose a global
 * UNIQUE for exactly this reason and `schema/attendees.ts` records it; self sign-up is the first
 * path that could actually violate it, because before 004 the only way to create an account was
 * a seed script that inserted a fixed list.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('address uniqueness is product-wide, not per conference (FR-302)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  const address = 'one-person@example.com'
  const password = 'correct-horse-battery-staple'

  it('refuses a second account for an address already registered at another conference', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: address, displayName: 'One Person', password },
    })
    expect(first.statusCode).toBe(204)

    const token = sessionCookieFrom(first) as string

    // Join one conference, so the account is unambiguously "at" a conference. If uniqueness
    // were per-conference, this is exactly the state in which a second account for a *different*
    // conference would be permitted.
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })
    expect(joined.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: address, displayName: 'One Person Again', password },
    })

    expect(
      second.statusCode,
      'Uniqueness is on the address alone. There is no conference in which this address is free.',
    ).toBe(409)

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email = ${address}
    `)
    expect(rows[0]?.count).toBe('1')
  })

  it('has no conference column on the uniqueness constraint at all', async () => {
    // The behavioural assertion above could pass against a per-conference constraint that
    // simply had not been exercised. This reads the constraint itself: one account, one
    // address, product-wide, with nothing scoping it.
    const rows = await getDb().execute<{ definition: string }>(sql`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'attendees' AND c.contype = 'u'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.definition).toBe('UNIQUE (email)')
    expect(
      rows[0]?.definition,
      'A conference in this constraint would give one person a separate identity per event ' +
        '(FR-302), and the event switcher would be switching between strangers.',
    ).not.toContain('event')
  })
})
