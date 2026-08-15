import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_EVENTS,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T116 (004) — **the server, exercised directly, against real seeded rows** (FR-389).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * FR-389 is specific about the mechanism: *cross-attendee isolation MUST be asserted by
 * automated tests exercising the server directly with real seeded rows, not by tests of client
 * behaviour.*
 *
 * The reason is that client behaviour is not the boundary. A component test proving Discover
 * renders nobody's profile proves the component; it says nothing about whether the data was
 * sent and merely not drawn. Principle VIII is explicit that client-side filtering must never
 * be relied on, so the assertion has to be made where the refusal happens.
 *
 * "Real seeded rows" matters too. Ada and Grace have genuinely different registrations and
 * genuinely different profiles — a fixture where both had nothing would let every "cannot see
 * it" assertion pass because there was nothing to see.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe("one attendee cannot reach another's data, server-side (FR-389)", () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let sharedEventId: string
  let adasOwnEventId: string
  let gracesOwnEventId: string
  let adasSessionId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    const events = await getDb().execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM events
    `)
    sharedEventId = events.find((row) => row.name === SEED_EVENTS[0].name)?.id as string
    adasOwnEventId = events.find((row) => row.name === SEED_EVENTS[1].name)?.id as string
    gracesOwnEventId = events.find((row) => row.name === SEED_EVENTS[2].name)?.id as string

    const signIn = async (email: string) =>
      sessionCookieFrom(
        await app.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: { email, password: SEED_PASSWORD },
        }),
      ) as string

    ada = await signIn(ADA)
    grace = await signIn(GRACE)

    // Ada authors real per-conference state, so "Grace cannot see it" is about something.
    const sessions = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })
    adasSessionId = (sessions.json() as Array<{ id: string }>)[0]?.id as string

    await app.inject({
      method: 'PUT',
      url: `/events/${sharedEventId}/agenda/saved/${adasSessionId}`,
      headers: { cookie: cookieHeader(ada) },
    })
    await app.inject({
      method: 'PUT',
      url: `/events/${sharedEventId}/agenda/notes/${adasSessionId}`,
      headers: { cookie: cookieHeader(ada) },
      payload: { body: "Ada's private note. Grace must never see this string." },
    })

    const image = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 9, g: 8, b: 7 } },
    })
      .png()
      .toBuffer()
    await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
      payload: { image: image.toString('base64') },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  it('the fixtures genuinely differ — otherwise nothing below proves anything', async () => {
    const adasProfile = (
      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(ada) },
      })
    ).json() as { company: string }
    const gracesProfile = (
      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(grace) },
      })
    ).json() as { company: string }

    expect(adasProfile.company).not.toBe(gracesProfile.company)

    // …and their registrations differ, which is what the conference-scoped assertions rest on.
    const adasEvents = (
      await app.inject({
        method: 'GET',
        url: '/events',
        headers: { cookie: cookieHeader(ada) },
      })
    ).json() as Array<{ id: string }>
    expect(adasEvents.map((event) => event.id)).not.toContain(gracesOwnEventId)
  })

  it("never serves one attendee the other's saved sessions", async () => {
    const graces = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/agenda/saved`,
      headers: { cookie: cookieHeader(grace) },
    })

    // The same conference, the same address, a different attendee. Grace saved nothing.
    expect(graces.statusCode).toBe(200)
    // T074 (014) — the payload became `{ sessions: [{ sessionId, changedSinceViewed }] }`. The
    // claim is unchanged: Grace's saved set for this conference is empty, whatever Ada has saved.
    expect((graces.json() as { sessions: unknown[] }).sessions).toEqual([])
  })

  it("never serves one attendee the other's private notes (FR-208)", async () => {
    const graces = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/agenda/notes`,
      headers: { cookie: cookieHeader(grace) },
    })

    expect(graces.body).not.toContain('Ada&#39;s private note')
    expect(graces.body).not.toContain("Ada's private note")
    expect((graces.json() as { notes: unknown[] }).notes).toEqual([])
  })

  it("never lets one attendee write over the other's note", async () => {
    await app.inject({
      method: 'PUT',
      url: `/events/${sharedEventId}/agenda/notes/${adasSessionId}`,
      headers: { cookie: cookieHeader(grace) },
      payload: { body: 'Grace writing on the same session.' },
    })

    const adas = await app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/agenda/notes`,
      headers: { cookie: cookieHeader(ada) },
    })

    // Both notes exist independently — the composite key is (attendee, session), so writing at
    // the same address writes to a different row.
    expect((adas.json() as { notes: Array<{ body: string }> }).notes[0]?.body).toContain(
      "Ada's private note",
    )
  })

  it("never serves one attendee the other's avatar through the own-avatar route", async () => {
    const graces = await app.inject({
      method: 'GET',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(grace) },
    })

    // Grace uploaded nothing. The address carries no identifier, so there is no way for her to
    // ask for Ada's.
    expect(graces.statusCode).toBe(204)
  })

  it("never serves one attendee the other's export", async () => {
    const graces = (
      await app.inject({
        method: 'GET',
        url: '/profile/export',
        headers: { cookie: cookieHeader(grace) },
      })
    ).json() as Record<string, unknown>

    expect(JSON.stringify(graces)).not.toContain("Ada's private note")
    expect(JSON.stringify(graces)).not.toContain(ADA)
    expect(graces['account']).toMatchObject({ email: GRACE })
  })

  it('never lets one attendee reach a conference the other is registered for', async () => {
    // Grace into Ada's own conference, and Ada into Grace's. Both refused, both identically.
    const graceIntoAdas = await app.inject({
      method: 'GET',
      url: `/events/${adasOwnEventId}/sessions`,
      headers: { cookie: cookieHeader(grace) },
    })
    const adaIntoGraces = await app.inject({
      method: 'GET',
      url: `/events/${gracesOwnEventId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })

    expect(graceIntoAdas.statusCode).toBe(404)
    expect(adaIntoGraces.statusCode).toBe(404)
    expect(graceIntoAdas.body).toEqual(adaIntoGraces.body)
  })

  it("never lets one attendee change the other's discoverability", async () => {
    const before = await getDb().execute<{ discoverable: boolean }>(sql`
      SELECT discoverable FROM attendees WHERE email = ${ADA}
    `)

    await app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      headers: { cookie: cookieHeader(grace) },
      payload: { discoverable: false, attendeeId: ADA, email: ADA },
    })

    const after = await getDb().execute<{ discoverable: boolean }>(sql`
      SELECT discoverable FROM attendees WHERE email = ${ADA}
    `)

    expect(after[0]?.discoverable).toBe(before[0]?.discoverable)
  })

  it("never lets one attendee delete the other's account", async () => {
    const before = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email = ${ADA}
    `)

    await app.inject({
      method: 'DELETE',
      url: `/account?attendeeId=${ADA}&email=${ADA}`,
      headers: { cookie: cookieHeader(grace) },
    })

    const after = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM attendees WHERE email = ${ADA}
    `)

    // Grace deleted *her own* account, which is what the route means. Ada is untouched.
    expect(after[0]?.count).toBe(before[0]?.count)
  })
})
