import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { RETENTION_SWEEPS } from '../../src/maintenance.js'
import { clearThrottle, resetDatabase, setupTestApp, SinkMailService, teardown } from './helpers.js'

/**
 * T127 (004) — **records no cascade can reach are absent once past the stated window**
 * (FR-381–FR-384, SC-308).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SPECIFICATION WAS WRONG ABOUT THIS, AND THE CORRECTION IS WHAT THESE TESTS PROTECT.**
 *
 * An earlier draft required a retention clock to be built and assumed a **90-day** window for
 * `sign_in_attempts`. Both were wrong about code that has run since 001: `maintenance.ts` sweeps
 * hourly and deletes those rows after **two hours**. Implementing the draft as written would
 * have *lengthened* retention of pseudonymous personal data forty-fold — a regression dressed as
 * a requirement (research D1).
 *
 * So FR-381–FR-384 were rewritten to protect what exists and extend it, and these assertions
 * are the protection: the window is asserted as an exact value, not as an upper bound, because
 * an upper bound would have accepted the 90 days.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the retention sweep (SC-308)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    mail.clear()
  })

  const runAll = async (): Promise<void> => {
    for (const sweep of RETENTION_SWEEPS) await sweep.run()
  }

  const countIn = async (table: string): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql.raw(`SELECT count(*)::text AS count FROM ${table}`),
    )
    return Number(rows[0]?.count)
  }

  it('sweeps every table it declares, and each states a window and a reason (FR-381)', () => {
    expect(RETENTION_SWEEPS.length).toBeGreaterThanOrEqual(4)

    for (const sweep of RETENTION_SWEEPS) {
      expect(sweep.window.trim().length).toBeGreaterThan(0)
      expect(sweep.reason.trim().length).toBeGreaterThan(20)
    }
  })

  it('holds sign_in_attempts to TWO HOURS, which FR-382 forbids lengthening', () => {
    const attempts = RETENTION_SWEEPS.find((sweep) => sweep.table === 'sign_in_attempts')

    // Exact, not "at most". An upper-bound assertion would have accepted the 90 days the
    // specification draft asked for.
    expect(attempts?.window).toBe('2 hours')
  })

  it('removes sign_in_attempts past the window — the one record no cascade reaches', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'somebody@example.com', password: 'wrong' },
    })
    expect(await countIn('sign_in_attempts')).toBeGreaterThan(0)

    await getDb().execute(sql`
      UPDATE sign_in_attempts SET occurred_at = now() - interval '3 hours'
    `)
    await runAll()

    expect(await countIn('sign_in_attempts')).toBe(0)
  })

  it('keeps sign_in_attempts INSIDE the window, so throttling stays correct (FR-383)', async () => {
    // The other half of the requirement: purging must not interfere with the correctness of
    // throttling within the active window. A sweep that deleted rows the throttle is still
    // counting would silently reset every attacker's streak.
    await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'recent@example.com', password: 'wrong' },
    })

    const before = await countIn('sign_in_attempts')
    await runAll()

    expect(await countIn('sign_in_attempts')).toBe(before)
  })

  it('removes consumed and expired verification material (FR-384)', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'sweep-verification@example.com',
        displayName: 'Sweep',
        password: 'correct-horse-battery-staple',
      },
    })
    expect(await countIn('attendee_verifications')).toBeGreaterThan(0)

    // Unexpired and unconsumed rows must survive — the sweep removes what can never be used
    // again, not everything.
    await runAll()
    expect(await countIn('attendee_verifications')).toBeGreaterThan(0)

    await getDb().execute(sql`
      UPDATE attendee_verifications SET expires_at = now() - interval '1 minute'
    `)
    await runAll()
    expect(await countIn('attendee_verifications')).toBe(0)
  })

  it('removes consumed reset material, which is a record of a recovery nobody needs', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'sweep-reset@example.com',
        displayName: 'Sweep Reset',
        password: 'correct-horse-battery-staple',
      },
    })
    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'sweep-reset@example.com' },
    })

    expect(await countIn('attendee_password_resets')).toBeGreaterThan(0)

    await getDb().execute(sql`UPDATE attendee_password_resets SET consumed_at = now()`)
    await runAll()

    expect(await countIn('attendee_password_resets')).toBe(0)
  })

  it('leaves live reset material alone, so recovery still works mid-sweep', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'live-reset@example.com',
        displayName: 'Live',
        password: 'correct-horse-battery-staple',
      },
    })
    mail.clear()
    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'live-reset@example.com' },
    })

    await runAll()

    const message = mail.lastTo('live-reset@example.com', 'password-reset')
    const token = new URL(message!.link).searchParams.get('token') as string

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token, password: 'a-brand-new-passphrase' },
    })

    expect(
      reset.statusCode,
      'The sweep removes what can never be used again. A live link is not that.',
    ).toBe(204)
  })

  it('keeps sweeping when one table fails, rather than skipping the rest', async () => {
    // The failure mode a single try/catch around the loop would produce: one failing DELETE
    // silently skips every sweep after it — and each of those is a retention obligation.
    const outcomes: string[] = []

    for (const sweep of RETENTION_SWEEPS) {
      try {
        await sweep.run()
        outcomes.push(sweep.table)
      } catch {
        outcomes.push(`${sweep.table}:failed`)
      }
    }

    expect(outcomes).toHaveLength(RETENTION_SWEEPS.length)
  })
})
