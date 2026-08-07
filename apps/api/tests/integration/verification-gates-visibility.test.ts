import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { events } from '../../src/db/schema/events.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_EVENTS,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  SinkMailService,
  teardown,
} from './helpers.js'

/**
 * T088 (004) — **an unverified attendee appears to nobody, however the setting reads**
 * (FR-359, FR-325c, SC-304, SC-304a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FILE THAT CLOSES THE IMPERSONATION SURFACE.**
 *
 * The specification review found a compound exposure that none of its three decisions showed on
 * its own: the join code is public (FR-317a), an unverified address otherwise prevents nothing
 * (FR-324), and profiles are visible to co-attendees (FR-357). Together, those would have let
 * anyone sign up **using an email address they do not own**, join any conference with a
 * world-readable code, and appear in a professional networking directory as that person.
 *
 * Gating discoverability on verification closes it at its only consequential exit while leaving
 * the one-sitting journey intact. SC-304a states the outcome as a measurable: *a person cannot
 * cause an email address they do not control to appear in any conference's directory.*
 *
 * The recorded consequence runs the other way and later features depend on it: **006 may assume
 * every profile it can read carries a verified address** (FR-325c), because verification is a
 * precondition of being readable at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('verification gates discoverability (FR-359, SC-304a)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  let ada: string
  let impostor: string
  let impostorId: string
  let sharedEventId: string

  const IMPERSONATED = 'someone-elses-address@example.com'

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
    await clearThrottle()

    const eventRows = await getDb().select({ id: events.id, name: events.name }).from(events)
    sharedEventId = eventRows.find((row) => row.name === SEED_EVENTS[0].name)?.id as string

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The attack, exactly as the review described it: sign up under an address you do not own,
    // join with a code anybody can read out of a public repository, and write a profile.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: IMPERSONATED,
        displayName: 'Definitely The Real Person',
        password: 'correct-horse-battery-staple',
      },
    })
    impostor = sessionCookieFrom(created) as string

    await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(impostor) },
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })

    await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(impostor) },
      payload: { company: 'A Company They Do Not Work For', headline: 'Not their words.' },
    })

    const rows = await getDb()
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.email, IMPERSONATED))
    impostorId = rows[0]?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
  })

  const readImpostor = () =>
    app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees/${impostorId}`,
      headers: { cookie: cookieHeader(ada) },
    })

  const setDiscoverable = (discoverable: boolean) =>
    app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      headers: { cookie: cookieHeader(impostor) },
      payload: { discoverable },
    })

  it('the attack succeeds up to the point that matters — they are a real co-attendee', async () => {
    // Not a test of the defence; a test that the *setup* is genuinely the dangerous scenario.
    // If joining or profile-writing had been blocked, everything below would be proving that
    // an account which does not exist cannot be seen.
    const own = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { cookie: cookieHeader(impostor) },
    })

    expect(own.statusCode).toBe(200)
    expect(own.json()).toMatchObject({
      company: 'A Company They Do Not Work For',
      emailVerified: false,
      discoverable: true,
    })
  })

  it('and they still appear to NOBODY (SC-304a)', async () => {
    expect(
      (await readImpostor()).statusCode,
      'A person must not be able to cause an address they do not control to appear in any ' +
        "conference's directory. This is the assertion that says so.",
    ).toBe(404)
  })

  it('turning discoverability ON does not make them visible', async () => {
    const response = await setDiscoverable(true)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      discoverable: true,
      emailVerified: false,
      // FR-362 — the response states EFFECTIVE visibility. Echoing only the flag would tell
      // them the opposite of what is true.
      effectivelyVisible: false,
    })

    expect((await readImpostor()).statusCode).toBe(404)
  })

  it('becomes visible the moment the address is verified — and not before', async () => {
    // The real owner of an address is the only person who can do this, because it requires
    // receiving mail at it. That is the whole of the defence.
    const message = mail.lastTo(IMPERSONATED, 'verification')
    expect(message).toBeDefined()
    const token = new URL(message!.link).searchParams.get('token') as string

    expect((await readImpostor()).statusCode).toBe(404)

    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify', payload: { token } })).statusCode,
    ).toBe(204)

    expect(
      (await readImpostor()).statusCode,
      'FR-359 requires BOTH conditions. With discoverability on and the address now verified, ' +
        'the profile becomes readable — on the next request, with no new sign-in (FR-363).',
    ).toBe(200)
  })

  it('takes effect on the next request with no new sign-in (FR-363)', async () => {
    // The session established before verification keeps working and immediately reflects the
    // new state: nothing caches the flag, and no token carries a copy that could go stale.
    await setDiscoverable(false)
    expect((await readImpostor()).statusCode).toBe(404)

    await setDiscoverable(true)
    expect((await readImpostor()).statusCode).toBe(200)
  })

  it('leaves 006 able to assume every readable profile is verified (FR-325c)', async () => {
    // The recorded consequence, asserted rather than trusted: verification is a precondition of
    // being readable, so a later feature reading a profile never has to check it — and must not
    // rely on verification state for anything beyond that.
    const readable = await readImpostor()
    expect(readable.statusCode).toBe(200)

    const rows = await getDb()
      .select({ verifiedAt: attendees.emailVerifiedAt })
      .from(attendees)
      .where(eq(attendees.id, impostorId))

    expect(rows[0]?.verifiedAt).not.toBeNull()
  })
})
