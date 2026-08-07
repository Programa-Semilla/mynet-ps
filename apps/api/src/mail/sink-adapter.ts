import { loadConfig } from '../config.js'
import type { MailService } from './service.js'

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
  readonly kind: 'verification' | 'password-reset'
  readonly to: string
  readonly link: string
  readonly at: Date
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
    this.#record('verification', to, link)
  }

  async sendPasswordReset(to: string, link: string): Promise<void> {
    this.#record('password-reset', to, link)
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

  #record(kind: SentMessage['kind'], to: string, link: string): void {
    this.#sent.push({ kind, to, link, at: new Date() })

    // `console.warn` rather than the Fastify logger: this adapter is constructed at the
    // composition root and has no request to log against, and the message must be visible at
    // the default development log level — quickstart tells a reader to look for it here.
    console.warn(
      `\n── development mail sink ─────────────────────────────────────────────\n` +
        `   ${kind} for ${to}\n   ${link}\n` +
        `   Nothing was sent. Register entry 18 — no mail provider is provisioned.\n` +
        `─────────────────────────────────────────────────────────────────────\n`,
    )
  }
}
