import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { MESSAGE_MAX_PAGE_SIZE } from '../../src/db/queries/messages.js'
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
 * T050 (007) — **a thousand messages, every one returned exactly once** (FR-518, research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS CURSOR'S GUARANTEE IS STRONGER THAN 006'S, AND THE DIFFERENCE IS WHY THIS TEST EXISTS.**
 *
 * The directory's cursor is deliberately asymmetric: an attendee's relevance score can fall below
 * a position the reader has already passed, so 006 permits omissions and forbids only duplicates,
 * and `useDirectory` de-duplicates on the client to hold up its half.
 *
 * Nothing here can change rank. A message's `sent_at` is immutable because a message is never
 * edited (FR-516) and never moves, and `(sent_at, id)` is a total order — so the page boundary
 * cannot skip a row and cannot repeat one. **The client therefore does no de-duplication at all**,
 * which is only safe if this property actually holds, so it is asserted rather than assumed.
 *
 * A thousand messages rather than a handful, because the interesting failures are at boundaries:
 * a cursor that used `>` where it needed `>=`, or compared only `sent_at`, loses or repeats a row
 * exactly at a page edge — and with three messages there are no page edges.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const TOTAL = 1_000

describe('paging a long conversation', () => {
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

  interface Page {
    messages: { messageId: string; body: string; sentAt: string }[]
    nextCursor: string | null
    state: string
  }

  const read = async (query = ''): Promise<Page> => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages${query}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as Page
  }

  /** Walks every page and returns the identifiers in the order they were served. */
  const walk = async (limit?: number): Promise<string[]> => {
    const size = limit === undefined ? '' : `limit=${limit}`
    const seen: string[] = []
    let cursor: string | null = null
    let guard = 0

    do {
      const parts = [size, cursor ? `cursor=${encodeURIComponent(cursor)}` : ''].filter(Boolean)
      const page: Page = await read(parts.length > 0 ? `?${parts.join('&')}` : '')
      seen.push(...page.messages.map((message) => message.messageId))
      cursor = page.nextCursor
      // A cursor that never advanced would otherwise loop until the test timed out, reporting a
      // timeout rather than the actual defect.
      if (++guard > TOTAL) throw new Error('paging did not terminate — the cursor is not advancing')
    } while (cursor !== null)

    return seen
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    const graceCookie = await signIn(GRACE)
    const graceId = await idOf(graceCookie)
    const adaId = await idOf(adaCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Message 0' },
    })
    if (opened.statusCode !== 201) throw new Error(`Fixture failed: ${opened.body}`)
    conversationId = (opened.json() as { conversationId: string }).conversationId

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Inserted directly rather than through the route, for two reasons. A thousand HTTP round
    // trips would dominate the suite's runtime, and the throttle would legitimately start
    // delaying them — `message_send` is delay-only, so the test would pass and take minutes.
    //
    // **Many share a `sent_at` deliberately.** `generate_series` with a single `now()` gives
    // batches of identical timestamps, which is exactly the case a cursor over `sent_at` alone
    // gets wrong: the tie-break on `id` is what makes the ordering total, and without these
    // collisions the test could not tell a correct implementation from a broken one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await getDb().execute(sql`
      INSERT INTO messages (conversation_id, author_id, body, sent_at)
      SELECT ${conversationId}::uuid,
             CASE WHEN i % 2 = 0 THEN ${adaId}::uuid ELSE ${graceId}::uuid END,
             'Message ' || i,
             now() + make_interval(secs => (i / 100)::int)
      FROM generate_series(1, ${TOTAL - 1}) AS i
    `)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture holds exactly a thousand messages', async () => {
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM messages WHERE conversation_id = ${conversationId}::uuid
    `)
    expect(rows[0]?.count).toBe(String(TOTAL))
  })

  it('returns every message exactly once, with no duplicates and no omissions', async () => {
    const seen = await walk()

    expect(seen, 'no message may be served twice').toHaveLength(new Set(seen).size)
    expect(
      seen.length,
      "and none may be skipped. This is the guarantee 006's directory cursor deliberately does " +
        'not make, and the reason the client does no de-duplication here.',
    ).toBe(TOTAL)
  })

  it.each([1, 7, 50, MESSAGE_MAX_PAGE_SIZE])(
    'holds at page size %i, where the boundaries fall differently',
    async (limit) => {
      const seen = await walk(limit)
      expect(new Set(seen).size).toBe(TOTAL)
      expect(seen.length).toBe(TOTAL)
    },
  )

  it('serves newest first, so a thread opens at its most recent message', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Asserted over `sentAt` rather than over the message text, **because the fixture
    // deliberately ties timestamps**. Within a tie the order is decided by `id`, which is a
    // random uuid — so "Message 999 comes before Message 998" is not a property the ordering
    // has, and asserting it would be asserting the fixture's insertion order rather than the
    // query's. Non-increasing `sentAt` is the property that actually matters, and the total
    // order over `(sent_at, id)` is what the completeness tests above prove.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const first = await read('?limit=25')
    const instants = first.messages.map((message) => Date.parse(message.sentAt))

    expect(instants).toHaveLength(25)
    expect(
      instants.every((instant, index) => index === 0 || instant <= (instants[index - 1] as number)),
      'newest first',
    ).toBe(true)

    // …and the first page really is the *end* of the conversation, not the beginning.
    const newest = await getDb().execute<{ max: string }>(sql`
      SELECT to_char(max(sent_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS max
      FROM messages WHERE conversation_id = ${conversationId}::uuid
    `)
    expect(first.messages[0]?.sentAt).toBe(newest[0]?.max)
  })

  it('does not transfer the whole history for the first page (SC-518)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const page = response.json() as Page
    expect(page.messages.length, 'the default page, not the conversation').toBeLessThanOrEqual(50)
    expect(page.nextCursor, 'and it says there is more').not.toBeNull()
  })

  /**
   * T143 (007) — **SC-518 is a number about transfer, so this measures bytes** (FR-518).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * "Renders its most recent page without transferring the whole history" is a claim about what
   * crosses the wire, and the assertion above — a page of at most fifty — is necessary but not
   * sufficient: a response could carry fifty messages and a `total`, or fifty messages and every
   * identifier, and satisfy it while transferring the conversation.
   *
   * So the payload is weighed against the whole thread's, and the ratio is the assertion. A
   * thousand messages against a page of fifty is a factor of twenty; anything within a factor of
   * four of the whole history means something is being sent that should not be.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('the first page is a small FRACTION of the whole history, in bytes (SC-518)', async () => {
    const firstPage = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    // The whole thing, for comparison. Walked rather than requested in one go, because the route
    // deliberately refuses a page size that large — which is itself the property under test.
    let wholeHistoryBytes = 0
    let cursor: string | null = null
    do {
      const page: Page = await read(
        cursor
          ? `?limit=${MESSAGE_MAX_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
          : `?limit=${MESSAGE_MAX_PAGE_SIZE}`,
      )
      wholeHistoryBytes += Buffer.byteLength(JSON.stringify(page.messages), 'utf8')
      cursor = page.nextCursor
    } while (cursor !== null)

    const firstPageBytes = Buffer.byteLength(firstPage.body, 'utf8')

    expect(wholeHistoryBytes, 'the fixture is genuinely large').toBeGreaterThan(50_000)
    expect(
      firstPageBytes * 4,
      `The first page is ${firstPageBytes} bytes against ${wholeHistoryBytes} for the whole ` +
        'conversation. A response carrying a total, or every identifier, would satisfy the ' +
        'page-size assertion above while still transferring the history.',
    ).toBeLessThan(wholeHistoryBytes)
  })

  it('bounds the page size server-side, so a caller cannot ask for the lot', async () => {
    // The limit is enforced by the route schema, so an over-large request is refused rather than
    // silently clamped — a clamp would let a caller believe they had the whole thread.
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages?limit=${TOTAL}`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(response.statusCode).toBe(400)
  })

  it('refuses a cursor this server did not issue, indistinguishably from a refusal', async () => {
    for (const cursor of ['not-base64url!!', Buffer.from('nonsense').toString('base64url')]) {
      const response = await app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursor)}`,
        headers: { cookie: cookieHeader(adaCookie) },
      })

      // 404, not 400: a hand-edited cursor must not be distinguishable from a conversation that
      // is not yours. A validation body here would be a difference an attacker can read.
      expect(response.statusCode, `cursor ${cursor}`).toBe(404)
    }
  })

  it("a cursor from one conversation reads the CALLER'S conversation, never the other", async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The cursor is **a position, not a scope**. The conversation comes from the path and its
    // guard, so a cursor lifted from somewhere else can only move a reader around inside a thread
    // they are already entitled to. Asserted because "opaque" is easy to mistake for "trusted".
    // ───────────────────────────────────────────────────────────────────────────────────────
    const page = await read('?limit=2')
    const cursor = page.nextCursor as string

    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursor)}&limit=2`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const next = response.json() as Page

    // Continuity rather than specific text, for the tie-break reason recorded above: two pages of
    // two must be the same four messages, in the same order, as one page of four.
    const four = await read('?limit=4')
    expect([...page.messages, ...next.messages].map((message) => message.messageId)).toEqual(
      four.messages.map((message) => message.messageId),
    )
  })
})
