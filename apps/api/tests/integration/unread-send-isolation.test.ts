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
 * T090a (007) — **sending a message does not by itself advance the sender's read position**
 * (FR-529).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A REPLY MUST NOT SILENTLY MARK OLDER UNREAD MESSAGES READ.**
 *
 * This is the requirement the obvious implementation gets wrong, and it gets it wrong in a way
 * nobody reports as a bug: the server, on writing a message, helpfully advances the author's
 * position to it — "they must have read the thread, they just replied to it". They may not have.
 * Somebody answering the newest of ten messages from a phone notification has read one of them,
 * and nine have just been marked read on their behalf and will never be shown as waiting again.
 *
 * The position is the **client's** to advance, from what has actually been displayed (T097), and
 * the send path must leave it alone. This file asserts that against the stored column rather than
 * against a derived flag, because the column is where the mistake would live.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('sending and the read position', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaId: string
  let conversationId: string
  const fromGrace: string[] = []

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

  const positionOf = async (attendeeId: string): Promise<string | null> => {
    const rows = await getDb().execute<{ last_read_message_id: string | null }>(sql`
      SELECT last_read_message_id FROM conversation_participants
      WHERE conversation_id = ${conversationId}::uuid AND attendee_id = ${attendeeId}::uuid
    `)
    return rows[0]?.last_read_message_id ?? null
  }

  const unreadFor = async (cookie: string): Promise<boolean> => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations/unread',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { hasUnread: boolean }).hasUnread
  }

  const sendAs = (cookie: string, body: string) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)

    // Three messages from Grace, none of them read by Ada.
    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { attendeeId: adaId, body: 'One.' },
    })
    const created = opened.json() as { conversationId: string; messageId: string }
    conversationId = created.conversationId
    fromGrace.push(created.messageId)

    for (const body of ['Two.', 'Three.']) {
      const sent = await sendAs(graceCookie, body)
      fromGrace.push((sent.json() as { messageId: string }).messageId)
    }
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: three unread messages and no read position', async () => {
    expect(fromGrace).toHaveLength(3)
    expect(await positionOf(adaId)).toBeNull()
    expect(await unreadFor(adaCookie)).toBe(true)
  })

  it('OPENING A CONVERSATION WRITES NOTHING — the position is advanced by display, not by arrival', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Reading the thread is a `GET`, and a `GET` that wrote a read position would make FR-529
    // impossible to satisfy: every fetch, including a three-second poll, would mark everything
    // read whether or not it reached a screen.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(await positionOf(adaId)).toBeNull()
    expect(await unreadFor(adaCookie)).toBe(true)
  })

  it("SENDING A REPLY DOES NOT ADVANCE THE SENDER'S POSITION (FR-529)", async () => {
    const sent = await sendAs(adaCookie, 'Replying without having read anything.')
    expect(sent.statusCode, sent.body).toBe(201)

    expect(
      await positionOf(adaId),
      'The send path must leave the read position alone. Advancing it here would mark nine ' +
        'unread messages read on behalf of somebody who answered the tenth from a notification.',
    ).toBeNull()
  })

  it('so the conversation is STILL unread for the sender afterwards', async () => {
    expect(
      await unreadFor(adaCookie),
      "Three messages from Grace remain unread. Ada's own reply is not one of them, and it did " +
        'not clear them.',
    ).toBe(true)
  })

  it('advancing explicitly is what clears it, and only as far as it is told', async () => {
    await app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { throughMessageId: fromGrace[1] as string },
    })

    expect(await positionOf(adaId)).toBe(fromGrace[1])
    expect(
      await unreadFor(adaCookie),
      'Message three is still after the position, so the conversation is still unread — which is ' +
        'the point of a position rather than a flag.',
    ).toBe(true)

    await app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { throughMessageId: fromGrace[2] as string },
    })
    expect(await unreadFor(adaCookie)).toBe(false)
  })

  it("sending does not touch the RECIPIENT's position either", async () => {
    const graceId = await idOf(graceCookie)
    const before = await positionOf(graceId)

    await sendAs(adaCookie, 'Another one.')

    expect(
      await positionOf(graceId),
      "A send must not move anybody's read position — not the sender's, and certainly not the " +
        "recipient's, which would mark a message read at the instant it was written.",
    ).toBe(before)
  })
})
