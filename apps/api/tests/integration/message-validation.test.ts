import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { MESSAGE_MAX_LENGTH } from '../../src/db/queries/messages.js'
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
 * T036 (007) — **what a message may contain, enforced on the server** (FR-512, FR-517,
 * research R12).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE COMPOSER'S DISABLED SEND IS NOT THE ENFORCEMENT, AND THIS FILE IS WHY.**
 *
 * FR-512 disables the send control while the composer is empty and FR-517 shows a counter
 * approaching the limit, so a caller that reaches these refusals has bypassed the form. That
 * makes them a backstop rather than the designed path — which is exactly the case where they go
 * untested, and exactly the case Principle VIII says client-side presentation of a limit is never
 * the enforcement of it.
 *
 * **Whitespace-only is the interesting one.** It is not refused by a length check on what
 * arrived: `'   '` is three characters. It is refused because the body is **trimmed before
 * insert**, so it becomes the empty string and the column's `CHECK (length(body) BETWEEN 1 AND
 * 2000)` cannot accept it. That ordering is the requirement made structural — "no message" has
 * exactly one representation in the database, and no later write path can invent a blank one.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Both routes that accept a body are driven, because there are two — opening a conversation and
 * sending into one — and a limit enforced on one of them is not enforced.
 */
describe('what a message body may be', () => {
  let app: FastifyInstance
  let adaCookie: string
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

  const openWith = (body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body },
    })

  const sendInto = (body: unknown) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body },
    })

  const messageCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM messages`,
    )
    return Number(rows[0]?.count ?? '0')
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    const graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Opening line.' },
    })
    if (opened.statusCode !== 201) throw new Error(`Fixture failed: ${opened.body}`)
    conversationId = (opened.json() as { conversationId: string }).conversationId
  })

  afterAll(async () => {
    await teardown(app)
  })

  const refused = [
    ['empty', ''],
    ['a single space', ' '],
    ['only whitespace', '   \t  '],
    ['only newlines', '\n\n\n'],
    ['over the limit', 'x'.repeat(MESSAGE_MAX_LENGTH + 1)],
    [
      'over the limit after trimming is not reached — padding is trimmed first',
      ` ${'x'.repeat(MESSAGE_MAX_LENGTH)} `,
    ],
  ] as const

  it.each(refused.slice(0, 5))('refuses %s when opening a conversation', async (_label, body) => {
    const before = await messageCount()
    const response = await openWith(body)

    expect(response.statusCode, response.body).toBe(400)
    expect(await messageCount(), 'nothing was written').toBe(before)
  })

  it.each(refused.slice(0, 5))(
    'refuses %s when sending into a conversation',
    async (_label, body) => {
      const before = await messageCount()
      const response = await sendInto(body)

      expect(response.statusCode, response.body).toBe(400)
      expect(await messageCount(), 'nothing was written').toBe(before)
    },
  )

  it('accepts a body of exactly the limit', async () => {
    const response = await sendInto('x'.repeat(MESSAGE_MAX_LENGTH))
    expect(response.statusCode, response.body).toBe(201)
  })

  it('accepts a body that reaches the limit only after its padding is trimmed', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The upper bound is measured against what will be **stored**, not against what arrived.
    // A route schema `maxLength` alone would refuse this, and refusing it would be wrong: the
    // attendee typed exactly 2,000 characters and a stray trailing newline from a paste is not
    // theirs to account for.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const response = await sendInto(`\n ${'y'.repeat(MESSAGE_MAX_LENGTH)} \n`)
    expect(response.statusCode, response.body).toBe(201)

    const rows = await getDb().execute<{ length: number }>(sql`
      SELECT length(body) AS length FROM messages ORDER BY sent_at DESC, id DESC LIMIT 1
    `)
    expect(rows[0]?.length).toBe(MESSAGE_MAX_LENGTH)
  })

  it('refuses a body that cannot be read as text at all', async () => {
    for (const body of [null, { text: 'hello' }, ['one', 'two']]) {
      const response = await sendInto(body)
      expect(response.statusCode, `${JSON.stringify(body)} must be refused`).toBe(400)
    }
  })

  it.each([
    ['a number', 42, '42'],
    ['a single-element array', ['hello'], 'hello'],
  ])('%s is COERCED to text, as on every route in this product', async (_label, body, stored) => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Recorded rather than asserted against.** Fastify configures Ajv with
    // `coerceTypes: 'array'` by default — the configuration this project uses on every route —
    // so `{"body": 42}` and `{"body": ["hello"]}` both reach the handler as ordinary strings and
    // are stored as ordinary messages.
    //
    // That is not a defect and it is deliberately not "fixed" here. The stored value is exactly
    // what the sender would see rendered, no requirement says a message may not be the text of a
    // number, and turning coercion off for these two routes alone would make their validation
    // behave differently from the rest of the product — a far likelier source of surprise than a
    // message reading "42". A multi-element array, an object and `null` are all still refused,
    // which is the case where coercion would actually be inventing content.
    //
    // The test exists so the behaviour is a decision a reader can find, rather than something
    // discovered the day a client sends an unquoted number.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const response = await sendInto(body)
    expect(response.statusCode, response.body).toBe(201)

    const rows = await getDb().execute<{ body: string }>(sql`
      SELECT body FROM messages ORDER BY sent_at DESC, id DESC LIMIT 1
    `)
    expect(rows[0]?.body).toBe(stored)
  })

  it('refuses a request with no body property', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })

  it('the database refuses a blank body even if a future write path forgets to trim', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The last line of defence, asserted directly rather than through a route. FR-512's lower
    // bound is a CHECK constraint precisely so that it survives a second write path — and a
    // constraint nothing exercises is a constraint that can be dropped from a regenerated
    // migration without anything noticing.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await expect(
      getDb().execute(sql`
        INSERT INTO messages (conversation_id, author_id, body)
        SELECT ${conversationId}::uuid, author_id, '' FROM messages LIMIT 1
      `),
    ).rejects.toThrow()
  })
})
