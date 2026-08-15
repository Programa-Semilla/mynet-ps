import { createTransport, type Transporter } from 'nodemailer'

import type { MailService } from './service.js'
import { renderVerificationBody } from './verification-copy.js'

/**
 * T028 (010) — **the real transactional mail adapter** (FR-840, FR-843, FR-844, FR-845,
 * research R3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SMTP, NOT A VENDOR SDK — AND THAT CHOICE IS THE POINT RATHER THAN A DETAIL.**
 *
 * Constitution v3.4.0 (decision 33) names **Mailgun** as the provider. There is no Mailgun
 * package in this file, no Mailgun type, and no Mailgun name anywhere in the source tree: the
 * provider is entirely contained in a connection URL held as a secret on the VM.
 *
 * FR-842 asks that the vendor be *confined* to the mail module. SMTP satisfies that more
 * strongly than confinement can — there is nothing to confine. Swapping providers is a change of
 * URL with no code change at all, which is the consistent choice for a project whose defining
 * deployment decision was to own its own infrastructure rather than adopt a vendor.
 *
 * **The cost is accepted and named**: no delivery webhooks, no bounce or complaint callbacks, no
 * per-message analytics. None is required by any requirement, and a bounce path would need a
 * route to receive it — a route FR-891 forbids this feature to add.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE PORT'S SHAPE IS UNCHANGED, AND THIS IS THE FILE WHERE IT WOULD HAVE BEEN LOST.**
 *
 * `MailService` has exactly three methods — two account messages and an operator report — and no
 * generic `send`. That absence is what has kept engagement notifications out of scope since 004,
 * and **a provider integration is the classic moment somebody adds `send(to, subject, body)`**
 * because the transport has one. It would be the natural shape for this class and it would
 * dissolve the guard entirely.
 *
 * So the transport's generic send is private, and the three public methods are the only things
 * that can reach it. `tests/unit/mail-selection.test.ts` asserts the port stays this shape.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export interface SmtpMailOptions {
  /**
   * The connection URL, credentials included — e.g. `smtps://user:key@smtp.mailgun.org:465`.
   *
   * **A secret in full**, because the credential is in its userinfo. It is never logged: the
   * failure paths below record the recipient and the error, never this.
   */
  readonly smtpUrl: string
  /** The envelope sender, on the sending domain so the provider's verification passes. */
  readonly from: string
  /**
   * Where a dispatch failure is reported (FR-846).
   *
   * Fastify's logger, handed in rather than reached for, so this class has no opinion about
   * logging and can be constructed in a test with a double.
   */
  readonly log: { warn: (details: object, message: string) => void }
}

export class SmtpMailService implements MailService {
  readonly #transport: Transporter
  readonly #from: string
  readonly #log: SmtpMailOptions['log']

  constructor({ smtpUrl, from, log }: SmtpMailOptions) {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **One transport for the process, created once at the composition root.**
    //
    // `createTransport` opens no connection — it validates the URL and returns a pool that dials
    // on first use — so constructing it at boot cannot fail because a provider is unreachable,
    // and a provider outage therefore cannot prevent the API from starting. That matters here
    // more than it usually would: `SinkMailService` refuses to construct under production, so if
    // this constructor could also refuse there would be no adapter that starts at all.
    //
    // Creating one per message would defeat pooling and open a TLS connection per send, on a
    // path already awaited inside a request.
    // ───────────────────────────────────────────────────────────────────────────────────────
    this.#transport = createTransport(smtpUrl)
    this.#from = from
    this.#log = log
  }

  /** FR-844. The body is `renderVerificationBody`'s, shared with the sink (FR-812a). */
  async sendVerification(to: string, link: string): Promise<void> {
    await this.#send(to, 'Confirm your MyNet email address', renderVerificationBody(link))
  }

  /**
   * FR-844.
   *
   * **Sent only when an account exists**, while the *response* to a reset request is identical
   * either way (FR-327). That asymmetry is the non-disclosure guarantee and it lives in the
   * caller — this method is simply not invoked when there is nobody to send to.
   */
  async sendPasswordReset(to: string, link: string): Promise<void> {
    await this.#send(
      to,
      'Reset your MyNet password',
      [
        'Reset your password',
        '',
        'Someone asked to reset the password on the MyNet account for this address. Follow the',
        'link below to choose a new one.',
        '',
        link,
        '',
        'If it was not you, nothing has changed and you can ignore this message. The link stops',
        'working once it is used or once it expires, and your current password still works.',
      ].join('\n'),
    )
  }

  /**
   * FR-845, FR-848 — **the operator's copy: identifiers and a timestamp, and nothing else.**
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE REPORTED CONTENT AND THE REPORTER'S REASON ARE NOT PARAMETERS OF THIS METHOD, SO THEY
   * CANNOT REACH A PROVIDER EVEN BY MISTAKE.**
   *
   * Putting reported text in email would copy two attendees' personal data into an external
   * provider's systems and into an inbox with its own retention — for a recipient who can query
   * the database directly. The mail says *a report exists, here is its identifier*.
   *
   * This is the one place in the product where that guarantee stops being about the port's
   * signature and starts being about bytes leaving the building, which is why it is restated.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  async sendAbuseReport(
    to: string,
    report: {
      readonly reportId: string
      readonly reportedAt: string
      readonly messageIds: readonly string[]
      readonly questionIds: readonly string[]
    },
  ): Promise<void> {
    await this.#send(
      to,
      `MyNet conduct report ${report.reportId}`,
      [
        `Report:      ${report.reportId}`,
        `Reported at: ${report.reportedAt}`,
        `Messages:    ${report.messageIds.length ? report.messageIds.join(', ') : 'none cited'}`,
        `Questions:   ${report.questionIds.length ? report.questionIds.join(', ') : 'none cited'}`,
        '',
        'The reported attendee has already been blocked by the reporter, and the report is',
        'recorded. This message carries identifiers only — no message text, no question text and',
        'no reason. Read the report in the database.',
      ].join('\n'),
    )
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **PRIVATE, AND THE `#` IS DOING REAL WORK.**
   *
   * This is a generic send. It is exactly the method `MailService` refuses to have, and the
   * reason it can exist here at all is that nothing outside this class can call it — a caller
   * cannot choose a subject, cannot choose a body, and cannot add a fourth message without
   * editing the port. Making it public would move the engagement-notification boundary from
   * "the interface forbids it" to "nobody has done it yet".
   * ═══════════════════════════════════════════════════════════════════════════════════════
   *
   * **A failure is logged and rethrown, never swallowed** (FR-846). Swallowing it here would put
   * the decision in the wrong place: only the caller knows what it is in the middle of, and every
   * caller already wraps this because an unprovisioned provider has been the expected state since
   * 004. FR-847's "a dispatch failure must not fail the action" is therefore satisfied where it
   * belongs — a report still blocks and is still recorded, and an account is still created.
   */
  async #send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.#transport.sendMail({ from: this.#from, to, subject, text })
    } catch (error) {
      // The recipient and the failure, never the connection URL: it carries the credential in
      // its userinfo, and a log line is exactly how a secret escapes a system that never meant
      // to disclose it (FR-835).
      this.#log.warn({ err: error, to, subject }, 'transactional mail could not be delivered')
      throw error
    }
  }
}
