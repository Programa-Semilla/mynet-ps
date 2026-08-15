import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T182, T190 (014 tranche 2, US8) — **the conference's modality and format are correctable
 * after creation, and hybrid is the reachable route between in-person and virtual** (FR-1047,
 * FR-1059, FR-1059a, SC-1023).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A DIRECT IN-PERSON→VIRTUAL CHANGE IS UNREACHABLE BY CONSTRUCTION, NOT MERELY REFUSED**
 * (spec edge case 1). The refusal names the sessions in the way — and the remedy is NOT "clear
 * the rooms first", because that is itself forbidden: FR-1050a requires a room on every
 * session of an in-person conference and forbids a link on one, so there is no order of
 * operations that reaches virtual directly. The reachable route, asserted end to end below, is
 * in-person → hybrid (free), give each session a link and drop its room, then hybrid →
 * virtual. Hybrid is the transitional modality by construction: the only value satisfied by
 * both room-only and link-only sessions.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('conference modality and format changes (T182, FR-1059a, FR-1047)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const LINK = 'https://meet.example.invalid/stream'

  const patchConference = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/admin/conferences/${fixture.assigned.eventId}`,
      headers: { cookie },
      payload,
    })

  const createSession = async (title: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, { title }),
    })
    expect(response.statusCode, response.body).toBe(201)
    return (response.json() as { id: string }).id
  }

  const patchSession = (id: string, overrides: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/admin/conferences/${fixture.assigned.eventId}/sessions/${id}`,
      headers: { cookie },
      payload: sessionBody(fixture.assigned, overrides),
    })

  it('refuses a direct in-person→virtual change NAMING every session in the way (FR-1059a)', async () => {
    await createSession('Opening Keynote')
    await createSession('Closing Panel')

    const refused = await patchConference({ modality: 'virtual' })
    expect(refused.statusCode, refused.body).toBe(409)

    const body = refused.json() as {
      code: string
      sessions?: { id: string; title: string }[]
    }
    expect(body.code).toBe('modality_conflicts_sessions')
    // Named, FR-1014's shape: an organizer told only "no" has to find them by eye. The order is
    // the query's total order — start, then title, then id — and both fixtures share a start
    // time, so this asserts the title tiebreak. It used to expect creation order, which the
    // query never promised: with `ORDER BY starts_at` alone the tie fell to executor order, and
    // the assertion flipped on a real CI run (fix/post-merge-verification).
    expect(body.sessions?.map((one) => one.title)).toEqual(['Closing Panel', 'Opening Keynote'])
  })

  it('cannot prepare the sessions first either — the change is unreachable by construction', async () => {
    const sessionId = await createSession('Opening Keynote')

    // Adding a link while the conference is still in person is forbidden (FR-1050a)…
    const linked = await patchSession(sessionId, { accessLink: LINK })
    expect(linked.statusCode).toBe(400)
    expect((linked.json() as { code: string }).code).toBe('modality_forbids_link')

    // …and so is clearing the room, which would leave the session with neither.
    const roomless = await patchSession(sessionId, { roomId: null })
    expect(roomless.statusCode).toBe(400)
    expect((roomless.json() as { code: string }).code).toBe('session_needs_room_or_link')
  })

  it('walks the reachable route: in-person → hybrid → link the sessions → virtual', async () => {
    const sessionId = await createSession('Opening Keynote')

    // In-person → hybrid: permitted with NO further act, because hybrid requires at least one
    // of a room and a link and every existing session already carries a room (US8 edge case).
    expect((await patchConference({ modality: 'hybrid' })).statusCode).toBe(200)

    // Hybrid → in-person would be free here too; give the session a link and it stops being:
    const linked = await patchSession(sessionId, { roomId: null, accessLink: LINK })
    expect(linked.statusCode, linked.body).toBe(200)

    // Switching BACK to in-person is now refused, naming the linked session (US8 edge case 2).
    const backwards = await patchConference({ modality: 'in-person' })
    expect(backwards.statusCode).toBe(409)
    expect((backwards.json() as { code: string }).code).toBe('modality_conflicts_sessions')

    // Hybrid → virtual: every session is link-only now, so nothing violates and it lands.
    expect((await patchConference({ modality: 'virtual' })).statusCode).toBe(200)

    const programme = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${fixture.assigned.eventId}/programme`,
      headers: { cookie },
    })
    const conference = (programme.json() as { conference: { modality: string } }).conference
    expect(conference.modality).toBe('virtual')
  })

  it('permits in-person→virtual DIRECTLY on a conference with no sessions', async () => {
    // The refusal is about sessions that would be left invalid, not about the transition
    // itself: with nothing to violate FR-1050a, no intermediate step is demanded.
    const response = await patchConference({ modality: 'virtual' })
    expect(response.statusCode, response.body).toBe(200)
  })

  it('ALWAYS permits a format change, sessions or none, because nothing branches on it (FR-1047)', async () => {
    await createSession('Opening Keynote')

    const set = await patchConference({ format: 'hackathon' })
    expect(set.statusCode, set.body).toBe(200)

    // And clearing it is an ordinary edit — the field is optional on a conference.
    const cleared = await patchConference({ format: null })
    expect(cleared.statusCode, cleared.body).toBe(200)

    // Both axes at once: a virtual hackathon must be expressible (FR-1045). Hybrid first,
    // since the session carries a room.
    expect((await patchConference({ modality: 'hybrid', format: 'hackathon' })).statusCode).toBe(
      200,
    )
  })

  it('reports modality and format on the programme read, for the editor to present (FR-1059)', async () => {
    await patchConference({ modality: 'hybrid', format: 'seminar' })

    const programme = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${fixture.assigned.eventId}/programme`,
      headers: { cookie },
    })
    const conference = (
      programme.json() as { conference: { modality: string; format: string | null } }
    ).conference
    expect(conference.modality).toBe('hybrid')
    expect(conference.format).toBe('seminar')
  })
})
