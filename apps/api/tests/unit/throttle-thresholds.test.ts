import { describe, expect, it } from 'vitest'

import {
  ATTEMPT_SCAN_LIMIT,
  delayFor,
  READ_MAX_DELAY_MS,
  THRESHOLDS,
} from '../../src/auth/throttle.js'
import { THROTTLE_ACTIONS } from '../../src/db/schema/sign-in-attempts.js'

/**
 * T012 (010) — **the regression guard for the throttle rework** (FR-863, FR-805).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T017 CHANGES THE MECHANISM EVERY THROTTLED ACTION SHARES. THIS FILE IS ABOUT THE ONE
 * WHOSE REQUESTS LEAVE THE PRODUCT.**
 *
 * `report_submit` is the newest entry in the table and the only action that **dispatches mail to
 * a human being**. Every other throttle bounds work the server does for itself; an unthrottled
 * report route is an unthrottled relay pointed at the single address the product's safety model
 * depends on somebody reading. 009 added it precisely to close that.
 *
 * The rework in T017 touches `failureDelayMs`, the row-writing order and the count boundary —
 * shared by all sixteen actions. A change that silently dropped `report_submit`'s denial, or
 * quietly widened its allowance, would leave every other test in this repository green.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Deliberately a second file rather than more cases in `throttle-actions.test.ts`.** That file
 * asserts 007's and 008's policy and is the place somebody adding an action reads. This one
 * asserts what feature 010 must not break, and it should be readable as exactly that when the
 * rework is reviewed.
 */
describe('report_submit survives the throttle rework (FR-863)', () => {
  it('is still a declared throttled action', () => {
    // The cheapest way to withdraw a throttle is to stop charging the action, which leaves the
    // threshold entry sitting there looking enforced. `throttle-route-audit.test.ts` asserts the
    // route still calls it; this asserts the action still exists to be called.
    expect(THROTTLE_ACTIONS).toContain('report_submit')
  })

  it('still has a threshold', () => {
    expect(THRESHOLDS.report_submit).toBeDefined()
  })

  /**
   * `mayDeny: true` is the whole point of this entry, and it is the opposite of the two actions
   * 010 adds. A rework that copied the wrong neighbour's flag while adding `directory_read` and
   * `thread_read` — both `mayDeny: false` — would land here.
   */
  it('may still DENY, unlike the two read actions 010 adds', () => {
    expect(
      THRESHOLDS.report_submit.mayDeny,
      'A report is the only action that sends mail out of this product. Delay-only would mean an ' +
        'attacker can flood the one inbox a human is supposed to read, at whatever rate the ' +
        'delay permits, indefinitely. Keyed on the reporter’s own identity, so a refusal falls ' +
        'only on them.',
    ).toBe(true)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **GENEROUS ENOUGH THAT SOMEBODY IN TROUBLE IS NEVER REFUSED.**
   *
   * Someone being harassed may legitimately report two or three accounts in quick succession. A
   * bound that caught them would be a safety failure dressed as a rate limit. The number is not
   * pinned — tuning is allowed — but the property that it comfortably exceeds a real sequence is
   * not, and a "tightening" to 1 or 2 would pass every other assertion in this repository.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('leaves room for a person reporting several accounts in one sitting', () => {
    expect(THRESHOLDS.report_submit.identifier.freeAttempts).toBeGreaterThanOrEqual(3)
  })

  it('keeps the source allowance an order of magnitude above the identifier’s', () => {
    // A conference venue behind one address must never be the thing that trips a safety control.
    expect(THRESHOLDS.report_submit.source.freeAttempts).toBeGreaterThanOrEqual(
      THRESHOLDS.report_submit.identifier.freeAttempts * 5,
    )
  })
})

/**
 * T019 (010) — the two read actions, asserted as configuration.
 *
 * Their *behaviour* is asserted against a real database in
 * `tests/integration/directory-throttle.test.ts` and `thread-read-throttle.test.ts`. This is the
 * cheap half that runs on every change with no database at all.
 */
describe('the read bounds are configured to delay and never deny (FR-802, FR-803)', () => {
  const READ_ACTIONS = ['directory_read', 'thread_read'] as const

  it.each(READ_ACTIONS)('%s exists and may never deny', (action) => {
    expect(THROTTLE_ACTIONS).toContain(action)
    expect(
      THRESHOLDS[action].mayDeny,
      `FR-802/FR-803 — ${action} may delay and may never refuse. A denial here refuses the ` +
        'directory to somebody standing in a venue trying to find a person, or freezes a ' +
        'conversation mid-exchange. The harvesting these bound is made expensive, not impossible.',
    ).toBe(false)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FIVE SECONDS, NOT SIX MINUTES, AND THIS IS THE LOAD-BEARING CHOICE IN THE WHOLE ENTRY.**
   *
   * Every pre-existing action escalates toward `IDENTIFIER_MAX_DELAY_MS` — six minutes. Those
   * are writes and sign-in attempts, where holding a request open is a cost paid by a guesser.
   *
   * A six-minute delay on a **read** is not a slowdown, it is a freeze: the directory never
   * arrives, the thread stops updating, and the attendee sees a product that has hung. Five
   * seconds degrades a poll to a slower poll, which is the intended shape of a bound that may
   * never deny — and is what keeps FR-802's "delay, never deny" honest rather than technically
   * true while being indistinguishable from a failure.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it.each(READ_ACTIONS)('%s is capped at the READ ceiling, not the six-minute one', (action) => {
    expect(THRESHOLDS[action].identifier.ceilingMs).toBe(READ_MAX_DELAY_MS)
    expect(THRESHOLDS[action].source.ceilingMs).toBe(READ_MAX_DELAY_MS)
  })

  it('keeps the read ceiling far below the write ceiling', () => {
    expect(READ_MAX_DELAY_MS).toBeLessThanOrEqual(5_000)
    // Every other action's ceiling. Named as an inequality so tuning either one stays possible
    // while the *relationship* — a read is bounded far more gently than a write — cannot invert.
    expect(READ_MAX_DELAY_MS).toBeLessThan(THRESHOLDS.sign_in.identifier.ceilingMs)
  })

  /**
   * The poll runs every three seconds while a thread is open and the tab is visible, so an hour
   * with one conversation open is roughly 1,200 requests. An allowance below that would delay
   * **every** attendee having a normal conversation, which is the opposite of a bound on abuse.
   */
  it('leaves the three-second poll comfortably inside the thread allowance', () => {
    const POLLS_PER_HOUR = 3600 / 3

    expect(
      THRESHOLDS.thread_read.identifier.freeAttempts,
      'The thread allowance is at or below what a single open conversation legitimately costs ' +
        'in an hour. Every attendee in an ordinary exchange would be delayed.',
    ).toBeGreaterThan(POLLS_PER_HOUR)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE INVARIANT THAT FORCED `ATTEMPT_SCAN_LIMIT` UP, RESTATED HERE SO THE REASON TRAVELS.**
   *
   * `throttle-actions.test.ts` already asserts this for every action, and it is what caught the
   * read thresholds: `countFailures` reads at most `ATTEMPT_SCAN_LIMIT` rows, so a `freeAttempts`
   * at or above that number can never be reached and the dimension is **dead configuration that
   * reads as a working bound**.
   *
   * 010's read allowances are the largest in the table by an order of magnitude — they have to
   * be, because a poll is legitimate traffic — so they are the first entries for which the scan
   * bound was the binding constraint rather than a comfortable margin.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it.each(READ_ACTIONS)('%s stays reachable within the scan bound', (action) => {
    expect(THRESHOLDS[action].identifier.freeAttempts).toBeLessThan(ATTEMPT_SCAN_LIMIT)
    expect(THRESHOLDS[action].source.freeAttempts).toBeLessThan(ATTEMPT_SCAN_LIMIT)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **SC-808's "PROGRESSIVE", ASSERTED WHERE PROGRESSION ACTUALLY LIVES.**
   *
   * The escalation is a property of `delayFor` — one curve shared by all sixteen actions — and it
   * is deliberately **not** observable through `failureDelayMs` for these two: that function
   * clamps a delay-only action's result to what `serveDelay` can actually sleep, which is the
   * mechanism that makes a denial unrepresentable (FR-802). The clamp is doing its job by hiding
   * the number, and the integration harness sets the bound to 20ms so the suite does not spend
   * minutes asleep, which flattens it completely.
   *
   * So the curve is asserted directly, against the read actions' own allowance and ceiling. A
   * flat delay would be a constant cost an automated reader absorbs once and then ignores.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it.each(READ_ACTIONS)('%s escalates rather than applying a flat cost (SC-808)', (action) => {
    const { freeAttempts, ceilingMs } = THRESHOLDS[action].identifier
    const owed = (failures: number) => delayFor(failures, freeAttempts, ceilingMs)

    expect(owed(freeAttempts), 'the allowance itself must still be free').toBe(0)
    expect(owed(freeAttempts + 1), 'one past the allowance must cost something').toBeGreaterThan(0)
    expect(
      owed(freeAttempts + 3),
      'three past the allowance costs no more than one past it — the delay is flat, not ' +
        'progressive, and an automated reader pays it once.',
    ).toBeGreaterThan(owed(freeAttempts + 1))
  })

  it.each(READ_ACTIONS)('%s stops escalating at the read ceiling', (action) => {
    const { freeAttempts, ceilingMs } = THRESHOLDS[action].identifier

    // The clamp, which is what keeps a delay from becoming a lockout. Driven far past the
    // allowance the curve must flatten AT the ceiling rather than growing without bound.
    expect(delayFor(freeAttempts + 40, freeAttempts, ceilingMs)).toBe(READ_MAX_DELAY_MS)
  })
})
