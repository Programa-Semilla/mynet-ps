import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  ADA,
  clearThrottle,
  resetDatabase,
  SEED_PASSWORD,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T046 — sign-in throttling (FR-031a–d, SC-003a).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The load-bearing assertion here is the absence of a lockout, not the presence of a delay.**
 *
 * Email is the identifier. If enough wrong guesses locked an account, anyone who knows an
 * attendee's address could deny them access to the conference workspace for the duration of
 * the conference — a denial-of-service handed out for free. FR-031b forbids it, and
 * quickstart.md Scenario 7 step 4 calls a lock here "a defect".
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('sign-in throttling', () => {
  let app: FastifyInstance

  const attempt = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/auth/sign-in', payload: { email, password } })

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await resetDatabase()
    await clearThrottle()
  })

  it('allows the first few failures without throttling (FR-031a)', async () => {
    for (let i = 0; i < 3; i += 1) {
      const response = await attempt(ADA, 'wrong')
      expect(response.statusCode, `attempt ${i + 1} should be a plain refusal`).toBe(401)
    }
  })

  it('escalates to a throttled refusal after repeated failures (FR-031a)', async () => {
    let throttledAt = -1

    for (let i = 0; i < 10; i += 1) {
      const response = await attempt(ADA, 'wrong')
      if (response.statusCode === 429) {
        throttledAt = i
        break
      }
    }

    expect(throttledAt, 'sustained wrong guesses must eventually be throttled').toBeGreaterThan(-1)
  })

  it('carries retry guidance without disclosing whether the identifier exists (FR-031d)', async () => {
    let throttled: Awaited<ReturnType<typeof attempt>> | undefined
    for (let i = 0; i < 10; i += 1) {
      const response = await attempt(ADA, 'wrong')
      if (response.statusCode === 429) {
        throttled = response
        break
      }
    }

    expect(throttled).toBeDefined()
    const body = throttled?.json() as { message: string; retryAfterSeconds?: number }
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
    // The message says how long to wait, and nothing about who was asked about.
    expect(body.message.toLowerCase()).not.toContain('account')
    expect(body.message).not.toContain(ADA)
  })

  it('throttles a nonexistent identifier identically to a real one (FR-030, FR-031d)', async () => {
    const drive = async (email: string) => {
      await clearThrottle()
      for (let i = 0; i < 10; i += 1) {
        const response = await attempt(email, 'wrong')
        if (response.statusCode === 429) {
          return { status: response.statusCode, body: response.json() }
        }
      }
      return undefined
    }

    const real = await drive(ADA)
    const fake = await drive('definitely-not-an-attendee@example.com')

    expect(real).toBeDefined()
    expect(fake).toBeDefined()
    expect(real?.status).toBe(fake?.status)
    expect(real?.body).toEqual(fake?.body)
  })

  /**
   * FR-031b, SC-003a — the assertion this file exists for.
   */
  it('NEVER permanently locks the account — the correct credential still works (FR-031b)', async () => {
    // Well past any threshold. If a lockout existed, this would trip it.
    for (let i = 0; i < 25; i += 1) {
      await attempt(ADA, 'wrong')
    }

    // Clearing the window simulates waiting out the delay. What matters is that waiting is
    // *sufficient* — that there is no state which permanently denies access.
    await clearThrottle()

    const response = await attempt(ADA, SEED_PASSWORD)
    expect(
      response.statusCode,
      'after any number of failures, the correct credential must still sign in (FR-031b)',
    ).toBe(204)
  })

  it('a success resets the escalation, so a legitimate attendee is not punished for a typo', async () => {
    await attempt(ADA, 'wrong')
    await attempt(ADA, 'wrong')
    await attempt(ADA, 'wrong')

    const success = await attempt(ADA, SEED_PASSWORD)
    expect(success.statusCode).toBe(204)

    // The streak is broken, so the next failure starts from zero rather than continuing to
    // escalate.
    const afterSuccess = await attempt(ADA, 'wrong')
    expect(afterSuccess.statusCode).toBe(401)
  })
})
