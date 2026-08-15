import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
 * T088 (007) — **unread follows the read position, not who spoke last** (FR-526, FR-527).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PROTOTYPE'S RULE IS THE ONE THIS REPLACES, AND IT IS WRONG IN A SPECIFIC WAY.**
 *
 * The prototype marks a conversation unread when *the last message is not mine*. That is cheap
 * and it is wrong twice:
 *
 *   - **Replying marks everything read.** Answer the oldest of ten unread messages and the other
 *     nine are silently considered read, because you now spoke last.
 *   - **A thread you have read stays unread** if the other person spoke last, however many times
 *     you have opened it.
 *
 * FR-527 replaces it with a read *position*: a conversation is unread when it contains at least
 * one message from the other person that the reader has not read. This file drives the exact
 * sequence the prototype's rule gets wrong — read, then reply, then receive — and asserts the
 * answer at each step.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('what makes a conversation unread', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaId: string
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

  /** Whether the conversation reads unread **for this attendee**. */
  const unreadFor = async (cookie: string): Promise<boolean> => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(cookie) },
    })
    const list = response.json() as { conversations: { unread: boolean }[] }
    return list.conversations[0]?.unread === true
  }

  /** The cheap Home question, which must always agree with the list. */
  const anyUnreadFor = async (cookie: string): Promise<boolean> => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations/unread',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { hasUnread: boolean }).hasUnread
  }

  const send = async (cookie: string, body: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })
    if (response.statusCode !== 201) throw new Error(`Send failed: ${response.body}`)
    return (response.json() as { messageId: string }).messageId
  }

  const readThrough = (cookie: string, messageId: string) =>
    app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { throughMessageId: messageId },
    })

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  let firstFromGrace: string

  beforeEach(async () => {
    await resetDatabase()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)

    // Grace opens the conversation, so Ada has something unread from the start.
    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { attendeeId: adaId, body: 'From Grace, one.' },
    })
    const created = opened.json() as { conversationId: string; messageId: string }
    conversationId = created.conversationId
    firstFromGrace = created.messageId
  })

  it('is unread for the recipient and NOT for the sender (FR-529)', async () => {
    expect(await unreadFor(adaCookie), 'Ada has not read it').toBe(true)
    expect(
      await unreadFor(graceCookie),
      'Grace wrote it. Sending must not make a conversation unread for the sender.',
    ).toBe(false)
  })

  it("Home's cheap question agrees with the list, for both", async () => {
    expect(await anyUnreadFor(adaCookie)).toBe(true)
    expect(await anyUnreadFor(graceCookie)).toBe(false)
  })

  it('reading it clears it', async () => {
    expect((await readThrough(adaCookie, firstFromGrace)).statusCode).toBe(204)

    expect(await unreadFor(adaCookie)).toBe(false)
    expect(await anyUnreadFor(adaCookie)).toBe(false)
  })

  it('a NEW message after the read position makes it unread again', async () => {
    await readThrough(adaCookie, firstFromGrace)
    await send(graceCookie, 'From Grace, two.')

    expect(await unreadFor(adaCookie)).toBe(true)
  })

  it('REPLYING DOES NOT MARK THE OLDER MESSAGES READ — the prototype rule fails here', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The sequence the prototype's "last message is not mine" rule gets wrong.
    //
    // Grace sends three. Ada replies without having read any of them. Under the prototype's rule
    // the conversation is now read, because Ada spoke last — and two unread messages have
    // silently disappeared. Under FR-527 it is still unread, because Ada's read position has not
    // moved past them.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    await send(graceCookie, 'From Grace, two.')
    await send(graceCookie, 'From Grace, three.')

    await send(adaCookie, 'A reply, without reading.')

    expect(
      await unreadFor(adaCookie),
      'Sending a reply must not silently clear older unread messages (FR-529). Under the ' +
        "prototype's rule this would now read as read, because Ada spoke last.",
    ).toBe(true)
    expect(await anyUnreadFor(adaCookie)).toBe(true)
  })

  it('a thread the attendee LAST REPLIED IN is read, once they have read what came before', async () => {
    // The other half of the same distinction. Ada reads everything, then replies. Nothing is
    // outstanding, so it is read — and it stays read, because her own message cannot make a
    // conversation unread for her.
    const last = await send(graceCookie, 'From Grace, two.')
    await readThrough(adaCookie, last)
    await send(adaCookie, 'And a reply.')

    expect(await unreadFor(adaCookie)).toBe(false)
  })

  it("the OTHER person's view is unaffected by either of those (FR-530)", async () => {
    await send(adaCookie, 'A reply from Ada.')

    // Grace has not read Ada's reply, so it is unread for her — decided by *her* position, not
    // by anything Ada did to her own.
    expect(await unreadFor(graceCookie)).toBe(true)

    await readThrough(adaCookie, firstFromGrace)
    expect(
      await unreadFor(graceCookie),
      "Ada advancing her own read position must not touch Grace's.",
    ).toBe(true)
  })

  it('a conversation with no messages from the other person is never unread', async () => {
    // Ada reads everything Grace sent, then sends several of her own. Nothing from the other
    // person is outstanding, so nothing is unread however much she writes.
    await readThrough(adaCookie, firstFromGrace)
    await send(adaCookie, 'One.')
    await send(adaCookie, 'Two.')

    expect(await unreadFor(adaCookie)).toBe(false)
    expect(await anyUnreadFor(adaCookie)).toBe(false)
  })
})
