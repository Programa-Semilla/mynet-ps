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
 * T125 (007) — **deleting an account removes its messages from EVERY conversation, not only
 * from its own view** (FR-570, SC-509).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS M3, AND IT IS THE FEATURE'S DELETION DECISION RATHER THAN A CONSEQUENCE OF ONE.**
 *
 * The alternative was specified and rejected: keeping a departed person's words in somebody
 * else's thread under a tombstone — "deleted user" — retains both their authored content and the
 * fact of their having been here, which is what the erasure right forecloses.
 *
 * The cost is real and is not hidden: **the survivor loses half of a conversation they remember
 * having.** `Thread.tsx` renders that honestly rather than papering over it (FR-519a), and this
 * file asserts both halves — what goes, and what stays.
 *
 * The cascade is `messages.author_id`, declared in the schema rather than implemented in a
 * deletion routine, so no future deletion path can forget it. That is what this test is really
 * checking: not that a function ran, but that the *database* is shaped so it could not fail to.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('deleting an account, from the other person’s side', () => {
  let app: FastifyInstance
  let adaCookie: string
  let departingCookie: string
  let adaId: string
  let departingId: string
  let conversationId: string

  const signIn = async (email: string, password = SEED_PASSWORD): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password },
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

  const thread = async (cookie: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as {
      messages: { body: string; mine: boolean }[]
      state: string
      counterpart: unknown
    }
  }

  const messageCount = async (): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM messages WHERE conversation_id = ${conversationId}::uuid
    `)
    return Number(rows[0]?.count ?? '0')
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    adaId = await idOf(adaCookie)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A **created** account rather than a seeded one, because this test deletes it — and the
    // seeded fixtures are what every other file in the suite depends on.
    //
    // Joining the shared conference is what makes them co-attendees, which is the precondition
    // for opening a conversation at all (FR-504).
    // ───────────────────────────────────────────────────────────────────────────────────────
    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `departing-${randomUUID()}@example.com`,
        displayName: 'Departing Attendee',
        password: SEED_PASSWORD,
      },
    })
    departingCookie = sessionCookieFrom(signUp) as string
    if (!departingCookie) throw new Error(`Sign-up failed: ${signUp.body}`)
    departingId = await idOf(departingCookie)

    await clearThrottle()
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(departingCookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(departingCookie) },
      payload: { attendeeId: adaId, body: 'Theirs, one.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    for (const [cookie, body] of [
      [adaCookie, 'Ada, one.'],
      [departingCookie, 'Theirs, two.'],
      [adaCookie, 'Ada, two.'],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { body },
      })
    }
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: four messages, two from each', async () => {
    expect(await messageCount()).toBe(4)

    const before = await thread(adaCookie)
    expect(before.messages).toHaveLength(4)
    expect(before.state).toBe('open')
  })

  it('DELETING removes every message that account authored, from the other person’s view', async () => {
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(departingCookie) },
    })
    expect(deleted.statusCode, deleted.body).toBeLessThan(400)

    expect(
      await messageCount(),
      'Two messages remain — Ada’s. The departed attendee’s went with them, from the shared ' +
        'conversation rather than only from their own view (FR-570).',
    ).toBe(2)
  })

  it('the SURVIVOR keeps their own messages, intact and readable (FR-572)', async () => {
    const after = await thread(adaCookie)

    expect(after.messages.map((message) => message.body).sort()).toEqual(['Ada, one.', 'Ada, two.'])
    expect(
      after.messages.every((message) => message.mine),
      'everything left in the thread is hers',
    ).toBe(true)
  })

  it('the conversation is now ONE-SIDED, and says so', async () => {
    const after = await thread(adaCookie)
    expect(after.state).toBe('one_sided')
  })

  it('the conversation is still LISTED — it is not deleted out from under the survivor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const list = response.json() as { conversations: { conversationId: string; state: string }[] }
    const surviving = list.conversations.find((row) => row.conversationId === conversationId)

    expect(surviving, 'FR-572 keeps it. Only the departed person’s content goes.').toBeDefined()
    expect(surviving?.state).toBe('one_sided')
  })

  it('every table the account touched is empty of it (SC-509)', async () => {
    // The cascades, asserted against the database rather than through the API — because what is
    // being checked is that the *schema* is shaped so a deletion path could not forget them.
    for (const [table, column] of [
      ['messages', 'author_id'],
      ['conversation_participants', 'attendee_id'],
      ['conversation_pairs', 'lower_attendee_id'],
      ['conversation_pairs', 'higher_attendee_id'],
      ['attendee_blocks', 'blocker_id'],
      ['attendee_blocks', 'blocked_id'],
      ['abuse_reports', 'reporter_id'],
      ['abuse_reports', 'reported_id'],
      ['push_subscriptions', 'attendee_id'],
    ] as const) {
      const rows = await getDb().execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM ${sql.raw(table)} WHERE ${sql.raw(column)} = ${departingId}::uuid`,
      )
      expect(rows[0]?.count, `${table}.${column} still references the deleted account`).toBe('0')
    }
  })
})
