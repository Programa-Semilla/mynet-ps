import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
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
 * T030 (002) — the conference programme over HTTP (FR-137–FR-140, SC-107).
 *
 * Against real seeded rows, because the properties being asserted — chronological order, an
 * empty programme answering `[]`, a session with no speaker rendering as an empty array — are
 * properties of the query and the schema together, not of either alone.
 */
describe('session catalog', () => {
  let app: FastifyInstance
  let adaCookie: string
  let summitId: string
  let horizonsId: string

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

  const sessionsFor = async (eventId: string, cookie: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    return response
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const token = sessionCookieFrom(signIn)
    if (!token) throw new Error('Sign-in failed; the test cannot proceed.')
    adaCookie = token

    summitId = await eventIdByName('Product & Design Summit')
    horizonsId = await eventIdByName('Frontend Horizons')
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('returns sessions in start order, with track, room and speakers (FR-137)', async () => {
    const response = await sessionsFor(summitId, adaCookie)
    expect(response.statusCode).toBe(200)

    const sessions = response.json() as Array<{
      title: string
      startsAt: string
      track: { name: string; colorToken: string }
      room: { name: string }
      speakers: Array<{ name: string }>
    }>

    expect(sessions.length).toBeGreaterThan(0)

    const starts = sessions.map((s) => Date.parse(s.startsAt))
    expect(starts, 'sessions must arrive chronological').toEqual([...starts].sort((a, b) => a - b))

    const first = sessions[0]
    expect(first?.track.name).toBeTruthy()
    expect(first?.room.name).toBeTruthy()
  })

  it('sends a track COLOUR TOKEN NAME, never a colour value (FR-136)', async () => {
    const response = await sessionsFor(summitId, adaCookie)
    const sessions = response.json() as Array<{ track: { colorToken: string } }>

    for (const session of sessions) {
      // A hex literal here would mean the palette had escaped into the database, which
      // research D7 exists to prevent.
      expect(session.track.colorToken).not.toMatch(/^#|rgb|hsl/i)
      expect(session.track.colorToken).toMatch(/^track-/)
    }
  })

  it('gives a session with no speaker an EMPTY ARRAY, never null (FR-138)', async () => {
    const response = await sessionsFor(summitId, adaCookie)
    const sessions = response.json() as Array<{ title: string; speakers: unknown }>

    const withoutSpeakers = sessions.filter(
      (s) => Array.isArray(s.speakers) && s.speakers.length === 0,
    )

    // The seed carries such a session on purpose; without it this branch is never exercised.
    expect(withoutSpeakers.length).toBeGreaterThan(0)
    for (const session of sessions) {
      expect(session.speakers, `${session.title} must not send null speakers`).toBeInstanceOf(Array)
    }
  })

  it('returns [] for a conference with no programme, not an error (FR-139)', async () => {
    // Systems & Scale is Grace's, so sign in as Grace to reach it — the empty-programme fixture
    // and the isolation boundary are deliberately the same event.
    await clearThrottle()
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'grace@example.com', password: SEED_PASSWORD },
    })
    const graceCookie = sessionCookieFrom(signIn)
    const systemsId = await eventIdByName('Systems & Scale')

    const response = await sessionsFor(systemsId, graceCookie ?? '')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('keeps the two seeded programmes fully disjoint, with differing counts (SC-107)', async () => {
    const summit = (await sessionsFor(summitId, adaCookie)).json() as Array<{
      title: string
      track: { name: string }
      room: { name: string }
      speakers: Array<{ name: string }>
    }>
    const horizons = (await sessionsFor(horizonsId, adaCookie)).json() as typeof summit

    // Differing counts, so "which conference am I looking at" is answerable at a glance.
    expect(summit.length).not.toBe(horizons.length)

    const namesOf = (list: typeof summit): string[] => [
      ...list.map((s) => s.title),
      ...list.map((s) => s.track.name),
      ...list.map((s) => s.room.name),
      ...list.flatMap((s) => s.speakers.map((sp) => sp.name)),
    ]

    const shared = namesOf(summit).filter((name) => namesOf(horizons).includes(name))
    expect(
      shared,
      'The two programmes share a name. SC-107 requires them disjoint, because that is what ' +
        'makes "no surface still shows the previous conference" checkable after a switch.',
    ).toEqual([])
  })

  it('never joins a speaker to a session from another conference', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Asserted over the TABLE, because the response cannot show a violation.**
    //
    // This previously compared the two endpoints' speaker ids and could not fail:
    // `listSessions` already filters speakers with `WHERE speakers.event_id = scope.eventId`,
    // so a genuinely cross-event `session_speakers` row is invisible to both responses. The
    // test verified the read filter while its comment claimed it verified the integrity rule.
    //
    // data-model.md records that this rule is not expressible as a foreign key, which is
    // exactly why it needs a direct assertion rather than an inferred one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const violations = await getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM session_speakers ss
      JOIN sessions s ON s.id = ss.session_id
      JOIN speakers p ON p.id = ss.speaker_id
      WHERE s.event_id <> p.event_id
    `)

    expect(
      violations[0]?.n,
      'A session_speakers row joins a session and a speaker from different conferences. No ' +
        'foreign key can express this rule (data-model.md), so this assertion is what holds it.',
    ).toBe(0)

    // And the join table is not empty, or the count above would be trivially zero.
    const joins = await getDb().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM session_speakers`,
    )
    expect(joins[0]?.n).toBeGreaterThan(0)
  })

  it('returns tracks with names and token names', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/tracks`,
      headers: { cookie: cookieHeader(adaCookie) },
    })

    expect(response.statusCode).toBe(200)
    const tracks = response.json() as Array<{ name: string; colorToken: string }>
    expect(tracks.length).toBeGreaterThan(0)
    for (const track of tracks) {
      expect(track.name).toBeTruthy()
      expect(track.colorToken).not.toMatch(/^#|rgb|hsl/i)
    }
  })

  it('sends absolute instants, with no relative wording (FR-124)', async () => {
    const sessions = (await sessionsFor(summitId, adaCookie)).json() as Array<{
      startsAt: string
      endsAt: string
    }>

    for (const session of sessions) {
      expect(session.startsAt).toMatch(/Z$|[+-]\d{2}:\d{2}$/)
      expect(Date.parse(session.endsAt)).toBeGreaterThan(Date.parse(session.startsAt))
    }
  })

  /**
   * T193 (014 tranche 2) — the attendee read carries `kind` and `accessLink`, and a virtual
   * session arrives with a NULL room rather than being dropped or placeholdered
   * (FR-1060, FR-1052, SC-1022).
   *
   * **Capacity is asserted ABSENT, deliberately** (FR-1070b): the programme is a cached read on
   * the client, and a cached seat count reads as a promise of a place. The live figure has its
   * own uncached route.
   */
  it('carries kind and accessLink, keeps capacity off the cached programme, and serves a virtual session with a null room (T193)', async () => {
    // Insert a virtual optional session directly — the seed carries none, and the property
    // under test is the READ's projection, not the authoring path.
    const db = getDb()
    const [track] = await db.execute<{ id: string }>(
      sql`SELECT id FROM tracks WHERE event_id = ${summitId} LIMIT 1`,
    )
    if (!track) throw new Error('The seeded summit has no track; the fixture cannot be built.')

    await db.execute(sql`
      INSERT INTO sessions
        (event_id, track_id, room_id, title, summary, starts_at, ends_at,
         kind, capacity, enrolment_closing_offset_hours, access_link)
      VALUES
        (${summitId}, ${track.id}, NULL, 'Remote Hands-on', NULL,
         now() + interval '1 day', now() + interval '25 hours',
         'optional', 5, 0, 'https://example.com/join-remote')
    `)

    const sessions = (await sessionsFor(summitId, adaCookie)).json() as Array<{
      title: string
      kind: string
      accessLink: string | null
      room: { id: string; name: string } | null
      capacity?: unknown
    }>

    // Every pre-existing session is mandatory and in person: the defaults every session had
    // before the column existed, now explicit on the wire.
    const seeded = sessions.filter((s) => s.title !== 'Remote Hands-on')
    expect(seeded.length).toBeGreaterThan(0)
    for (const session of seeded) {
      expect(session.kind).toBe('mandatory')
      expect(session.accessLink).toBeNull()
      expect(session.room).not.toBeNull()
    }

    // The virtual optional session is PRESENT — a left join, because an inner join would
    // silently drop a roomless session from the programme — with its link and no room at all.
    const virtual = sessions.find((s) => s.title === 'Remote Hands-on')
    expect(
      virtual,
      'the virtual session vanished from the programme (inner-join regression)',
    ).toBeDefined()
    expect(virtual?.kind).toBe('optional')
    expect(virtual?.accessLink).toBe('https://example.com/join-remote')
    expect(virtual?.room, 'a virtual session carries no room, and never a placeholder').toBeNull()

    // FR-1070b — no session on the cached programme carries a seat count, of either kind.
    for (const session of sessions) {
      expect(
        'capacity' in session,
        'capacity reached the cached programme read. A stale seat count reads as a promise ' +
          'of a place; the live figure is served by the places route alone (FR-1070b).',
      ).toBe(false)
    }
  })
})
