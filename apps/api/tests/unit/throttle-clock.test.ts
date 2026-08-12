import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T014 (010) — **one clock** (FR-811).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE THROTTLE USED TWO CLOCKS, AND THE SECOND ONE WAS INVISIBLE.**
 *
 * `sign_in_attempts.occurred_at` is stamped by **PostgreSQL** — `defaultNow()` on the column.
 * Every judgement made about those rows was computed in **Node**:
 *
 *   * the rolling window's lower bound — `new Date(Date.now() - WINDOW_MS)`, sent as a parameter
 *   * how long a caller had already waited — `Date.now() - streak.lastFailureAt.getTime()`
 *
 * Those are two different machines' opinions about the present. The API runs in one container and
 * PostgreSQL in another; nothing keeps their clocks together, and a container clock that has
 * drifted forward makes `waited` larger than it really is, which **subtracts a delay that was
 * never served**. Drift the other way and the window silently narrows, discarding rows the
 * throttle is meant to be counting. Neither shows up as an error; both weaken the bound.
 *
 * The fix is not "synchronise the clocks" — it is to stop having two. Every timestamp involved in
 * evaluating the window or computing the delay now originates from the database, which is the
 * machine that stamped the rows in the first place.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS IS A STRUCTURAL ASSERTION, AND IT IS STATED AS ONE RATHER THAN DRESSED UP.**
 *
 * FR-812 groups FR-811 with the behavioural requirements. It is not behavioural in the same way:
 * observing the defect requires two clocks that actually disagree, and a test cannot skew the
 * database container's clock relative to its own. What it *can* assert is the property that makes
 * the disagreement unreachable — that this module consults no wall clock but the database's.
 *
 * That is a real guarantee, not a proxy for one: with no second clock in the file, there is no
 * second opinion to differ. It is weaker than "the delay is correct under drift", and saying so
 * is the point — FR-812a takes the same care over the verification copy.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../src/auth/throttle.js', import.meta.url)).replace(/\.js$/, '.ts'),
  'utf8',
)

/**
 * Comments removed before matching, for the reason 007's and 009's absence guards record: every
 * phrase this file forbids also appears in the prose explaining why it is forbidden. Matching raw
 * text fails on a correct implementation, and the natural repair is to weaken the pattern until
 * it checks nothing.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the throttle reads one clock, and it is the database’s (FR-811)', () => {
  it('the comment-stripped source is still real code', () => {
    // A stripper that ate the file would make every assertion below pass vacuously.
    expect(CODE).toContain('countFailures')
    expect(CODE).toContain('outstandingDelay')
    expect(CODE.length).toBeGreaterThan(500)
  })

  /**
   * The single assertion this file exists for.
   *
   * `Date.now()` is how both defects were spelled. It is not needed anywhere in this module once
   * the window and the elapsed time are computed by the database: what remains are *durations*
   * (`setTimeout`, `hrtime`), which are not timestamps and have no clock to disagree with.
   */
  it('never asks Node what time it is', () => {
    expect(
      CODE,
      'apps/api/src/auth/throttle.ts consults Node’s wall clock. The rows it judges are stamped ' +
        'by PostgreSQL (`occurred_at` defaults to now()), so a Node timestamp is a SECOND ' +
        'opinion about the present — and the two containers’ clocks are not kept together. ' +
        'Drift forward and `waited` subtracts a delay that was never served; drift back and the ' +
        'window discards rows the throttle should be counting. Neither surfaces as an error. ' +
        'Compute the window bound and the elapsed time in SQL (FR-811).',
    ).not.toMatch(/Date\.now\s*\(/)
  })

  it('never builds a window bound out of a JavaScript Date', () => {
    // The specific shape the defect had: `new Date(Date.now() - WINDOW_MS)`, passed to the query
    // as a parameter. Asserted separately from the rule above so that reintroducing it by a
    // different route — `new Date()`, say — still fails.
    expect(CODE).not.toMatch(/new Date\s*\(/)
  })

  /**
   * The positive half. Forbidding Node's clock would be satisfied by a module that stopped
   * bounding the window at all, which is a far worse outcome than the defect.
   */
  it('bounds the counting window in SQL, using the database’s own now()', () => {
    expect(
      CODE,
      'The rolling window is no longer expressed against the database clock. Removing Node’s ' +
        'timestamp is only half of FR-811 — the window still has to be bounded, or the throttle ' +
        'counts every attempt ever recorded.',
    ).toMatch(/now\s*\(\s*\)\s*-\s*interval/i)
  })

  /**
   * `outstandingDelay` is where the subtraction lives, and it is the half that silently *reduces*
   * a delay rather than widening a window.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **THE STREAK CARRIES AN ELAPSED DURATION, NOT AN INSTANT, AND THAT DISTINCTION IS EARNED.**
   *
   * The first fix carried the database's `now()` back alongside each row and subtracted the two
   * timestamps in JavaScript. One clock, correct in principle — and broken in practice, because
   * `sql<Date>` is an assertion to the type checker rather than a conversion: `now()` arrived as
   * a **string** and `.getTime()` threw on every throttled request.
   *
   * Asking the database for the *difference* fixes both at once. Only one machine reads a clock,
   * and the value crossing the boundary is a number with nothing to parse.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('measures how long a caller has waited as a duration computed in SQL', () => {
    expect(CODE).toMatch(/extract\s*\(\s*epoch\s+from/i)
    expect(CODE).toMatch(/lastFailureAgeMs/)
  })

  /**
   * A `numeric` crosses the postgres.js boundary as a **string**, to preserve precision. That is
   * the same shape of defect as `sql<Date>` above — a value that types as a number and is not one
   * — and here it would make `required - waited` produce `NaN`, which `Math.max(0, NaN)` turns
   * into `NaN` and every comparison silently reads as "no delay".
   */
  it('casts the elapsed value to a real number rather than trusting the type parameter', () => {
    expect(
      CODE,
      'The SQL-computed elapsed time is not cast to float8. `extract` returns `numeric`, which ' +
        'postgres.js hands back as a string — so the subtraction would produce NaN and the ' +
        'throttle would silently stop delaying anybody.',
    ).toMatch(/::float8/)
  })
})
