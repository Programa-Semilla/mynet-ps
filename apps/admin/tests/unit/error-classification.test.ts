import { ApiError } from '@mynet/data/http'
import { OfflineError } from '@mynet/data'
import { describe, expect, it } from 'vitest'

import { classify, describe as describeFailure, type AdminFailure } from '../../src/app/errors.js'

/**
 * T083 (013) — **all seven refusal outcomes must be different from each other** (contracts).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE PROPERTY 008's DEFECT DESTROYED, AND THE ONE THAT WOULD HAVE CAUGHT IT.**
 *
 * `ApiError extends RequestRefusedError`, and **every** non-2xx throws `ApiError` — so
 * `instanceof RequestRefusedError` catches 401, 403, 404, 409, 429 and 500 alike. 008 classified
 * on the class, rendered one deliberately-reasonless sentence for all of them, and swallowed
 * every message its routes had written to be read. The routes were right; the client made them
 * unreachable.
 *
 * A test asserting each code maps to *a* message would pass against a `classify` that returned
 * the same message for everything. So this asserts **mutual difference**: seven inputs, seven
 * distinct outputs. That is the property `instanceof` classification cannot satisfy, and it is
 * the shape 009 adopted for its five outcomes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The seven the contract enumerates, plus the two non-refusal outcomes the client also shows. */
const CASES: readonly {
  readonly label: string
  readonly error: unknown
  readonly expected: AdminFailure
}[] = [
  {
    label: 'no session, expired, or unknown token — 401, no detail (FR-917)',
    error: new ApiError(401, { code: 'not_authenticated' }),
    expected: 'not_authenticated',
  },
  {
    label: 'all four sign-in failures, indistinguishable (FR-915)',
    error: new ApiError(401, { code: 'invalid_credentials' }),
    expected: 'invalid_credentials',
  },
  {
    label: 'the bootstrapped credential still stands — 403 WITH an explanation (FR-992)',
    error: new ApiError(403, { code: 'credential_not_replaced' }),
    expected: 'credential_not_replaced',
  },
  {
    label: 'wrong tier, gone, or never existed — one answer for all (FR-906)',
    error: new ApiError(404, { code: 'not_found' }),
    expected: 'not_found',
  },
  {
    label: 'another operator got there first — 409 WITH an explanation (FR-945)',
    error: new ApiError(409, { code: 'report_already_resolved' }),
    expected: 'report_already_resolved',
  },
  {
    label: 'a reasonless conflict — already an organizer',
    error: new ApiError(409, { code: 'refused' }),
    expected: 'refused',
  },
  {
    label: 'throttled — delay only, never denial (FR-916)',
    error: new ApiError(429, { code: 'too_many_attempts', retryAfterSeconds: 3 }),
    expected: 'too_many_attempts',
  },
  {
    label: 'nothing reached the server',
    error: new OfflineError('Loading admin/reports'),
    expected: 'unreachable',
  },
  {
    label: 'a refusal the client has no name for',
    error: new ApiError(500, { code: 'internal_error' }),
    expected: 'unknown',
  },
]

describe('administrative error classification', () => {
  it.each(CASES)('classifies $label', ({ error, expected }) => {
    expect(classify(error)).toBe(expected)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE ASSERTION THAT ACTUALLY MATTERS.**
   *
   * Nine inputs, nine distinct classifications, nine distinct sentences. A `classify` that
   * collapsed any pair would pass every individual case above through sheer coincidence of
   * ordering; this cannot.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('produces a DIFFERENT outcome for every case', () => {
    const outcomes = CASES.map((testCase) => classify(testCase.error))
    expect(
      new Set(outcomes).size,
      'Two refusals classified the same. That is 008’s defect: `ApiError extends ' +
        'RequestRefusedError` and every non-2xx throws `ApiError`, so classifying on the CLASS ' +
        'collapses 401, 403, 404, 409 and 500 into one — and swallows every message the routes ' +
        'wrote to be read. Classify on `error.code`.',
    ).toBe(CASES.length)
  })

  it('produces a DIFFERENT message for every outcome', () => {
    const messages = CASES.map((testCase) => describeFailure(classify(testCase.error)))
    expect(
      new Set(messages).size,
      'Two outcomes render the same sentence. Distinguishing them internally and then saying ' +
        'the same thing is the same failure one layer up — the operator still cannot tell ' +
        '"reload the queue" from "that is gone".',
    ).toBe(CASES.length)

    for (const message of messages) {
      expect(message.length, 'a refusal rendered an empty message').toBeGreaterThan(10)
    }
  })

  /**
   * **A refusal must not be recognised by its class**, which is the mechanism rather than the
   * outcome. Two errors of the *same class* carrying *different codes* must classify differently
   * — the exact case `instanceof` cannot see.
   */
  it('distinguishes two refusals of the same class by their code', () => {
    const notFound = new ApiError(404, { code: 'not_found' })
    const conflict = new ApiError(409, { code: 'report_already_resolved' })

    expect(notFound.constructor).toBe(conflict.constructor)
    expect(
      classify(notFound),
      'two `ApiError`s with different codes classified the same, so classification is reading ' +
        'the class rather than the code.',
    ).not.toBe(classify(conflict))
  })

  /**
   * **The two explained refusals say something actionable about the READER**, which is the test
   * every explained refusal in this product has to pass. Everything else says as little as the
   * server did.
   */
  it('explains the two refusals that are about the reader, and no others', () => {
    expect(describeFailure('credential_not_replaced')).toMatch(/replace/i)
    expect(describeFailure('report_already_resolved')).toMatch(/another operator|reload/i)

    // The reasonless one must not acquire a reason. FR-906's 404 covers "wrong tier", "gone" and
    // "never existed" alike, so a message naming any of them would disclose which.
    const generic = describeFailure('not_found')
    expect(generic).not.toMatch(/tier|permission|organizer|operator|allowed/i)
  })
})
