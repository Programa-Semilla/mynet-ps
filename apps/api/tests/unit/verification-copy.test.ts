import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderVerificationBody } from '../../src/mail/verification-copy.js'

/**
 * T016 (010) — **what the verification message actually says** (FR-809, FR-810, FR-812a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE THREAT IS SIGN-UP WITH SOMEBODY ELSE'S ADDRESS, AND IT IS NOT HYPOTHETICAL ONCE A
 * PUBLIC URL EXISTS.**
 *
 * Sign-up is open to anybody. Nothing stops a person entering an address they do not control, so
 * the owner of that address receives mail about an account they did not create — and, until
 * FR-806 landed alongside this, that account could push a live-resolving profile bearing a chosen
 * name and face permanently into a verified attendee's Network.
 *
 * The message is the only contact the product ever has with that person. It has one job beyond
 * carrying the link: **tell them what following it does, and give them somewhere to go if it was
 * not them.** A verification mail that is only a button is an instruction to complete somebody
 * else's sign-up.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-812a IS HONEST ABOUT WHAT THIS IS WORTH, AND SO IS THIS FILE.** FR-809 and FR-810 govern
 * message *content*, not behaviour. Asserting that copy contains a phrase is weaker than
 * asserting a refusal, and the requirement says so rather than dressing it up as equivalent.
 *
 * What raises it above a spell-check is the **structural** half below: the renderer is handed a
 * link and nothing else, so FR-810's "no display name, no other address, no profile content" is
 * not a rule the copy has to remember — there is no parameter through which any of it could
 * arrive.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const LINK = 'https://mynet-dev.programasemilla.com/verify?token=abc123'

describe('the verification message explains itself (FR-809)', () => {
  it('carries the link', () => {
    expect(renderVerificationBody(LINK)).toContain(LINK)
  })

  /**
   * "Confirms an account" — the thing a recipient needs to know *before* they click, not after.
   */
  it('says that following the link confirms an account', () => {
    const body = renderVerificationBody(LINK).toLowerCase()

    expect(
      /confirm|verif/.test(body) && /account|address/.test(body),
      'FR-809 — the message must tell its recipient that following the link confirms an account. ' +
        'A bare link and a button is an instruction to complete a stranger’s sign-up.',
    ).toBe(true)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE CONTEST PATH, WHICH IS THE HALF THAT IS EASY TO DROP.**
   *
   * Every product's verification mail says "click here". Far fewer say what to do when it was not
   * you — and that is the entire reason FR-809 names it separately, because the recipient who
   * needs it is by definition not a user of the product and has no other way in.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('tells somebody who did not create the account what to do', () => {
    const body = renderVerificationBody(LINK).toLowerCase()

    expect(
      /did ?n[o']?t (create|sign|request)|was ?n[o']?t you|not you/.test(body),
      'FR-809 — the message must address the person who did NOT create this account. They are ' +
        'the recipient this requirement exists for: sign-up is open, so anybody can enter an ' +
        'address they do not control.',
    ).toBe(true)
  })

  it('gives that person somewhere to go, not only something to avoid', () => {
    const body = renderVerificationBody(LINK)

    // Either a mailbox to write to, or a stated consequence of doing nothing. "Ignore this"
    // alone is not a way to contest; "ignore this, and here is what happens" is a statement the
    // recipient can act on, and an address is better still.
    //
    // The consequence pattern is deliberately broad. What FR-809 asks for is that the message
    // says what *not* following the link means — "the address is not confirmed", "the account
    // cannot be found", "the link expires" all discharge it, and pinning one phrasing would make
    // this a spell-check on wording rather than a check on substance.
    expect(
      /@/.test(body.replace(LINK, '')) ||
        /(expire|will not|cannot|never|not confirmed)/i.test(body),
      'FR-809 asks for a stated way to CONTEST the account. Give an address to write to, or ' +
        'state plainly what happens if the link is never followed — silence is not a remedy.',
    ).toBe(true)
  })
})

describe('the verification message discloses nothing about the account (FR-810)', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE STRUCTURAL ASSERTION, AND IT IS THE ONE THAT WILL STILL BE TRUE IN THREE FEATURES.**
   *
   * FR-810 forbids the display name, any other address, and any profile content. A copy review
   * catches that today. A *signature* that cannot carry them catches it forever — the same move
   * `MailService` makes by having no generic `send`, and `sendAbuseReport` makes by having no
   * parameter for message text.
   *
   * If a later change adds a parameter here "to personalise the greeting", this fails, and the
   * conversation happens before the mail goes out rather than after.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('cannot receive a display name, because it takes only a link', () => {
    expect(
      renderVerificationBody.length,
      'renderVerificationBody has gained a parameter. FR-810 forbids the message disclosing the ' +
        'display name, any other address, or any profile content — and the reason this renderer ' +
        'takes a link and nothing else is so that none of them can reach it at all.',
    ).toBe(1)
  })

  it('addresses nobody by name', () => {
    const body = renderVerificationBody(LINK)

    // A greeting is where a name arrives. There is no name available to this function, so a
    // salutation with a placeholder in it is the failure shape worth catching.
    expect(body).not.toMatch(/\bdear\b/i)
    expect(body).not.toMatch(/\$\{|\{\{|%s\b/)
  })

  it('mentions no address other than a contest mailbox this deployment configured', () => {
    const configured = process.env['MAIL_OPERATOR_ADDRESS']
    const addresses = renderVerificationBody(LINK)
      .replace(LINK, '')
      .match(/[\w.+-]+@[\w.-]+\.\w+/g)

    for (const address of addresses ?? []) {
      expect(
        address,
        `The verification message names ${address}. FR-810 permits nothing about the account ` +
          'beyond what the recipient already knows by receiving the mail — and the address it ' +
          'was sent to is the only one they know. The contest mailbox is the single exception.',
      ).toBe(configured)
    }
  })
})

/**
 * FR-812a again: both adapters must say the same thing. A renderer extracted so the SMTP adapter
 * could reuse it, and then used by only one of them, is a second copy waiting to drift — and the
 * one that drifts is the one nobody reads, which is production's.
 */
describe('one body, shared by both adapters (FR-812a)', () => {
  const ORIGINAL = process.env['MAIL_OPERATOR_ADDRESS']

  beforeEach(() => {
    process.env['MAIL_OPERATOR_ADDRESS'] = ORIGINAL
  })

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env['MAIL_OPERATOR_ADDRESS']
    else process.env['MAIL_OPERATOR_ADDRESS'] = ORIGINAL
  })

  it('is deterministic for one link, so the two adapters cannot differ by construction', () => {
    expect(renderVerificationBody(LINK)).toBe(renderVerificationBody(LINK))
  })

  it('produces a body worth sending, not a stub', () => {
    // A renderer returning the bare link would satisfy "contains the link" and nothing else.
    expect(renderVerificationBody(LINK).length).toBeGreaterThan(LINK.length + 120)
  })
})
