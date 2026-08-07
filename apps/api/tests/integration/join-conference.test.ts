import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_EVENTS,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T039 (004) — `POST /events/join` (FR-310, FR-312, FR-313, FR-315, FR-317).
 */
describe('joining a conference by code', () => {
  let app: FastifyInstance
  let token: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()

    // A brand-new account registered for nothing, which is what US1 actually starts from.
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `joiner-${Math.random().toString(36).slice(2)}@example.com`,
        displayName: 'New Joiner',
        password: 'correct-horse-battery-staple',
      },
    })
    token = sessionCookieFrom(created) as string
  })

  const join = (joinCode: string) =>
    app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: { joinCode },
    })

  it('registers the attendee and returns the conference (FR-310)', async () => {
    const response = await join(SEED_EVENTS[0].joinCode)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      event: { name: SEED_EVENTS[0].name, timezone: SEED_EVENTS[0].timezone },
      alreadyRegistered: false,
    })
  })

  it('makes the first joined conference the active one (FR-315)', async () => {
    await join(SEED_EVENTS[0].joinCode)

    const active = await app.inject({
      method: 'GET',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(token) },
    })

    expect(active.statusCode).toBe(200)
    expect(
      (active.json() as { name: string }).name,
      'FR-315 is satisfied by DERIVATION, not by a recorded choice — an attendee whose only ' +
        'registration is this one resolves to it. Recording an explicit selection instead would ' +
        'pin them permanently (FR-104), so joining your first conference would silently become ' +
        'a choice they never made.',
    ).toBe(SEED_EVENTS[0].name)
  })

  it('does not pin the attendee to their first conference', async () => {
    // The other half of the note above, and the one that would catch the mistake: if joining
    // wrote an `active_event_selections` row, that row would win over every later derivation
    // for the rest of the account's life.
    await join(SEED_EVENTS[0].joinCode)

    const rows = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM active_event_selections
    `)
    expect(rows[0]?.count).toBe('0')
  })

  it('is idempotent — entering the same code twice is not an error (FR-312)', async () => {
    await join(SEED_EVENTS[0].joinCode)
    const second = await join(SEED_EVENTS[0].joinCode)

    expect(second.statusCode).toBe(200)
    expect(second.json()).toMatchObject({ alreadyRegistered: true })
    expect((second.json() as { event: { name: string } }).event.name).toBe(SEED_EVENTS[0].name)
  })

  it('creates exactly one registration however many times the code is entered (FR-312)', async () => {
    await join(SEED_EVENTS[0].joinCode)
    await join(SEED_EVENTS[0].joinCode)
    await join(SEED_EVENTS[0].joinCode)

    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(token) },
    })

    expect(events.json() as unknown[]).toHaveLength(1)
  })

  it('accepts a code with stray case and whitespace (research D7)', async () => {
    const response = await join(`  ${SEED_EVENTS[1].joinCode.toLowerCase()}  `)

    expect(
      response.statusCode,
      'A code is read off a badge or a slide. Telling somebody their correctly-transcribed code ' +
        'is wrong because of a trailing space would be the product being pedantic at their expense.',
    ).toBe(200)
  })

  it('refuses an unrecognised code in one wording, whatever the cause (FR-313)', async () => {
    const nonsense = await join('NOT-A-REAL-CODE')
    const empty = await join('   ')

    expect(nonsense.statusCode).toBe(404)
    expect(empty.statusCode).toBe(404)

    // Identical bodies, from one factory. Two call sites returning "the same" 404 would drift.
    expect(nonsense.json()).toEqual(empty.json())
    expect(nonsense.json()).toMatchObject({ code: 'not_found' })
  })

  it('makes a conference with no usable code unjoinable, cleanly (FR-317)', async () => {
    // The state a database migrated but not re-seeded is in: every code is the migration's
    // random placeholder. It must fail as an unrecognised code rather than admitting everyone
    // or raising.
    await getDb().execute(sql`
      UPDATE events SET join_code = gen_random_uuid()::text WHERE name = ${SEED_EVENTS[2].name}
    `)

    const response = await join(SEED_EVENTS[2].joinCode)
    expect(response.statusCode).toBe(404)

    // Restore, so this file leaves the fixture as it found it.
    await getDb().execute(sql`
      UPDATE events SET join_code = ${SEED_EVENTS[2].joinCode} WHERE name = ${SEED_EVENTS[2].name}
    `)
  })

  it('refuses an unauthenticated caller (FR-386)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/events/join',
      payload: { joinCode: SEED_EVENTS[0].joinCode },
    })

    expect(response.statusCode).toBe(401)
  })

  it('takes no attendee identifier — the session decides who joins (FR-385)', async () => {
    // Smuggling an identifier must change nothing: `additionalProperties: false` strips it, and
    // the handler reads `request.attendee` regardless.
    const response = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(token) },
      payload: {
        joinCode: SEED_EVENTS[0].joinCode,
        attendeeId: '00000000-0000-4000-8000-000000000000',
      },
    })

    expect(response.statusCode).toBe(200)

    const registrations = await getDb().execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM registrations
      WHERE attendee_id = '00000000-0000-4000-8000-000000000000'
    `)
    expect(registrations[0]?.count).toBe('0')
  })
})
