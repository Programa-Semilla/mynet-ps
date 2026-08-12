import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  settleAttempt,
  THRESHOLDS,
  type ActionKey,
} from '../../src/auth/throttle.js'
import { clearThrottle, resetDatabase, setupTestApp, teardown } from './helpers.js'

/**
 * T009 (010) — **the throttle bounds a burst, not only a sustained rate** (FR-804, SC-810).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DEFECT: COUNT → SLEEP → RECORD.**
 *
 * Every throttled action evaluated its allowance *before* writing anything down. Requests that
 * arrived together therefore all read the same pre-burst count, all found themselves inside the
 * allowance, and all passed — because not one of them had been recorded yet when the others
 * looked. The bound held perfectly against a caller who waited for each answer, and not at all
 * against one who did not, which is the only kind of caller it was written for.
 *
 * A hundred concurrent requests against a three-attempt allowance were a hundred free attempts.
 *
 * **The fix is an ordering, not a lock**: record the row first, then judge against the rows
 * already there. An in-flight request is a committed row with `succeeded = false`, so every
 * request behind it counts it. R5 rejected the two alternatives explicitly — folding count and
 * insert into one statement rewrites the query four features rest on, and an advisory lock
 * serialises a hot path on a two-vCPU box.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **ASSERTED AT THE THROTTLE, NOT THROUGH A ROUTE, AND THAT IS DELIBERATE.**
 *
 * FR-804 is a property of the shared mechanism — FR-805 makes it apply to all sixteen actions at
 * once. Driving it through one route would prove it for that route and leave fifteen unproven,
 * and would measure the route's fixture cost rather than the throttle's ordering. The behavioural
 * assertions through real routes are `directory-throttle.test.ts` and
 * `thread-read-throttle.test.ts`; this is the one about the mechanism itself.
 *
 * It runs against a **real database**, which is the whole point: the counter lives in PostgreSQL
 * precisely because an in-process one is wrong the moment there is more than one API instance,
 * and a test with a fake would assert nothing about the commit visibility this rests on.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('a burst does not collectively exceed the allowance (FR-804, SC-810)', () => {
  let app: FastifyInstance

  /**
   * `export` — authenticated, `mayDeny: true`, and the tightest identifier allowance in the
   * table at three. Chosen because a small allowance makes the burst assertion sharp: the gap
   * between "three free" and "eight free" is unmistakable, where an allowance of 1,500 would need
   * a burst nobody would wait for.
   */
  const ACTION = 'export' as const
  const FREE = THRESHOLDS[ACTION].identifier.freeAttempts

  /** Comfortably past the allowance, and small enough to stay well inside the connection pool. */
  const BURST = FREE + 5

  /** A key nothing else in the suite can touch, so the count is this test's own arrivals. */
  const freshKey = (): ActionKey => ({
    identifierHash: hashAttemptValue(`burst-${randomUUID()}`),
    sourceHash: hashAttemptValue(`burst-source-${randomUUID()}`),
    action: ACTION,
  })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()
  }, 120_000)

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: an allowance small enough for the burst to exceed it', () => {
    expect(FREE).toBeGreaterThan(0)
    expect(BURST).toBeGreaterThan(FREE + 1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE DETERMINISTIC HALF.** Every request is recorded before any of them is judged — which
   * is exactly FR-804's "arriving before any of them is recorded", with the scheduling
   * non-determinism removed so the bound can be asserted exactly rather than approximately.
   *
   * Each request judges itself against the rows **strictly older than its own**, so the request
   * holding the k-th row sees k − 1 arrivals ahead of it. Free passes therefore stop at
   * `FREE + 1`, whatever order the requests were served in.
   *
   * Under the old ordering every one of these would be free, because none of the rows would
   * exist yet at the moment each request looked.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('judges each arrival against the ones already in flight', async () => {
    const key = freshKey()

    const ids = await Promise.all(Array.from({ length: BURST }, () => beginAttempt(key)))
    expect(new Set(ids.map(String)).size, 'every arrival must get its own row').toBe(BURST)

    const delays = await Promise.all(ids.map((id) => failureDelayMs(key, id)))
    const free = delays.filter((ms) => ms === 0).length

    expect(
      free,
      `${free} of ${BURST} simultaneous arrivals were admitted free against an allowance of ` +
        `${FREE}. Under the old count-then-record ordering every one of them was free, because ` +
        'none had been recorded when the others looked. Delays: ' +
        JSON.stringify(delays.map(Number)),
    ).toBeLessThanOrEqual(FREE + 1)

    // And the bound is a bound rather than a blanket refusal: the allowance is still spent
    // before anybody is delayed, which is what FR-805 protects.
    expect(free).toBeGreaterThanOrEqual(FREE)
  })

  /**
   * The genuinely concurrent half — insert and evaluate interleaved, as real requests do.
   *
   * Asserted loosely on purpose. Whether a particular row has committed by the time a particular
   * sibling reads is a scheduling question, and pinning it would buy an intermittently failing
   * test in exchange for nothing: the property that matters is that a burst is *no longer free*,
   * and under the old ordering it was free every time.
   */
  it('bounds a burst that is not artificially staged', async () => {
    const key = freshKey()

    const delays = await Promise.all(
      Array.from({ length: BURST }, async () => {
        const id = await beginAttempt(key)
        return failureDelayMs(key, id)
      }),
    )

    expect(
      delays.filter((ms) => ms === 0).length,
      'Every request in a concurrent burst was admitted free. That is the pre-010 behaviour ' +
        'exactly: the allowance bounded a sustained rate and not a burst.',
    ).toBeLessThan(BURST)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FR-805 — THE SEQUENTIAL CASE MUST BE UNCHANGED, AND THIS IS WHERE THAT IS CHECKED.**
   *
   * The rework moves the write from after the judgement to before it. Judging against rows
   * *strictly older than your own* is what keeps that from shifting every allowance one attempt
   * earlier — an off-by-one that would be invisible in review and would alter the observable
   * behaviour of all sixteen actions at once, which FR-805 forbids.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves the one-at-a-time allowance exactly where it was (FR-805)', async () => {
    const key = freshKey()
    const observed: number[] = []

    for (let attempt = 0; attempt < FREE + 2; attempt += 1) {
      const id = await beginAttempt(key)
      observed.push(await failureDelayMs(key, id))
    }

    // The first FREE + 1 attempts are free — `delayFor` returns zero while
    // `failures - freeAttempts <= 0`, so the attempt that makes the count *equal* the allowance
    // is still free. That has been every action's behaviour since 001 and is not 010's to change.
    expect(
      observed.slice(0, FREE + 1).every((ms) => ms === 0),
      JSON.stringify(observed),
    ).toBe(true)
    expect(observed[FREE + 1], JSON.stringify(observed)).toBeGreaterThan(0)
  })

  /**
   * A success still ends the identifier streak, which is what `settleAttempt` restores.
   *
   * Without it the rework would be a silent lockout: every request writes `succeeded = false`
   * first, so an action that never settled would count its own successes as failures and escalate
   * against attendees who were doing nothing wrong.
   */
  it('lets a settled success clear the streak, as it always did', async () => {
    const key = freshKey()

    for (let attempt = 0; attempt < FREE + 2; attempt += 1) {
      const id = await beginAttempt(key)
      await failureDelayMs(key, id)
    }

    const succeeded = await beginAttempt(key)
    await settleAttempt(succeeded, true)

    const next = await beginAttempt(key)
    expect(
      await failureDelayMs(key, next),
      'A recorded success no longer ends the identifier streak. The identifier dimension is a ' +
        'streak by design — an attendee who mistypes three times and then gets in must not carry ' +
        'those failures forward.',
    ).toBe(0)
  })
})
