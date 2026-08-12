import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { hashPassword } from '../../src/auth/password.js'
import { THRESHOLDS } from '../../src/auth/throttle.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { clearThrottle, setupTestApp, signInAttempts, teardown } from './helpers.js'

/**
 * Deep review — **`admin_sign_in` is counted, and it may delay but never deny** (FR-916).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE PROJECT HAS THIS TEST TWICE ALREADY AND 011 SHIPPED WITHOUT IT.**
 *
 * `message-send-throttle.test.ts` and `reset-throttle.test.ts` each exist because a threshold was
 * asserted as *configuration* and never as *behaviour*, and the first of them states the reason
 * in one sentence: **"A correct table wired to a route that never consults it passes every one of
 * those tests."** `THRESHOLDS.admin_sign_in.mayDeny === false` was the whole of FR-916's coverage.
 * Deleting the `recordAttempt` call from `POST /admin/session` would have left the entire suite
 * green — on the highest-privilege credential in the product.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **BOTH HALVES ARE ASSERTED, AND THEY FAIL IN OPPOSITE DIRECTIONS.**
 *
 *   - **Counted.** Rows land in `sign_in_attempts` under this action. This is what a deleted
 *     `recordAttempt` breaks, and nothing else in the suite observes it: the route's *response*
 *     is identical whether or not the attempt was recorded, because the penalty is a delay.
 *   - **Never denied.** No failure produces a 429, and a correct credential still works after the
 *     allowance is exhausted. `mayDeny: false` is deliberate here for the reason the reset route
 *     gives: an identifier-keyed denial can only ever harm the person who owns the identifier,
 *     and locking the platform tier out of its own product is an attack rather than a defence.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **What this does NOT assert, and it is recorded rather than glossed:** the delay-only reading
 * means the platform credential has no lockout and no operator-visible signal that anybody is
 * trying. `review-findings.md` carries that as a Notable for an explicit decision; this file
 * pins the behaviour that was chosen, not the question of whether to choose it.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'throttled-operator@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

/** Comfortably past the allowance, derived from the table so tuning does not fail this file. */
const OVER_THE_LIMIT = THRESHOLDS.admin_sign_in.identifier.freeAttempts + 3

describe('administrative sign-in is counted but never refused (FR-916)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(abuseReports)
    await db.delete(organizerAssignments)
    await db.delete(operators)

    await db.insert(operators).values({
      email: OPERATOR_EMAIL,
      displayName: 'Throttled Operator',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      credentialIsInitial: false,
    })
  })

  const attempt = async (password: string): Promise<number> => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: OPERATOR_EMAIL, password },
    })
    return response.statusCode
  }

  it('the fixture is real: an allowance worth exceeding, and a delay-only policy', () => {
    expect(THRESHOLDS.admin_sign_in.identifier.freeAttempts).toBeGreaterThan(0)
    expect(
      THRESHOLDS.admin_sign_in.mayDeny,
      'The policy half — the only half this feature originally asserted.',
    ).toBe(false)
  })

  it('records every failed attempt under its own action (FR-307a)', async () => {
    await attempt('wrong-password-entirely')

    const recorded = await getDb()
      .select()
      .from(signInAttempts)
      .where(eq(signInAttempts.action, 'admin_sign_in'))

    expect(
      recorded.length,
      'A failed administrative sign-in was not counted. `admin_sign_in` has its own row in ' +
        'THRESHOLDS and its own action on the attempts table, and neither does anything unless ' +
        'the route calls `recordAttempt` — which nothing else in the suite observes, because ' +
        'the penalty is a delay and the response is identical either way.',
    ).toBeGreaterThan(0)

    expect(recorded[0]?.succeeded).toBe(false)
    // Hashes, never the address itself — the table's own rule, re-asserted at the one call site
    // this feature added.
    expect(recorded[0]?.identifierHash).not.toContain(OPERATOR_EMAIL)
  })

  it('records a successful attempt too, so the counter can be reset by success', async () => {
    expect(await attempt(OPERATOR_PASSWORD)).toBe(204)

    const succeeded = await getDb()
      .select()
      .from(signInAttempts)
      .where(eq(signInAttempts.action, 'admin_sign_in'))

    expect(succeeded.some((row) => row.succeeded)).toBe(true)
  })

  it('never answers 429, however many attempts fail (FR-916)', async () => {
    const statuses: number[] = []
    for (let index = 0; index < OVER_THE_LIMIT; index += 1) {
      statuses.push(await attempt(`wrong-password-${index}`))
    }

    expect(
      statuses.filter((status) => status === 429),
      `${OVER_THE_LIMIT} failed administrative sign-ins produced a refusal. FR-916 permits the ` +
        'throttle to delay and never to deny: a lockout on the platform tier is an attack ' +
        'anybody can run with a known address, and it locks out the only actor who could ' +
        'respond to it.',
    ).toHaveLength(0)

    // Every one is the ordinary refusal, indistinguishable from an unknown address (FR-917).
    expect(new Set(statuses)).toEqual(new Set([401]))
  }, 120_000)

  it('still admits the correct credential after the allowance is exhausted', async () => {
    for (let index = 0; index < OVER_THE_LIMIT; index += 1) {
      await attempt(`wrong-password-${index}`)
    }

    expect(
      await attempt(OPERATOR_PASSWORD),
      'The operator could not sign in after the allowance was spent. That is a denial wearing a ' +
        "delay's clothes, and it is the outcome `mayDeny: false` exists to prevent.",
    ).toBe(204)
  }, 120_000)
})
