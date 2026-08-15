import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { sectors } from '../../src/db/schema/vocabulary.js'
import {
  ADA,
  attendees,
  clearThrottle,
  events,
  resetDatabase,
  SEED_PASSWORD,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T166 (014 tranche 2) — **the vocabulary is platform-tier only, and an organizer cannot tell it
 * exists** (FR-1089, SC-1020).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **PROVED BY DIRECT ADDRESS ENTRY, WHICH IS THE ONLY WAY TO PROVE IT** — 013's tier-boundary
 * discipline, applied to the fifth destination. The administrative client renders an organizer
 * no Vocabulary entry (`tier-controls.test.tsx`), and that is a courtesy; this is the control.
 *
 * The refusal is a **404 identical to a route that does not exist**, produced by
 * `requirePlatformOperator`'s single `notFound()` factory. A 403 would confirm both that the
 * surface exists and that the caller is not on it. An organizer's authority reaches only the
 * conferences they are assigned (decision 32), and this is product-wide reference data no
 * conference owns — which is also why these routes carry `requirePlatformOperator` and NOT
 * `requireConferenceAuthority`: that guard reads `:eventId` from the path and cannot express
 * product-wide authority at all (R20).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'vocabulary-fixture@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('the vocabulary tier boundary (T166, FR-1089)', () => {
  let app: FastifyInstance
  let operatorId: string
  let sectorId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(organizerAssignments)
    await db.delete(operators)

    const [operator] = await db
      .insert(operators)
      .values({
        email: OPERATOR_EMAIL,
        displayName: 'Fixture Operator',
        passwordHash: await hashPassword(OPERATOR_PASSWORD),
        credentialIsInitial: false,
      })
      .returning({ id: operators.id })
    operatorId = operator!.id

    const ada = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!
    const event = (await db.select().from(events).limit(1))[0]!
    await db.insert(organizerAssignments).values({
      attendeeId: ada.id,
      eventId: event.id,
      assignedBy: operatorId,
    })

    // A real seeded sector to aim the per-value addresses at, so the organizer's 404 cannot be
    // explained away as "the row genuinely did not exist".
    sectorId = (await db.select().from(sectors).limit(1))[0]!.id
  })

  const sessionFor = async (email: string, password: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email, password },
    })
    expect(response.statusCode, `${email} could not sign in`).toBe(204)
    const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    return `${ADMIN_SESSION_COOKIE}=${cookie?.value}`
  }

  /** Every vocabulary address, of every verb, aimed at a row that really exists. */
  const addresses = () => [
    { method: 'GET' as const, url: '/admin/vocabulary/sectors' },
    { method: 'GET' as const, url: '/admin/vocabulary/subsectors' },
    { method: 'GET' as const, url: '/admin/vocabulary/interests' },
    { method: 'POST' as const, url: '/admin/vocabulary/sectors', payload: { label: 'Probe' } },
    {
      method: 'POST' as const,
      url: '/admin/vocabulary/subsectors',
      payload: { sectorId, label: 'Probe' },
    },
    { method: 'POST' as const, url: '/admin/vocabulary/interests', payload: { label: 'Probe' } },
    {
      method: 'PATCH' as const,
      url: `/admin/vocabulary/sectors/${sectorId}`,
      payload: { label: 'Renamed' },
    },
    { method: 'POST' as const, url: `/admin/vocabulary/sectors/${sectorId}/retirement` },
    { method: 'DELETE' as const, url: `/admin/vocabulary/sectors/${sectorId}/retirement` },
    { method: 'DELETE' as const, url: `/admin/vocabulary/sectors/${sectorId}` },
  ]

  it('refuses a conference organizer on every vocabulary address, with 404 (SC-1020)', async () => {
    const organizer = await sessionFor(ADA, SEED_PASSWORD)

    for (const address of addresses()) {
      const response = await app.inject({ ...address, headers: { cookie: organizer } })
      expect(
        response.statusCode,
        `${address.method} ${address.url} did not refuse a conference organizer with 404`,
      ).toBe(404)
      // Nothing in the body may hint that a vocabulary surface exists behind the refusal.
      expect(response.body).not.toMatch(/vocabular|sector|interest|platform/i)
    }

    // And nothing an organizer probed changed anything: the seeded sector is untouched.
    const untouched = (await getDb().select().from(sectors).where(eq(sectors.id, sectorId)))[0]!
    expect(untouched.retiredAt).toBeNull()
    expect(untouched.label).not.toBe('Renamed')
  })

  it('lets a platform operator read the vocabulary, seeded with exactly the four sectors (FR-1086)', async () => {
    const platform = await sessionFor(OPERATOR_EMAIL, OPERATOR_PASSWORD)

    const response = await app.inject({
      method: 'GET',
      url: '/admin/vocabulary/sectors',
      headers: { cookie: platform },
    })
    expect(response.statusCode).toBe(200)

    const listed = response.json() as { label: string; retiredAt: string | null }[]
    expect(listed.map((sector) => sector.label).sort()).toEqual([
      'Agro',
      'Comercio',
      'Industria',
      'Servicios',
    ])

    // The subsector and interest lists ship EMPTY and authorable (FR-1086): the client's lists
    // do not exist yet, and the product must be complete without them.
    for (const url of ['/admin/vocabulary/subsectors', '/admin/vocabulary/interests']) {
      const empty = await app.inject({ method: 'GET', url, headers: { cookie: platform } })
      expect(empty.statusCode).toBe(200)
      expect(empty.json()).toEqual([])
    }
  })

  it('lets a platform operator author a value that becomes choosable with no deployment (SC-1012)', async () => {
    const platform = await sessionFor(OPERATOR_EMAIL, OPERATOR_PASSWORD)

    const created = await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/interests',
      headers: { cookie: platform },
      payload: { label: 'Fintech' },
    })
    expect(created.statusCode).toBe(201)

    // Choosable immediately, on the attendee-side read (FR-1094b: choosable from the moment it
    // exists — there is no unpublished vocabulary value).
    const signedIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const cookie = signedIn.cookies.find((entry) => entry.name === 'mynet_session')
    const choosable = await app.inject({
      method: 'GET',
      url: '/vocabulary',
      headers: { cookie: `mynet_session=${cookie?.value}` },
    })
    expect(choosable.statusCode).toBe(200)
    expect(
      (choosable.json() as { interests: { label: string }[] }).interests.map((i) => i.label),
    ).toContain('Fintech')
  })
})
