import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import { anEndpoint, registerDevice, subscriptionRows } from '../support/push.js'
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
 * T102 (007) — **a send reaches every device the recipient has** (FR-550, FR-553, M7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FAN-OUT IS THE PROPERTY, AND ONE DEVICE IS NOT ENOUGH TO TEST IT.**
 *
 * An attendee with a phone and a laptop has two registrations, and delivering to whichever the
 * query happened to return first is a defect nobody reports — the notification arrives, on one
 * device, and the person assumes the other was asleep.
 *
 * The payload is asserted too: FR-553 requires the sender to be **identified**, and M7 puts the
 * message content in it. Both are decisions with recorded costs, so both get an assertion rather
 * than a comment — the content one especially, because it is what puts message text on a lock
 * screen.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('dispatching a notification for a received message', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

  let adaCookie: string
  let graceCookie: string
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

  const send = (cookie: string, body: string) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  beforeAll(async () => {
    app = await setupTestApp({ push })
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await resetDatabase()
    push.clear()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Opening the conversation.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId
    push.clear()
  })

  it('delivers to EVERY device the recipient has registered', async () => {
    const phone = anEndpoint('grace-phone')
    const laptop = anEndpoint('grace-laptop')
    await registerDevice(app, graceCookie, phone)
    await registerDevice(app, graceCookie, laptop)

    expect((await send(adaCookie, 'Are you nearby?')).statusCode).toBe(201)

    expect(
      push
        .delivered()
        .map((delivery) => delivery.endpoint)
        .sort(),
      'An attendee with a phone and a laptop has two registrations. Delivering to whichever the ' +
        'query returned first is a defect nobody reports.',
    ).toEqual([laptop, phone].sort())
  })

  it('identifies the SENDER by display name (FR-553)', async () => {
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))
    await send(adaCookie, 'Are you nearby?')

    expect(push.delivered()[0]?.payload.title).toBe('Ada Lovelace')
  })

  it('carries the message CONTENT, and the conversation to open (M7, FR-554)', async () => {
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))
    await send(adaCookie, 'Are you nearby?')

    const payload = push.delivered()[0]?.payload
    expect(payload?.body).toBe('Are you nearby?')
    // 014 — `PushPayload` became a union when the second trigger arrived, so the shape is
    // narrowed rather than assumed. Asserting the narrowing is itself worth something: a message
    // send producing a session-change payload would be a delivery that opens the wrong place.
    expect(payload && 'conversationId' in payload, 'a message send must produce a message payload')
      .toBe(true)
    expect(
      payload && 'conversationId' in payload ? payload.conversationId : undefined,
      'The conversation rather than a URL: the service worker builds the address, so the server ' +
        'port carries no knowledge of the client’s addressing scheme.',
    ).toBe(conversationId)
  })

  it('delivers NOTHING to the sender — a notification is for the recipient', async () => {
    await registerDevice(app, adaCookie, anEndpoint('ada-phone'))
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))

    await send(adaCookie, 'From Ada.')

    expect(
      push.delivered().map((delivery) => delivery.endpoint),
      'Notifying somebody about a message they just wrote is the sort of thing that ships.',
    ).toHaveLength(1)
    expect(push.delivered()[0]?.endpoint).toMatch(/grace-phone/)
  })

  it('dispatches on BOTH send paths, including the one that opens a conversation', async () => {
    // `POST /conversations` is a send too, and it is the *first* message somebody receives —
    // which makes it the one most worth a notification, and the easiest to forget.
    await resetDatabase()
    push.clear()
    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    graceId = await idOf(graceCookie)

    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'A first message.' },
    })
    expect(opened.statusCode).toBe(201)

    expect(push.delivered()).toHaveLength(1)
    expect(push.delivered()[0]?.payload.body).toBe('A first message.')
  })

  it('records the delivery against the subscription', async () => {
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))

    expect((await subscriptionRows(graceId))[0]?.last_delivered_at).toBeNull()

    await send(adaCookie, 'Are you nearby?')

    expect(
      (await subscriptionRows(graceId))[0]?.last_delivered_at,
      'How a stale registration is recognised later.',
    ).not.toBeNull()
  })

  it('does not fail the send when there is nobody registered', async () => {
    const response = await send(adaCookie, 'Nobody is listening.')

    expect(response.statusCode, response.body).toBe(201)
    expect(push.delivered()).toEqual([])
  })

  it('truncates a long body rather than failing the whole delivery', async () => {
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))

    // Exceeding the ~4 KB encrypted payload cap fails the delivery entirely, so a message that is
    // slightly too long would arrive as nothing at all rather than as a truncated notification.
    await send(adaCookie, 'x'.repeat(1_500))

    const body = push.delivered()[0]?.payload.body ?? ''
    expect(body.length).toBeLessThan(1_500)
    expect(body.endsWith('…'), 'and the reader is told there is more').toBe(true)
  })
})
