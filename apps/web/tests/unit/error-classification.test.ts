import { OfflineError, RequestRefusedError } from '@mynet/data'
import { describe, expect, it } from 'vitest'

import { classifyRefusal } from '../../src/app/agenda/useCommitments.js'

/**
 * T208 (014 tranche 2) — commitment refusals are classified on `error.code`, the server's own
 * sentence passes through, and every outcome is DIFFERENT from every other
 * (FR-1069, FR-1069a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE MUTUAL-DIFFERENCE ASSERTION IS THE ONE THAT MATTERS, AND THIS PROJECT HAS THE SCARS
 * TO PROVE IT — TWICE.** 008 classified on the error *class*: `ApiError extends
 * RequestRefusedError` and every non-2xx throws `ApiError`, so `instanceof` caught 400, 404,
 * 429 and 500 alike and swallowed every message the routes wrote to be read. The rule that
 * came out of it — classify on `error.code` — was then obeyed by 014's tranche 1, which
 * reproduced the outcome anyway: four distinct 409s all carried `refused`, so six
 * carefully-written refusals rendered as two sentences, and a test asserting each code mapped
 * to *a* message would have passed, because every one of them did. Two of them.
 *
 * So this file asserts the property both defects destroyed: given the five distinct codes the
 * server actually sends, the five rendered messages are **pairwise different**, and each is
 * the server's own sentence rather than a local paraphrase.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The five commitment refusals as the server writes them — codes from
 * `apps/api/src/routes/events/enrolments.ts` and `routes/events/agenda.ts`, sentences abridged
 * but distinct, as the real ones are. The test's subject is the classifier, so the fixtures
 * only need the property the routes guarantee: five codes, five different sentences.
 */
const SERVER_REFUSALS = [
  ['session_full', 'This session is full — every place is taken.'],
  ['enrolment_closed', 'Enrolment for this session has closed.'],
  ['already_enrolled', 'You already hold a place in this session.'],
  ['not_optional', 'This session does not take enrolment — save it to your agenda instead.'],
  ['not_saveable', 'This session takes enrolment instead of saving — take a place to commit.'],
] as const

describe('commitment refusal classification (FR-1069, FR-1069a)', () => {
  it('passes each server sentence through under its own code — never a paraphrase', () => {
    for (const [code, message] of SERVER_REFUSALS) {
      const outcome = classifyRefusal(new RequestRefusedError(code, message), 'enrol')
      expect(outcome.code, `code ${code} was reclassified`).toBe(code)
      expect(
        outcome.message,
        `the server's sentence for ${code} was swallowed. The route wrote it to be read ` +
          '(FR-1069), and a local paraphrase is how six refusals became two sentences in ' +
          'tranche 1.',
      ).toBe(message)
      expect(outcome.offline).toBe(false)
    }
  })

  it('renders ALL outcomes mutually different — codes, offline and the fallback', () => {
    const outcomes = [
      ...SERVER_REFUSALS.map(([code, message]) =>
        classifyRefusal(new RequestRefusedError(code, message), 'enrol'),
      ),
      classifyRefusal(new OfflineError('offline'), 'enrol'),
      // A fault with no code at all — the generic last branch.
      classifyRefusal(new TypeError('boom'), 'enrol'),
    ]

    const messages = outcomes.map((outcome) => outcome.message)
    expect(
      new Set(messages).size,
      'Two refusals render the same sentence. "This session is full" and "enrolment has ' +
        'closed" are different facts about the reader’s own action and lead to different next ' +
        'steps (FR-1069) — a shared rendering is FR-1069a’s named defect, and a per-code check ' +
        'would pass right through it.',
    ).toBe(messages.length)

    const codes = outcomes.map((outcome) => outcome.code)
    expect(new Set(codes).size, 'two outcomes share a code').toBe(codes.length)
  })

  it('is blind to the CLASS: the same class with different codes renders differently', () => {
    // Both are RequestRefusedError. An instanceof classifier — 008's defect — cannot tell them
    // apart, and this is the assertion that fails if anybody reintroduces one.
    const full = classifyRefusal(new RequestRefusedError('session_full', 'full'), 'enrol')
    const closed = classifyRefusal(new RequestRefusedError('enrolment_closed', 'closed'), 'enrol')

    expect(full.message).not.toBe(closed.message)
    expect(full.code).not.toBe(closed.code)
  })

  it('classifies offline by class, legitimately, and says nothing was queued', () => {
    // OfflineError is the ONE class check allowed: it never reached a server, so it carries no
    // code to classify on.
    const outcome = classifyRefusal(new OfflineError('offline'), 'enrol')
    expect(outcome.offline).toBe(true)
    expect(outcome.code).toBe('offline')
    // FR-217/FR-1070b — refused, never queued, and the attendee is told so in wording that is
    // true of BOTH commitments (FR-1066a): the old sentence said "nothing has been saved".
    expect(outcome.message).toMatch(/nothing.*queued/i)
    expect(outcome.message).not.toMatch(/nothing has been saved/i)
  })

  it('words the four actions differently, so a refusal names what was attempted', () => {
    const failure = new TypeError('boom')
    const worded = (['save', 'unsave', 'enrol', 'release'] as const).map(
      (action) => classifyRefusal(failure, action).message,
    )
    expect(new Set(worded).size).toBe(worded.length)
  })
})
