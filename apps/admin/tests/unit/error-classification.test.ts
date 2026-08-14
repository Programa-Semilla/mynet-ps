import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { ApiError } from '@mynet/data/http'
import { OfflineError } from '@mynet/data'
import { describe, expect, it } from 'vitest'

import { classify, describe as describeFailure, type AdminFailure } from '../../src/app/errors.js'

/**
 * T083 (013), T094 (014) — **every refusal outcome must be different from each other one**
 * (contracts/administrative.md, contracts/authoring.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **013 HAD SEVEN. 014 BROUGHT SIX MORE AND THEY ARRIVED SHARING TWO CODES — SO THIS FILE FOUND
 * A REAL DEFECT RATHER THAN CONFIRMING AN INVARIANT.**
 *
 * The authoring routes were written with four distinct 409 explanations all carrying `refused`
 * and two distinct 400 explanations all carrying `validation_failed`. `classify` read the code,
 * correctly, and therefore rendered *"That could not be completed."* for four different
 * situations — including the one that matters most, *"cancel it instead, nothing is lost"*.
 *
 * The mutual-difference assertion below is what caught it. A test checking that each code maps
 * to *a* message would have passed: every one of them did map to a message. Two of them.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
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
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **T094 (014) — SIX MORE EXPLAINED REFUSALS, AND THEY ARRIVED SHARING TWO CODES.**
  //
  // `contracts/authoring.md` requires every explained refusal to render **differently from the
  // others**, and 014's routes were written with four distinct 409 messages all carrying `refused`
  // and two distinct 400 messages all carrying `validation_failed`. The server wrote six careful
  // explanations; the client could distinguish two outcomes and rendered "That could not be
  // completed." for four of them.
  //
  // That is 008's defect exactly — *the routes were right; the client made them unreachable* —
  // reached from the other end. 008 classified on the CLASS and collapsed distinct codes; 014
  // classified correctly on the code and the codes themselves were not distinct. The rule
  // "classify on `error.code`" is only worth anything if the code says which refusal it is.
  //
  // The project already had the answer: `question_has_votes`, `own_question` and
  // `conversation_closed` are each their own `ErrorCode` for precisely this reason. These follow.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    label: 'a track or room a session still uses — 409 WITH a reason (FR-1017)',
    error: new ApiError(409, { code: 'still_referenced' }),
    expected: 'still_referenced',
  },
  {
    label: 'deletion refused because attendees have engaged — 409, cancel instead (FR-1019)',
    error: new ApiError(409, { code: 'session_has_engagement' }),
    expected: 'session_has_engagement',
  },
  {
    label: 'dates that would leave sessions outside the conference (FR-1014)',
    error: new ApiError(409, { code: 'would_orphan_sessions' }),
    expected: 'would_orphan_sessions',
  },
  {
    label: 'a timezone change with sessions already scheduled (FR-1015)',
    error: new ApiError(409, { code: 'timezone_frozen' }),
    expected: 'timezone_frozen',
  },
  {
    label: 'a session outside the conference’s days, in venue-local time (FR-1012)',
    error: new ApiError(400, { code: 'outside_conference_days' }),
    expected: 'outside_conference_days',
  },
  {
    label: 'an end at or before the start (FR-1013)',
    error: new ApiError(400, { code: 'ends_before_start' }),
    expected: 'ends_before_start',
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

/**
 * **FR-1014 requires the refusal to NAME the sessions, and the client was dropping them.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Two layers were discarding structured detail. `ApiError` kept only `code`, `message`, `status`
 * and `retryAfterSeconds`, so everything else in the body died at the transport boundary; and
 * `describe` mapped an outcome to a fixed sentence, so even once it survived, nothing read it.
 *
 * Meanwhile the API declares both fields in a response schema — after a 45-line comment about
 * Fastify stripping what a schema does not name — and `patchConference` runs an **extra ordered
 * query** for the sole purpose of building the list. All of that work terminated in a sentence
 * that said "Move or cancel them first" about forty sessions the organizer then had to find by eye.
 *
 * These assert the sentence changes with the detail, which is the property that was missing: a test
 * that only checked the fixed wording would pass against a client that still threw the detail away.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a refusal renders the detail it carried (FR-1014, FR-1019, FR-1025)', () => {
  it('names the sessions a date-range change would orphan (FR-1014)', () => {
    const named = describeFailure('would_orphan_sessions', {
      sessions: [
        { id: 's1', title: 'Opening Keynote' },
        { id: 's2', title: 'Closing Panel' },
      ],
    })

    expect(named).toContain('Opening Keynote')
    expect(named).toContain('Closing Panel')
    expect(
      named,
      'FR-1014 says the refusal "MUST name the sessions concerned". A message that only says ' +
        'sessions would be left outside makes the organizer find them by eye.',
    ).not.toBe(describeFailure('would_orphan_sessions'))
  })

  it('still says something true when the detail is absent', () => {
    // The detail is structured data from a route that may be older than the client, so its
    // absence must degrade to the sentence rather than to a broken one.
    const bare = describeFailure('would_orphan_sessions')
    expect(bare).toMatch(/outside the conference/i)
    expect(bare).not.toMatch(/undefined|\[object/i)
  })

  it('reports the SERVER’s engagement counts, and identifies nobody (FR-1025, FR-1042)', () => {
    const message = describeFailure('session_has_engagement', {
      engagement: { saved: 12, notes: 4, questions: 3, votes: 9 },
    })

    // The server's counts rather than the programme's: FR-1019a means a save can arrive between
    // the render and the request, so the stale number on screen is not the one that refused.
    expect(message).toMatch(/12/)
    expect(message).toMatch(/cancel it instead/i)

    // Counts only. Nothing here may name, or be able to name, an attendee.
    expect(message).not.toMatch(/@|attendee-|[0-9a-f]{8}-[0-9a-f]{4}/i)
  })
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **T-review (014) — THE POPULATION, NOT JUST THE PROPERTY.**
 *
 * The mutual-difference assertion above has the right shape and the wrong source. `CASES` is a
 * **hand-maintained array**: nothing derives it from the `ErrorCode` union or from what the routes
 * actually throw, so `new Set(outcomes).size === CASES.length` is a statement about the list rather
 * than about the client. A fourteenth server code classifies as `unknown`, renders *"Something went
 * wrong. Try again, and reload if it keeps happening."*, and **every assertion in this file still
 * passes** — because the list it checks does not know the code exists.
 *
 * That is the defect 014 already hit once, from the other direction. Six carefully-written refusals
 * shared two codes and rendered as two sentences; the fix was six new codes on the server. Nothing
 * was added to stop the *next* six arriving unclassified, and the engagement predicate got a
 * schema-derived guard for exactly this reason while the error map did not.
 *
 * So the population is read from `apps/api/src/errors.ts`, and a new code **fails this build until
 * somebody decides what the administrative product should say about it** — the same
 * fail-by-existence discipline `deletion-coverage`, `export-coverage` and `throttle-route-audit`
 * apply, and for the same reason: a guard that only covers what happened to exist when it was
 * written stops guarding the moment anything changes.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **READING THE API'S SOURCE FROM THE ADMIN SUITE IS DELIBERATE.**
 *
 * The alternative was to import the union, which is impossible: `ErrorCode` is a *type*, erased at
 * runtime, so there is nothing to enumerate. Generating a runtime list on the server and importing
 * it would make the administrative client depend on the API package — a dependency this product
 * does not have and should not acquire for a test. Reading the file couples the two by **path**
 * rather than by build graph, and a moved file fails loudly on the first assertion below.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Codes the administrative product genuinely never meets, each with the reason.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **DO NOT ADD A CODE HERE TO MAKE A FAILURE GO AWAY.** The question is "can an administrative
 * request receive this?" — not "is it inconvenient to classify?". If an authoring or moderation
 * route can throw it, it belongs in `classify` with a sentence written for an operator to read.
 *
 * The cost of getting this wrong is silent and one-directional: a code exempted here that a route
 * does throw renders as "Something went wrong", which is the exact outcome this whole file exists
 * to prevent.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
const ATTENDEE_ONLY: Record<string, string> = {
  address_registered: 'sign-up only; no administrative route creates an attendee account',
  link_expired: 'attendee verification and password-reset links; administration has neither',
  image_too_large: 'avatar upload, which no administrative tier may perform (FR-1006)',
  image_unreadable: 'avatar upload, as above',
  conversation_closed: 'Messages, which exists only in the attendee product',
  question_has_votes:
    "an ATTENDEE withdrawing their own question. An operator's removal is a different route " +
    'with a different rule, and it does not consult votes',
  own_question: 'an attendee voting on their own question; operators do not vote',
  validation_failed:
    'the route schema rejecting a malformed body before any handler runs. The administrative ' +
    'forms disable their controls rather than submitting invalid input, and the six authoring ' +
    'refusals that used to share this code now each have their own',
  internal_error:
    'an unhandled server fault. It has no actionable explanation by construction, and `unknown` ' +
    'is the honest rendering rather than a fallback',
}

const API_ERRORS = fileURLToPath(new URL('../../../api/src/errors.ts', import.meta.url))

/** Every member of the server's `ErrorCode` union, read from its declaration. */
const serverErrorCodes = (): string[] => {
  const source = readFileSync(API_ERRORS, 'utf8')
  const declaration = /export type ErrorCode =([\s\S]*?)\n\n/.exec(source)?.[1]
  if (!declaration) {
    throw new Error(
      'Could not find the `ErrorCode` union in apps/api/src/errors.ts. If it moved or was ' +
        'reshaped, fix this reader — do not delete the assertion, which is the only thing ' +
        'binding the administrative client to the codes the server can actually send.',
    )
  }

  // Comments carry code names in prose (`'refused'` is named in three JSDoc blocks), so the union
  // members are taken from the non-comment lines alone. Matching raw text would admit every code
  // an explanation mentions and quietly stop failing.
  return declaration
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("| '"))
    .map((line) => line.slice(3, line.indexOf("'", 3)))
}

describe('the administrative client classifies every code the server can send', () => {
  it('found the union to audit', () => {
    // A reader that matched nothing would make every assertion below vacuous — 010's precache
    // defect, which this project records as its worst.
    expect(serverErrorCodes().length).toBeGreaterThan(15)
    expect(serverErrorCodes()).toContain('session_has_engagement')
  })

  it('classifies each one, or records why the administrative product never meets it', () => {
    const unhandled = serverErrorCodes().filter(
      (code) => classify(new ApiError(409, { code })) === 'unknown' && !(code in ATTENDEE_ONLY),
    )

    expect(
      unhandled,
      'These server error codes classify as `unknown` in the administrative client, so they ' +
        'render "Something went wrong. Try again, and reload if it keeps happening." — whatever ' +
        'the route wrote. Either add a case to `classify` and a sentence to `describe`, or add ' +
        'the code to ATTENDEE_ONLY in this file WITH the reason it cannot reach an operator. ' +
        'This is 014’s own defect: six refusals written to be read, rendered as two sentences.',
    ).toEqual([])
  })

  it('records no exemption for a code the server no longer has', () => {
    // The mirror. An exemption for a code that does not exist is a reason nobody will re-check,
    // and it makes this list look more considered than it is.
    const codes = new Set(serverErrorCodes())
    const stale = Object.keys(ATTENDEE_ONLY).filter((code) => !codes.has(code))

    expect(stale, 'ATTENDEE_ONLY exempts codes the server no longer defines.').toEqual([])
  })

  /**
   * Codes that deliberately render as one sentence, and the requirement that makes them one.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **A MERGE IS PERMITTED ONLY WHEN A REQUIREMENT ASKS FOR IT.** The whole lesson of D10 is that
   * a code exists to say *which* refusal it is, so collapsing two into one sentence throws that
   * away one layer above where it was made. The exception is a rule that positively requires the
   * reader to be unable to tell — and then the merge is the requirement being met, not missed.
   *
   * Anything not listed here must render distinctly, which is what the assertion below enforces.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const DELIBERATELY_MERGED: Record<string, string> = {
    // FR-917 — a 401 carries no detail. "Your session expired" and "you were never signed in"
    // are one fact to an operator: sign in again. Distinguishing them would also tell an
    // unauthenticated caller that a session had once existed.
    session_expired: 'not_authenticated',
  }

  it('gives every classified code a distinct sentence, over the DERIVED population', () => {
    // The mutual-difference property again, but asked of the codes the server has rather than of
    // a list somebody typed. This is the assertion that would have caught 014’s six-into-two
    // collapse without anybody having to notice and write six new cases first.
    const classified = serverErrorCodes().filter(
      (code) => !(code in ATTENDEE_ONLY) && !(code in DELIBERATELY_MERGED),
    )
    const sentences = classified.map((code) =>
      describeFailure(classify(new ApiError(409, { code }))),
    )

    expect(
      new Set(sentences).size,
      'Two server codes render the same sentence in the administrative client. A code exists to ' +
        'say WHICH refusal it is (D10); two codes collapsing into one message discards that ' +
        'distinction one layer above where it was made, which is exactly what happened when four ' +
        '409s all carried `refused`. If the merge is required — FR-917’s 401, for instance — ' +
        'record it in DELIBERATELY_MERGED with the requirement that asks for it.',
    ).toBe(classified.length)
  })

  it('keeps each recorded merge actually merged', () => {
    // The mirror of the exemption. A merge recorded here that no longer happens is a note nobody
    // will re-check, and it would hide a later split that FR-917 forbids.
    for (const [code, merged] of Object.entries(DELIBERATELY_MERGED)) {
      expect(
        classify(new ApiError(401, { code })),
        `\`${code}\` no longer classifies as \`${merged}\`. It is recorded as a deliberate ` +
          'merge, so either the requirement changed and this entry should go, or the split is ' +
          'an accident that discloses more than the refusal is meant to.',
      ).toBe(classify(new ApiError(401, { code: merged })))
    }
  })
})
