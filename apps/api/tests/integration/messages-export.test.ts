import { randomUUID } from 'node:crypto'

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
 * T138 (007) — **the export covers what this feature collects, and states what it withholds**
 * (FR-577, FR-578, research R14).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE EXCLUSION IS THIS FEATURE'S ONE DECLARED DIVERGENCE FROM STANDING DECISION 12, AND IT IS
 * ASSERTED RATHER THAN LEFT AS PROSE.**
 *
 * Decision 12 requires an export "covering every field collected", and a received message is a
 * field collected about this attendee. FR-578 excludes it anyway, on the reasoning that a received
 * message is **primarily its author's personal data**: exporting it would hand one attendee a
 * machine-readable copy of another attendee's words, through a self-service route the author never
 * sees and cannot object to.
 *
 * That reasoning is contestable and the specification says so — comparable products do export
 * received correspondence, and REVIEWERS.md lists it as a point a reviewer should decide they
 * agree with. What is not contestable is that the attendee must be **told**, or an export that
 * silently omits half a conversation is indistinguishable from an export of somebody who had no
 * conversations.
 *
 * The subscription keys are the other half: they are a **capability**, not a record. Reproducing
 * them would put the ability to deliver to a device into a file the attendee downloads and keeps —
 * the same reasoning that keeps the password hash and live reset tokens out.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the personal-data export, for 007’s tables', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let graceId: string

  const MINE = 'A message I wrote, which must be exported.'
  const THEIRS = 'A message they wrote, which must NOT be exported.'
  const REASON = 'A reason I gave, which is my own record.'

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

  interface Export {
    messages: { conversationId: string; body: string; sentAt: string }[]
    blocks: { blockedAttendeeId: string; createdAt: string }[]
    reports: { reportedAttendeeId: string; reason: string; messageIds: string[] }[]
    pushSubscriptions: { endpoint: string; keysRedacted: true }[]
    exclusions: string[]
  }

  const exportAs = async (cookie: string): Promise<{ body: string; data: Export }> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'GET',
      url: '/profile/export',
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode, response.body).toBe(200)
    return { body: response.body, data: response.json() as Export }
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)
    const adaId = await idOf(adaCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: MINE },
    })
    const conversationId = (opened.json() as { conversationId: string }).conversationId

    const theirs = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { body: THEIRS },
    })
    const theirMessageId = (theirs.json() as { messageId: string }).messageId

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A device registration, written **directly**, because the route that creates one belongs to
    // Phase 7 and is gated on the constitution amendment (register entry 10).
    //
    // The export's obligation is not gated: `push_subscriptions` exists on migration `0006`, the
    // export already reads it, and the two key columns are exactly the sort of thing that gets
    // exported by accident. Waiting for the route to exist would leave that untested for as long
    // as the amendment is outstanding, which could be indefinitely.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await getDb().execute(sql`
      INSERT INTO push_subscriptions (attendee_id, endpoint, p256dh_key, auth_key)
      VALUES (
        ${adaId}::uuid,
        ${`https://push.example.invalid/${randomUUID()}`},
        'PUBLIC-KEY-VALUE-THAT-MUST-NOT-BE-EXPORTED',
        'AUTH-SECRET-VALUE'
      )
    `)

    // A report, which also blocks — so both of this feature's remaining tables have a row.
    await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, reason: REASON, messageIds: [theirMessageId] },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('includes the messages the attendee AUTHORED (FR-577)', async () => {
    const { data } = await exportAs(adaCookie)

    expect(data.messages.map((message) => message.body)).toEqual([MINE])
    expect(data.messages[0]?.conversationId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('EXCLUDES the messages they received (FR-578)', async () => {
    const { body, data } = await exportAs(adaCookie)

    expect(data.messages.map((message) => message.body)).not.toContain(THEIRS)
    expect(
      body.includes(THEIRS),
      "A received message is primarily its author's personal data, and this export is a " +
        'self-service route they cannot see or object to.',
    ).toBe(false)
  })

  it('STATES the exclusion in the document itself (FR-578)', async () => {
    const { data } = await exportAs(adaCookie)

    expect(
      data.exclusions.some((note) => /messages you received are not included/i.test(note)),
      'An export that silently omits something is indistinguishable from an export of an ' +
        'attendee who had nothing.',
    ).toBe(true)
  })

  it('the exclusion note is present even for an attendee with NOTHING to exclude', async () => {
    // Alan has no conversations at all. The note appears anyway, because otherwise its presence
    // would itself disclose that something was withheld.
    const alanCookie = await signIn('alan@example.com')
    const { data } = await exportAs(alanCookie)

    expect(data.messages).toEqual([])
    expect(data.exclusions.some((note) => /messages you received/i.test(note))).toBe(true)
  })

  it('includes the blocks the attendee created, and not blocks against them', async () => {
    const { data } = await exportAs(adaCookie)

    expect(data.blocks.map((block) => block.blockedAttendeeId)).toEqual([graceId])

    // Grace was blocked BY Ada. That is Ada's record, not Grace's.
    const grace = await exportAs(graceCookie)
    expect(
      grace.data.blocks,
      "A block against you is somebody else's record of their own decision, and telling you it " +
        'exists is what FR-537 forbids.',
    ).toEqual([])
  })

  it('includes the reports the attendee filed, with their own reason', async () => {
    const { data } = await exportAs(adaCookie)

    expect(data.reports).toHaveLength(1)
    expect(data.reports[0]?.reportedAttendeeId).toBe(graceId)
    expect(data.reports[0]?.reason, 'their own words, in their own export').toBe(REASON)
  })

  it('does NOT include reports made about them', async () => {
    const { body, data } = await exportAs(graceCookie)

    expect(data.reports).toEqual([])
    expect(body.includes(REASON), 'that is somebody else’s record').toBe(false)
  })

  it('includes device registrations with the KEYS REDACTED (research R14)', async () => {
    const { body, data } = await exportAs(adaCookie)

    expect(data.pushSubscriptions).toHaveLength(1)
    expect(data.pushSubscriptions[0]?.endpoint).toMatch(/^https:\/\/push\.example\.invalid\//)
    expect(data.pushSubscriptions[0]?.keysRedacted).toBe(true)

    for (const key of ['PUBLIC-KEY-VALUE-THAT-MUST-NOT-BE-EXPORTED', 'AUTH-SECRET-VALUE']) {
      expect(
        body.includes(key),
        'Together the keys grant the ability to deliver to that device. Exporting them would ' +
          'hand over a capability rather than a record — the same reasoning that keeps the ' +
          'password hash out.',
      ).toBe(false)
    }
  })

  it('states the key redaction in the document too', async () => {
    const { data } = await exportAs(adaCookie)

    expect(
      data.exclusions.some((note) => /encryption keys are omitted/i.test(note)),
      'The reader is told, rather than left to notice a field they did not know to look for.',
    ).toBe(true)
  })

  it('nothing in the export names a conversation participant', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `conversationId` appears as grouping context, and it is deliberately not a record of the
    // other participant: `conversations` holds no identifier at all (research R10). So an export
    // of authored messages cannot leak who they were sent to, by construction.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const { data } = await exportAs(adaCookie)
    const messagesJson = JSON.stringify(data.messages)

    expect(messagesJson).not.toContain(graceId)
    expect(messagesJson).not.toContain('Grace Hopper')
  })
})
