import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THRESHOLDS } from '../../src/auth/throttle.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * Deep review — **a send may be delayed and may never be refused** (FR-511a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SIBLING OF THIS TEST WAS WRITTEN AND THIS ONE WAS NOT.**
 *
 * `conversation-create-throttle.test.ts` exists because the creation cap was asserted as
 * *configuration* and never as *behaviour*, and its header says outright: **"A correct table wired
 * to a route that never consults it passes every one of those tests."** That reasoning applies
 * word for word to `message_send`, and was not applied to it.
 *
 * `THRESHOLDS.message_send.mayDeny === false` was the whole of FR-511a's coverage. Nothing called
 * the route enough times to observe what happens at the limit. If the clamp in `serveDelay`
 * regressed, or the send route were keyed on the wrong action, an attendee at a conference would
 * receive the **429 this requirement forbids** — and every existing test would stay green.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ASYMMETRY IS THE DESIGN, AND BOTH HALVES NOW HAVE A TEST.**
 *
 * Opening a conversation with somebody new **may deny**: it bounds breadth of contact, it is keyed
 * on the caller's own authenticated identity, and a denial can only ever inconvenience the person
 * doing it. Sending inside a conversation **may not**: the harm M1 names is breadth, not volume,
 * and an attendee who could no longer answer a thread they already have would be a worse product
 * than the one the cap protects.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('sending is bounded but never refused (FR-511a)', () => {
  let app: FastifyInstance
  let adaCookie: string
  let conversationId: string

  /**
   * Comfortably past the allowance, derived from the table so tuning does not fail this file.
   *
   * The identifier dimension is the one that binds first: it is keyed on the acting attendee, and
   * the source dimension is far larger because a conference venue is hundreds of people behind one
   * address.
   */
  const OVER_THE_LIMIT = THRESHOLDS.message_send.identifier.freeAttempts + 5

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}: ${response.body}`)
    return token
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    const graceCookie = await signIn(GRACE)

    const graceId = (
      await app
        .inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader(graceCookie) } })
        .then((response) => response.json() as { id: string })
    ).id

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Opening the thread.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    // Cleared once, then **never again** — the counter accumulating across the sends below is the
    // entire mechanism under test.
    await clearThrottle()
  }, 120_000)

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: a conversation, and a limit worth exceeding', () => {
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(THRESHOLDS.message_send.identifier.freeAttempts).toBeGreaterThan(0)
    expect(
      THRESHOLDS.message_send.mayDeny,
      'The policy half. This file exists because the policy was the only half asserted.',
    ).toBe(false)
  })

  it('accepts every send past the allowance — a 429 is the one outcome forbidden', async () => {
    const statuses: number[] = []

    for (let index = 0; index < OVER_THE_LIMIT; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(adaCookie) },
        payload: { body: `Message number ${index}.` },
      })
      statuses.push(response.statusCode)
    }

    const refused = statuses.filter((status) => status === 429)

    expect(
      refused,
      `${OVER_THE_LIMIT} sends produced ${refused.length} refusals. FR-511a permits the throttle ` +
        'to delay a legitimate sender and never to deny one — a 429 here means `message_send` ' +
        'has acquired `mayDeny`, or the send route is keyed on the creation counter.',
    ).toHaveLength(0)

    expect(
      statuses.every((status) => status === 201),
      JSON.stringify(statuses),
    ).toBe(true)
  }, 120_000)
})
