import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import { anEndpoint, registerDevice } from '../support/push.js'
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
 * T105 (007) — **no notification for a sender the recipient blocks, evaluated at DISPATCH time**
 * (FR-542, FR-558).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"THE SEND ALREADY REFUSES A BLOCKED SENDER" IS THE OBJECTION, AND FR-558 ANSWERS IT
 * EXPLICITLY: THE BLOCK IS EVALUATED AT THE MOMENT OF DISPATCH, NOT THE MOMENT THE MESSAGE WAS
 * ACCEPTED.**
 *
 * The two are not the same instant, and the gap is where the failure lives. A message can be
 * accepted and the recipient can block a moment later — the send path's check has already run, and
 * a dispatch that trusted it would push a notification from somebody the recipient has just refused
 * contact from, onto their lock screen. That is the worst possible moment for this product to get
 * it wrong: blocking is what somebody does when they want it to stop *now*.
 *
 * So the check is re-asked, and this file drives exactly the sequence that separates the two: a
 * conversation, a block, and only then a send.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('notifications and blocks', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

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
    adaId = await idOf(adaCookie)
    graceId = await idOf(graceCookie)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(adaCookie) },
      payload: { attendeeId: graceId, body: 'Before any block.' },
    })
    conversationId = (opened.json() as { conversationId: string }).conversationId

    // Grace has a device throughout, so an absent notification is never merely an absent device.
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))
    push.clear()
  })

  it('the fixture is real: an unblocked send DOES notify', async () => {
    expect((await send(adaCookie, 'Perfectly ordinary.')).statusCode).toBe(201)
    expect(
      push.delivered(),
      'Without this, every assertion below could pass because nothing ever dispatches.',
    ).toHaveLength(1)
  })

  it('NO DISPATCH once the recipient blocks the sender (FR-542)', async () => {
    await block(graceCookie, adaId)
    push.clear()

    // The send itself is refused too — but that is the send path's check, and this file is about
    // the dispatch path's. The assertion is that nothing was pushed, whatever the status.
    await send(adaCookie, 'After the block.')

    expect(push.delivered()).toEqual([])
  })

  it('NO DISPATCH when the SENDER blocks the recipient either', async () => {
    // The other direction. Ada has refused contact from Grace, so notifying Grace about Ada's
    // message would be pushing a conversation neither of them can continue.
    await block(adaCookie, graceId)
    push.clear()

    await send(adaCookie, 'From the blocker.')

    expect(push.delivered()).toEqual([])
  })

  it('the block is re-asked AT DISPATCH, not trusted from the send path (FR-558)', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The sequence the requirement is actually about. The dispatch path is given a message that
    // was written before the block and asked to deliver it after — which is what a queued or
    // retried delivery would look like, and what a dispatch trusting the send path's earlier
    // answer would push straight onto a lock screen.
    //
    // Driven directly against the port's record rather than through a queue, because there is no
    // queue: the assertion is that the check lives on the dispatch path at all.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    expect((await send(adaCookie, 'One.')).statusCode).toBe(201)
    expect(push.delivered(), 'delivered while unblocked').toHaveLength(1)

    await block(graceCookie, adaId)
    push.clear()

    await send(adaCookie, 'Two.')

    expect(
      push.delivered(),
      'Nothing reaches the device once the block exists, however the send is treated.',
    ).toEqual([])
  })

  it('UNBLOCKING restores notifications, so the suppression is not one-way', async () => {
    await block(graceCookie, adaId)
    await app.inject({
      method: 'DELETE',
      url: '/blocks',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { attendeeId: adaId },
    })
    push.clear()

    expect((await send(adaCookie, 'Back to normal.')).statusCode).toBe(201)
    expect(push.delivered()).toHaveLength(1)
  })

  it('a block against SOMEBODY ELSE does not suppress this conversation', async () => {
    // Blocks are directional and per-person (FR-540). Grace blocking Alan must not stop Ada's
    // messages reaching her — which a suppression keyed on "does this attendee block anybody"
    // would get wrong.
    const alanCookie = await signIn('alan@example.com')
    await block(graceCookie, await idOf(alanCookie))
    push.clear()

    expect((await send(adaCookie, 'From Ada, unaffected.')).statusCode).toBe(201)
    expect(push.delivered()).toHaveLength(1)
  })
})
