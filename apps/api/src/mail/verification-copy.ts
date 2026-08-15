import { loadConfig } from '../config.js'

/**
 * T024, T031 (010) — **what the verification message says**, shared by both adapters (FR-809,
 * FR-810, FR-812a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE RECIPIENT THIS COPY IS WRITTEN FOR IS THE ONE WHO DID NOT SIGN UP.**
 *
 * Sign-up is open to anybody and nothing stops a person entering an address they do not control.
 * So the owner of that address receives mail about an account they did not create — and this
 * message is the **only** contact the product ever has with them. They are not a user; they have
 * no session, no profile and no way in. If it does not tell them what is happening, nothing will.
 *
 * A verification mail that is only a link and a button is, to that person, an instruction to
 * complete somebody else's sign-up.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **IT TAKES A LINK AND NOTHING ELSE, AND THAT SIGNATURE IS FR-810.**
 *
 * The requirement forbids disclosing the display name, any other address, or any profile content
 * — nothing beyond what the recipient already knows by receiving the mail. Enforcing that by
 * review means re-reviewing it every time the copy changes. Enforcing it by *signature* means
 * there is no parameter through which any of it could arrive, which is the same move
 * `MailService` makes by having no generic `send` and `sendAbuseReport` makes by having no
 * parameter for message text.
 *
 * `tests/unit/verification-copy.test.ts` asserts the arity, so "let's personalise the greeting"
 * fails the build rather than shipping.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **One renderer, two adapters** (FR-812a). The sink writes it to the log and `SmtpMailService`
 * sends it. A second copy would be a second thing to keep true, and the one that drifted would be
 * the one nobody reads locally — which is production's.
 */
export const renderVerificationBody = (link: string): string => {
  // Read here rather than taken as a parameter: it is a property of the deployment, not of the
  // message, and threading it through every caller would be one more place to pass the wrong
  // thing. Absent is a legitimate state — see `config.ts` — so the copy has to work without it.
  const operator = loadConfig().mail.operatorAddress

  /**
   * The contest path, and the reason it has two forms.
   *
   * FR-809 asks for a *stated way to contest*. An address is the strong form and needs somebody
   * to have configured one. Where none is configured, the honest answer is not silence but the
   * consequence: an unverified address is never used, so doing nothing is itself effective. That
   * is a fact the recipient can act on, which "please ignore this email" is not.
   */
  const contest = operator
    ? `If you did not create this account, do not follow the link, and tell us at ${operator}.\n` +
      'Until the link is followed, the address is not confirmed and the account cannot be found\n' +
      'by anyone else.'
    : 'If you did not create this account, do not follow the link. Until it is followed, the\n' +
      'address is not confirmed, the account cannot be found by anyone else, and no further mail\n' +
      'will be sent to you about it.'

  // Plain text, hard-wrapped, no salutation. There is no name available to greet with, and a
  // template placeholder is exactly the failure `verification-copy.test.ts` looks for.
  return [
    'Confirm your email address',
    '',
    'Someone used this address to create a MyNet account. Following the link below confirms',
    'that the address is yours and completes the sign-up.',
    '',
    link,
    '',
    contest,
  ].join('\n')
}
