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
 * T070 (007) — **A blocking B and B blocking A are two independent facts** (FR-540).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FAILURE THIS PREVENTS IS SPECIFIC, AND IT WOULD LOOK LIKE TIDINESS.**
 *
 * `conversation_pairs` — the table immediately next to `attendee_blocks` in the same feature —
 * *orders* its two identifiers so that A–B and B–A are the same row. Applying that here is the
 * obvious consistency, and it is a serious bug: with one row for the pair, **unblocking one
 * releases both**. An attendee who relented would silently restore the other person's block
 * against them, re-opening a channel that person had deliberately closed, and neither of them
 * would be told.
 *
 * The two tables sit side by side with opposite treatments of the same shape. This file is what
 * stops somebody making them consistent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('blocks are directional and independent', () => {
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

  const blocksOf = async (cookie: string): Promise<string[]> => {
    const response = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as { blocks: { attendeeId: string }[] }).blocks.map(
      (entry) => entry.attendeeId,
    )
  }

  const rowCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM attendee_blocks`,
    )
    return Number(rows[0]?.count ?? '0')
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
      payload: { attendeeId: graceId, body: 'Before anything.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('A blocking B does NOT imply B blocking A', async () => {
    await block(adaCookie, graceId)

    expect(await blocksOf(adaCookie)).toEqual([graceId])
    expect(
      await blocksOf(graceCookie),
      "Grace has blocked nobody. Ada's block is Ada's record, and it must not appear as Grace's.",
    ).toEqual([])
  })

  it('MUTUAL blocks are TWO rows, not one', async () => {
    await block(graceCookie, adaId)

    expect(
      await rowCount(),
      'One row for the pair would mean unblocking one released both — the failure this file ' +
        'exists to prevent. `conversation_pairs` orders its pair; this table must not.',
    ).toBe(2)

    expect(await blocksOf(adaCookie)).toEqual([graceId])
    expect(await blocksOf(graceCookie)).toEqual([adaId])
  })

  it('UNBLOCKING ONE LEAVES THE OTHER STANDING (FR-540)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The heart of it. Ada relents; Grace's refusal of Ada is untouched, and Ada is still
    // refused — which is correct, because Grace never changed her mind and nobody asked her to.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    await unblock(adaCookie, graceId)

    expect(await blocksOf(adaCookie)).toEqual([])
    expect(
      await blocksOf(graceCookie),
      "Ada unblocking Grace must not release Grace's block of Ada. Nobody asked Grace.",
    ).toEqual([adaId])
    expect(await rowCount()).toBe(1)

    // …and the enforcement follows the rows: Ada is still refused, because Grace still blocks her.
    const refused = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'I have unblocked you.' },
    })
    expect(refused.statusCode).toBe(409)
  })

  it("and Ada is not told that Grace's block is what refuses her", async () => {
    // The refusal shape is the same one an attendee sees when *they* are the blocker, so Ada
    // cannot infer from it that Grace has blocked her (FR-537).
    const refused = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'Still trying.' },
    })

    expect(refused.statusCode).toBe(409)
    expect(refused.body.toLowerCase()).not.toContain('block')
  })

  it('releasing the second block restores sending for both', async () => {
    await unblock(graceCookie, adaId)

    expect(await rowCount()).toBe(0)

    for (const cookie of [adaCookie, graceCookie]) {
      const response = await app.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { body: 'Back to normal.' },
      })
      expect(response.statusCode, response.body).toBe(201)
    }
  })

  it('the database itself refuses a self-block, whatever a future write path does', async () => {
    // The CHECK constraint, asserted directly. A constraint nothing exercises is one that can be
    // dropped from a regenerated migration without anything noticing.
    await expect(
      getDb().execute(sql`
        INSERT INTO attendee_blocks (blocker_id, blocked_id)
        VALUES (${adaId}::uuid, ${adaId}::uuid)
      `),
    ).rejects.toThrow()
  })
})
