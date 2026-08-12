import { describe, expect, it, vi } from 'vitest'

import { SmtpMailService } from '../../src/mail/smtp-adapter.js'

/**
 * T032 (010) — **operator mail carries identifiers and a timestamp, and nothing else** (FR-848).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONE PLACE ATTENDEE DATA COULD LEAVE THE BUILDING, AND UNTIL 010 NOTHING ACTUALLY
 * SENT ANYTHING.**
 *
 * 007 established the rule and 009 extended it to questions, but both were asserted against the
 * *sink* — an adapter that records rather than sends. The guarantee was therefore about a
 * signature and a log line. This feature is the first time a real provider receives these bytes:
 * a third party's systems, a third party's retention, and an inbox belonging to a person.
 *
 * Putting reported content in that email would copy two attendees' personal data out of a
 * database the operator can already query directly. The mail says *a report exists, here is its
 * identifier* — and the reason it cannot say more is structural: **the message text and the
 * reporter's reason are not parameters of `sendAbuseReport`.** They cannot reach a provider by
 * mistake because there is no channel through which they could arrive.
 *
 * This file drives the real adapter with a transport double and reads what it was handed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Captures what the adapter hands the transport, without opening a connection. */
const captureSend = () => {
  const sent: { from?: string; to?: string; subject?: string; text?: string }[] = []

  vi.doMock('nodemailer', () => ({
    createTransport: () => ({
      sendMail: async (message: (typeof sent)[number]) => {
        sent.push(message)
      },
    }),
  }))

  return sent
}

const OPERATOR = 'apps@programasemilla.com'

const REPORT = {
  reportId: '11111111-1111-4111-8111-111111111111',
  reportedAt: '2026-08-11T09:30:00.000Z',
  messageIds: ['22222222-2222-4222-8222-222222222222'],
  questionIds: ['33333333-3333-4333-8333-333333333333'],
} as const

const buildAdapter = async () => {
  const sent = captureSend()
  vi.resetModules()
  const { SmtpMailService: Adapter } = (await import('../../src/mail/smtp-adapter.js')) as {
    SmtpMailService: typeof SmtpMailService
  }

  const adapter = new Adapter({
    smtpUrl: 'smtps://user:secret-key@smtp.example.invalid:465',
    from: 'MyNet <no-reply@example.invalid>',
    log: { warn: () => {} },
  })

  return { adapter, sent }
}

describe('operator abuse mail (FR-848)', () => {
  it('is addressed to the operator and names the report', async () => {
    const { adapter, sent } = await buildAdapter()
    await adapter.sendAbuseReport(OPERATOR, REPORT)

    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toBe(OPERATOR)
    expect(`${sent[0]!.subject}${sent[0]!.text}`).toContain(REPORT.reportId)
  })

  it('carries the cited identifiers and the timestamp', async () => {
    const { adapter, sent } = await buildAdapter()
    await adapter.sendAbuseReport(OPERATOR, REPORT)

    const body = sent[0]!.text ?? ''
    expect(body).toContain(REPORT.messageIds[0])
    expect(body).toContain(REPORT.questionIds[0])
    expect(body).toContain(REPORT.reportedAt)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE STRUCTURAL GUARANTEE, RESTATED AS AN ASSERTION.**
   *
   * There is no parameter for message text and none for the reporter's reason, so this cannot
   * fail today without somebody first widening the port. That is the point: the assertion exists
   * to fail *in the same change* that widens it, at which moment somebody has to justify sending
   * an attendee's words to a third party.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('cannot carry reported content, because the method has no parameter for any', () => {
    // `to` plus the report object. A third parameter is how content would arrive.
    expect(
      SmtpMailService.prototype.sendAbuseReport.length,
      'sendAbuseReport has gained a parameter. FR-848 permits identifiers and a timestamp only — ' +
        'never message or question text, never the reporter’s reason. The absence of a channel ' +
        'is what makes that true rather than remembered.',
    ).toBe(2)
  })

  /**
   * The connection URL carries the provider credential in its userinfo. A body that echoed
   * configuration, or a subject built from it, would put a secret into an inbox and a provider's
   * logs — FR-835's concern, reached by an unexpected route.
   */
  it('never echoes the connection URL or its credential', async () => {
    const { adapter, sent } = await buildAdapter()
    await adapter.sendAbuseReport(OPERATOR, REPORT)

    const message = JSON.stringify(sent[0])
    expect(message).not.toContain('secret-key')
    expect(message).not.toContain('smtps://')
  })

  /**
   * The empty case is worth pinning: a report citing nothing must still be a message somebody can
   * act on. A body that silently rendered `` for both lists reads as a malformed email and is the
   * kind of thing that gets filtered.
   */
  it('says so plainly when a report cites nothing', async () => {
    const { adapter, sent } = await buildAdapter()
    await adapter.sendAbuseReport(OPERATOR, { ...REPORT, messageIds: [], questionIds: [] })

    expect(sent[0]!.text).toMatch(/none cited/)
  })
})
