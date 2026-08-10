import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { registrations } from '../../src/db/schema/events.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  events,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T049 (007) — **a conversation is a relationship, not conference content** (FR-505, FR-507, M2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FEATURE'S LARGEST DEPARTURE FROM EVERYTHING BEFORE IT, AND THE TEST IS WHAT
 * KEEPS IT TRUE.**
 *
 * Standing decision 7 splits the product in two: conference content swaps on event switch,
 * relationships persist across it. Every per-attendee table before 007 is in the first half, so
 * "the active event changes what you see" is the habit five features have built — and adding an
 * event filter to the conversation list is the single edit that would silently reintroduce the
 * failure FR-507 exists to prevent. It would look like consistency.
 *
 * Two properties, and the second is the sharper one:
 *
 *   1. **Switching the active event changes nothing** — not which conversations are listed, not
 *      their order, not their contents.
 *   2. **A conversation stays fully sendable after the shared registration is gone.** FR-505 says
 *      co-attendance is checked once, at creation, and never again. So this test *deletes* the
 *      registration that made the pair reachable and then sends a message successfully. A
 *      re-evaluated condition would make a thread vanish when somebody left a conference — which
 *      is the state M2 rules out, and which nothing else in the suite would catch.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('conversations are independent of the active event', () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  let adaId: string
  let graceId: string
  let conversationId: string
  let summitId: string
  let horizonsId: string

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

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

  const switchTo = async (cookie: string, eventId: string) =>
    app.inject({
      method: 'PUT',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(cookie) },
      payload: { eventId },
    })

  const listAs = async (cookie: string) => {
    const response = await app.inject({
      method: 'GET',
      url: '/conversations',
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as { conversations: unknown[] }
  }

  const threadAs = async (cookie: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json() as { messages: { body: string }[] }
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)

    summitId = await eventIdByName('Product & Design Summit')
    // Ada's alone. Grace is not registered for it, which is what makes the switch meaningful.
    horizonsId = await eventIdByName('Frontend Horizons')

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Started at the summit.' },
    })
    if (opened.statusCode !== 201) throw new Error(`Fixture failed: ${opened.body}`)
    conversationId = (opened.json() as { conversationId: string }).conversationId
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the list and the thread are IDENTICAL before and after an event switch (FR-507)', async () => {
    await switchTo(adaCookie, summitId)
    const listAtSummit = await listAs(adaCookie)
    const threadAtSummit = await threadAs(adaCookie)

    const switched = await switchTo(adaCookie, horizonsId)
    expect(switched.statusCode, switched.body).toBe(200)

    const listAtHorizons = await listAs(adaCookie)
    const threadAtHorizons = await threadAs(adaCookie)

    expect(
      listAtHorizons,
      'The conversation list must not change when the active conference does. An event filter ' +
        'here would look like consistency with every other per-attendee read in the product, and ' +
        'would be exactly the edit FR-507 exists to prevent.',
    ).toEqual(listAtSummit)
    expect(threadAtHorizons).toEqual(threadAtSummit)
  })

  it('the conversation is still there at a conference the counterpart does not attend', async () => {
    // Ada is at Frontend Horizons; Grace is not registered for it at all. The conversation is
    // still listed, still readable, and still hers.
    await switchTo(adaCookie, horizonsId)

    const list = await listAs(adaCookie)
    expect(list.conversations).toHaveLength(1)

    const thread = await threadAs(adaCookie)
    expect(thread.messages[0]?.body).toBe('Started at the summit.')
  })

  it('sending still works from a conference the pair does not share', async () => {
    await switchTo(adaCookie, horizonsId)

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'Sent from a conference Grace is not at.' },
    })

    expect(response.statusCode, response.body).toBe(201)
  })

  it('SENDING STILL WORKS AFTER THE SHARED REGISTRATION IS DELETED (FR-505, M2)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The sharp one. Co-attendance is a precondition of *creating* a conversation and is never
    // re-evaluated — so removing the registration that made the pair reachable must change
    // nothing about the conversation that already exists.
    //
    // Done by deleting the row rather than by calling the withdrawal route, because the point is
    // the *state*, not the journey: whatever removes a registration, a permanent conversation
    // must survive it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await getDb()
      .delete(registrations)
      .where(and(eq(registrations.attendeeId, graceId), eq(registrations.eventId, summitId)))

    const stillShared = await getDb()
      .select()
      .from(registrations)
      .where(eq(registrations.attendeeId, graceId))
    expect(
      stillShared.some((row) => row.eventId === summitId),
      'the fixture must actually have removed the shared registration',
    ).toBe(false)

    const send = await app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { body: 'The conference ended. This still sends.' },
    })
    expect(send.statusCode, send.body).toBe(201)

    // …and Grace can still read it, from her side, with no registration in common at all.
    const thread = await app.inject({
      method: 'GET',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(graceCookie) },
    })
    expect(thread.statusCode).toBe(200)
    expect(thread.body).toContain('The conference ended. This still sends.')
  })

  it('but a NEW conversation between them can no longer be opened (FR-504)', async () => {
    // The other half of the same rule, and the one that makes it a *precondition* rather than a
    // permission: co-attendance is required at creation, so with the shared registration gone a
    // fresh pair cannot start one. This pair already has a conversation, so the assertion is made
    // from Grace toward Alan's position — see `conversation-co-attendance.test.ts` for the full
    // treatment of the refusal's indistinguishability.
    const response = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: adaId, body: 'To myself.' },
    })

    expect(response.statusCode).toBe(404)
  })
})
