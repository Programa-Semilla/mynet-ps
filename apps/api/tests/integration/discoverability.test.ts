import { eq, sql } from 'drizzle-orm'
import type { RouteOptions } from 'fastify'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { events } from '../../src/db/schema/events.js'
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
 * T089 (004) — the discoverability setting (FR-360, FR-362, FR-363).
 */
describe('the discoverability setting', () => {
  let app: FastifyInstance
  let ada: string
  let grace: string
  let adaId: string
  let sharedEventId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    const rows = await getDb().select({ id: attendees.id, email: attendees.email }).from(attendees)
    adaId = rows.find((row) => row.email === ADA)?.id as string

    const eventRows = await getDb().select({ id: events.id, name: events.name }).from(events)
    sharedEventId = eventRows.find((row) => row.name === SEED_EVENTS[0].name)?.id as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    await getDb()
      .update(attendees)
      .set({ discoverable: true })
      .where(sql`true`)
    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
    grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: GRACE, password: SEED_PASSWORD },
      }),
    ) as string
  })

  const set = (discoverable: boolean, token = ada) =>
    app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      headers: { cookie: cookieHeader(token) },
      payload: { discoverable },
    })

  const readAdaAsGrace = () =>
    app.inject({
      method: 'GET',
      url: `/events/${sharedEventId}/attendees/${adaId}`,
      headers: { cookie: cookieHeader(grace) },
    })

  it('reports EFFECTIVE visibility, not the flag that was written (FR-362)', async () => {
    const response = await set(true)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      discoverable: true,
      emailVerified: true,
      effectivelyVisible: true,
    })
  })

  it('reports effectivelyVisible false for a verified-off attendee, with the flag on', async () => {
    await getDb().update(attendees).set({ emailVerifiedAt: null }).where(eq(attendees.id, adaId))

    const response = await set(true)

    expect(
      response.json(),
      'A response echoing only the setting would tell an unverified attendee the exact opposite ' +
        'of what is true, which is the one thing FR-362 asks this surface not to do.',
    ).toEqual({ discoverable: true, emailVerified: false, effectivelyVisible: false })

    await getDb()
      .update(attendees)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(attendees.id, adaId))
  })

  it('takes effect on the NEXT request, with no new sign-in (FR-363)', async () => {
    // The same session, before and after. Nothing caches the flag and no token carries a copy,
    // so there is nothing that could go stale.
    expect((await readAdaAsGrace()).statusCode).toBe(200)

    await set(false)
    expect((await readAdaAsGrace()).statusCode).toBe(404)

    await set(true)
    expect((await readAdaAsGrace()).statusCode).toBe(200)
  })

  it("leaves the owner's own view completely unchanged (FR-340)", async () => {
    const before = (
      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(ada) },
      })
    ).json() as Record<string, unknown>

    await set(false)

    const after = (
      await app.inject({
        method: 'GET',
        url: '/profile',
        headers: { cookie: cookieHeader(ada) },
      })
    ).json() as Record<string, unknown>

    // Everything except the setting itself is identical: hiding from others must not hide
    // anything from yourself.
    expect({ ...after, discoverable: true }).toEqual({ ...before, discoverable: true })
    expect(after['discoverable']).toBe(false)
  })

  it('is persisted, not merely reported', async () => {
    await set(false)

    const rows = await getDb()
      .select({ discoverable: attendees.discoverable })
      .from(attendees)
      .where(eq(attendees.id, adaId))

    expect(rows[0]?.discoverable).toBe(false)
  })

  it('is idempotent — setting it to what it already is changes nothing', async () => {
    const first = await set(false)
    const second = await set(false)

    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())
  })

  it('is ALL-OR-NOTHING — no per-field visibility exists anywhere (FR-360)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Per-field visibility was considered in brainstorm #04 and rejected; FR-360 requires a
    // recorded decision to reintroduce it. The obvious way it would arrive is not a design
    // document but a second property on this body — `visibleFields`, or `hideCompany` — added
    // because somebody asked for it in a review.
    //
    // `additionalProperties: false` strips it, and this asserts that the setting genuinely has
    // exactly one dimension: a request naming a field must not change what is returned.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const smuggled = await app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      headers: { cookie: cookieHeader(ada) },
      payload: { discoverable: true, hideCompany: true, visibleFields: ['displayName'] },
    })

    expect(smuggled.statusCode).toBe(200)
    expect(smuggled.json()).toEqual({
      discoverable: true,
      emailVerified: true,
      effectivelyVisible: true,
    })

    // …and a co-attendee still sees every field, because there is no per-field rule to apply.
    const seen = (await readAdaAsGrace()).json() as Record<string, unknown>
    expect(seen['company']).toBe('Analytical Engines')
  })

  it('exposes no route that could set visibility for one field or one conference', async () => {
    // The structural half. Per-conference discoverability is per-field visibility's cousin and
    // was rejected on the same grounds (Event scoping declaration) — a single cross-event
    // setting, deliberately.
    const routes: RouteOptions[] = []
    const audited = await buildApp({ onRoute: (route) => routes.push(route) })
    await audited.close()

    const offending = routes
      .filter((route) => /discoverab|visibility/i.test(route.url))
      .map((route) => route.url)
      .filter((url) => url !== '/profile/discoverability')

    expect(
      offending,
      'One setting, cross-event, all-or-nothing. Another address here would be per-field or ' +
        'per-conference visibility arriving without the recorded decision FR-360 requires.',
    ).toEqual([])
  })

  it('refuses an unauthenticated caller (FR-386)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      payload: { discoverable: false },
    })

    expect(response.statusCode).toBe(401)
  })

  it("changes only the caller's own setting (FR-385)", async () => {
    await set(false, grace)

    const rows = await getDb()
      .select({ email: attendees.email, discoverable: attendees.discoverable })
      .from(attendees)
    const adaRow = rows.find((row) => row.email === ADA)
    const graceRow = rows.find((row) => row.email === GRACE)

    expect(graceRow?.discoverable).toBe(false)
    expect(adaRow?.discoverable, 'Grace hiding must not hide Ada').toBe(true)
  })
})
