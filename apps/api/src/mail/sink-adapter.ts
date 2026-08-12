import { loadConfig } from '../config.js'
import type { MailService } from './service.js'
import { renderVerificationBody } from './verification-copy.js'

/**
 * T019 (004) — the development and test implementation of `MailService` (FR-394).
 *
 * It sends nothing. It records what *would* have been sent, so that the integration suite can
 * read a verification link without a provider, and so quickstart.md's Scenario 2 has somewhere
 * to look while register entry 18 is open.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS ADAPTER REFUSES TO EXIST IN PRODUCTION, AND THE REFUSAL IS NOT DEFENSIVE PADDING.**
 *
 * A reset link *is* the account: anyone holding one can set the password. This class holds
 * every link it is given in memory and writes each to the log, which is exactly what makes it
 * useful in development and exactly what would make it a credential leak anywhere else. The
 * specification sanctions reading links from the log **in development** (quickstart Scenario 2)
 * and forbids credential material reaching any log otherwise (FR-332, FR-391, SC-311).
 *
 * A comment saying "do not use in production" is not what keeps those two apart. The throw is.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

export interface SentMessage {
  readonly kind: 'verification' | 'password-reset' | 'abuse-report'
  readonly to: string
  /**
   * The link, for the two account messages.
   *
   * **An abuse report has none**, and that is the point rather than an omission: it carries
   * identifiers and a timestamp only (research R11), so this field holds the report identifier
   * and the record below carries no attendee-authored text at all.
   */
  readonly link: string
  readonly at: Date
  /** Present only for an abuse report. Identifiers, never content. */
  readonly messageIds?: readonly string[]
}

export class SinkMailService implements MailService {
  readonly #sent: SentMessage[] = []

  constructor() {
    if (loadConfig().isProduction) {
      throw new Error(
        'SinkMailService must never run in production: it writes verification and reset links ' +
          'to the log and holds them in memory, and a reset link is the account (FR-332, ' +
          'FR-391). Provision a real transactional mail provider — register entry 18.',
      )
    }
  }

  async sendVerification(to: string, link: string): Promise<void> {
    // T024 (010) — the same body the SMTP adapter sends, written to the log rather than
    // delivered. Both adapters render from one function so the copy a developer reads locally is
    // the copy a stranger receives in a deployed environment (FR-812a); a second version here
    // would be the one that drifted, and it would drift in the direction nobody checks.
    this.#record('verification', to, link, renderVerificationBody(link))
  }

  async sendPasswordReset(to: string, link: string): Promise<void> {
    this.#record('password-reset', to, link)
  }

  /**
   * T080 (007) — the operator's copy, recorded rather than sent.
   *
   * **Nothing attendee-authored reaches this adapter**, so unlike the two above it is not
   * holding credential material — a report identifier is not a capability. The reason string and
   * the message bodies are deliberately absent from the signature, so this implementation could
   * not log them even if it wanted to.
   */
  async sendAbuseReport(
    to: string,
    report: {
      readonly reportId: string
      readonly reportedAt: string
      readonly messageIds: readonly string[]
      // 009 (FR-783) — the reported questions, alongside the messages.
      readonly questionIds: readonly string[]
    },
  ): Promise<void> {
    this.#sent.push({
      kind: 'abuse-report',
      to,
      link: report.reportId,
      at: new Date(),
      messageIds: [...report.messageIds, ...report.questionIds],
    })

    console.warn(
      `\n── development mail sink ─────────────────────────────────────────────\n` +
        `   abuse report ${report.reportId} for ${to}\n` +
        `   reported at ${report.reportedAt}, ${report.messageIds.length} message(s) and ` +
        `${report.questionIds.length} question(s) cited\n` +
        `   Nothing was sent. Register entry 18 — no mail provider is provisioned.\n` +
        `─────────────────────────────────────────────────────────────────────\n`,
    )
  }

  /**
   * Everything this adapter has been handed, newest last.
   *
   * A copy, so a test holding the result cannot be surprised by a later send mutating it, and
   * so nothing outside this class can add to the record.
   */
  sent(): readonly SentMessage[] {
    return [...this.#sent]
  }

  /** The most recent message to an address, which is what every test that reads a link wants. */
  lastTo(to: string, kind?: SentMessage['kind']): SentMessage | undefined {
    const normalised = to.trim().toLowerCase()
    return [...this.#sent]
      .reverse()
      .find(
        (message) =>
          message.to.trim().toLowerCase() === normalised && (!kind || message.kind === kind),
      )
  }

  /** Test seam: an empty sink, so one file's sends cannot be read by another's assertions. */
  clear(): void {
    this.#sent.length = 0
  }

  #record(kind: SentMessage['kind'], to: string, link: string, body?: string): void {
    this.#sent.push({ kind, to, link, at: new Date() })

    // `console.warn` rather than the Fastify logger: this adapter is constructed at the
    // composition root and has no request to log against, and the message must be visible at
    // the default development log level — quickstart tells a reader to look for it here.
    //
    // The rendered body is printed when there is one, so that walking quickstart locally shows
    // what a recipient would actually read rather than only the link they would click.
    console.warn(
      `\n── development mail sink ─────────────────────────────────────────────\n` +
        `   ${kind} for ${to}\n   ${link}\n` +
        (body ? `\n${body}\n\n` : '') +
        `   Nothing was sent. No MAIL_SMTP_URL is configured, so the sink is selected.\n` +
        `─────────────────────────────────────────────────────────────────────\n`,
    )
  }
}
