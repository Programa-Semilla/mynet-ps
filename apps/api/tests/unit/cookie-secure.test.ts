import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetConfigForTests } from '../../src/config.js'
import { clearedSessionCookieOptions, sessionCookieOptions } from '../../src/auth/cookie.js'

/**
 * T062 (006) — **a deployed configuration cannot serve a non-`Secure` session cookie**
 * (FR-478).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS IS A UNIT TEST AND NOT AN INTEGRATION ONE.**
 *
 * The integration suite runs with `NODE_ENV=test`, where `Secure` is deliberately off —
 * localhost has no certificate. So the property FR-478 is actually about, *what the cookie
 * looks like in a deployed environment*, is the one configuration the integration suite can
 * never be in. Asserting it there would mean asserting the development behaviour and calling it
 * the production guarantee.
 *
 * Here the environment is the input. Each case loads the configuration afresh under a stated
 * `NODE_ENV` and reads the attribute that would actually be sent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The failure being prevented is specific and was live until 006.** `secure` was gated on
 * `isProduction`, which is a statement about a *name*. UAT is a real, publicly reachable
 * environment carrying realistically-shaped attendee data, and a session cookie without
 * `Secure` there is one an attacker on the same network takes by downgrading a single request.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Rebuilds the configuration under a stated `NODE_ENV`, then returns the cookie module.
 *
 * `loadConfig` memoises, and `resetConfigForTests` is the seam it exposes for exactly this —
 * cheaper and far less fragile than re-importing the module graph, which the bundler resolves
 * statically and will not cache-bust.
 */
const cookieUnder = (nodeEnv: string) => {
  process.env['NODE_ENV'] = nodeEnv
  resetConfigForTests()
  return { sessionCookieOptions, clearedSessionCookieOptions }
}

describe('the session cookie’s Secure attribute (FR-478)', () => {
  const original = process.env['NODE_ENV']

  beforeEach(() => {
    // The unit project supplies a syntactically valid, deliberately worthless set of values, so
    // `loadConfig` is satisfiable here without a database.
    process.env['AUTH_PASSWORD_PEPPER'] ??= 'unit-tests-only-not-a-secret'
    process.env['AUTH_ATTEMPT_HASH_KEY'] ??= 'unit-tests-only-not-a-secret'
    process.env['DATABASE_URL'] ??= 'postgresql://unit:unit@127.0.0.1:5432/never-connected'
  })

  afterEach(() => {
    if (original === undefined) delete process.env['NODE_ENV']
    else process.env['NODE_ENV'] = original
    // Left memoised under a foreign NODE_ENV, the next file in this project would read it.
    resetConfigForTests()
  })

  it('is SET in production', () => {
    const cookie = cookieUnder('production')
    expect(cookie.sessionCookieOptions(1000).secure).toBe(true)
  })

  it('is relaxed only for local development and the test suite', () => {
    const development = cookieUnder('development')
    expect(
      development.sessionCookieOptions(1000).secure,
      'localhost has no certificate, so a Secure cookie there is one the browser discards — ' +
        'sign-in would be impossible on a developer machine.',
    ).toBe(false)
  })

  /**
   * The assertion that carries the requirement.
   *
   * The clearing options must match the set options in **every** attribute except lifetime. A
   * cleared cookie whose `Secure` differs is a *different cookie*, so the browser keeps the
   * original alongside it — and sign-out clears nothing while reporting success.
   */
  it('uses the SAME Secure value when clearing as when setting', () => {
    for (const nodeEnv of ['production', 'development']) {
      const cookie = cookieUnder(nodeEnv)

      expect(
        cookie.clearedSessionCookieOptions().secure,
        `under NODE_ENV=${nodeEnv} the cleared cookie's Secure differs from the set one, so the ` +
          'browser keeps the original alongside it and sign-out revokes nothing in the client.',
      ).toBe(cookie.sessionCookieOptions(1000).secure)
    }
  })

  it('keeps SameSite=Lax rather than replacing it with a token scheme (FR-477)', () => {
    const options = cookieUnder('production').sessionCookieOptions(1000)

    // One origin is what makes `Lax` a genuine CSRF defence (FR-476). An `Authorization` header
    // would need the token reachable from JavaScript, which `httpOnly` exists to prevent.
    expect(options.sameSite).toBe('lax')
    expect(options.httpOnly).toBe(true)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A NEW ENVIRONMENT NAME MUST DEFAULT TO SECURE.**
   *
   * This is why the gate is `nodeEnv !== 'development' && nodeEnv !== 'test'` rather than
   * `nodeEnv === 'production'`. `loadConfig` refuses an unrecognised `NODE_ENV` outright today,
   * which is the strongest form of the same guarantee — so the assertion is on the refusal.
   *
   * If a later feature widens the accepted set, this test is what makes it choose deliberately:
   * the new name lands on the secure side unless somebody adds it to the two-name exception.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses an environment name it does not recognise, rather than guessing', () => {
    expect(() => cookieUnder('staging').sessionCookieOptions(1000)).toThrow(/NODE_ENV/)
  })
})
