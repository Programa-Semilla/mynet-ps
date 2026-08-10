import { describe, expect, it } from 'vitest'

import { THRESHOLDS } from '../../src/auth/throttle.js'
import { THROTTLE_ACTIONS } from '../../src/db/schema/sign-in-attempts.js'

/**
 * T030 (007) — **the delay-only guarantee, as a structural guard** (FR-511a, FR-331, research
 * R5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`mayDeny: false` IS A REQUIREMENT, NOT A TUNING CHOICE, AND A BOOLEAN IS ONE KEYSTROKE
 * FROM ITS OPPOSITE.**
 *
 * Two actions in this product may delay and may never deny. `reset_request` cannot deny because
 * it is keyed on the *victim's* address, so a denial is itself the attack (FR-331). 007's
 * `message_send` cannot deny for an unrelated reason (FR-511a): a delayed message is a working
 * product and a refused one is not, in the one moment a conference contact mattered.
 *
 * Neither guarantee is visible at any call site — the clamp lives inside `failureDelayMs`
 * precisely so no route can forget it — which is exactly what makes it easy to withdraw by
 * accident. `tests/integration/reset-lockout.test.ts` proves the behaviour for one action
 * against a real database; this proves the *configuration* for both, in the suite that runs on
 * every change, with no database at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * It also fails when a **new** action is added without a threshold entry, which is the same
 * fail-by-existence discipline `deletion-coverage` and `export-coverage` apply to tables.
 */
describe('throttle actions', () => {
  it('gives every declared action a threshold', () => {
    // `Record<ThrottleAction, …>` already makes this a compile error, and it is asserted at
    // runtime anyway: the type is only as good as the cast nobody has written yet, and this
    // costs nothing.
    for (const action of THROTTLE_ACTIONS) {
      expect(THRESHOLDS[action], `no threshold declared for '${action}'`).toBeDefined()
    }
  })

  it('never lets a message send be denied', () => {
    expect(
      THRESHOLDS.message_send.mayDeny,
      'FR-511a — sending may be delayed and may never be refused. Flipping this to true makes ' +
        'the throttle capable of telling an attendee at a conference that their message will ' +
        'not be sent, which is the one outcome the requirement forbids.',
    ).toBe(false)
  })

  it('keeps reset-request delay-only, which 004 made a requirement', () => {
    // Restated here rather than left to 004's integration test alone: this file is where
    // somebody adding an action reads what the flag means, and a table with one delay-only
    // entry reads like an exception where two read like a rule.
    expect(THRESHOLDS.reset_request.mayDeny).toBe(false)
  })

  it('lets conversation creation actually refuse', () => {
    expect(
      THRESHOLDS.conversation_create.mayDeny,
      'FR-504a — the cap on how many distinct people one account may open a conversation with ' +
        'has to be a cap. A delay-only bound does not bound mass contact; it spreads it over ' +
        'the afternoon.',
    ).toBe(true)
  })

  it('bounds new conversations far more tightly than sends within one', () => {
    // The asymmetry is the whole design (research R5): the harm M1 names is breadth of contact,
    // not volume inside a thread. If these two ever converge, one of them has been "tuned"
    // without the reasoning being revisited.
    expect(THRESHOLDS.conversation_create.identifier.freeAttempts).toBeLessThan(
      THRESHOLDS.message_send.identifier.freeAttempts,
    )
    expect(THRESHOLDS.conversation_create.source.freeAttempts).toBeLessThan(
      THRESHOLDS.message_send.source.freeAttempts,
    )
  })

  it('keys both new actions on the acting attendee, which is what makes the asymmetry legitimate', () => {
    // Not assertable from this table — the key is chosen at the call site — so it is recorded
    // as the standing condition on the two entries above rather than left implicit:
    //
    //   `conversation_create` may deny **only because** its identifier is the caller's own
    //   authenticated identity. The day a route keys it on the *recipient* instead, a denial
    //   starts falling on somebody who did nothing, and FR-331's reasoning applies to it just
    //   as it does to `reset_request`.
    //
    // `tests/integration/conversation-create.test.ts` and the route's own body are where that
    // is enforced. This assertion exists to carry the sentence.
    expect(THRESHOLDS.conversation_create.mayDeny).toBe(true)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T042 (008) — **both of this feature's actions may deny, and that is asserted rather than
   * assumed** (FR-609, FR-638, FR-638a).
   *
   * The flag is deliberate in both directions here. This table now holds two delay-only entries
   * and six denying ones, and the difference between the groups is a single question: **who
   * does a denial fall on?** `reset_request` is keyed on a victim's address, so a denial is the
   * attack. `message_send` is delay-only for an unrelated product reason. Everything else,
   * including these two, is keyed on the acting attendee's own authenticated identity, so a
   * refusal can only inconvenience the person doing the thing.
   *
   * Asserted separately from the generic "every action has a threshold" case above, because a
   * threshold with the wrong `mayDeny` satisfies that one perfectly.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('lets card sharing actually refuse (FR-609, FR-638a)', () => {
    expect(
      THRESHOLDS.card_share.mayDeny,
      'FR-638a — a bound on mass card-sharing has to be a cap. Each share plants a durable ' +
        "entry in a stranger's Network that they did not ask for and cannot delete (FR-618), " +
        'so a delay-only bound would not bound it — it would spread it over the afternoon.',
    ).toBe(true)
  })

  it('lets meeting proposals actually refuse (FR-638, FR-638a)', () => {
    expect(
      THRESHOLDS.appointment_propose.mayDeny,
      "FR-638a — a proposal asks for a slot of somebody else's time and arrives needing an " +
        "answer. Keyed on the proposer's own identity, so a refusal falls only on them.",
    ).toBe(true)
  })

  it('keeps the delay-only set to exactly the two actions that earned it', () => {
    // ─────────────────────────────────────────────────────────────────────────────────────
    // The inverse of the assertions above, and the one that fails when a **future** feature
    // adds an action and copies the wrong neighbour's flag. Delay-only is the exceptional
    // configuration: it is correct only when a denial could fall on somebody other than the
    // actor (FR-331), or when a refused action is a failure the actor cannot act on (FR-511a).
    //
    // If you are here because this failed, do not add your action to the list to make it pass.
    // Say which of those two arguments applies to it, in its own entry in `THRESHOLDS`, and
    // then add it here.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const delayOnly = THROTTLE_ACTIONS.filter((action) => !THRESHOLDS[action].mayDeny).sort()

    expect(
      delayOnly,
      'The set of delay-only throttle actions has changed. `reset_request` (FR-331, keyed on a ' +
        "victim's address) and `message_send` (FR-511a, a refused message at a conference is a " +
        'failure nobody can act on) are the two that have earned it. Anything else here is ' +
        'either a new requirement that needs recording, or a flag copied from the wrong ' +
        'neighbour.',
    ).toEqual(['message_send', 'reset_request'])
  })
})
