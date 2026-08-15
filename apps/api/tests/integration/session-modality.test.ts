import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  createConference,
  platformSession,
  sessionBody,
  type Conference,
} from './authoring-fixtures.js'
import { ADA, attendees, clearThrottle, GRACE, setupTestApp, teardown } from './helpers.js'

/**
 * T181, T183, T184, T185 (014 tranche 2, US8) — **modality decides what a session carries, the
 * access link is `https:` or nothing, and clearing a link strands nobody** (FR-1050, FR-1050a,
 * FR-1050b, FR-1053, FR-1058a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-1050a IS A WRITE-PATH RULE OF NECESSITY, AND IT IS TESTED AS ONE** (research R19).
 *
 * A CHECK constraint cannot reference `events.modality`, so the modality's requiring and
 * forbidding halves exist only in `validateModalityFields` — there is no second layer to fall
 * back on, which is why every combination is asserted through the route AND the one half a
 * column CAN hold (`sessions_room_or_link`, `sessions_access_link_https`) is driven once with
 * the route bypassed, 009's two-layer discipline. The bypassed drive of the modality rule
 * itself asserts the OPPOSITE: the database accepts what the write path refuses, which is the
 * recorded reason the write path may never be weakened to "the constraint will catch it".
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('session modality and access links (T181–T185)', () => {
  let app: FastifyInstance
  let cookie: string
  let inPerson: Conference
  let virtual: Conference
  let hybrid: Conference

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    // The platform operator authors in every conference (FR-1002), so one principal covers all
    // three modalities without three assignments.
    await buildAuthoringFixture(ADA, app)
    inPerson = await createConference('In Person', { modality: 'in-person' })
    virtual = await createConference('Virtual', { modality: 'virtual' })
    hybrid = await createConference('Hybrid', { modality: 'hybrid' })
    cookie = await platformSession(app)
  })

  const LINK = 'https://meet.example.invalid/session'

  const post = (conference: Conference, overrides: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/admin/conferences/${conference.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(conference, { roomId: null, accessLink: null, ...overrides }),
    })

  /**
   * T181 — **every modality/field combination, unambiguously permitted or forbidden**
   * (FR-1050, FR-1050a). Twelve cells, no gaps: a table with a hole is a combination whose
   * behaviour somebody will discover in production.
   */
  it.each([
    // in-person: a room and ONLY a room.
    ['in-person', { roomId: 'room' }, 201, null],
    ['in-person', { accessLink: LINK }, 400, 'modality_forbids_link'],
    ['in-person', { roomId: 'room', accessLink: LINK }, 400, 'modality_forbids_link'],
    ['in-person', {}, 400, 'session_needs_room_or_link'],
    // virtual: a link and ONLY a link.
    ['virtual', { accessLink: LINK }, 201, null],
    ['virtual', { roomId: 'room' }, 400, 'modality_forbids_room'],
    ['virtual', { roomId: 'room', accessLink: LINK }, 400, 'modality_forbids_room'],
    ['virtual', {}, 400, 'session_needs_room_or_link'],
    // hybrid: at least one, either one, or both — and NEVER required to be both.
    ['hybrid', { roomId: 'room' }, 201, null],
    ['hybrid', { accessLink: LINK }, 201, null],
    ['hybrid', { roomId: 'room', accessLink: LINK }, 201, null],
    ['hybrid', {}, 400, 'session_needs_room_or_link'],
  ] as const)('a %s conference: %o answers %d (%s)', async (modality, fields, status, code) => {
    const conference =
      modality === 'in-person' ? inPerson : modality === 'virtual' ? virtual : hybrid
    const overrides: Record<string, unknown> = { ...fields }
    if (overrides.roomId === 'room') overrides.roomId = conference.roomId

    const response = await post(conference, overrides)
    expect(response.statusCode, response.body).toBe(status)
    if (code) expect((response.json() as { code: string }).code).toBe(code)
  })

  /**
   * T183 — **the modality refusals are MUTUALLY different, pairwise, codes AND messages**
   * (FR-1050b, FR-1069a's shape). This feature's recorded lesson twice over: a test that each
   * refusal maps to *a* message passes while six render as two — the mutual-difference
   * assertion is the only one that catches it.
   */
  it('produces pairwise-different refusals — codes AND messages (FR-1050b)', async () => {
    const refusals = [
      await post(inPerson, {}),
      await post(inPerson, { accessLink: LINK }),
      await post(virtual, { roomId: virtual.roomId }),
      await post(virtual, { accessLink: 'not-a-url' }),
    ]

    for (const response of refusals) expect(response.statusCode, response.body).toBe(400)

    const bodies = refusals.map((one) => one.json() as { code: string; message: string })
    expect(new Set(bodies.map((one) => one.code)).size, 'two refusals share a code').toBe(4)
    expect(new Set(bodies.map((one) => one.message)).size, 'two refusals share a message').toBe(4)
    for (const body of bodies) expect(body.message.length).toBeGreaterThan(20)
  })

  /**
   * T184 — **`https:` alone; `javascript:` and `data:` refused BY NAME** (FR-1053). The two
   * named schemes are the two the check exists for: either one rendered as a joining link is
   * execution authored by a promoted attendee on every registered attendee's device.
   */
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['http://meet.example.invalid/plain'],
    ['not a url at all'],
    ['//scheme-relative.example.invalid/x'],
  ])('refuses %s with access_link_invalid, and never fetches it', async (link) => {
    const response = await post(hybrid, { accessLink: link })
    expect(response.statusCode, response.body).toBe(400)
    expect((response.json() as { code: string }).code).toBe('access_link_invalid')
  })

  it('accepts a well-formed https link and returns it on the row', async () => {
    const response = await post(virtual, { accessLink: LINK })
    expect(response.statusCode, response.body).toBe(201)
    expect((response.json() as { accessLink: string }).accessLink).toBe(LINK)
  })

  /**
   * The column CHECKs, driven once with the route bypassed (009's btrim discipline): the two
   * layers are asserted separately because the weaker one is the last line of defence when the
   * other is bypassed — and the day they disagree is the day this fails.
   */
  it('drives sessions_room_or_link and sessions_access_link_https at the COLUMN, route bypassed', async () => {
    const db = getDb()

    const bare = (extra: string) =>
      db.execute(
        sql`
          INSERT INTO sessions (event_id, title, starts_at, ends_at, track_id, kind,
                                room_id, access_link)
          VALUES (${hybrid.eventId}::uuid, 'Bypassed', '2027-03-01T09:00:00Z'::timestamptz,
                  '2027-03-01T10:00:00Z'::timestamptz, ${hybrid.trackId}::uuid, 'mandatory',
                  ${sql.raw(extra)})
        `,
      )

    // Drizzle wraps the PostgreSQL error ("Failed query: …") and carries the violation as the
    // cause, so the constraint name is asserted on the whole chain rather than the top message.
    const violation = async (statement: Promise<unknown>): Promise<string> =>
      statement.then(
        () => 'the insert was ACCEPTED — the CHECK is gone',
        (error: unknown) => `${String(error)} ${String((error as Error).cause ?? '')}`,
      )

    expect(await violation(bare('NULL, NULL')), 'neither a room nor a link').toMatch(
      /sessions_room_or_link/,
    )
    expect(
      await violation(bare(`NULL, 'http://plain.example.invalid/x'`)),
      'a non-https link',
    ).toMatch(/sessions_access_link_https/)
  })

  it('documents that the DATABASE accepts what only the write path refuses (FR-1050a is write-path)', async () => {
    // A link on an in-person conference's session, inserted with the route bypassed: the
    // column layer CANNOT hold this rule (a CHECK cannot reference `events.modality`), so this
    // insert SUCCEEDS — which is exactly why `validateModalityFields` may never be weakened on
    // the ground that "the constraint will catch it". Nothing will.
    const db = getDb()
    const rows = await db.execute<{ id: string }>(sql`
      INSERT INTO sessions (event_id, title, starts_at, ends_at, track_id, kind,
                            room_id, access_link)
      VALUES (${inPerson.eventId}::uuid, 'Bypassed Link', '2027-03-01T09:00:00Z'::timestamptz,
              '2027-03-01T10:00:00Z'::timestamptz, ${inPerson.trackId}::uuid, 'mandatory',
              ${inPerson.roomId}::uuid, ${LINK})
      RETURNING id
    `)
    expect(rows[0]?.id).toBeDefined()
  })

  /**
   * T185 — **clearing an access link is refused while any place or save exists, naming them;
   * correcting it never is** (FR-1058a, FR-1058). The two acts differ in what they do to
   * somebody committed: a corrected link is correct the moment they open the session, a
   * removed one strands them — and notifying instead would be a fourth material change.
   */
  it('refuses clearing a committed session’s link, permits correcting it, and permits clearing once free', async () => {
    const created = await post(hybrid, { roomId: hybrid.roomId, accessLink: LINK })
    expect(created.statusCode, created.body).toBe(201)
    const sessionId = (created.json() as { id: string }).id

    const db = getDb()
    const attendeeId = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, GRACE))
    )[0]?.id as string
    await db.execute(sql`
      INSERT INTO session_enrolments (attendee_id, session_id)
      VALUES (${attendeeId}::uuid, ${sessionId}::uuid)
    `)

    const patch = (accessLink: string | null) =>
      app.inject({
        method: 'PATCH',
        url: `/admin/conferences/${hybrid.eventId}/sessions/${sessionId}`,
        headers: { cookie },
        payload: sessionBody(hybrid, { roomId: hybrid.roomId, accessLink }),
      })

    // Clearing: refused, its own code, naming the commitments as counts (never identity).
    const cleared = await patch(null)
    expect(cleared.statusCode, cleared.body).toBe(409)
    const refusal = cleared.json() as { code: string; message: string; placesHeld?: number }
    expect(refusal.code).toBe('access_link_committed')
    expect(refusal.placesHeld, 'the refusal names the held places').toBe(1)
    expect(refusal.message).toMatch(/1 hold a place/)

    // Correcting: always permitted — the new value is what every attendee reads next time.
    const corrected = await patch('https://meet.example.invalid/corrected')
    expect(corrected.statusCode, corrected.body).toBe(200)

    // Once nobody is committed, clearing is an ordinary edit again.
    await db.execute(sql`DELETE FROM session_enrolments WHERE session_id = ${sessionId}::uuid`)
    const freed = await patch(null)
    expect(freed.statusCode, freed.body).toBe(200)
  })
})
