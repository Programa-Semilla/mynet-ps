import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
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
 * T070a (007) — **blocking deletes nothing** (FR-538).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE IMPLEMENTATION OF THIS REQUIREMENT IS AN ABSENCE, WHICH IS WHY IT NEEDS A TEST.**
 *
 * Nothing in the block path deletes a message, and that is easy to keep true by accident and easy
 * to break by good intention: "blocking should clean up the conversation" is a plausible product
 * instinct, and a `DELETE` added for it would be irreversible.
 *
 * FR-538 is the opposite instinct, deliberately. A block **refuses future contact**; it does not
 * rewrite what was said. The blocker keeps the history — including the messages that made them
 * block — which is precisely what somebody needs if they later report the conduct, and what they
 * would lose if blocking tidied up after itself.
 *
 * Unblocking therefore restores sending **with nothing lost**, and this file asserts the whole
 * round trip: message counts before, during, and after.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('blocking preserves history', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let graceId: string
  let conversationId: string

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

  const idOf = async (cookie: string): Promise<string> => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { id: string }).id
  }

  const threadAs = async (cookie: string): Promise<{ body: string; mine: boolean }[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode, response.body).toBe(200)
    return (response.json() as { messages: { body: string; mine: boolean }[] }).messages
  }

  const storedCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM messages WHERE conversation_id = ${conversationId}::uuid
    `)
    return Number(rows[0]?.count ?? '0')
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Ada one.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    for (const [cookie, body] of [
      [graceCookie, 'Grace one.'],
      [adaCookie, 'Ada two.'],
      [graceCookie, 'Grace two — the one that caused it.'],
    ] as const) {
      const sent = await app.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { body },
      })
      if (sent.statusCode !== 201) throw new Error(`Fixture failed: ${sent.body}`)
    }
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture holds four messages from both attendees', async () => {
    expect(await storedCount()).toBe(4)
  })

  it('BLOCKING DELETES NOTHING (FR-538)', async () => {
    const before = await threadAs(adaCookie)
    expect(before).toHaveLength(4)

    const blocked = await app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId },
    })
    expect(blocked.statusCode).toBe(204)

    expect(await storedCount(), 'no row was removed').toBe(4)

    const after = await threadAs(adaCookie)
    expect(
      after,
      "The blocker's history is intact and UNCHANGED — including the messages that caused the " +
        'block, which are exactly what they would need in order to report the conduct.',
    ).toEqual(before)
  })

  it('the blocked attendee keeps their view of it too', async () => {
    // Removing the conversation from Grace's side would both destroy her record and disclose the
    // block to her, which FR-537 forbids. Nothing about her view changes.
    const grace = await threadAs(graceCookie)

    expect(grace).toHaveLength(4)
    expect(grace.map((message) => message.body)).toContain('Grace two — the one that caused it.')
  })

  it('the conversation is still listed for both, not hidden', async () => {
    for (const cookie of [adaCookie, graceCookie]) {
      const response = await app.inject({
        method: 'GET',
        url: '/conversations',
        headers: { cookie: cookieHeader(cookie) },
      })

      const list = response.json() as { conversations: { state: string }[] }
      expect(list.conversations).toHaveLength(1)
    }
  })

  it("only the BLOCKER's list reports the state as blocked", async () => {
    const stateFor = async (cookie: string): Promise<string | undefined> => {
      const response = await app.inject({
        method: 'GET',
        url: '/conversations',
        headers: { cookie: cookieHeader(cookie) },
      })
      return (response.json() as { conversations: { state: string }[] }).conversations[0]?.state
    }

    expect(await stateFor(adaCookie), "Ada's own record of her own choice").toBe('blocked')
    expect(await stateFor(graceCookie), 'and Grace is told nothing (FR-537)').toBe('open')
  })

  it('UNBLOCKING restores sending having lost nothing', async () => {
    const released = await app.inject({
      method: 'DELETE',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId },
    })
    expect(released.statusCode).toBe(204)

    expect(await storedCount(), 'still four, throughout').toBe(4)

    const sent = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { body: 'Sorry about that.' },
    })
    expect(sent.statusCode, sent.body).toBe(201)

    const thread = await threadAs(adaCookie)
    expect(thread).toHaveLength(5)
    expect(
      thread.map((message) => message.body),
      'The whole conversation, with the new message appended rather than replacing anything. ' +
        '**Newest first** — that is what the route serves, because a thread opens at its most ' +
        'recent message; the client reverses it for display (FR-515).',
    ).toEqual([
      'Sorry about that.',
      'Grace two — the one that caused it.',
      'Ada two.',
      'Grace one.',
      'Ada one.',
    ])
  })
})
