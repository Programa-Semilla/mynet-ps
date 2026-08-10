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
 * T069 (007) — **the refused attendee is never told a block exists** (FR-537).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A SENDER LEARNS THEIR MESSAGE DID NOT SEND. THEY NEVER LEARN WHY.**
 *
 * This is the requirement most easily defeated by a helpful error message. "That attendee is not
 * accepting messages" reads as good product writing and is a disclosure: it tells somebody they
 * have been blocked, by whom, and when — which is exactly the information that makes blocking
 * dangerous to the blocker in the situations blocking exists for.
 *
 * So the assertions here are about *what the response does not contain*, and they are deliberately
 * crude — a test checking for one specific phrase would pass against the next phrasing somebody
 * wrote. What they forbid is any word disclosing a **cause**: that somebody decided something
 * about this sender. `refused` itself is required and stays, because FR-537 forbids disclosing
 * *why* a message did not send, not *that* it did not.
 *
 * The 409 is also deliberately **the shape a generic conflict would take**, so that a blocked
 * send and a hypothetical future conflict are indistinguishable to a client.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a block discloses nothing to the attendee it refuses', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaId: string
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

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'An ordinary first message.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    await app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  const refusedSend = () =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { body: 'Anybody there?' },
    })

  it('the refusal says nothing about blocking, anywhere in the response', async () => {
    const response = await refusedSend()

    expect(response.statusCode).toBe(409)

    const everything = JSON.stringify({
      body: response.body,
      headers: response.headers,
    }).toLowerCase()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Words that would disclose a CAUSE, not words that describe a refusal.**
    //
    // `refused` is the error code and is required: the sender has to be able to tell "this did
    // not send" from "this succeeded", and FR-537 forbids disclosing *why*, not *that*. So the
    // list below is deliberately about the other party — anything implying somebody decided
    // something about this sender.
    //
    // Crude on purpose all the same: a test checking for one specific phrase would pass against
    // the next phrasing somebody wrote, and "that attendee is not accepting messages" reads as
    // good product writing while being exactly the disclosure this forbids.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (const word of ['block', 'not accepting', 'unavailable', 'declin', 'ignor', 'reported']) {
      expect(
        everything.includes(word),
        `The refusal contains "${word}". A sender must learn their message did not send and ` +
          'never why (FR-537) — a helpful phrase here tells somebody they have been blocked, ' +
          'by whom, and when.',
      ).toBe(false)
    }
  })

  it("Grace's conversation list shows nothing about the block", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(graceCookie) },
    })

    const list = response.json() as { conversations: { state: string }[] }

    expect(
      list.conversations[0]?.state,
      'The reverse case is deliberately not representable. `blocked` means *this attendee blocks ' +
        'the counterpart* — never that they are blocked, which is why the type has three values ' +
        'rather than four.',
    ).toBe('open')
    // No field anywhere in the payload names a block. Checked over the *keys and values* rather
    // than the raw body, so attendee-authored message text cannot make this pass or fail.
    expect(JSON.stringify(list).toLowerCase()).not.toContain('"blocked"')
  })

  it("Grace's thread reads normally, with the state the server reports being `open`", async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect(response.statusCode).toBe(200)
    expect((response.json() as { state: string }).state).toBe('open')
    expect(response.body).toContain('An ordinary first message.')
  })

  it("Grace's block list is her own and shows nothing of Ada's (FR-541)", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect(response.statusCode).toBe(200)
    expect(
      response.json(),
      'A block list showing blocks made *against* the caller would be the disclosure FR-537 ' +
        'forbids, delivered as a feature.',
    ).toEqual({ blocks: [] })
  })

  it("ADA's own list DOES show it, because it is her record of her own choice (FR-541)", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const list = response.json() as { blocks: { attendeeId: string; displayName: string }[] }
    expect(list.blocks).toHaveLength(1)
    expect(list.blocks[0]?.attendeeId).toBe(graceId)
    expect(list.blocks[0]?.displayName).toBe('Grace Hopper')
  })

  it('the blocked refusal is INDISTINGUISHABLE from the blocker being refused', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Both directions take the same 409, so the server never has to decide which story to tell —
    // and a client cannot infer the direction of a block from the shape of a refusal.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const blocked = await refusedSend()
    const blocker = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'From the blocker.' },
    })

    expect(blocked.statusCode).toBe(blocker.statusCode)
    expect(blocked.body).toBe(blocker.body)
  })

  it('a blocked send is distinguishable from a NONEXISTENT conversation, deliberately', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The one distinction that is correct to make. Grace can see this conversation, has every
    // message in it, and is entitled to know her send failed rather than that the thread vanished
    // — a 404 here would tell her something false. FR-524's indistinguishability is about
    // conversations the caller is *not in*; this one she is.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const refused = await refusedSend()
    const missing = await app.inject({
      method: 'POST',
      url: `/conversations/${randomUUID()}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { body: 'Into nothing.' },
    })

    expect(refused.statusCode).toBe(409)
    expect(missing.statusCode).toBe(404)
  })

  it('nothing anywhere lets Grace discover who has blocked her', async () => {
    // The sweep: every route this feature exposes, driven as Grace, with every response searched
    // for Ada's identifier in a block-shaped context.
    const responses = [
      await app.inject({
        method: 'GET',
        url: '/blocks',
        headers: { cookie: cookieHeader(graceCookie) },
      }),
      await app.inject({
        method: 'GET',
        url: '/conversations',
        headers: { cookie: cookieHeader(graceCookie) },
      }),
      await app.inject({
        method: 'GET',
        url: '/conversations/unread',
        headers: { cookie: cookieHeader(graceCookie) },
      }),
      await app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(graceCookie) },
      }),
      await refusedSend(),
    ]

    for (const response of responses) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // `"blocked"` as a **value**, which is what a state field would carry. Searching for the
      // bare word would catch two innocent things and make this test lie: the `/blocks` route's
      // own payload key — Grace's list of blocks *she* made is hers to have — and any message
      // whose text happens to contain the word, which is attendee content rather than a
      // disclosure.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect(response.body.toLowerCase()).not.toContain('"blocked"')
    }

    // Ada's identifier appears nowhere either — the conversation list projects a counterpart, so
    // this is checked against the *refusal* rather than against every read.
    expect((await refusedSend()).body).not.toContain(adaId)
  })
})
