import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T026 (010) — **the adapter is chosen by configuration alone** (FR-841).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO ENVIRONMENT BRANCH. CREDENTIALS PRESENT SELECTS REAL DELIVERY; ABSENT SELECTS THE SINK.**
 *
 * This is the shape 007 proved for `PushService`, and the reason it is a requirement rather than
 * a preference is worth restating: **an environment branch makes a local end-to-end test a
 * special mode.** If `NODE_ENV` chose the adapter, then walking the sign-up journey on a
 * developer's machine would exercise a code path that production never runs, and the first time
 * the real path executed would be against real people.
 *
 * With configuration as the only signal, `pnpm start` with an SMTP URL **is** the production
 * path. That is what makes a local test evidence about production rather than about development.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **ASSERTED OVER THE COMPOSITION ROOT'S SOURCE, WHICH IS THE ONLY PLACE THE CHOICE IS MADE.**
 *
 * Constructing the two adapters and comparing them would prove which one a *test* got. The
 * requirement is about what the selection is allowed to consult, and the failure mode is a
 * branch nobody notices — `if (config.isProduction)` added beside the existing check, which every
 * behavioural test would still pass because both adapters satisfy the port.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const PORTS = readFileSync(
  fileURLToPath(new URL('../../src/plugins/ports.ts', import.meta.url)),
  'utf8',
)

/** Comments stripped: every phrase forbidden below also appears in the prose explaining it. */
const CODE = PORTS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('mail adapter selection (FR-841)', () => {
  it('the comment-stripped composition root is still real code', () => {
    expect(CODE).toContain('app.decorate')
    expect(CODE).toContain('mail')
  })

  it('selects on the SMTP URL being configured', () => {
    expect(
      CODE,
      'The composition root does not consult `config.mail.smtpUrl`. FR-841 makes the presence of ' +
        'credentials the ONE signal that selects real delivery.',
    ).toMatch(/config\.mail\.smtpUrl/)
  })

  it('constructs the real adapter when it is present', () => {
    expect(CODE).toMatch(/new SmtpMailService/)
  })

  it('keeps the sink as the fallback', () => {
    expect(CODE).toMatch(/new SinkMailService/)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE ASSERTION THAT MATTERS: NO ENVIRONMENT BRANCH ANYWHERE NEAR THE MAIL SELECTION.**
   *
   * `nodeEnv` legitimately appears in this file for two unrelated reasons — the push sink's
   * logger is handed over only in development, and the "not provisioned" warnings are gated the
   * same way. Both are about *diagnostics*, not about which adapter is used.
   *
   * So this checks the statement that performs the mail selection rather than the whole file.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('does not branch on the environment when choosing', () => {
    // The selection statement: from `options.mail` to the end of that expression.
    const selection = /options\.mail[\s\S]{0,600}?SinkMailService\(\)/.exec(CODE)?.[0] ?? ''

    expect(selection, 'the mail selection statement was not found to inspect').not.toBe('')

    expect(
      /isProduction|isDeployed|nodeEnv|NODE_ENV/.test(selection),
      'The mail adapter is chosen with reference to the environment. FR-841 forbids it: ' +
        'credentials present selects real delivery, credentials absent selects the sink, ' +
        'identically everywhere. An environment branch makes a local end-to-end test exercise a ' +
        'path production never runs — which is precisely when the real path first executes ' +
        'against real people.',
    ).toBe(false)
  })

  /**
   * The port's shape is what has kept engagement notifications out of scope since 004, and a
   * provider integration is the classic moment somebody adds a generic send "just for the
   * adapter". Asserted here because this is the file where the adapter is wired in.
   */
  it('does not introduce a generic send onto the port', () => {
    const service = readFileSync(
      fileURLToPath(new URL('../../src/mail/service.ts', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    expect(
      /^\s*send\s*\(/m.test(service),
      'A generic `send` has appeared on MailService. There are exactly three methods — two ' +
        'account messages and an operator report — and the absence of a fourth is what keeps the ' +
        'engagement-notification exclusion a boundary rather than a convention (FR-843).',
    ).toBe(false)
  })
})
