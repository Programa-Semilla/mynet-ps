import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  conversationPairs,
  conversationParticipants,
  conversations,
} from '../../src/db/schema/conversations.js'
import { messages } from '../../src/db/schema/messages.js'
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
 * T033 (007) — **a conversation comes into being by somebody speaking, and by nothing else**
 * (FR-503, FR-503a, FR-501).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ROW COUNTS ARE THE ASSERTION, NOT THE RESPONSE.**
 *
 * A route that answered 201 with a plausible identifier while writing two conversations, one
 * participant, or no pair row would pass any test that only read the body. So this file counts
 * rows in all four tables and asserts the exact shape the data model requires: **one**
 * conversation, **one** pair, **two** participants, **one** message.
 *
 * The participant count is the sharpest of the four. FR-501 makes a conversation exactly two
 * people, and the authorization predicate for the whole feature is the existence of a
 * participant row (FR-523) — so a first message that wrote only the sender's row would leave the
 * recipient unable to read the message they had just been sent, and a 404 to the recipient is
 * indistinguishable from the conversation not existing. That failure is silent on the sending
 * side and total on the receiving one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('opening a conversation by sending the first message', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaId: string
  let graceId: string

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}.`)
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

  const open = (cookie: string, attendeeId: string, body: string) =>
    app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId, body },
    })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('writes exactly one conversation, one pair and two participants', async () => {
    const response = await open(adaCookie, graceId, 'Enjoyed your talk — could we compare notes?')

    expect(response.statusCode, response.body).toBe(201)
    const created = response.json() as { conversationId: string; messageId: string; sentAt: string }
    expect(created.conversationId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(created.messageId).toMatch(/^[0-9a-f-]{36}$/i)
    // An absolute instant over the wire, as everywhere else in this product (FR-124).
    expect(new Date(created.sentAt).toISOString()).toBe(created.sentAt)

    const db = getDb()

    const conversationRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, created.conversationId))
    expect(conversationRows, 'exactly one conversation').toHaveLength(1)
    expect(
      conversationRows[0]?.lastMessageAt,
      'last_message_at is written in the SAME transaction as the message, so it is never null ' +
        'to any reader outside that transaction (schema/conversations.ts).',
    ).not.toBeNull()

    const pairRows = await db
      .select()
      .from(conversationPairs)
      .where(eq(conversationPairs.conversationId, created.conversationId))
    expect(pairRows, 'exactly one pair row').toHaveLength(1)

    // Ordered, which is what makes FR-502's uniqueness direction-independent.
    const [lower, higher] = [adaId, graceId].sort()
    expect(pairRows[0]?.lowerAttendeeId).toBe(lower)
    expect(pairRows[0]?.higherAttendeeId).toBe(higher)

    const participantRows = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, created.conversationId))
    expect(
      participantRows.map((row) => row.attendeeId).sort(),
      'BOTH attendees, not only the sender. Participation is the authorization predicate ' +
        '(FR-523), so a missing recipient row is a message the recipient cannot read.',
    ).toEqual([lower, higher])

    const messageRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, created.conversationId))
    expect(messageRows, 'exactly one message').toHaveLength(1)
    expect(messageRows[0]?.authorId).toBe(adaId)
    expect(messageRows[0]?.body).toBe('Enjoyed your talk — could we compare notes?')
  })

  it('neither participant row carries a read position yet (FR-526)', async () => {
    const rows = await getDb()
      .select({ lastReadMessageId: conversationParticipants.lastReadMessageId })
      .from(conversationParticipants)

    expect(
      rows.every((row) => row.lastReadMessageId === null),
      "Null until somebody actually reads. Advancing the sender's position as a side effect " +
        "of sending is FR-529's failure, and T090a asserts it from the other direction.",
    ).toBe(true)
  })

  it('the body is trimmed before it is stored', async () => {
    await resetDatabase()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)

    const response = await open(adaCookie, graceId, '   padded on both sides   ')
    expect(response.statusCode, response.body).toBe(201)

    const rows = await getDb().select({ body: messages.body }).from(messages)
    expect(
      rows[0]?.body,
      'Trimmed before insert, which is what makes the CHECK on the column able to refuse an ' +
        'all-whitespace body — it trims to the empty string and cannot reach the table.',
    ).toBe('padded on both sides')
  })

  it('opening a thread without sending writes NOTHING (FR-503a)', async () => {
    await resetDatabase()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The requirement is an absence, so this asserts an absence: there is **no route** that
    // creates an empty conversation, and reading Ada's list after she has "opened" a thread by
    // navigating to it produces nothing at all. The only write path is the send above.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const routes: { method: 'POST' | 'PUT'; url: string }[] = [
      { method: 'POST', url: `/conversations/${graceId}` },
      { method: 'PUT', url: `/conversations/${graceId}` },
    ]

    for (const route of routes) {
      const response = await app.inject({
        ...route,
        headers: { cookie: cookieHeader(adaCookie) },
        payload: {},
      })
      expect(
        [404, 405].includes(response.statusCode),
        `${route.method} ${route.url} answered ${response.statusCode}. No route may create a ` +
          'conversation without a message (FR-503a).',
      ).toBe(true)
    }

    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM conversations`,
    )
    expect(rows[0]?.count, 'nothing came into being').toBe('0')
  })
})
