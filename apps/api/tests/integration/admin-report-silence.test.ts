import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { buildApp } from '../../src/app.js'
import { resetConfigForTests } from '../../src/config.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import type { MailService } from '../../src/mail/service.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  SEED_PASSWORD,
  sessionCookieFrom,
  seededAttendeeId,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T080, T081 (013) — **the reporter is told nothing, and the operator mail is unchanged**
 * (FR-946, FR-947).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DECISION 35 CONDITIONS THE ENTIRE REPORT-QUEUE READ ON THE REPORTER STAYING UNINFORMED.**
 *
 * *"The reporter is still promised nothing, so a queue must not become a status they can see."*
 * That is not a UI preference — a status the reporter can observe would turn every resolution
 * into a signal about another attendee, on a surface designed to send the matter **out** of the
 * product.
 *
 * FR-947 is the other half: the operator mail is **unchanged** by this feature. It carries
 * identifiers and a timestamp only — never message text and never the reason — and it was
 * written that way to stop that text living in an inbox outside every retention rule this
 * project controls. **A queue reading the row is not that**, and the two must not be conflated:
 * granting the queue a disclosure does not grant the mail one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'silence-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('what a resolution discloses', () => {
  let app: FastifyInstance
  let adaId: string
  let graceId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(abuseReports)
    await db.delete(organizerAssignments)
    await db.delete(operators)

    await db.insert(operators).values({
      email: OPERATOR_EMAIL,
      displayName: 'Silent Operator',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      credentialIsInitial: false,
    })

    adaId = await seededAttendeeId(ADA)
    graceId = await seededAttendeeId(GRACE)
  })

  const platformSession = async (): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD },
    })
    const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    return `${ADMIN_SESSION_COOKIE}=${cookie?.value}`
  }

  /**
   * **T080 — resolution discloses nothing to the reporter, on any MyNet surface** (FR-946).
   *
   * Driven by comparing the reporter's own surfaces before and after, byte for byte, rather than
   * by checking a specific field is absent — a field-by-field assertion would pass on the day
   * somebody added a *different* field.
   */
  it('changes nothing the reporter can observe (FR-946)', async () => {
    const db = getDb()
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'What Ada said about Grace.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const headers = { cookie: cookieHeader(sessionCookieFrom(signIn) as string) }

    const surfaces = ['/auth/me', '/events', '/profile', '/blocks']
    const before = new Map<string, string>()
    for (const surface of surfaces) {
      before.set(surface, (await app.inject({ method: 'GET', url: surface, headers })).body)
    }

    const cookie = await platformSession()
    const resolved = await app.inject({
      method: 'POST',
      url: `/admin/reports/${report!.id}/resolution`,
      headers: { cookie },
      payload: { outcome: 'actioned', note: 'Dealt with.' },
    })
    expect(resolved.statusCode).toBe(204)

    for (const surface of surfaces) {
      expect(
        (await app.inject({ method: 'GET', url: surface, headers })).body,
        `${surface} changed after the reporter’s report was resolved. FR-946 keeps them told ` +
          'nothing at all — decision 35 conditions the whole queue read on it.',
      ).toBe(before.get(surface))
    }
  })

  it('exposes no address at which a reporter could ask about their report (FR-946)', async () => {
    const routes: { method: string | string[]; url: string }[] = []
    const probe = await buildApp({ onRoute: (route) => routes.push(route) })
    await probe.close()

    // Every report-shaped address outside the administrative prefix, other than filing one.
    const readable = routes
      .flatMap((route) =>
        (Array.isArray(route.method) ? route.method : [route.method]).map((method) => ({
          method,
          url: route.url,
        })),
      )
      .filter((route) => /report/i.test(route.url))
      .filter((route) => !/^\/admin(\/|$)/.test(route.url))
      .filter((route) => route.method !== 'POST' && route.method !== 'HEAD')
      .map((route) => `${route.method} ${route.url}`)

    expect(
      readable,
      'An attendee-facing address reads a report. There is no status, no case identifier and ' +
        'nothing to poll (FR-946, FR-972).',
    ).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T081 — FILING A REPORT STILL DISPATCHES OPERATOR MAIL, AND THAT MAIL IS UNCHANGED**
   * (FR-947).
   *
   * Two claims, and the second is the one at risk. Now that a queue exists and may disclose
   * content, the obvious "improvement" is to put the reason in the mail so an operator can triage
   * from their inbox. That is exactly what FR-947 forbids: the mail was shaped to keep that text
   * out of a system this project does not control, and granting the *queue* a disclosure does not
   * grant the *mail* one.
   *
   * The double is the whole `MailService`, substituted at the port — so this reads what actually
   * reaches a provider rather than what the call site intended.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('still mails the operator, with identifiers and a timestamp only (FR-947)', async () => {
    const dispatched: unknown[] = []

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **An operator address has to be configured for a dispatch to happen at all**, and its
    // absence is the *expected* state — register entry 21 is still open, so no address has been
    // named and a report is written and blocked while the dispatch is skipped and logged
    // (FR-549). That fallback is deliberate: a report that failed because nobody had configured
    // an inbox would be a safety control that silently did nothing.
    //
    // So this test configures one. Without it the assertion below would read "no mail was sent"
    // and pass for the wrong reason — which is how a guard about mail content ends up asserting
    // nothing at all.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const previous = process.env['MAIL_OPERATOR_ADDRESS']
    process.env['MAIL_OPERATOR_ADDRESS'] = 'operator-inbox@mynet.invalid'
    resetConfigForTests()

    const recordingMail: MailService = {
      sendVerification: async () => {},
      sendPasswordReset: async () => {},
      sendAbuseReport: async (to, report) => {
        dispatched.push({ to, report })
      },
    }

    const instrumented = await buildApp({ ports: { mail: recordingMail } })

    try {
      const signIn = await instrumented.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      })
      const headers = { cookie: cookieHeader(sessionCookieFrom(signIn) as string) }

      const filed = await instrumented.inject({
        method: 'POST',
        url: '/reports',
        headers,
        // 007's own field names, read from the route rather than guessed — `attendeeId` names
        // the **target**, which is the narrowing exception `safety.ts` records.
        payload: {
          attendeeId: graceId,
          reason: 'THE-REPORTERS-OWN-WORDS-WHICH-MUST-NOT-BE-MAILED',
          messageIds: [],
          questionIds: [],
        },
      })

      expect(filed.statusCode, 'filing a report stopped working').toBeLessThan(300)

      // The mail still goes — 011 did not quietly replace dispatch with the queue.
      expect(
        dispatched.length,
        'filing a report dispatched no operator mail. The queue is an ADDITION, not a ' +
          'replacement: register entry 21 is still open, and until somebody is made responsible ' +
          'the mail is the only thing that leaves the product (FR-947).',
      ).toBe(1)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **And it carries no reason and no content.** The reason was disclosed to the QUEUE by
      // decision 38; the mail was deliberately not included in that grant.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const serialised = JSON.stringify(dispatched)
      expect(
        serialised,
        'the reporter’s stated reason reached the operator mail. FR-947 keeps it out precisely ' +
          'so it does not live in an inbox outside every retention rule this project controls.',
      ).not.toContain('THE-REPORTERS-OWN-WORDS-WHICH-MUST-NOT-BE-MAILED')

      const [only] = dispatched as [{ report: Record<string, unknown> }]
      expect(Object.keys(only.report).sort()).toEqual(
        ['messageIds', 'questionIds', 'reportId', 'reportedAt'].sort(),
      )
    } finally {
      await instrumented.close()
      if (previous === undefined) delete process.env['MAIL_OPERATOR_ADDRESS']
      else process.env['MAIL_OPERATOR_ADDRESS'] = previous
      resetConfigForTests()
    }
  })
})
