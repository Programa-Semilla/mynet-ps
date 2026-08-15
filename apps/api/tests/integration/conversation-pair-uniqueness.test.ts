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
 * T034 (007) — **one conversation per pair, forever, including when two people start one at the
 * same moment** (FR-502, FR-510).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONCURRENT CASE IS THE POINT OF THIS FILE.**
 *
 * The sequential case — Ada messages Grace twice — is easy and would pass against a
 * check-then-insert implementation. The specification names the hard one as an edge case: two
 * attendees composing a first message *to each other* at the same instant. A read-then-write has
 * a window in which both see no conversation and both create one, leaving the pair with two
 * permanently, which is the exact state FR-502 exists to make impossible.
 *
 * The design's answer is that **the unique violation IS the enforcement** — the handler inserts
 * and absorbs the conflict rather than asking first — so the database arbitrates and there is no
 * window to lose. This file drives both directions at once and counts rows.
 *
 * **The direction-independence is what makes it sharp.** A unique index over an unordered pair
 * would happily hold one A–B row and one B–A row, and every assertion about "one conversation"
 * would pass while the pair had two. `conversation_pairs` orders the identifiers, so Grace's
 * simultaneous attempt collides with Ada's rather than sitting beside it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('exactly one conversation per pair', () => {
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

  const conversationCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM conversations`,
    )
    return Number(rows[0]?.count ?? '0')
  }

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
  }

  it('a second send by the same attendee appends and answers 200, not 201', async () => {
    await fresh()

    const first = await open(adaCookie, graceId, 'First.')
    expect(first.statusCode, first.body).toBe(201)
    const firstId = (first.json() as { conversationId: string }).conversationId

    const second = await open(adaCookie, graceId, 'Second.')
    expect(
      second.statusCode,
      '200 rather than 201: the conversation already existed and the message was appended to ' +
        'it (contract, `POST /conversations`).',
    ).toBe(200)

    const secondId = (second.json() as { conversationId: string }).conversationId
    expect(secondId, 'the same conversation, never a second one (FR-510)').toBe(firstId)

    expect(await conversationCount()).toBe(1)
    expect(await messageCount()).toBe(2)
  })

  it('the OTHER attendee replying through the same route reaches the same conversation', async () => {
    await fresh()

    const adas = await open(adaCookie, graceId, 'From Ada.')
    expect(adas.statusCode, adas.body).toBe(201)
    const conversationId = (adas.json() as { conversationId: string }).conversationId

    // Grace opens "a conversation with Ada" — which already exists in the other direction. The
    // ordered pair is what makes the two the same row.
    const graces = await open(graceCookie, adaId, 'From Grace.')
    expect(graces.statusCode, graces.body).toBe(200)
    expect((graces.json() as { conversationId: string }).conversationId).toBe(conversationId)

    expect(await conversationCount()).toBe(1)
    expect(await messageCount()).toBe(2)
  })

  it('TWO SIMULTANEOUS FIRST MESSAGES, one in each direction, produce ONE conversation', async () => {
    await fresh()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Issued without awaiting between them, so both handlers are inside their transactions at
    // the same time. This is the edge case the specification names, and the one a
    // check-then-insert loses.
    //
    // Which of the two answers 201 is not asserted — either is correct, and the winner is the
    // database's to choose. What is asserted is that exactly one conversation exists afterwards
    // and that **both messages survive**: absorbing the conflict must append the loser's message,
    // not discard it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const [fromAda, fromGrace] = await Promise.all([
      open(adaCookie, graceId, 'Simultaneous, from Ada.'),
      open(graceCookie, adaId, 'Simultaneous, from Grace.'),
    ])

    expect([200, 201]).toContain(fromAda.statusCode)
    expect([200, 201]).toContain(fromGrace.statusCode)

    const adaConversation = (fromAda.json() as { conversationId: string }).conversationId
    const graceConversation = (fromGrace.json() as { conversationId: string }).conversationId
    expect(
      adaConversation,
      'Both callers must be told about the same conversation. Two identifiers here would mean ' +
        'two threads for one pair, which is precisely FR-502.',
    ).toBe(graceConversation)

    expect(await conversationCount(), 'one conversation, not two').toBe(1)
    expect(
      await messageCount(),
      'both messages kept. The loser of the race appends rather than failing.',
    ).toBe(2)
  })

  it('leaves no orphaned conversation behind when the race is lost', async () => {
    await fresh()

    await Promise.all([
      open(adaCookie, graceId, 'A.'),
      open(graceCookie, adaId, 'B.'),
      open(adaCookie, graceId, 'C.'),
    ])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The implementation inserts a conversation before it can claim the pair, so a lost race
    // leaves one it must remove. An orphan is invisible to every product surface — it has no
    // participants, so nobody can read it — which is exactly why it needs a test: it would
    // accumulate silently, one row per contended first message.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const orphans = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count
      FROM conversations c
      WHERE NOT EXISTS (SELECT 1 FROM conversation_pairs p WHERE p.conversation_id = c.id)
    `)

    expect(
      Number(orphans[0]?.count ?? '0'),
      'A conversation with no pair row is litter no product surface can reach, and it would ' +
        'accumulate one per contended first message.',
    ).toBe(0)

    expect(await conversationCount()).toBe(1)
  })
})
