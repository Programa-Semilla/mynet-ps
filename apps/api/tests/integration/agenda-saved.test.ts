import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions } from '../../src/db/schema/agenda.js'
import { events } from '../../src/db/schema/events.js'
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
 * T019 (005) — the saved-session routes over HTTP (FR-184–FR-188, FR-196).
 *
 * Against real seeded rows, because the properties asserted here — that saving twice creates
 * one row, that the set is per conference, that an empty set is a valid answer rather than a
 * 404 — are properties of the route, the query and the schema **together**. A mocked database
 * would agree with whatever the test expected.
 */
describe('saved sessions', () => {
  let app: FastifyInstance
  let adaCookie: string
  let summitId: string
  let horizonsId: string

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

  const signIn = async (email: string): Promise<string> => {
    await clearThrottle()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(response)
    if (!token) throw new Error(`Sign-in failed for ${email}; the test cannot proceed.`)
    return token
  }

  const saved = (eventId: string, cookie: string) =>
    app.inject({
      method: 'GET',
      url: `/events/${eventId}/agenda/saved`,
      headers: { cookie: cookieHeader(cookie) },
    })

  const save = (eventId: string, sessionId: string, cookie: string) =>
    app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/saved/${sessionId}`,
      headers: { cookie: cookieHeader(cookie) },
    })

  const unsave = (eventId: string, sessionId: string, cookie: string) =>
    app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/agenda/saved/${sessionId}`,
      headers: { cookie: cookieHeader(cookie) },
    })

  const sessionIdsOf = async (eventId: string, cookie: string): Promise<string[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    return (response.json() as Array<{ id: string }>).map((session) => session.id)
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    summitId = await eventIdByName('Product & Design Summit')
    horizonsId = await eventIdByName('Frontend Horizons')
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('starts empty, and an empty set is a valid answer rather than a 404 (FR-195)', async () => {
    // Nothing is seeded here on purpose: saved sessions are attendee-authored, and seeding them
    // would fabricate personal data (data-model.md). So the empty state is the first state.
    const response = await saved(summitId, adaCookie)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ sessionIds: [] })
  })

  it('saves a session and reads it back as an identifier (FR-184, FR-188)', async () => {
    const [first] = await sessionIdsOf(summitId, adaCookie)
    if (!first) throw new Error('The seeded summit programme is empty.')

    expect((await save(summitId, first, adaCookie)).statusCode).toBe(204)
    expect((await saved(summitId, adaCookie)).json()).toEqual({ sessionIds: [first] })
  })

  it('SAVING TWICE CREATES ONE ROW, not two (FR-187)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The requirement is idempotency *from the attendee's point of view*, which the response
    // alone cannot demonstrate: two 204s look identical whether one row or two were written.
    // So this counts rows in the table, which is where the composite primary key does the work.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const ids = await sessionIdsOf(summitId, adaCookie)
    const target = ids[1]
    if (!target) throw new Error('The seeded summit programme has fewer than two sessions.')

    expect((await save(summitId, target, adaCookie)).statusCode).toBe(204)
    expect((await save(summitId, target, adaCookie)).statusCode).toBe(204)

    const rows = await getDb()
      .select()
      .from(savedSessions)
      .where(eq(savedSessions.sessionId, target))

    expect(
      rows,
      'Saving the same session twice must not create a second record. The composite primary ' +
        'key is what enforces that, rather than handler logic that could be forgotten.',
    ).toHaveLength(1)
  })

  it('unsaves, and unsaving something not saved still succeeds', async () => {
    const ids = await sessionIdsOf(summitId, adaCookie)
    const target = ids[2]
    if (!target) throw new Error('The seeded summit programme has fewer than three sessions.')

    // Never saved: still a 204. The caller does not need to know which, and telling them would
    // leak nothing useful (research D6).
    expect((await unsave(summitId, target, adaCookie)).statusCode).toBe(204)

    await save(summitId, target, adaCookie)
    expect((await unsave(summitId, target, adaCookie)).statusCode).toBe(204)
    expect(
      ((await saved(summitId, adaCookie)).json() as { sessionIds: string[] }).sessionIds,
    ).not.toContain(target)
  })

  it('keeps each conference its own set (FR-185, US1 scenario 5)', async () => {
    const summitIds = await sessionIdsOf(summitId, adaCookie)
    const horizonsIds = await sessionIdsOf(horizonsId, adaCookie)

    const summitTarget = summitIds[0]
    const horizonsTarget = horizonsIds[0]
    if (!summitTarget || !horizonsTarget) throw new Error('Both programmes must be non-empty.')

    await save(horizonsId, horizonsTarget, adaCookie)

    const summitSaved = ((await saved(summitId, adaCookie)).json() as { sessionIds: string[] })
      .sessionIds
    const horizonsSaved = ((await saved(horizonsId, adaCookie)).json() as { sessionIds: string[] })
      .sessionIds

    expect(horizonsSaved).toContain(horizonsTarget)
    expect(
      summitSaved,
      'A save made at one conference is meaningless at another. The set must swap on switch.',
    ).not.toContain(horizonsTarget)
    expect(summitSaved).toContain(summitTarget)
  })

  it('refuses a session that belongs to ANOTHER conference, disclosing nothing (FR-231)', async () => {
    const [horizonsSession] = await sessionIdsOf(horizonsId, adaCookie)
    if (!horizonsSession) throw new Error('The seeded horizons programme is empty.')

    // Ada is registered for both, so this is not an access refusal — it is a session that is
    // simply not part of the conference named in the path.
    const response = await save(summitId, horizonsSession, adaCookie)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'not_found', message: 'That is not available.' })
  })

  it('refuses a nonexistent and a MALFORMED identifier identically (FR-231)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A `format: uuid` on the route would answer the malformed case with a 400 and a
    // validation body, separating "not a uuid" from "not in this conference". Smaller than an
    // existence leak, but still a difference an attacker can read — so the shape is checked in
    // the query layer, where it produces the one uniform refusal.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const nonexistent = await save(summitId, '00000000-0000-4000-8000-000000000000', adaCookie)
    const malformed = await save(summitId, 'not-a-uuid', adaCookie)

    expect(nonexistent.statusCode).toBe(404)
    expect(malformed.statusCode).toBe(404)
    expect(malformed.json()).toEqual(nonexistent.json())
  })

  it('refuses every saved-session route without a sign-in session', async () => {
    const [first] = await sessionIdsOf(summitId, adaCookie)
    if (!first) throw new Error('The seeded summit programme is empty.')

    for (const request of [
      { method: 'GET' as const, url: `/events/${summitId}/agenda/saved` },
      { method: 'PUT' as const, url: `/events/${summitId}/agenda/saved/${first}` },
      { method: 'DELETE' as const, url: `/events/${summitId}/agenda/saved/${first}` },
    ]) {
      const response = await app.inject(request)
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401)
    }
  })
})
