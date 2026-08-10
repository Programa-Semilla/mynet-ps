import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THRESHOLDS } from '../../src/auth/throttle.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * **SC-506a — one account cannot open conversations with an entire conference** (FR-504a, M1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS WAS ASSERTED AS CONFIGURATION AND NEVER AS BEHAVIOUR, WHICH IS THE GAP IT CLOSES.**
 *
 * `tests/unit/throttle-actions.test.ts` proves the policy is right: `conversation_create` carries
 * `mayDeny: true`, and its free-attempt count is strictly below `message_send`'s. Both assertions
 * read the threshold table. **Neither of them calls the route.**
 *
 * A correct table wired to a route that never consults it passes every one of those tests, and
 * SC-506a — *"attempts to create beyond the limit are refused"* — would be false while its unit
 * coverage stayed green. That is the shape of gap a spec-compliance review exists to find: the
 * requirement is about a refusal, and nothing was exercising a refusal.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE LIMIT IS READ FROM THE TABLE RATHER THAN WRITTEN DOWN HERE.** Hard-coding `5` would make
 * a *tuning* change fail this file, and tuning is allowed — what is not allowed is the cap
 * ceasing to be a cap. Deriving the bound means this asserts the property and stays quiet about
 * the number.
 *
 * **Refusal, not delay, is the assertion.** Every other throttle in this feature may only slow a
 * caller down; this one is the single exception, and it is legitimate because it is keyed on the
 * caller's own authenticated identity — a denial can only ever inconvenience the person doing it.
 * A delay-only bound does not bound mass contact, it spreads it across the afternoon.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`freeAttempts: N` permits N + 1, and that is the whole codebase's meaning of the name, not a
 * defect in this feature.** `delayFor` compares the streak *recorded before this attempt* and
 * returns zero while `failures - freeAttempts <= 0`, so the attempt that makes the count equal
 * the allowance is still free. `sign_in`, `join_code` and `export` have all behaved this way
 * since 001.
 *
 * This file therefore asserts **that a refusal arrives, and arrives close to the configured
 * allowance** — not that it arrives on one exact attempt. Pinning the off-by-one here would make
 * a future correction of it look like a regression in Messages.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('opening conversations is capped, and the cap refuses (SC-506a)', () => {
  let app: FastifyInstance

  /** The identifier-keyed allowance — the caller's own account, which is the dimension M1 bounds. */
  const FREE = THRESHOLDS.conversation_create.identifier.freeAttempts

  const signUpAndJoin = async (label: string): Promise<{ cookie: string; id: string }> => {
    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `${label}-${randomUUID()}@example.com`,
        displayName: 'Conference Attendee',
        password: SEED_PASSWORD,
      },
    })
    const cookie = sessionCookieFrom(signUp)
    if (!cookie) throw new Error(`Sign-up failed: ${signUp.body}`)

    await clearThrottle()
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(cookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })

    return { cookie, id: (me.json() as { id: string }).id }
  }

  const open = (cookie: string, attendeeId: string) =>
    app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId, body: 'Hello — enjoyed your talk.' },
    })

  /** Comfortably past the allowance, so the refusal is reached whichever side of it lands. */
  const ATTEMPTS = FREE + 3

  let sender: { cookie: string; id: string }
  let targets: { cookie: string; id: string }[]

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    sender = await signUpAndJoin('opener')
    targets = []
    for (let index = 0; index < ATTEMPTS; index += 1) {
      targets.push(await signUpAndJoin(`target-${index}`))
    }

    // Cleared once here and **not** between the attempts below — the counter accumulating across
    // them is the entire mechanism under test.
    await clearThrottle()
  }, 120_000)

  afterAll(async () => {
    await teardown(app)
  })

  /** Filled by the first test and read by the second — the order here is deliberate. */
  const statuses: number[] = []
  let firstConversationId = ''

  it('the fixture is real: enough distinct people to exceed the allowance', () => {
    expect(FREE).toBeGreaterThan(0)
    expect(targets).toHaveLength(ATTEMPTS)
  })

  it('opens the first conversations, then REFUSES rather than delaying (FR-504a)', async () => {
    for (const target of targets) {
      const response = await open(sender.cookie, target.id)
      statuses.push(response.statusCode)
      if (response.statusCode === 201 && !firstConversationId) {
        firstConversationId = (response.json() as { conversationId: string }).conversationId
      }
    }

    const refusedAt = statuses.indexOf(429)

    // 429, not 201-after-a-pause. This is the assertion the unit test cannot make: the route
    // consults the table, and the table's `mayDeny` reaches the caller as a refusal.
    expect(
      refusedAt,
      'No attempt was refused. A cap that is configured and not enforced leaves SC-506a false ' +
        `while throttle-actions.test.ts stays green. Statuses: ${JSON.stringify(statuses)}.`,
    ).toBeGreaterThan(-1)

    // Everything before the refusal opened; the allowance is not silently smaller than declared.
    expect(
      statuses.slice(0, refusedAt).every((status) => status === 201),
      `Every attempt before the refusal must open. Got ${JSON.stringify(statuses)}.`,
    ).toBe(true)

    // Close to the declared allowance, without pinning the off-by-one — see the header.
    expect(refusedAt).toBeGreaterThanOrEqual(FREE)
    expect(refusedAt).toBeLessThanOrEqual(FREE + 1)

    // And it stays refused. A cap that lifts on the next request is not a cap.
    expect(statuses.slice(refusedAt).every((status) => status === 429)).toBe(true)
  }, 120_000)

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE REGRESSION THIS FILE ORIGINALLY MISSED** (FR-511a).
   *
   * The first version of this test proved a capped account could still send — through
   * `POST /conversations/:id/messages`, the thread route, which charges `message_send` and cannot
   * deny. That is the path the *thread* uses, and it was never the broken one.
   *
   * Discover's Message action routes through `POST /conversations` whichever case applies,
   * because FR-510 reopens the same conversation from a profile. That endpoint charged
   * `conversation_create` unconditionally, so writing to somebody you already knew was billed to
   * the denying counter — and past the cap it answered 429. A legitimate send, refused.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('a capped account can still write to somebody it ALREADY has a conversation with', async () => {
    expect(firstConversationId, 'the previous test must have opened at least one').not.toBe('')

    // The same endpoint that just answered 429 for new people, aimed at an existing pair. The
    // outcome is an append, so it is a message send and FR-511a forbids refusing it.
    const appended = await open(sender.cookie, targets[0]!.id)

    expect(
      appended.statusCode,
      'FR-511a — a send may be delayed and may never be refused. A 429 here means an append is ' +
        'being charged to the conversation-creation cap, which is the one throttle allowed to deny.',
    ).toBe(200)
  })

  it('bounds breadth, not volume: a capped account can still reply in the threads it has', async () => {
    // The asymmetry `throttle-actions.test.ts` asserts in the table, observed through the routes.
    // `message_send` is a different action with a far larger allowance and `mayDeny: false`, so
    // somebody who has hit the contact cap is **not silenced** — they are stopped from reaching
    // more people, which is the harm M1 names. Being unable to answer a conversation you already
    // have would be a different and much worse product.
    expect(firstConversationId, 'the previous test must have opened at least one').not.toBe('')

    const sent = await app.inject({
      method: 'POST',
      url: `/conversations/${firstConversationId}/messages`,
      headers: { cookie: cookieHeader(sender.cookie) },
      payload: { body: 'Following up on the thread we already have.' },
    })

    expect(sent.statusCode, `Sending was refused with ${sent.statusCode}: ${sent.body}`).toBe(201)
  })
})
