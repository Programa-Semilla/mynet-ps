import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SinkPushService } from '../../src/notifications/sink-adapter.js'
import {
  allSubscriptionRows,
  anEndpoint,
  registerDevice,
  subscriptionRows,
} from '../support/push.js'
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
 * T103 (007) — **a device replaces rather than accumulates, and revoking one leaves the others**
 * (FR-555, FR-556).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE UPSERT IS KEYED ON THE ENDPOINT ALONE, AND THE OBVIOUS ALTERNATIVE IS A CROSS-ACCOUNT
 * LEAK.**
 *
 * Keying on `(attendee_id, endpoint)` is the natural instinct and it is wrong. The same browser
 * profile signed into two accounts in turn produces the **same endpoint** — it belongs to the
 * browser installation, not to the session. Under the pair key the first account's row survives,
 * and the push service delivers *one attendee's messages using another attendee's registration*: a
 * shared laptop at a conference receiving somebody else's correspondence, indistinguishable from a
 * caching bug.
 *
 * That case gets its own test below, because it is the one nobody thinks to write.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the lifecycle of a device registration', () => {
  let app: FastifyInstance
  const push = new SinkPushService()

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

  const unregister = (cookie: string, endpoint: string) =>
    app.inject({
      method: 'DELETE',
      url: '/push/subscriptions',
      headers: { cookie: cookieHeader(cookie) },
      payload: { endpoint },
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
  })

  it('answers 201 for a new endpoint and 200 when the same one re-registers', async () => {
    const endpoint = anEndpoint('grace-phone')

    expect(await registerDevice(app, graceCookie, endpoint)).toBe(201)
    expect(await registerDevice(app, graceCookie, endpoint)).toBe(200)
  })

  it('RE-REGISTERING REPLACES rather than accumulates (FR-555)', async () => {
    const endpoint = anEndpoint('grace-phone')
    await registerDevice(app, graceCookie, endpoint)
    await registerDevice(app, graceCookie, endpoint)
    await registerDevice(app, graceCookie, endpoint)

    expect(
      await subscriptionRows(graceId),
      'A browser silently renews its subscription. Every renewal that left its predecessor ' +
        'behind would be a row the server tries and fails to deliver to, forever.',
    ).toHaveLength(1)
  })

  it('re-registering rewrites the KEYS, not only the owner', async () => {
    const endpoint = anEndpoint('grace-phone')
    await registerDevice(app, graceCookie, endpoint)

    await app.inject({
      method: 'POST',
      url: '/push/subscriptions',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { endpoint, keys: { p256dh: 'rotated-public-key', auth: 'rotated-auth' } },
    })

    expect(
      (await subscriptionRows(graceId))[0]?.p256dh_key,
      'A browser may keep the endpoint and rotate the keys. A stale key encrypts a payload the ' +
        'device cannot open — a delivery that succeeds and arrives as nothing.',
    ).toBe('rotated-public-key')
  })

  it('THE SAME ENDPOINT UNDER A SECOND ACCOUNT REASSIGNS IT, never duplicates it', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The shared-device case, and the reason the upsert cannot be keyed on the attendee-endpoint
    // pair. Grace signs in on a browser, then Ada signs in on the same browser: one endpoint, and
    // it must belong to whoever holds it now.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const sharedBrowser = anEndpoint('shared-laptop')

    await registerDevice(app, graceCookie, sharedBrowser)
    await registerDevice(app, adaCookie, sharedBrowser)

    const rows = await allSubscriptionRows()
    expect(rows, 'one row for one browser, not two').toHaveLength(1)
    expect(
      rows[0]?.attendee_id,
      'The device belongs to whoever holds it now. Under a pair key the first account’s row ' +
        'would survive and the push service would deliver Grace’s messages to Ada’s browser.',
    ).toBe(adaId)
  })

  it('…and the reassigned device receives only the NEW owner’s messages', async () => {
    const sharedBrowser = anEndpoint('shared-laptop')
    await registerDevice(app, graceCookie, sharedBrowser)
    await registerDevice(app, adaCookie, sharedBrowser)

    const opened = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { attendeeId: adaId, body: 'To Ada, who now holds that browser.' },
    })
    expect(opened.statusCode).toBe(201)

    expect(
      push.delivered().map((delivery) => delivery.payload.body),
      'Ada holds the browser now, and this message is for Ada.',
    ).toEqual(['To Ada, who now holds that browser.'])
  })

  it('REVOKING ONE DEVICE LEAVES THE OTHERS (FR-556)', async () => {
    const phone = anEndpoint('grace-phone')
    const laptop = anEndpoint('grace-laptop')
    await registerDevice(app, graceCookie, phone)
    await registerDevice(app, graceCookie, laptop)

    expect((await unregister(graceCookie, phone)).statusCode).toBe(204)

    const remaining = await subscriptionRows(graceId)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.endpoint).toBe(laptop)
  })

  it('unregistering is idempotent, and an unknown endpoint is not an error', async () => {
    const endpoint = anEndpoint('grace-phone')
    await registerDevice(app, graceCookie, endpoint)

    expect((await unregister(graceCookie, endpoint)).statusCode).toBe(204)
    expect((await unregister(graceCookie, endpoint)).statusCode).toBe(204)
    expect((await unregister(graceCookie, anEndpoint('never-registered'))).statusCode).toBe(204)
  })

  it('one attendee CANNOT unregister another’s device', async () => {
    const gracePhone = anEndpoint('grace-phone')
    await registerDevice(app, graceCookie, gracePhone)

    expect((await unregister(adaCookie, gracePhone)).statusCode).toBe(204)

    expect(
      await subscriptionRows(graceId),
      'Unscoped, this would let anybody who learned an endpoint unregister somebody else’s ' +
        'phone. The idempotent 204 discloses nothing about whether it existed.',
    ).toHaveLength(1)
  })

  it('deleting an account takes its registrations with it', async () => {
    await registerDevice(app, graceCookie, anEndpoint('grace-phone'))
    await registerDevice(app, graceCookie, anEndpoint('grace-laptop'))

    await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect(await subscriptionRows(graceId)).toEqual([])
  })

  it('refuses a malformed subscription', async () => {
    for (const payload of [
      { endpoint: '', keys: { p256dh: 'a', auth: 'b' } },
      { endpoint: anEndpoint('x') },
      { endpoint: anEndpoint('x'), keys: { p256dh: 'a' } },
      { endpoint: anEndpoint('x'), keys: {} },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/push/subscriptions',
        headers: { cookie: cookieHeader(graceCookie) },
        payload,
      })
      expect(response.statusCode, JSON.stringify(payload)).toBe(400)
    }
  })

  it('STRIPS an unknown property rather than rejecting it, and that IS the enforcement', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Recorded rather than asserted against.** Fastify configures Ajv with `removeAdditional`,
    // so `additionalProperties: false` *deletes* an unknown key instead of answering 400 — the
    // same behaviour 004's sign-up route relies on for FR-301's "MUST NOT collect any other
    // personal data at that moment". Nothing extra reaches the handler, which is what the
    // requirement is about; refusing would be a different, stricter promise nobody made.
    //
    // The test exists so a reader finds a decision rather than discovering it the day a client
    // sends a field the server quietly discards.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const endpoint = anEndpoint('grace-phone')
    const response = await app.inject({
      method: 'POST',
      url: '/push/subscriptions',
      headers: { cookie: cookieHeader(graceCookie) },
      payload: { endpoint, keys: { p256dh: 'a', auth: 'b' }, smuggled: 'ignored' },
    })

    expect(response.statusCode).toBe(201)

    const rows = await subscriptionRows(graceId)
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain('smuggled')
  })
})
