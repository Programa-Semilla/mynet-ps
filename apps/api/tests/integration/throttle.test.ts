import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  ADA,
  clearThrottle,
  SOURCE_FREE_ATTEMPTS,
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

  const attempt = (email: string, password: string, source = '203.0.113.1') =>
    app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
      remoteAddress: source,
    })

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
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A correct credential is never throttled.** Not after any number of failures, and — the
   * case that matters — not while an attacker is still failing.
   *
   * The earlier arrangement consulted the throttle *before* verifying the password, and the
   * outstanding delay was measured from the newest failure. An attacker who kept failing
   * therefore held the account shut indefinitely: the owner's correct password was refused
   * before it was looked at, and only a success could clear the streak, which the refusal
   * prevented. A closed loop. Verification now happens first, which is what makes SC-003a's
   * "accounts an attacker can render permanently inaccessible is zero" true by construction.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('NEVER locks the account — the correct credential works after any number of failures', async () => {
    for (let i = 0; i < 12; i += 1) {
      await attempt(ADA, 'wrong')
    }

    // No clearing, no waiting. The streak is live and well past every threshold.
    const response = await attempt(ADA, SEED_PASSWORD)
    expect(
      response.statusCode,
      'after any number of failures, the correct credential must still sign in (FR-031b)',
    ).toBe(204)
  })

  it('NEVER locks the account while an attacker is actively still failing (SC-003a)', async () => {
    // The attacker, from their own address, past the escalation ceiling.
    for (let i = 0; i < 15; i += 1) {
      await attempt(ADA, 'wrong', '198.51.100.7')
    }

    // They keep going — this is the case a "wait out the delay" test cannot model, because the
    // victim never gets a quiet moment to wait through.
    await attempt(ADA, 'wrong', '198.51.100.7')

    // The owner, from their own address, immediately.
    const owner = await attempt(ADA, SEED_PASSWORD, '203.0.113.9')
    expect(
      owner.statusCode,
      'an attacker who keeps failing must not be able to deny the owner access (FR-031b, SC-003a)',
    ).toBe(204)
  })

  it('escalates the delay on repeated failures (FR-031a)', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await attempt(ADA, 'wrong')).statusCode).toBe(401)
    }

    // Past the free allowance the failure is held, and beyond the served bound it is reported
    // as retry-after guidance instead. Either way the *failure* is what pays.
    const throttled = []
    for (let i = 0; i < 6; i += 1) {
      throttled.push((await attempt(ADA, 'wrong')).statusCode)
    }
    expect(throttled, 'repeated failures must eventually be throttled').toContain(429)
  })

  /**
   * FR-031a — the source dimension, which had no coverage at all.
   *
   * Identifier throttling gives every address three free attempts of its own, so a spray across
   * thousands of identifiers is bounded by nothing else. Deleting the source half of the
   * throttle entirely used to leave this whole file green.
   */
  it('throttles a spray across many identifiers from one source', async () => {
    const source = '198.51.100.20'

    for (let i = 0; i < SOURCE_FREE_ATTEMPTS + 4; i += 1) {
      await attempt(`nobody-${i}@example.com`, 'wrong', source)
    }

    const next = await attempt('nobody-final@example.com', 'wrong', source)
    expect(next.statusCode, 'a distributed spray from one source must be throttled').toBe(429)
  })

  it('does not let an attacker clear the source counter by signing in to their own account', async () => {
    const source = '198.51.100.30'

    for (let i = 0; i < SOURCE_FREE_ATTEMPTS + 4; i += 1) {
      await attempt(`nobody-${i}@example.com`, 'wrong', source)
    }

    // A success from the same source. If the source counter were a streak ended by any success,
    // this would reset it and the spray could continue indefinitely.
    expect((await attempt(ADA, SEED_PASSWORD, source)).statusCode).toBe(204)

    const resumed = await attempt('nobody-after@example.com', 'wrong', source)
    expect(
      resumed.statusCode,
      'a success must not reset the source counter — that would make the bound optional',
    ).toBe(429)
  })

  /**
   * The spec's named edge case: a conference venue puts hundreds of attendees behind one public
   * address. Treating that address like a single guesser would lock out the whole hall.
   */
  it("lets attendees behind a shared address sign in despite each other's typos", async () => {
    const venue = '198.51.100.40'

    for (let i = 0; i < 10; i += 1) {
      await attempt(`attendee-${i}@example.com`, 'wrong', venue)
    }

    const legitimate = await attempt(ADA, SEED_PASSWORD, venue)
    expect(
      legitimate.statusCode,
      'a legitimate attendee sharing an address with many others must still sign in (SC-003a)',
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
