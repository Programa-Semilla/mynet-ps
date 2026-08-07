import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { clearThrottle, resetDatabase, setupTestApp, SinkMailService, teardown } from './helpers.js'

/**
 * T054 (004) — **an attacker MUST NOT be able to deny an attendee their own reset**
 * (FR-331, research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS FR-031b's FAILURE, ARRIVING BY A NEW ROUTE.**
 *
 * 001 eliminated account lockout and wrote the reasoning into `auth/throttle.ts` in capitals:
 * email is the identifier, so a lock lets *anyone* deny an attendee access by typing their
 * address enough times. SC-003a measures it — the number of accounts an attacker can render
 * permanently inaccessible must be **zero**.
 *
 * That guarantee rests on a mechanism which does **not** transfer to this route. Sign-in
 * verifies the credential *before* consulting the throttle, so a correct password is never
 * refused. A reset request has no credential to verify: the throttle has to gate it, and an
 * identifier-keyed denial would land on exactly the person the throttle exists to protect.
 *
 * So reset-request is configured `mayDeny: false` — it may delay, and it may never deny. The
 * person who suffers an identifier-keyed denial is always the victim, never the attacker.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('an attacker cannot deny an attendee their own recovery path (FR-331)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  const VICTIM = 'victim@example.com'

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

  const requestFrom = (email: string, remoteAddress: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email },
      remoteAddress,
    })

  it('still sends the victim their link after a sustained attack on their address', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: VICTIM, displayName: 'Victim', password: 'correct-horse-battery-staple' },
    })
    mail.clear()

    // The attack: many reset requests for the victim's address, from the attacker's own
    // connection. Far beyond any threshold the identifier dimension could set.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await requestFrom(VICTIM, '203.0.113.7')
      expect(
        response.statusCode,
        'even the attacker is never denied — a 429 here would be an account-existence oracle',
      ).toBe(202)
    }

    mail.clear()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **And now the victim, from their own connection, asks for their own reset.**
    //
    // If this fails — or is refused, or silently sends nothing — then an attacker who knows an
    // address can permanently deny its owner the ability to recover their account, which is
    // precisely what FR-031b forbids and SC-003a measures at zero.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const victimsOwn = await requestFrom(VICTIM, '198.51.100.42')

    expect(victimsOwn.statusCode).toBe(202)
    expect(
      mail.lastTo(VICTIM, 'password-reset'),
      'The victim must receive a working link. A delay is acceptable; a denial is not.',
    ).toBeDefined()
  })

  it('lets the victim complete the reset the attack was meant to prevent', async () => {
    const email = 'still-recoverable@example.com'
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Still', password: 'correct-horse-battery-staple' },
    })

    for (let attempt = 0; attempt < 25; attempt += 1) {
      await requestFrom(email, '203.0.113.9')
    }

    mail.clear()
    await requestFrom(email, '198.51.100.99')

    const message = mail.lastTo(email, 'password-reset')
    expect(message).toBeDefined()

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: {
        token: new URL(message!.link).searchParams.get('token'),
        password: 'the-victim-regains-control',
      },
    })
    expect(reset.statusCode).toBe(204)

    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: { email, password: 'the-victim-regains-control' },
        })
      ).statusCode,
    ).toBe(204)
  })

  it("does not let a reset storm slow the victim's SIGN-IN either (FR-307a)", async () => {
    // The other half of the isolation: reset-request and sign-in are separate counters, so
    // exhausting one cannot consume the other. Without the `action` filter this attack would
    // lock the victim out of the account they can still remember the password for.
    const email = 'sign-in-still-works@example.com'
    const password = 'correct-horse-battery-staple'
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Fine', password },
    })

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await requestFrom(email, '203.0.113.11')
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The mistype comes first, and it is the assertion that can fail.**
    //
    // A *correct* password never consults the throttle — `sign-in.ts` reaches `failureDelayMs`
    // only inside its failure branch — so asserting 204 below cannot detect a shared counter.
    // Worse, a success ends the identifier streak, so probing after it would hide the defect
    // even on the failure path. One honest typo, before any success, is what shows whether the
    // reset storm was allowed to spend this address's sign-in allowance.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const mistyped = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: 'a-single-honest-typo' },
    })
    expect(
      mistyped.statusCode,
      "A reset storm must not spend the victim's sign-in counter. 429 here means the attacker " +
        'has denied them the account they still remember the password for — FR-031b by a new route.',
    ).toBe(401)

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
    })
    expect(signIn.statusCode).toBe(204)
  })
})
