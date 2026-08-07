import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { hashAttemptValue } from '../../src/auth/throttle.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T104 (004) — **`sign_in_attempts` is deliberately NOT deleted with the account**
 * (FR-382, research D10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS LOOKS LIKE A GAP IN A FEATURE WHOSE POINT IS COMPLETE DELETION. IT IS NOT.**
 *
 * The table has no foreign key by design, so nothing reaches it — and adding one, or deleting
 * these rows explicitly, would hand an attacker a way to **clear their own trail**: register an
 * account, spray credentials at other addresses, delete the account, and every record of the
 * attempt goes with it. Deletion would become an anti-forensic tool.
 *
 * The rows are pseudonymous — keyed hashes, never addresses — and they expire on the two-hour
 * sweep, which FR-382 forbids lengthening. So the data is minimal, unattributable without the
 * key, and short-lived; those three properties together are why leaving it is the right answer
 * rather than a compromise.
 *
 * This test exists so that a future reader who notices the "gap" finds the reasoning attached
 * to an assertion, rather than deciding it was an oversight and closing it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('sign-in attempts survive account deletion, by design (research D10)', () => {
  let app: FastifyInstance
  let token: string

  const EMAIL = 'leaves-a-trail@example.com'
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
      payload: { email: EMAIL, displayName: 'Leaves A Trail', password: PASSWORD },
    })
    token = sessionCookieFrom(created) as string

    // A few failures, which is what an attacker's trail actually looks like.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: EMAIL, password: 'wrong' },
      })
    }
  })

  const attemptsForAddress = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM sign_in_attempts
      WHERE identifier_hash = ${hashAttemptValue(EMAIL)}
    `)
    return Number(rows[0]?.count)
  }

  it('records the attempts in the first place', async () => {
    expect(await attemptsForAddress()).toBeGreaterThan(0)
  })

  it('keeps them after the account is deleted', async () => {
    const before = await attemptsForAddress()

    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/account',
          headers: { cookie: cookieHeader(token) },
        })
      ).statusCode,
    ).toBe(204)

    expect(
      await attemptsForAddress(),
      'Deleting these would let an attacker clear their own trail by registering an account and ' +
        'deleting it. The rows are pseudonymous and expire in two hours; that is what makes ' +
        'keeping them the right answer rather than a compromise (research D10).',
    ).toBe(before)
  })

  it('holds no readable address, so what survives is pseudonymous (FR-042)', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(token) },
    })

    const rows = await getDb().execute<Record<string, unknown>>(sql`
      SELECT * FROM sign_in_attempts
    `)

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      for (const value of Object.values(row)) {
        expect(String(value), 'the address itself must never be stored').not.toContain(EMAIL)
        expect(String(value)).not.toContain('@')
      }
    }
  })

  it('carries no foreign key to attendees, which is what makes the above possible', async () => {
    // Asserted on the schema rather than on behaviour: adding the key is precisely the change
    // somebody would make to "fix" this, and it would take the rows with the account silently.
    const keys = await getDb().execute<{ conname: string }>(sql`
      SELECT c.conname FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'sign_in_attempts' AND c.contype = 'f'
    `)

    expect(keys).toEqual([])
  })

  it('is covered by the retention sweep instead, at two hours (FR-382)', async () => {
    const { RETENTION_SWEEPS } = await import('../../src/maintenance.js')
    const sweep = RETENTION_SWEEPS.find((entry) => entry.table === 'sign_in_attempts')

    expect(
      sweep,
      'no cascade reaches this table, so a sweep is the ONLY thing that can',
    ).toBeDefined()
    expect(sweep?.window).toBe('2 hours')

    // And the sweep genuinely removes aged rows, rather than merely being declared.
    await getDb().execute(sql`
      UPDATE sign_in_attempts SET occurred_at = now() - interval '3 hours'
    `)
    await sweep?.run()

    const remaining = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM sign_in_attempts
    `)
    expect(remaining[0]?.count).toBe('0')
  })
})
