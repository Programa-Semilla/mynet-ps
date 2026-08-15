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
 * T126 (007) — **nothing of the departed attendee survives anywhere** (FR-573, SC-510).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ASSERTED AGAINST THE API RESPONSE, NOT AGAINST THE DATABASE, AND THAT IS THE POINT.**
 *
 * A schema audit can show that no column holds the departed attendee. It cannot show that no
 * *response* reconstructs them — and reconstruction is how a tombstone actually arrives: not as a
 * retained row, but as a client-facing convenience. `counterpart: { displayName: "Deleted user" }`
 * is a tombstone. So is an `attendeeId` with a null name, because an identifier is a handle to a
 * person whether or not it is rendered.
 *
 * So `counterpart` must be **null** — the whole object absent, carrying no name, no avatar and no
 * identifier — and the response is searched for the departed attendee's actual display name,
 * email and identifier as strings.
 *
 * The client renders the closed treatment from `state`, never from a missing field.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const DEPARTING_NAME = 'Quintessa Vandermeer'

describe('a departed counterpart', () => {
  let app: FastifyInstance
  let adaCookie: string
  let departingId: string
  let departingEmail: string
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

  /** Every response the survivor can obtain that could possibly carry the departed attendee. */
  const everySurvivorRead = () =>
    Promise.all([
      app.inject({
        method: 'GET',
        url: '/conversations',
        headers: { cookie: cookieHeader(adaCookie) },
      }),
      app.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: { cookie: cookieHeader(adaCookie) },
      }),
      app.inject({
        method: 'GET',
        url: '/conversations/unread',
        headers: { cookie: cookieHeader(adaCookie) },
      }),
      app.inject({
        method: 'GET',
        url: '/blocks',
        headers: { cookie: cookieHeader(adaCookie) },
      }),
    ])

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    const adaId = await idOf(adaCookie)

    departingEmail = `quintessa-${randomUUID()}@example.com`
    await clearThrottle()
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: departingEmail, displayName: DEPARTING_NAME, password: SEED_PASSWORD },
    })
    const departingCookie = sessionCookieFrom(signUp) as string
    departingId = await idOf(departingCookie)

    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(departingCookie) },
      payload: { joinCode: 'PDS-2026' },
    })

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(departingCookie) },
      payload: { attendeeId: adaId, body: 'From somebody who will leave.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'A reply that will survive.' },
    })

    // Ada blocks them, so the block path is exercised by the deletion too — a blocked attendee
    // who leaves must take their row with them rather than leaving a name in a block list.
    await app.inject({
      method: 'POST',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: departingId },
    })

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(departingCookie) },
    })
    if (deleted.statusCode >= 400) throw new Error(`Deletion failed: ${deleted.body}`)
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: the conversation survives with the attendee gone', async () => {
    const rows = await getDb().execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM attendees WHERE id = ${departingId}::uuid`,
    )
    expect(rows[0]?.count, 'the account is gone').toBe('0')

    const list = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    expect((list.json() as { conversations: unknown[] }).conversations).toHaveLength(1)
  })

  it('`counterpart` IS NULL — no name, no avatar, no identifier (FR-573)', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    const [conversation] = (list.json() as { conversations: { counterpart: unknown }[] })
      .conversations

    expect(
      conversation?.counterpart,
      'The whole object absent, not an object with null fields. An identifier with no name is ' +
        'still a handle to a person, and a placeholder name is a tombstone.',
    ).toBeNull()
  })

  it("the THREAD's counterpart is null too, not merely the list's", async () => {
    const page = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect((page.json() as { counterpart: unknown }).counterpart).toBeNull()
  })

  it('NO RESPONSE ANYWHERE CARRIES THEIR NAME, ADDRESS OR IDENTIFIER (SC-510)', async () => {
    for (const response of await everySurvivorRead()) {
      for (const trace of [DEPARTING_NAME, departingEmail, departingId]) {
        expect(
          response.body.includes(trace),
          `a response carries "${trace}" after the account was deleted`,
        ).toBe(false)
      }
    }
  })

  it('no response invents a placeholder person either', async () => {
    // The other way a tombstone arrives: not a retained value, but a manufactured one.
    for (const response of await everySurvivorRead()) {
      const body = response.body.toLowerCase()
      for (const invented of ['deleted user', 'former attendee', 'unknown attendee', 'anonymous']) {
        expect(body.includes(invented), `a response invents "${invented}"`).toBe(false)
      }
    }
  })

  it('the block Ada made against them is gone, rather than naming a ghost', async () => {
    const blocks = await app.inject({
      method: 'GET',
      url: '/blocks',
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(
      (blocks.json() as { blocks: unknown[] }).blocks,
      'A block list is the one surface that renders a name outside a conversation. A departed ' +
        'attendee must leave it entirely rather than becoming an unnamed row.',
    ).toEqual([])
  })

  it("the survivor's own read position survived, reset rather than deleted", async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `last_read_message_id` is `ON DELETE SET NULL` rather than cascade, deliberately: the
    // message it pointed at may have been the departed attendee's. A cascade would have deleted
    // **the participation**, evicting the survivor from their own conversation as a side effect
    // of somebody else leaving.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM conversation_participants
      WHERE conversation_id = ${conversationId}::uuid
    `)

    expect(rows[0]?.count, 'exactly one participant left, and it is the survivor').toBe('1')
  })
})
