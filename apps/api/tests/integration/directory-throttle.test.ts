import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  READ_MAX_DELAY_MS,
  THRESHOLDS,
} from '../../src/auth/throttle.js'
import { getDb } from '../../src/db/client.js'
import { signInAttempts } from '../../src/db/schema/sign-in-attempts.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T010 (010) — **the directory listing is bounded, and the bound may never refuse** (FR-801,
 * FR-802, SC-808).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FINDING: A JOIN CODE IS PRINTED ON BADGES AND SHOWN ON SLIDES.**
 *
 * Anyone can sign themselves up and enter one. Once inside, the directory pages a whole
 * conference at a hundred rows a request — name, company, role, headline, interests, availability
 * and a face — with nothing counting the requests. That is the entire attendee list of a
 * conference, downloadable by anybody who read a slide, and it gets materially worse the moment
 * the URL is public rather than a laptop's.
 *
 * **What this bound is for is cost, not prevention.** FR-802 forbids denial outright, and the
 * reason is the product: a refusal here refuses Discover to somebody standing in a venue trying
 * to find the person they were told to meet. Harvesting is made expensive; browsing is untouched.
 * That is the same trade `reset_request` makes, and for the same shape of reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ALLOWANCE IS PRE-LOADED RATHER THAN SPENT.**
 *
 * `directory_read` allows 120 requests an hour per attendee — a heavy human session, and a tenth
 * of what a harvester wants. Reaching that by issuing 121 real listings would take minutes and
 * would measure the directory query rather than the throttle.
 *
 * So the counter is filled directly, in the table the product itself writes, and then **one real
 * request through the real route** is what is measured. The rows are the same rows; only the way
 * they got there differs.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('the directory listing is rate-limited and never denied (FR-801, FR-802)', () => {
  let app: FastifyInstance
  let cookie: string
  let attendeeId: string
  let eventId: string

  const FREE = THRESHOLDS.directory_read.identifier.freeAttempts

  /**
   * Fills the attendee's own `directory_read` counter with `count` failures.
   *
   * Only the identifier dimension: the source allowance is an order of magnitude higher and the
   * larger of the two dimensions wins, so seeding one is enough and seeding both would make it
   * ambiguous which produced the delay.
   */
  const preloadCounter = async (count: number): Promise<void> => {
    if (count <= 0) return
    await getDb()
      .insert(signInAttempts)
      .values(
        Array.from({ length: count }, () => ({
          identifierHash: hashAttemptValue(attendeeId),
          sourceHash: hashAttemptValue(`unused-${randomUUID()}`),
          action: 'directory_read' as const,
          succeeded: false,
        })),
      )
  }

  const listDirectory = () =>
    app.inject({
      method: 'GET',
      url: `/events/${eventId}/attendees`,
      headers: { cookie: cookieHeader(cookie) },
    })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE DELAY IS ASSERTED AS THE VALUE THE ROUTE SERVES, NOT AS WALL-CLOCK TIME.**
   *
   * `tests/integration/helpers.ts` sets `AUTH_MAX_SERVED_DELAY_MS=20` for the whole suite, so a
   * request owing five seconds sleeps twenty milliseconds. Without it the throttle tests alone
   * would add minutes to every run.
   *
   * A wall-clock assertion would therefore measure the harness's cap rather than the bound, and
   * would fail against a correct implementation. `failureDelayMs` is the same function the route
   * calls, so this observes the computation the request performed instead of reimplementing it.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const owedDelayMs = async (): Promise<number> => {
    const key = {
      identifierHash: hashAttemptValue(attendeeId),
      sourceHash: hashAttemptValue('127.0.0.1'),
      action: 'directory_read' as const,
    }
    return failureDelayMs(key, await beginAttempt(key))
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `directory-reader-${randomUUID()}@example.com`,
        displayName: 'Directory Reader',
        password: SEED_PASSWORD,
      },
    })
    const issued = sessionCookieFrom(signUp)
    if (!issued) throw new Error(`Sign-up failed: ${signUp.body}`)
    cookie = issued

    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(cookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    attendeeId = (me.json() as { id: string }).id

    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(cookie) },
    })
    eventId = (events.json() as { id: string }[])[0]!.id

    await clearThrottle()
  }, 120_000)

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: a signed-in attendee reading a conference they joined', async () => {
    const response = await listDirectory()
    expect(response.statusCode, response.body).toBe(200)
    expect(FREE).toBeGreaterThan(0)
  })

  /**
   * FR-801 — the route charges the action at all. Everything below is meaningless without this,
   * and it is the assertion that fails if a future edit removes the throttle call while leaving
   * the threshold entry looking enforced.
   */
  it('charges the directory_read counter (FR-801)', async () => {
    await clearThrottle()
    await listDirectory()

    const rows = await getDb().select().from(signInAttempts)
    const charged = rows.filter((row) => row.action === 'directory_read')

    expect(
      charged.length,
      'A directory listing recorded no `directory_read` attempt. The threshold table, the route ' +
        'audit and the enumeration can all be correct while the handler never calls the throttle.',
    ).toBe(1)

    // Keyed on the reader's own identity — the dimension FR-801 bounds. Keyed on anything else,
    // one attendee's browsing would slow another's.
    expect(charged[0]!.identifierHash).toBe(hashAttemptValue(attendeeId))
  })

  /**
   * SC-808 — "progressive delay, and never a denial."
   *
   * Two points on the curve rather than one. A single delayed request proves a delay exists; two
   * that differ prove it *escalates*, which is what "progressive" means and what a flat
   * fixed-delay implementation would fail.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE BOUND ENGAGES EXACTLY WHERE THE ALLOWANCE ENDS, AND NOT BEFORE.**
   *
   * Two points, on either side of the threshold. One of them alone proves nothing: an
   * implementation that delayed *every* listing would satisfy "past the allowance costs
   * something", and one that never delayed would satisfy "at the allowance costs nothing".
   *
   * The escalation curve itself is asserted in `tests/unit/throttle-thresholds.test.ts` rather
   * than here, and deliberately: `failureDelayMs` clamps a delay-only action's result to what
   * `serveDelay` can sleep — the mechanism that makes a denial unrepresentable (FR-802) — and
   * the harness sets that bound to 20ms, which flattens the curve to a single value. The clamp
   * hiding the number is the clamp working.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('costs nothing inside the allowance and something past it (SC-808)', async () => {
    await clearThrottle()
    await preloadCounter(FREE)
    const atTheAllowance = await owedDelayMs()
    const insideResponse = await listDirectory()

    await clearThrottle()
    await preloadCounter(FREE + 1)
    const pastTheAllowance = await owedDelayMs()
    const pastResponse = await listDirectory()

    expect(insideResponse.statusCode, 'a listing inside the allowance must be served').toBe(200)
    expect(pastResponse.statusCode, 'a delayed listing must still be served').toBe(200)

    expect(
      atTheAllowance,
      'A listing INSIDE the allowance was already being delayed. The allowance is what an ' +
        'ordinary attendee spends, and delaying inside it is a product defect wearing a ' +
        "defence's clothes.",
    ).toBe(0)

    expect(
      pastTheAllowance,
      'One listing past the allowance owes nothing — the bound never engages, and the ' +
        'frequency of this read stays entirely client-controlled.',
    ).toBeGreaterThan(0)
  }, 60_000)

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE ASSERTION FR-802 EXISTS FOR, AND THE ONLY ONE THAT CANNOT BE INFERRED FROM
   * CONFIGURATION.**
   *
   * `throttle-thresholds.test.ts` proves `mayDeny: false` is set. That is the policy. This is the
   * behaviour: a counter driven far past its allowance still answers **200**, because
   * `failureDelayMs` clamps a delay-only action to what `serveDelay` will actually sleep, so
   * there is no remainder for the route to turn into a refusal.
   *
   * The clamp lives inside the throttle rather than at the call site precisely so no route can
   * forget it — and this is what notices if it ever moves.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('never denies, however far past the allowance the counter is driven (FR-802)', async () => {
    await clearThrottle()
    await preloadCounter(FREE + 40)

    const owed = await owedDelayMs()
    const response = await listDirectory()

    expect(
      response.statusCode,
      'The directory refused a request. FR-802 forbids denial outright: a 429 here refuses ' +
        'Discover to somebody standing in a venue trying to find a person, which is the product’s ' +
        'central journey. The bound makes harvesting expensive, not impossible.',
    ).toBe(200)

    // And the cost is bounded too — five seconds, not the six-minute ceiling every write action
    // escalates toward. A six-minute delay on a read is a freeze, not a slowdown.
    expect(owed).toBeLessThanOrEqual(READ_MAX_DELAY_MS)
  }, 60_000)
})
