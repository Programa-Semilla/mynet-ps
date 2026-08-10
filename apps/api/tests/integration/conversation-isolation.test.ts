import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
 * T048 (007) — **THE FR-522 TEST. A non-participant is refused, and told nothing** (FR-520,
 * FR-522, FR-524, SC-505).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE MOST IMPORTANT FILE THIS FEATURE ADDS, AND IT IS NAMED AS A REQUIREMENT RATHER THAN
 * LEFT TO DILIGENCE.**
 *
 * FR-522 does not merely say non-participants must be refused — it says an *integration test
 * against a real database* must prove it. That is unusual and deliberate: this is the first
 * feature whose personal data is not reachable by the event-scope guard, so the protection
 * everything before 007 inherited does not apply here, and the audit that enforces it
 * (`participation-audit`) checks route *declarations* rather than behaviour.
 *
 * The test is deliberately hostile. It does not check that a participant can read their thread;
 * it tries, by every means the HTTP surface allows, to make the server hand Alan something of
 * Ada and Grace's, and asserts that none of them work.
 *
 * **404, never 403, and byte-identical to a conversation that does not exist.** A 403 would
 * confirm that a conversation between two specific people is there — which is the metadata this
 * destination exists to keep private, and a conversation identifier appears in URLs, gets shared,
 * and ends up in logs and browser history. So "does conversation X exist" is a question an
 * outsider can ask repeatedly, and every answer must be the same.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a conversation is private to its two participants', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  /** Registered for the same conference as both, and party to nothing they say. */
  let alanCookie: string
  let conversationId: string
  let messageId: string

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

  /**
   * Every read and write this feature exposes for one conversation, driven as anybody.
   *
   * Labelled, because an assertion failure has to name *which* route leaked — the injected
   * response carries no reference back to the request that produced it.
   */
  const everyRoute = (cookie: string, id: string) => [
    {
      label: `GET /conversations/${id}/messages`,
      response: app.inject({
        method: 'GET',
        url: `/conversations/${id}/messages`,
        headers: { cookie: cookieHeader(cookie) },
      }),
    },
    {
      label: `POST /conversations/${id}/messages`,
      response: app.inject({
        method: 'POST',
        url: `/conversations/${id}/messages`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { body: 'Reading over your shoulder.' },
      }),
    },
    {
      label: `PUT /conversations/${id}/read`,
      response: app.inject({
        method: 'PUT',
        url: `/conversations/${id}/read`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { throughMessageId: messageId },
      }),
    },
  ]

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    alanCookie = await signIn('alan@example.com')

    const graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Private to the two of us.' },
    })
    if (opened.statusCode !== 201) throw new Error(`Fixture failed: ${opened.body}`)

    const created = opened.json() as { conversationId: string; messageId: string }
    conversationId = created.conversationId
    messageId = created.messageId
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real, or every assertion below is trivially true', async () => {
    // Guard against the suite passing because there is nothing to leak.
    const page = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('Private to the two of us.')
  })

  it('ALAN IS REFUSED EVERY ROUTE, WITH 404 AND NEVER 403 (FR-522, FR-524)', async () => {
    for (const { label, response: pending } of everyRoute(alanCookie, conversationId)) {
      const response = await pending
      expect(response.statusCode, `${label} answered ${response.statusCode}`).toBe(404)
      expect(response.body, label).not.toContain('Private to the two of us.')
    }
  })

  it('the refusal is BYTE-IDENTICAL to a conversation that does not exist', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The heart of FR-524. A shared status with a differing body leaks exactly as much as a
    // differing status would: an outsider holding a conversation identifier could tell "there is
    // a conversation here that is not yours" from "there is nothing here", which is who-talks-to-
    // whom — the metadata Messages exists to keep private.
    //
    // Achieved by construction rather than by two careful branches: `requireParticipation` runs
    // one query, and a conversation that exists but is not the caller's produces no row exactly
    // as one that does not exist produces no row.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const real = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(alanCookie) },
    })
    const imaginary = await app.inject({
      method: 'GET',
      url: `/conversations/${randomUUID()}/messages`,
      headers: { cookie: cookieHeader(alanCookie) },
    })
    const malformed = await app.inject({
      method: 'GET',
      url: `/conversations/not-a-uuid/messages`,
      headers: { cookie: cookieHeader(alanCookie) },
    })

    expect(real.statusCode).toBe(404)
    expect(new Set([real.body, imaginary.body, malformed.body]).size).toBe(1)
  })

  it("Alan's own conversation list contains nothing of theirs (FR-520)", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(alanCookie) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ conversations: [] })
    expect(response.body).not.toContain('Private to the two of us.')
  })

  it("Alan's unread indicator is not affected by their conversation", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations/unread',
      headers: { cookie: cookieHeader(alanCookie) },
    })

    expect(response.json()).toEqual({ hasUnread: false })
  })

  it.each([
    ['a query parameter', 'attendeeId'],
    ['a differently-cased query parameter', 'attendee_id'],
    ['a conversation parameter', 'conversationId'],
  ])('ignores an identifier smuggled in via %s', async (_label, parameter) => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations?${parameter}=${conversationId}`,
      headers: { cookie: cookieHeader(alanCookie) },
    })

    expect(response.body).not.toContain('Private to the two of us.')
  })

  it('ignores an identifier smuggled in via a header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: {
        cookie: cookieHeader(alanCookie),
        'x-conversation-id': conversationId,
        'x-attendee-id': await idOf(adaCookie),
        'x-on-behalf-of': await idOf(adaCookie),
      },
    })

    expect(response.body).not.toContain('Private to the two of us.')
  })

  it('refuses a fabricated session token outright', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader('a-token-that-was-never-issued') },
    })

    // 401 rather than 404: this caller has not established who they are at all, which is a
    // different question from whether they participate. `requireAttendee` answers it first.
    expect(response.statusCode).toBe(401)
  })

  it('an unauthenticated caller cannot probe conversation existence at all', async () => {
    const real = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
    })
    const imaginary = await app.inject({
      method: 'GET',
      url: `/conversations/${randomUUID()}/messages`,
    })

    expect(real.statusCode).toBe(401)
    expect(new Set([real.body, imaginary.body]).size).toBe(1)
  })

  it('BOTH participants can read it, so the refusal is about participation and nothing else', async () => {
    for (const cookie of [adaCookie, graceCookie]) {
      const response = await app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
      })

      expect(response.statusCode).toBe(200)
      expect(response.body).toContain('Private to the two of us.')
    }
  })

  it('never projects an author identifier, only `mine` (contract)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Asserted from both sides, because `mine` must differ between them while the payload must
    // carry no identifier either way. A response that leaked `authorId` would be correct for
    // every functional test and would still widen the surface for no gain — the counterpart is
    // already established by the conversation.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const adaId = await idOf(adaCookie)

    for (const [cookie, mine] of [
      [adaCookie, true],
      [graceCookie, false],
    ] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
      })

      const page = response.json() as {
        messages: { mine: boolean }[]
        counterpart: { attendeeId: string } | null
      }
      expect(page.messages[0]?.mine).toBe(mine)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Asserted over the MESSAGES, not over the whole payload.** The page carries a
      // `counterpart` — who the conversation is with — which is a deliberate addition recorded
      // in `queries/messages.ts`: the thread's header, the composer's availability and the two
      // safety dialogs all need it, and the alternative was reading the whole conversation list
      // to render one header.
      //
      // That is one identifier for the one person the reader is already talking to. What must
      // not appear is an identifier **per message**: the counterpart is already established by
      // the conversation, so repeating it would add nothing and widen the surface.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect(JSON.stringify(page.messages)).not.toContain(adaId)
      expect(JSON.stringify(page.messages)).not.toContain('authorId')
    }
  })
})
