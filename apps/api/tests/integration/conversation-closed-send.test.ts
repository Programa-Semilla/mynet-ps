import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T128 (007) — **sending into a one-sided conversation is refused server-side** (FR-574).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **403 WITH AN EXPLANATION, NOT THE REASONLESS 409 A BLOCK GETS — AND THE DIFFERENCE IS
 * DELIBERATE** (contract).
 *
 * A block answers with nothing at all, because saying why would disclose to the refused attendee
 * that somebody decided something about them (FR-537). None of that applies here. A closed
 * conversation is a fact about a thread the caller **can already see every message of**, so
 * explaining it discloses nothing about another attendee — and leaving them to guess would make a
 * permanent state look like a transient failure worth retrying, over and over.
 *
 * Enforced on the server rather than by the client's disabled composer, because a disabled
 * control is presentation and this is a rule: the composer is *unavailable* (FR-574), and the
 * requirement is that the send is refused whatever reaches the route.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('sending into a conversation whose counterpart has gone', () => {
  let app: FastifyInstance
  let adaCookie: string
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

  const send = (body: string) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body },
    })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    const adaId = await idOf(adaCookie)

    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `closing-${randomUUID()}@example.com`,
        displayName: 'Closing Attendee',
        password: SEED_PASSWORD,
      },
    })
    const departingCookie = sessionCookieFrom(signUp) as string

    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(departingCookie) },
      payload: { joinCode: 'PDS-2026' },
    })

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(departingCookie) },
      payload: { attendeeId: adaId, body: 'Before they left.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    // Ada could send, before. Without this the refusal below could be for any reason at all.
    const beforeClosing = await send('While it was still open.')
    if (beforeClosing.statusCode !== 201) throw new Error(`Fixture failed: ${beforeClosing.body}`)

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(departingCookie) },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('REFUSES the send, with 403', async () => {
    const refused = await send('Is anyone there?')

    expect(refused.statusCode, refused.body).toBe(403)
  })

  it('explains why, unlike a block', async () => {
    const refused = await send('Trying again.')

    const body = refused.json() as { code: string; message: string }
    expect(body.code).toBe('conversation_closed')
    expect(
      body.message,
      'A closed conversation is a fact about a thread the caller can already see every message ' +
        'of. Leaving them to guess would make a permanent state look like a transient failure.',
    ).toMatch(/deleted their account/i)
  })

  it('writes nothing', async () => {
    const before = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM messages WHERE conversation_id = ${conversationId}::uuid
    `)

    await send('And again.')

    const after = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM messages WHERE conversation_id = ${conversationId}::uuid
    `)
    expect(after[0]?.count).toBe(before[0]?.count)
  })

  it('the thread stays READABLE — closed to sending is not closed to reading (FR-572)', async () => {
    const page = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(page.statusCode).toBe(200)
    const body = page.json() as { messages: { body: string }[]; state: string }
    expect(body.state).toBe('one_sided')
    expect(body.messages.map((message) => message.body)).toEqual(['While it was still open.'])
  })

  it('the read position can still be advanced, so the survivor can clear their own dot', async () => {
    const page = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })
    const [message] = (page.json() as { messages: { messageId: string }[] }).messages

    const marked = await app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { throughMessageId: message?.messageId },
    })

    expect(
      marked.statusCode,
      'Reading is not sending. Refusing this would leave a survivor unable to clear an ' +
        'indicator about a conversation nobody can add to.',
    ).toBe(204)
  })

  it('403 rather than the 404 a non-participant gets — the caller IS a participant', async () => {
    // FR-524's indistinguishability is about conversations the caller is *not* in. This one they
    // are, and telling them it does not exist would be false.
    const refused = await send('One more.')
    expect(refused.statusCode).toBe(403)
    expect(refused.statusCode).not.toBe(404)
  })
})
