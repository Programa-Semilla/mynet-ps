import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetConfigForTests } from '../../src/config.js'
import { assertSeedableTarget, SEED_TARGET_ENV_VAR } from '../../src/db/seed/index.js'

/**
 * T069b (006) — **`pnpm db:seed` refuses to run against a deployed database** (FR-485, and
 * 001's FR-067, which v3.0.0 carries forward to bind UAT).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT THIS PREVENTS IS TOTAL, INSTANT AND UNRECOVERABLE.**
 *
 * `seed()` begins by calling every module's `clear`, and `attendeeSeed.clear` is
 * `DELETE FROM attendees` — which cascades to profiles, interests, registrations, saved
 * sessions, notes, tokens and auth sessions. One `pnpm db:seed` in a shell whose `DATABASE_URL`
 * points at UAT destroys **every account on it** in about a second, with no confirmation.
 *
 * `seed/index.ts` has claimed since 002 that it "never runs against an environment holding real
 * attendee data". Nothing enforced it. That was safe only because there was nowhere else to
 * point a `DATABASE_URL`; 006 is the feature that changes that, so 006 is the feature that owes
 * the enforcement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **It refuses rather than warning, and it is not merely "configured not to".** That
 * distinction is the whole of FR-067 and FR-485: 001 satisfied its equivalent with a
 * permanently data-free preview branch — a *mechanism* — and separate env files alone are a
 * convention. A convention is not an enforcement.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('the seed refuses a deployed target (FR-485)', () => {
  const original = {
    nodeEnv: process.env['NODE_ENV'],
    databaseUrl: process.env['DATABASE_URL'],
    target: process.env[SEED_TARGET_ENV_VAR],
  }

  beforeEach(() => {
    process.env['AUTH_PASSWORD_PEPPER'] ??= 'unit-tests-only-not-a-secret'
    process.env['AUTH_ATTEMPT_HASH_KEY'] ??= 'unit-tests-only-not-a-secret'
    delete process.env[SEED_TARGET_ENV_VAR]
  })

  afterEach(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: original.nodeEnv,
      DATABASE_URL: original.databaseUrl,
      [SEED_TARGET_ENV_VAR]: original.target,
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetConfigForTests()
  })

  const under = (nodeEnv: string, databaseUrl: string) => {
    process.env['NODE_ENV'] = nodeEnv
    process.env['DATABASE_URL'] = databaseUrl
    resetConfigForTests()
  }

  it('allows a development database', () => {
    under('development', 'postgresql://mynet:mynet@localhost:5432/mynet_dev')
    expect(() => assertSeedableTarget()).not.toThrow()
  })

  it('allows the test database, because the integration suite re-seeds constantly', () => {
    under('test', 'postgresql://mynet:mynet@localhost:5432/mynet_test')
    expect(() => assertSeedableTarget()).not.toThrow()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE CASE THAT WAS ACTUALLY REACHABLE, and that the first version of this guard missed.**
   *
   * The guard keyed on `NODE_ENV`, which describes the *shell*, not the *target*. `pnpm db:seed`
   * sets no `NODE_ENV`, so it resolved to `development` and the guard returned immediately — on
   * an operator's own machine, which is the only machine from which the accident is reachable.
   *
   * And the accident is a **documented, supported workflow**: `deploy/vm/README.md` section 4
   * tells an operator to reach the loopback-only production database over an SSH tunnel. That
   * connection presents as `localhost:15432/mynet_prod` — an entirely local-looking host — so
   * the database NAME is the only thing that can carry the refusal.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('REFUSES a production database reached over an SSH tunnel from a dev shell', () => {
    under('development', 'postgresql://mynet:secret@localhost:15432/mynet_prod')

    expect(() => assertSeedableTarget()).toThrow(/Refusing to seed/)
    expect(() => assertSeedableTarget()).toThrow(/mynet_prod/)
  })

  it('REFUSES the UAT database reached the same way', () => {
    under('development', 'postgresql://mynet:secret@127.0.0.1:15432/mynet_uat')
    expect(() => assertSeedableTarget()).toThrow(/Refusing to seed/)
  })

  it('still allows an ordinary local development database', () => {
    under('development', 'postgresql://mynet:mynet@localhost:5432/mynet_dev')
    expect(() => assertSeedableTarget()).not.toThrow()
  })

  it('REFUSES a deployed environment outright', () => {
    under('production', 'postgresql://mynet:secret@10.0.0.4:5432/mynet_prod')
    expect(() => assertSeedableTarget()).toThrow(/Refusing to seed/)
  })

  /**
   * The error has to be actionable. "Refused" tells an operator nothing; "you are pointed at
   * `mynet_prod` on `10.0.0.4`" tells them both what went wrong and which shell did it.
   */
  it('NAMES the resolved host and database in the refusal', () => {
    under('production', 'postgresql://mynet:secret@10.0.0.4:5432/mynet_prod')

    expect(() => assertSeedableTarget()).toThrow(/10\.0\.0\.4/)
    expect(() => assertSeedableTarget()).toThrow(/mynet_prod/)
  })

  /**
   * And it must not leak on the way. A refusal that printed the connection string would put a
   * database password into a terminal, a CI log and a screenshot — while nominally protecting
   * the database.
   */
  it('does NOT disclose the password while naming the target', () => {
    under('production', 'postgresql://mynet:super-secret-password@10.0.0.4:5432/mynet_prod')

    try {
      assertSeedableTarget()
      throw new Error('should have refused')
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-password')
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **The deliberate path: name the database you intend to destroy.**
   *
   * The specification's Assumptions say the existing seeded conference content is used for
   * UAT, so seeding a deployed environment has to be *possible*. It must not be possible by
   * accident — hence an escape hatch that cannot be satisfied by a stray environment variable
   * or a copied command, because it has to match the resolved database name exactly.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('allows a deployed target that is NAMED explicitly', () => {
    under('production', 'postgresql://mynet:secret@10.0.0.4:5432/mynet_uat')
    process.env[SEED_TARGET_ENV_VAR] = 'mynet_uat'

    expect(() => assertSeedableTarget()).not.toThrow()
  })

  it('refuses when the named database is not the one it is pointed at', () => {
    // The exact accident: an operator who seeded UAT yesterday, still has the variable exported,
    // and today has a production URL in their shell.
    under('production', 'postgresql://mynet:secret@10.0.0.4:5432/mynet_prod')
    process.env[SEED_TARGET_ENV_VAR] = 'mynet_uat'

    expect(() => assertSeedableTarget()).toThrow(/Refusing to seed/)
  })

  it('is not satisfied by a truthy value, only by the right name', () => {
    under('production', 'postgresql://mynet:secret@10.0.0.4:5432/mynet_prod')

    for (const value of ['1', 'true', 'yes', 'YES-I-AM-SURE', ' ']) {
      process.env[SEED_TARGET_ENV_VAR] = value
      expect(() => assertSeedableTarget(), `"${value}" must not satisfy the guard`).toThrow(
        /Refusing to seed/,
      )
    }
  })

  it('refuses rather than crashing when the URL cannot be parsed', () => {
    // A guard that threw a parse error on the refusal path would report the wrong problem, and
    // an operator debugging *that* is one who has stopped reading the refusal.
    under('production', 'not-a-url-at-all')

    expect(() => assertSeedableTarget()).toThrow(/Refusing to seed/)
  })
})
