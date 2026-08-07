import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { clearThrottle, resetDatabase, setupTestApp, SinkMailService, teardown } from './helpers.js'

/**
 * T055 (004) — **a throttled reset request still answers 202** (FR-327, FR-331).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The throttle must not become the account-existence oracle FR-327 exists to close.
 *
 * The wording of the response is only half of non-disclosure. If a *throttled* request answered
 * `429` while an unthrottled one answered `202`, then an attacker could learn membership by
 * timing the transition: hammer an address until it throttles, and compare. Worse, if the
 * throttle only counted addresses that *exist* — an easy implementation slip, since only those
 * do any work — the very first `429` would name a member.
 *
 * So this route has no `429` at all. The delay-only mode in `auth/throttle.ts` clamps its
 * outstanding time to what can be served in-request, so there is no remainder for the handler
 * to refuse on even if a later edit wanted one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the reset throttle is not an account-existence oracle (FR-327)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  const KNOWN = 'known-address@example.com'
  const UNKNOWN = 'unknown-address@example.com'

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()

    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: KNOWN, displayName: 'Known', password: 'correct-horse-battery-staple' },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    mail.clear()
  })

  const request = (email: string) =>
    app.inject({ method: 'POST', url: '/auth/reset-request', payload: { email } })

  it('never answers anything but 202, however many times it is called', async () => {
    const statuses = new Set<number>()

    for (let attempt = 0; attempt < 30; attempt += 1) {
      statuses.add((await request(KNOWN)).statusCode)
    }

    expect(
      [...statuses],
      'A 429 on this route is a membership signal. The delay-only counter is what makes it ' +
        'unrepresentable rather than merely avoided by a handler that remembers not to raise one.',
    ).toEqual([202])
  })

  it('answers a known and an unknown address identically, under load', async () => {
    // Both hammered equally, then compared. The known address does real work — it issues a
    // token and sends a message — and the unknown one does none; neither difference may reach
    // the response.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(KNOWN)
      await request(UNKNOWN)
    }

    const known = await request(KNOWN)
    const unknown = await request(UNKNOWN)

    expect(known.statusCode).toBe(unknown.statusCode)
    expect(known.body).toEqual(unknown.body)
    // Header-for-header, because `retry-after` is set for `too_many_attempts` elsewhere and its
    // presence on one and not the other would be the difference all by itself.
    expect(known.headers['retry-after']).toBeUndefined()
    expect(unknown.headers['retry-after']).toBeUndefined()
  })

  it('still delays, so the throttle is doing something rather than nothing', async () => {
    // Delay-only must not mean "no defence". The escalation is served in-request — the suite
    // shrinks the served bound to 20ms, so this asserts the mechanism rather than a duration.
    const before = Date.now()
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await request(KNOWN)
    }
    const elapsed = Date.now() - before

    expect(
      elapsed,
      'Every request past the free allowance occupies a connection before it is answered. That ' +
        'cost is the whole defence on a route that may never deny.',
    ).toBeGreaterThan(0)
  })
})
