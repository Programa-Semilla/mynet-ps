import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T127 (007) — **a conversation with no participants left is removed** (FR-575).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE CASE M3'S CASCADES CANNOT REACH, AND THE ONE NOBODY WOULD EVER NOTICE.**
 *
 * `conversations` holds no attendee foreign key at all — deliberately, because a row naming a
 * departed attendee would breach FR-573, and that emptiness is the entire reason
 * `conversation_pairs` exists as a separate table (research R10). The consequence is that when
 * *both* participants delete their accounts, every other row goes and the conversation itself
 * stays.
 *
 * It would be invisible: a conversation with no participants is unreachable by every product
 * surface — nobody can list it, read it or send into it. So nothing would report it, and it would
 * accumulate one row per pair who both left. FR-575 calls that litter rather than a record.
 *
 * This file deletes both accounts and counts rows in the table nothing can see.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a conversation nobody is left in', () => {
  let app: FastifyInstance

  const signUpAndJoin = async (): Promise<{ cookie: string; id: string }> => {
    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `both-leaving-${randomUUID()}@example.com`,
        displayName: 'Leaving Attendee',
        password: SEED_PASSWORD,
      },
    })
    const cookie = sessionCookieFrom(signUp)
    if (!cookie) throw new Error(`Sign-up failed: ${signUp.body}`)

    await clearThrottle()
    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(cookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })

    return { cookie, id: (me.json() as { id: string }).id }
  }

  const countOf = async (table: string): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM ${sql.raw(table)}`,
    )
    return Number(rows[0]?.count ?? '0')
  }

  const deleteAccount = (cookie: string) =>
    app.inject({ method: 'DELETE', url: '/account', headers: { cookie: cookieHeader(cookie) } })

  let first: { cookie: string; id: string }
  let second: { cookie: string; id: string }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    first = await signUpAndJoin()
    second = await signUpAndJoin()

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(first.cookie) },
      payload: { attendeeId: second.id, body: 'Between two people who will both leave.' },
    })
    if (opened.statusCode !== 201) throw new Error(`Fixture failed: ${opened.body}`)

    await app.inject({
      method: 'POST',
      url: `/conversations/${(opened.json() as { conversationId: string }).conversationId}/messages`,
      headers: { cookie: cookieHeader(second.cookie) },
      payload: { body: 'And a reply.' },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: one conversation, two participants, two messages', async () => {
    expect(await countOf('conversations')).toBe(1)
    expect(await countOf('conversation_participants')).toBe(2)
    expect(await countOf('messages')).toBe(2)
  })

  it('the FIRST departure leaves the conversation standing, for the survivor (FR-572)', async () => {
    expect((await deleteAccount(first.cookie)).statusCode).toBeLessThan(400)

    expect(
      await countOf('conversations'),
      'One participant is still here, and the conversation is theirs to keep — one-sided and ' +
        'read-only rather than removed out from under them.',
    ).toBe(1)
    expect(await countOf('conversation_participants')).toBe(1)
    expect(await countOf('messages'), 'the survivor’s own message remains').toBe(1)
    expect(await countOf('conversation_pairs'), 'the pair row cascaded away with them').toBe(0)
  })

  it('THE SECOND DEPARTURE REMOVES IT (FR-575)', async () => {
    expect((await deleteAccount(second.cookie)).statusCode).toBeLessThan(400)

    expect(await countOf('conversation_participants')).toBe(0)
    expect(await countOf('messages')).toBe(0)
    expect(
      await countOf('conversations'),
      'A conversation with no participants is unreachable by every product surface — which is ' +
        'exactly why it must be removed rather than left: nothing would ever report it.',
    ).toBe(0)
  })

  it('leaves nothing behind in any table this feature added', async () => {
    for (const table of [
      'conversations',
      'conversation_pairs',
      'conversation_participants',
      'messages',
      'attendee_blocks',
      'abuse_reports',
      'push_subscriptions',
    ]) {
      expect(
        await countOf(table),
        `${table} still holds rows after both accounts were deleted`,
      ).toBe(0)
    }
  })
})
