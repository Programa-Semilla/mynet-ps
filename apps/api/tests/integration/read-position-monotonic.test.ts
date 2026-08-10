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
 * T090 (007) — **the read position only ever moves forward** (FR-528, contract).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WITHOUT MONOTONICITY, A CONVERSATION SILENTLY BECOMES UNREAD AGAIN.**
 *
 * The client advances the position as messages are displayed, and those requests race: two
 * arrive out of order as a reader scrolls, or a retry lands after a later one. If the route
 * simply stored what it was given, the older request would win whenever it arrived second — and
 * the attendee would watch a dot reappear on a thread they had just read, with nothing to
 * explain it and no way to make it stop.
 *
 * So an older message is **accepted and changes nothing**, rather than refused: the caller has
 * not made an error, and answering 400 would turn an ordinary race into something a client has
 * to handle.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('advancing the read position', () => {
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

  const readThrough = (messageId: string) =>
    app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { throughMessageId: messageId },
    })

  const storedPosition = async (): Promise<string | null> => {
    const rows = await getDb().execute<{ last_read_message_id: string | null }>(sql`
      SELECT last_read_message_id FROM conversation_participants
      WHERE conversation_id = ${conversationId}::uuid AND attendee_id = ${adaId}::uuid
    `)
    return rows[0]?.last_read_message_id ?? null
  }

  const unread = async (): Promise<boolean> => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations/unread',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    return (response.json() as { hasUnread: boolean }).hasUnread
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)

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
      const sent = await app.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(graceCookie) },
        payload: { body },
      })
      fromGrace.push((sent.json() as { messageId: string }).messageId)
    }
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture holds three messages from the other attendee', () => {
    expect(fromGrace).toHaveLength(3)
    expect(new Set(fromGrace).size).toBe(3)
  })

  it('starts unset, so nothing is read until something is', async () => {
    expect(await storedPosition()).toBeNull()
    expect(await unread()).toBe(true)
  })

  it('advances to the message it is given', async () => {
    expect((await readThrough(fromGrace[2] as string)).statusCode).toBe(204)
    expect(await storedPosition()).toBe(fromGrace[2])
    expect(await unread()).toBe(false)
  })

  it('NAMING AN OLDER MESSAGE IS ACCEPTED AND CHANGES NOTHING', async () => {
    // The heart of it. 204, not 400 — an out-of-order arrival is an ordinary race rather than a
    // caller error, and refusing it would make a client handle something it cannot prevent.
    const response = await readThrough(fromGrace[0] as string)

    expect(response.statusCode).toBe(204)
    expect(
      await storedPosition(),
      'An older message must not move the position backwards. If it did, the attendee would ' +
        'watch a dot reappear on a thread they had just read.',
    ).toBe(fromGrace[2])
    expect(await unread()).toBe(false)
  })

  it('re-naming the SAME message is idempotent', async () => {
    expect((await readThrough(fromGrace[2] as string)).statusCode).toBe(204)
    expect(await storedPosition()).toBe(fromGrace[2])
  })

  it('a burst of out-of-order requests settles on the NEWEST, whatever the order', async () => {
    // Issued together, so they interleave. The result must not depend on which lands last.
    await Promise.all([
      readThrough(fromGrace[0] as string),
      readThrough(fromGrace[1] as string),
      readThrough(fromGrace[2] as string),
      readThrough(fromGrace[0] as string),
    ])

    expect(await storedPosition()).toBe(fromGrace[2])
    expect(await unread()).toBe(false)
  })

  it('a message that is not in this conversation advances nothing, silently', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Silently, because reporting the difference would confirm whether the message exists — and
    // a message identifier is guessable. The route answers 204 either way and the position is
    // untouched, so a client cannot use this as an existence oracle.
    //
    // A well-formed identifier that names nothing stands in for one from another conversation:
    // the query's condition is "this message belongs to this conversation", and both cases fail
    // it identically.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const response = await readThrough('00000000-0000-4000-8000-000000000000')

    expect(response.statusCode).toBe(204)
    expect(await storedPosition()).toBe(fromGrace[2])
  })

  it('a malformed identifier is accepted and advances nothing', async () => {
    expect((await readThrough('not-a-uuid')).statusCode).toBe(204)
    expect(await storedPosition()).toBe(fromGrace[2])
  })
})
