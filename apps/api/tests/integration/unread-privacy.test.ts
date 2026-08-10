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
 * T089 (007) — **no response anywhere projects another attendee's read position** (FR-530,
 * SC-512).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"SEEN" IS NOT A FEATURE OF THIS PRODUCT, AND THE ABSENCE IS ENFORCED RATHER THAN CUSTOMARY.**
 *
 * M5 puts read receipts, delivery ticks, typing indicators and presence out of scope entirely.
 * The read position exists — it has to, or unread cannot work — but it is **private to the
 * participant it belongs to**, and that is a stronger claim than "we do not render it": a field
 * present in a payload is disclosed whether or not a client draws it.
 *
 * So this file drives every route the feature exposes and searches the responses for the
 * *actual stored value* of the other attendee's read position. A response that carried it under
 * any key at all — `lastReadMessageId`, `readAt`, `seen` — would fail, and so would one that
 * carried it by accident inside a debug field.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe("another attendee's read position", () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaId: string
  let conversationId: string
  let messageGraceRead: string

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

  /** Every read this feature exposes, driven as one attendee. */
  const everyRead = (cookie: string) =>
    Promise.all([
      app.inject({
        method: 'GET',
        url: '/conversations',
        headers: { cookie: cookieHeader(cookie) },
      }),
      app.inject({
        method: 'GET',
        url: '/conversations/unread',
        headers: { cookie: cookieHeader(cookie) },
      }),
      app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
      }),
      app.inject({
        method: 'GET',
        url: '/blocks',
        headers: { cookie: cookieHeader(cookie) },
      }),
    ])

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

    const second = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'Two, from Ada.' },
    })
    messageGraceRead = (second.json() as { messageId: string }).messageId

    // Grace reads up to Ada's message. That is the value nothing may disclose to Ada.
    await app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { throughMessageId: messageGraceRead },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  it("the fixture is real: Grace's read position is actually stored", async () => {
    // Without this the sweep below could pass because nothing was ever recorded.
    const rows = await getDb().execute<{ last_read_message_id: string | null }>(sql`
      SELECT p.last_read_message_id
      FROM conversation_participants p
      JOIN attendees a ON a.id = p.attendee_id
      WHERE p.conversation_id = ${conversationId}::uuid AND a.email = ${GRACE}
    `)

    expect(rows[0]?.last_read_message_id).toBe(messageGraceRead)
  })

  it("ADA'S RESPONSES NEVER CARRY GRACE'S READ POSITION (FR-530, SC-512)", async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Checked against the payloads that carry no message identifiers of their own**, and the
    // exclusion is a fact about the data rather than a convenience.
    //
    // A read position **is** a message identifier, and it is an identifier of a message *both*
    // participants are entitled to see — so the value legitimately appears in the thread page,
    // as the `messageId` of an ordinary message Ada can read. Asserting its absence there would
    // be asserting that Ada cannot see her own conversation.
    //
    // What must never happen is the identifier appearing **as a read position**, which is a
    // question about field *shape* rather than about the value. The next test asks it, across
    // every route including the thread.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const [list, unread, , blocks] = await everyRead(adaCookie)

    for (const response of [list, unread, blocks]) {
      expect(
        response.body.includes(messageGraceRead),
        'A read position present in a payload is disclosed whether or not a client draws it. ' +
          '"Seen" is not a feature of this product (M5), and FR-530 makes that a property of the ' +
          'responses rather than of the rendering.',
      ).toBe(false)
    }
  })

  it('no response uses a read-position-shaped field name at all', async () => {
    // Belt and braces: the value above could coincide with a message Ada legitimately sees, so
    // the *shape* is asserted too. These are the names a "seen" feature would arrive under.
    for (const cookie of [adaCookie, graceCookie]) {
      for (const response of await everyRead(cookie)) {
        const body = response.body.toLowerCase()
        for (const field of ['lastread', 'readat', 'seenat', '"seen"', 'readby', 'deliveredat']) {
          expect(body.includes(field), `a response carries "${field}"`).toBe(false)
        }
      }
    }
  })

  it('nothing reports typing, presence or delivery either (M5)', async () => {
    for (const response of await everyRead(adaCookie)) {
      const body = response.body.toLowerCase()
      for (const field of ['typing', 'presence', 'online', 'lastseen', 'delivered']) {
        expect(body.includes(field), `a response carries "${field}"`).toBe(false)
      }
    }
  })

  it("Grace's own position is not projected back to HER either", async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Deliberate, and worth asserting rather than assuming. Nothing in the product needs to
    // render a reader their own read position — `unread` is the derived answer they actually
    // use — so projecting it would be collecting a field into a payload for no requirement,
    // which Principle VIII refuses on its own terms.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (const response of await everyRead(graceCookie)) {
      expect(response.body.includes(messageGraceRead) && response.body.includes('astRead')).toBe(
        false,
      )
    }
  })

  it('one attendee reading changes nothing observable for the other', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    await app.inject({
      method: 'PUT',
      url: `/conversations/${conversationId}/read`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { throughMessageId: messageGraceRead },
    })

    const after = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(
      after.body,
      'Grace reading must be invisible to Ada. If this ever differs, something is projecting a ' +
        'read position — which is the whole of what FR-530 forbids.',
    ).toBe(before.body)
  })
})
