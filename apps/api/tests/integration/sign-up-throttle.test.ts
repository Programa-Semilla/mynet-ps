import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
 * T041 (004) — **per-action counters** (FR-307, FR-307a, FR-314, research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ASSERTION THIS FILE EXISTS FOR: a sign-up storm against an address must not slow that
 * address's SIGN-IN.**
 *
 * 001's throttle was built for one action, and its no-lockout guarantee (FR-031b, SC-003a)
 * rests on verifying the credential before consulting the throttle — so a correct password is
 * never refused. This feature adds three actions with no credential to verify first, and if
 * they shared a counter, the guarantee would be defeated without a single line of `sign-in.ts`
 * changing: anyone could exhaust an address's allowance by *attempting to sign up as them*, and
 * the rightful owner would be locked out of the account they already have.
 *
 * That is FR-031b's failure arriving by a new route, and the `action` column is what closes it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('throttling is per action (FR-307a)', () => {
  let app: FastifyInstance

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE PROBE THAT CAN ACTUALLY FAIL — and why the obvious one cannot.**
   *
   * Signing in with the *correct* password proves nothing about the `action` filter, because a
   * successful sign-in never consults the throttle at all: `sign-in.ts` reaches `failureDelayMs`
   * only inside its `if (!attendee || !verified)` branch, which is exactly the property SC-003a
   * rests on. Deleting `eq(signInAttempts.action, action)` from `countFailures` would leave a
   * correct-password assertion green.
   *
   * The isolation is only observable on a **failed** sign-in. With a shared counter, the storm
   * above would have inflated this address's streak, and the owner's first honest typo would
   * come back 429 with a multi-second wait instead of a plain 401.
   *
   * **Call this BEFORE any successful sign-in for the same address.** The identifier dimension
   * is counted with `resetOnSuccess`, so one success ends the streak — and under the mutation
   * this test exists to catch, it would end the *storm's* streak too, restoring a 401 and
   * hiding the very defect being probed. Verified by removing `eq(signInAttempts.action, …)`
   * from `countFailures` and confirming this assertion goes red.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const expectMistypeStillReachesTheCredential = async (
    email: string,
    storm: string,
  ): Promise<void> => {
    const mistyped = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: 'a-single-honest-typo' },
    })

    expect(
      mistyped.statusCode,
      `${storm} must not spend the sign-in counter. A 429 here means one honest typo by the ` +
        "rightful owner was met with a wait they did not earn — FR-031b's lockout reached by a " +
        'new route. 401 is the correct refusal: their credential was still looked at.',
    ).toBe(401)
  }

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

  const password = 'correct-horse-battery-staple'

  it('lets a sign-up storm throttle sign-up without touching sign-in', async () => {
    const email = 'storm-target@example.com'

    // An account that already exists, so every sign-up attempt below is refused and counts as
    // a failure. This is the attack: the address is known, and the attacker cannot sign in.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/sign-up',
          payload: { email, displayName: 'Storm Target', password },
        })
      ).statusCode,
    ).toBe(204)

    // Hammer it until the sign-up counter bites. The escalation begins after three failures.
    let throttled = false
    for (let attempt = 0; attempt < 12 && !throttled; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, displayName: 'Attacker', password },
      })
      throttled = response.statusCode === 429
    }

    expect(throttled, 'sign-up must be rate-limited at all (FR-307)').toBe(true)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **And now the whole point**, in the order that can actually detect a shared counter: the
    // owner mistypes once *before* any success has had a chance to reset the streak.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await expectMistypeStillReachesTheCredential(email, 'a sign-up storm')

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
    })

    expect(
      signIn.statusCode,
      'A sign-up storm against an address must not deny its owner their own sign-in. If this ' +
        "fails, the `action` filter has been dropped from the throttle count and FR-031b's " +
        'lockout has been reintroduced by a new route (research D2).',
    ).toBe(204)
  })

  it('lets a join-code storm throttle joining without touching sign-in', async () => {
    const email = 'code-guesser@example.com'
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Code Guesser', password },
    })
    const token = sessionCookieFrom(created) as string

    // FR-314 — the surface must not be usable to enumerate codes. Guessing costs escalating
    // time, and here the person paying is the guesser: this route is authenticated, so the
    // identifier dimension is the attendee themselves.
    let throttled = false
    for (let attempt = 0; attempt < 15 && !throttled; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/events/join',
        headers: { cookie: cookieHeader(token) },
        payload: { joinCode: `GUESS-${attempt}` },
      })
      throttled = response.statusCode === 429
    }

    expect(throttled, 'join-code entry must be rate-limited (FR-314)').toBe(true)

    // Note this one is defended twice over, and only the first is what the helper probes for:
    // `join_code` keys its identifier on the **attendee id** while sign-in keys on the
    // **email**, so these two counters would not collide even with the `action` filter gone.
    // Asserted anyway — it is the property FR-307a promises, and the day either route changes
    // which value it hashes, the second defence disappears silently.
    await expectMistypeStillReachesTheCredential(email, 'a join-code storm')

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
    })
    expect(signIn.statusCode).toBe(204)
  })

  it('does not let a sign-in storm slow sign-up either — the isolation runs both ways', async () => {
    const victim = 'sign-in-storm@example.com'
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: victim, displayName: 'Victim', password },
    })

    // Exhaust the sign-in counter for the address with wrong passwords.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: victim, password: 'not-the-right-password' },
      })
    }

    // A *different* person signing up is unaffected, and so is the same address's sign-up path
    // — it answers 409 because the account exists, which is the answer on its merits rather
    // than a throttle.
    const other = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: 'bystander@example.com', displayName: 'Bystander', password },
    })
    expect(other.statusCode).toBe(204)

    const same = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: victim, displayName: 'Victim Again', password },
    })
    expect(same.statusCode).toBe(409)
  })

  it('still lets the correct credential through after its own failures, as 001 guaranteed', async () => {
    // FR-031b and SC-003a, re-asserted here because this feature changed the code path that
    // makes them true. The delay is outstanding-time-based and the credential is verified
    // before the throttle is consulted, so the number of accounts an attacker can render
    // permanently inaccessible stays zero.
    const email = 'still-works@example.com'
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Still Works', password },
    })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: 'wrong' },
      })
    }

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
    })
    expect(signIn.statusCode).toBe(204)
  })

  it('joins successfully once the storm stops counting against a fresh attendee', async () => {
    // A guessing streak belongs to the guesser, not to the conference: another attendee's join
    // is unaffected by somebody else exhausting their own allowance.
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: 'clean-joiner@example.com', displayName: 'Clean', password },
    })
    const token = sessionCookieFrom(created) as string

    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })

    expect(joined.statusCode).toBe(200)
  })
})
