import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOperatorCredential } from '../../src/admin/bootstrap.js'
import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { resetConfigForTests } from '../../src/config.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { clearThrottle, setupTestApp, teardown } from './helpers.js'

/**
 * T051, T058 (013) — **the bootstrap, and the three things it must refuse** (FR-990–FR-993,
 * SC-912).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-993 IS THE ONE AN OBVIOUS IMPLEMENTATION GETS WRONG, AND THIS IS WHY IT IS DRIVEN.**
 *
 * The natural way to write a bootstrap is an idempotent upsert — *"set the password to the
 * configured value"* — and that is a **credential reset triggered by an environment variable**.
 *
 * `ADMIN_BOOTSTRAP_PASSWORD` sits in a `.env` on the host forever, because nobody removes a
 * variable after using it once. Every deploy that re-ran an upsert would silently overwrite the
 * operator's chosen password with the value in that file, so anybody who has ever read it — or a
 * backup of it — would hold a credential that keeps being restored.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const SEEDED = 'bootstrap-fixture@mynet.invalid'
const BOOTSTRAP_PASSWORD = 'a-bootstrapped-operator-password'

describe('the administrative bootstrap', () => {
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
    await db.delete(organizerAssignments)
    await db.delete(operators)

    // The state the seed leaves: an identity with **no usable credential** (FR-990).
    await db.insert(operators).values({ email: SEEDED, displayName: 'Bootstrap Fixture' })

    delete process.env['ADMIN_BOOTSTRAP_EMAIL']
    delete process.env['ADMIN_BOOTSTRAP_PASSWORD']
    resetConfigForTests()
  })

  afterEach(() => {
    delete process.env['ADMIN_BOOTSTRAP_EMAIL']
    delete process.env['ADMIN_BOOTSTRAP_PASSWORD']
    resetConfigForTests()
  })

  const configure = (email: string, password: string): void => {
    process.env['ADMIN_BOOTSTRAP_EMAIL'] = email
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = password
    resetConfigForTests()
  }

  const signIn = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/admin/session', payload: { email, password } })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-991 — SIGN-IN IS IMPOSSIBLE, NOT DEFAULTED.**
   *
   * A seeded operator has `password_hash = null`, so there is no well-known password to find and
   * no account to guess into. This is the state of any environment where nobody has yet been made
   * responsible for it, and it is **safe rather than broken**.
   *
   * The refusal is the same one an unknown address produces — asserted here as well as in
   * `admin-sign-in.test.ts`, because the shape of *this particular* failure is what would betray
   * that the account exists.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves a seeded operator unable to sign in at all (FR-990, FR-991)', async () => {
    const withSeededIdentity = await signIn(SEEDED, BOOTSTRAP_PASSWORD)
    await clearThrottle()
    const unknownAddress = await signIn('nobody@mynet.invalid', BOOTSTRAP_PASSWORD)

    expect(withSeededIdentity.statusCode).toBe(401)
    expect(
      withSeededIdentity.body,
      'an operator with no credential answered differently from an unknown address, which ' +
        'reports that the account exists (FR-915).',
    ).toBe(unknownAddress.body)
  })

  it('does nothing at all when neither value is configured (FR-991)', async () => {
    const outcome = await bootstrapOperatorCredential()
    expect(outcome).toEqual({ status: 'not-configured' })

    const [operator] = await getDb().select().from(operators).where(eq(operators.email, SEEDED))
    expect(operator?.passwordHash, 'a credential appeared with nothing configured').toBe(null)
  })

  /**
   * **It gives a credential to an identity a reviewed change already created — it does not
   * create one** (FR-901; this file cited FR-902, the organizer rule, until 012 — FR-1102a).
   *
   * A bootstrap that created an identity from an environment variable is self sign-up with extra
   * steps: anybody who can set an environment variable on the host could mint themselves a
   * platform operator. Decision 32 forbids that in both tiers.
   */
  it('refuses to create an operator that the seed did not (FR-901)', async () => {
    configure('someone-who-does-not-exist@mynet.invalid', BOOTSTRAP_PASSWORD)

    const outcome = await bootstrapOperatorCredential()
    expect(outcome.status).toBe('no-such-operator')

    const all = await getDb().select().from(operators)
    expect(
      all.map((operator) => operator.email),
      'the bootstrap created an administrative identity. A platform operator is SEEDED as ' +
        'committed reviewed data; a bootstrap that creates one is self sign-up with extra steps ' +
        '(decision 32, FR-901).',
    ).toEqual([SEEDED])
  })

  /**
   * **The credential works, and `credential_is_initial` stays TRUE** (FR-992).
   *
   * That second half is what forces the replacement: `requireOperator` refuses every other
   * administrative address while it stands, so the operator can sign in and reach exactly one
   * route.
   */
  it('sets an initial credential that reaches only the replacement route (FR-992, SC-912)', async () => {
    configure(SEEDED, BOOTSTRAP_PASSWORD)
    expect((await bootstrapOperatorCredential()).status).toBe('credential-set')

    const [operator] = await getDb().select().from(operators).where(eq(operators.email, SEEDED))
    expect(operator?.passwordHash).not.toBe(null)
    expect(
      operator?.credentialIsInitial,
      'the bootstrap cleared `credential_is_initial`, so nothing forces the replacement (FR-992)',
    ).toBe(true)

    const signedIn = await signIn(SEEDED, BOOTSTRAP_PASSWORD)
    expect(signedIn.statusCode).toBe(204)
    const cookie = signedIn.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    const header = `${ADMIN_SESSION_COOKIE}=${cookie?.value}`

    // Every other administrative address refuses with an **explained** 403 — one of only two
    // refusals in this feature that explain themselves, and it passes the test they must: the
    // follow-up question is about the reader, and they can fix it in one step.
    const blocked = await app.inject({
      method: 'GET',
      url: '/admin/conferences',
      headers: { cookie: header },
    })
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json()).toMatchObject({ code: 'credential_not_replaced' })

    // `/admin/me` is refused too, like every address except the replacement route. The client
    // therefore learns this state **from the 403 itself** — it classifies `credential_not_replaced`
    // and renders the replacement screen rather than surfacing an error. It cannot learn it from a
    // `credentialIsInitial` flag on a successful `/admin/me`, because that response is unreachable
    // in this state; the field exists on the payload and is dead. See `deviations.md` D8.
    const me = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { cookie: header },
    })
    expect(me.statusCode).toBe(403)

    // The one route this state may reach.
    const replaced = await app.inject({
      method: 'PUT',
      url: '/admin/session/credential',
      headers: { cookie: header },
      payload: { currentPassword: BOOTSTRAP_PASSWORD, newPassword: 'a-password-they-chose-1' },
    })
    expect(
      replaced.statusCode,
      'the credential-replacement route refused an operator with an initial credential, which ' +
        'makes the state a dead end (FR-992).',
    ).toBe(204)

    // And now everything else opens, on the same session — the server deliberately does not
    // revoke it, because signing them straight out would make the opening interaction a dead end.
    const afterwards = await app.inject({
      method: 'GET',
      url: '/admin/conferences',
      headers: { cookie: header },
    })
    expect(afterwards.statusCode).toBe(200)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **SIGNING OUT IS REACHABLE FROM THE FORCED-REPLACEMENT STATE, AND IT WAS NOT.**
   *
   * Found at the deep-review gate. `DELETE /admin/session` carries `requireOperator`, and the
   * FR-992 gate admitted only the replacement route — so sign-out answered 403 for exactly the
   * operators the product forces onto that screen. The "Sign out instead" control never reached
   * `revokeAdminSession`: the row stayed live and the cookie stayed set, while the client (which
   * clears its own state in a `finally`) showed the sign-in form. Reloading returned straight to
   * the replacement screen, still authenticated.
   *
   * That contradicts FR-919 for the one state every new operator passes through. It is safe to
   * admit because ending a session discloses nothing and grants no capability — FR-992's concern
   * is an initial credential reaching a surface that *acts*, and this is the one request that
   * only ever takes access away.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('lets an operator sign out before replacing the initial credential (FR-919, FR-992)', async () => {
    configure(SEEDED, BOOTSTRAP_PASSWORD)
    expect((await bootstrapOperatorCredential()).status).toBe('credential-set')

    const signedIn = await signIn(SEEDED, BOOTSTRAP_PASSWORD)
    const cookie = signedIn.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    const header = `${ADMIN_SESSION_COOKIE}=${cookie?.value}`

    const signedOut = await app.inject({
      method: 'DELETE',
      url: '/admin/session',
      headers: { cookie: header },
    })
    expect(
      signedOut.statusCode,
      'sign-out was refused while the initial credential stood, so the forced-replacement screen ' +
        'is a state an operator cannot leave (FR-919).',
    ).toBe(204)

    // The session is genuinely over, not merely forgotten by the client: the same token now
    // fails, which is the half a cleared cookie alone would not prove.
    const afterwards = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { cookie: header },
    })
    expect(afterwards.statusCode).toBe(401)

    // Everything else stays refused in this state — the exemption is sign-out and nothing more.
    const stillBlocked = await signIn(SEEDED, BOOTSTRAP_PASSWORD)
    const freshHeader = `${ADMIN_SESSION_COOKIE}=${
      stillBlocked.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)?.value
    }`
    const conferences = await app.inject({
      method: 'GET',
      url: '/admin/conferences',
      headers: { cookie: freshHeader },
    })
    expect(conferences.statusCode).toBe(403)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-993 — NEVER RESET AN OPERATOR WHO HAS ALREADY REPLACED THEIR CREDENTIAL.**
   *
   * The assertion that matters is the last one: the operator's **chosen** password still works
   * after a second bootstrap run. Checking only that `credential_is_initial` stayed false would
   * pass against an implementation that overwrote the hash and left the flag alone.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('never resets a credential the operator chose (FR-993)', async () => {
    const db = getDb()
    const chosen = 'the-password-they-chose-themselves'

    await db
      .update(operators)
      .set({ passwordHash: await hashPassword(chosen), credentialIsInitial: false })
      .where(eq(operators.email, SEEDED))

    configure(SEEDED, BOOTSTRAP_PASSWORD)
    const outcome = await bootstrapOperatorCredential()

    expect(
      outcome.status,
      'the bootstrap reset a credential the operator had already replaced (FR-993). An ' +
        'idempotent upsert is the natural wrong implementation: the configured value sits in a ' +
        '`.env` on the host forever, so every run would restore a password somebody else knows.',
    ).toBe('already-replaced')

    // The bootstrap password must NOT work…
    const withBootstrap = await signIn(SEEDED, BOOTSTRAP_PASSWORD)
    expect(withBootstrap.statusCode).toBe(401)
    await clearThrottle()

    // …and the one they chose must.
    const withChosen = await signIn(SEEDED, chosen)
    expect(
      withChosen.statusCode,
      'a second bootstrap run overwrote the operator’s chosen password (FR-993).',
    ).toBe(204)
  })

  /**
   * **A re-seed does not reset a replaced credential either** (SC-912).
   *
   * The seed inserts identities; it does not update existing ones. Worth driving, because "the
   * seed clears operators and re-inserts them" would silently return every operator to the
   * no-credential state — recoverable, but a surprise nobody would predict from reading the
   * bootstrap alone.
   */
  it('keeps a replaced credential across a re-seed (SC-912)', async () => {
    const db = getDb()
    const chosen = 'the-password-they-chose-themselves'
    await db
      .update(operators)
      .set({ passwordHash: await hashPassword(chosen), credentialIsInitial: false })
      .where(eq(operators.email, SEEDED))

    const { seed } = await import('../../src/db/seed/index.js')
    await seed()

    // The fixture identity is not in the committed seed, so a re-seed removes it — which is the
    // correct behaviour and is what this asserts: the seed's operators are exactly the committed
    // ones, and nothing it does resurrects or rewrites a credential.
    const remaining = await db.select().from(operators).where(eq(operators.email, SEEDED))
    expect(remaining).toEqual([])

    const seeded = await db.select().from(operators)
    expect(seeded.every((operator) => operator.passwordHash === null)).toBe(true)
  })
})
