import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { sessions, sessionSpeakers } from '../../src/db/schema/catalog.js'
import {
  buildAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T028 (014) — **a session cannot be assembled out of two conferences' parts** (FR-1005).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A FOREIGN KEY CANNOT EXPRESS THIS, WHICH IS WHY IT NEEDS A TEST RATHER THAN A CONSTRAINT.**
 *
 * `sessions.track_id` references `tracks.id`, and **every** track satisfies that — including one
 * belonging to a conference the organizer has nothing to do with. The database will accept a
 * session in conference A that points at a track in conference B without complaint, and the
 * result reads as a perfectly ordinary session until somebody notices its track is not in the
 * legend.
 *
 * 002 recorded the same limitation for `session_speakers`, which cannot express its same-event
 * rule as a foreign key either and is enforced by a scoped query instead. This is that rule
 * asserted for a **write** path rather than a read.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('conference isolation in authoring (T028, FR-1005)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const create = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload,
    })

  it("refuses another conference's track", async () => {
    const response = await create(
      sessionBody(fixture.assigned, { trackId: fixture.unassigned.trackId }),
    )

    expect(
      response.statusCode,
      'A session was created against a track belonging to another conference. The foreign key ' +
        'accepts it — every track id is a valid track — so the same-event rule has to be a ' +
        'scoped condition in the write path (FR-1005).',
    ).toBe(404)
  })

  it("refuses another conference's room", async () => {
    expect(
      (await create(sessionBody(fixture.assigned, { roomId: fixture.unassigned.roomId })))
        .statusCode,
    ).toBe(404)
  })

  it("silently drops another conference's speaker rather than joining it", async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **A speaker is the one part where the answer is "drop" rather than "refuse", and the
    // asymmetry is deliberate.** Track and room are `NOT NULL` on a session — a session missing
    // either cannot exist — so a bad reference has to be a refusal. Speakers are optional
    // (FR-138), so the write succeeds with the foreign speaker absent, which is the same outcome
    // as never having named them.
    //
    // The important half is what is NOT in the database afterwards: a `session_speakers` row
    // crossing two conferences would be exactly the state 002 says cannot be expressed as a
    // foreign key and must therefore be prevented by the query.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const response = await create(
      sessionBody(fixture.assigned, {
        speakerIds: [fixture.assigned.speakerId, fixture.unassigned.speakerId],
      }),
    )

    expect(response.statusCode).toBe(201)
    const sessionId = response.json().id as string

    const links = await getDb()
      .select({ speakerId: sessionSpeakers.speakerId })
      .from(sessionSpeakers)
      .where(eq(sessionSpeakers.sessionId, sessionId))

    expect(
      links.map((link) => link.speakerId),
      'A `session_speakers` row joins a session in one conference to a speaker in another. That ' +
        'is the state 002 records as inexpressible as a foreign key, so it has to be prevented ' +
        'by the write path re-scoping every speaker to the conference (FR-1005).',
    ).toEqual([fixture.assigned.speakerId])
  })

  it('writes nothing into the other conference, whatever is attempted', async () => {
    await create(sessionBody(fixture.assigned, { trackId: fixture.unassigned.trackId }))
    await create(sessionBody(fixture.assigned, { roomId: fixture.unassigned.roomId }))

    const strays = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.eventId, fixture.unassigned.eventId))

    expect(
      strays,
      'A refused write left a row in the conference the organizer has no authority over.',
    ).toEqual([])
  })

  it('refuses to edit a session belonging to another conference', async () => {
    const [stray] = await getDb()
      .insert(sessions)
      .values({
        eventId: fixture.unassigned.eventId,
        trackId: fixture.unassigned.trackId,
        roomId: fixture.unassigned.roomId,
        title: 'Not yours',
        startsAt: new Date('2027-03-01T09:00:00.000Z'),
        endsAt: new Date('2027-03-01T10:00:00.000Z'),
      })
      .returning({ id: sessions.id })

    // Addressed through the conference the organizer DOES run, naming a session in the one they
    // do not. The guard passes — they are authorised for the conference in the path — so this is
    // the write layer's `AND event_id = scope.eventId` doing the work, not the guard.
    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${stray?.id}`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { title: 'Taken over' }),
    })

    expect(response.statusCode).toBe(404)

    const after = await getDb()
      .select({ title: sessions.title })
      .from(sessions)
      .where(eq(sessions.id, stray?.id as string))

    expect(after[0]?.title).toBe('Not yours')
  })
})
