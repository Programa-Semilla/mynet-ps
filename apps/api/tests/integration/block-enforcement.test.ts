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
 * T068 (007) — **a block is enforced on the server, on both send paths** (FR-536, SC-506).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE ARE TWO WAYS TO SEND A MESSAGE, AND A BLOCK ENFORCED ON ONE OF THEM IS NOT ENFORCED.**
 *
 * `POST /conversations` opens a thread with a first message; `POST /conversations/{id}/messages`
 * sends into one that exists. A block has to refuse both, and the second is the one that matters
 * more: the blocked attendee frequently already *has* the conversation open, having been talking
 * to the blocker a moment ago.
 *
 * **Takes effect immediately** (SC-506). The block is read on the send path itself and cached
 * nowhere — 007's repositories are deliberately undecorated (FR-563) precisely because age is
 * the wrong clock for a refusal. This test blocks and sends in the same breath, with no
 * intervening request, and the send is refused.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a block refuses sending', () => {
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

  const block = (cookie: string, attendeeId: string) =>
    app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId },
    })

  const unblock = (cookie: string, attendeeId: string) =>
    app.inject({
      method: 'DELETE',
      url: '/blocks',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId },
    })

  const sendInto = (cookie: string, body: string) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  const openWith = (cookie: string, attendeeId: string, body: string) =>
    app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId, body },
    })

  const messageCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM messages`,
    )
    return Number(rows[0]?.count ?? '0')
  }

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  const fresh = async (): Promise<void> => {
    await resetDatabase()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)

    const opened = await openWith(adaCookie, graceId, 'Before any block.')
    if (opened.statusCode !== 201) throw new Error(`Fixture failed: ${opened.body}`)
    conversationId = (opened.json() as { conversationId: string }).conversationId
  }

  it('refuses the blocked attendee sending into an EXISTING conversation (FR-536)', async () => {
    await fresh()

    // Grace can send, before the block. Without this the assertion below could pass for any
    // reason at all.
    expect((await sendInto(graceCookie, 'Still allowed.')).statusCode).toBe(201)

    expect((await block(adaCookie, graceId)).statusCode).toBe(204)

    const before = await messageCount()
    const refused = await sendInto(graceCookie, 'After the block.')

    expect(refused.statusCode, refused.body).toBe(409)
    expect(await messageCount(), 'and nothing was written').toBe(before)
  })

  it('refuses the blocked attendee OPENING a new conversation (FR-536)', async () => {
    await fresh()
    await block(adaCookie, graceId)

    // Grace has a conversation with Ada already; this route would append to it. Refused all the
    // same, and nothing is appended.
    const before = await messageCount()
    const refused = await openWith(graceCookie, adaId, 'Trying the other route.')

    expect(refused.statusCode, refused.body).toBe(409)
    expect(await messageCount()).toBe(before)
  })

  it('takes effect on the very NEXT request, with nothing in between (SC-506)', async () => {
    await fresh()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // No reload, no re-read, no cache to expire — 007's repositories are undecorated precisely
    // so this holds. The block and the refused send are consecutive requests.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await block(adaCookie, graceId)
    expect((await sendInto(graceCookie, 'Immediately after.')).statusCode).toBe(409)
  })

  it('refuses the BLOCKER sending too, which is FR-539 from the server side', async () => {
    await fresh()
    await block(adaCookie, graceId)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Sending to somebody whose contact you have refused is incoherent, and FR-539 makes the
    // blocker's composer unavailable with an unblock action rather than merely discouraged. The
    // server refuses it as well, so the requirement does not rest on the client honouring a
    // `state` field.
    //
    // Ada is not disclosed anything she does not know: she made the block, and her client is
    // told `state: 'blocked'` on the conversation.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect((await sendInto(adaCookie, 'From the blocker.')).statusCode).toBe(409)
  })

  it('UNBLOCKING restores sending in both directions, with nothing lost (FR-538)', async () => {
    await fresh()
    await block(adaCookie, graceId)
    expect((await sendInto(graceCookie, 'Refused.')).statusCode).toBe(409)

    expect((await unblock(adaCookie, graceId)).statusCode).toBe(204)

    expect((await sendInto(graceCookie, 'Allowed again.')).statusCode).toBe(201)
    expect((await sendInto(adaCookie, 'And from Ada.')).statusCode).toBe(201)
  })

  it('the conversation stays READABLE to both while the block is in force', async () => {
    await fresh()
    await block(adaCookie, graceId)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A block refuses **future contact**; it is not a deletion and not a revocation of access to
    // what was already said (FR-538). Both parties keep the history. Hiding it from the blocked
    // attendee would also disclose the block to them, which FR-537 forbids.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (const cookie of [adaCookie, graceCookie]) {
      const thread = await app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
      })

      expect(thread.statusCode).toBe(200)
      expect(thread.body).toContain('Before any block.')
    }
  })

  it('blocking is idempotent, and so is unblocking', async () => {
    await fresh()

    expect((await block(adaCookie, graceId)).statusCode).toBe(204)
    expect((await block(adaCookie, graceId)).statusCode, 'a double-tap is the same request').toBe(
      204,
    )

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendee_blocks WHERE blocker_id = ${adaId}::uuid
    `)
    expect(rows[0]?.count, 'one row, not two').toBe('1')

    expect((await unblock(adaCookie, graceId)).statusCode).toBe(204)
    expect((await unblock(adaCookie, graceId)).statusCode, 'and again').toBe(204)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE 404s HERE WERE AN EXISTENCE ORACLE, AND THE ASSERTION CHANGED WITH THE BEHAVIOUR.**
   *
   * This asserted 404 for a nonexistent attendee and for a malformed identifier. The first is the
   * disclosure: post a UUID, read the status, learn whether it belongs to a real MyNet attendee —
   * against a product with public self sign-up. `POST /conversations` refuses to answer that
   * question by construction, and this route answered it freely.
   *
   * Blocking is now scoped to attendees the caller can actually reach (co-attending, or already
   * in a conversation), and everything else takes the **same 204** a real block takes. Nothing is
   * written in either case.
   *
   * Blocking *yourself* keeps its 400: the caller is asking about themselves, so there is no
   * privacy cost, and a silent success would hide a client defect.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses blocking yourself, and discloses nothing about anybody else', async () => {
    await fresh()

    expect((await block(adaCookie, adaId)).statusCode).toBe(400)

    // Identical answers, so the status cannot be read as an existence check.
    const nonexistent = await block(adaCookie, '00000000-0000-4000-8000-000000000000')
    const malformed = await block(adaCookie, 'not-a-uuid')

    for (const [label, response] of Object.entries({ nonexistent, malformed })) {
      expect(
        response.statusCode,
        `${label} must answer exactly as a real block does — a differing status is an oracle ` +
          'for "is this identifier a real attendee".',
      ).toBe(204)
    }

    // Accepted-and-ignored, not accepted-and-written.
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM attendee_blocks WHERE blocker_id = ${adaId}::uuid`,
    )
    expect(rows[0]?.count).toBe('0')
  })
})
