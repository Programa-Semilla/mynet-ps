import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T026 (014) — **an organizer builds a programme, and an attendee sees it** (FR-1001, SC-1001).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE LAST ASSERTION IS THE FEATURE. EVERYTHING ABOVE IT IS SETUP.**
 *
 * Until 014, a conference programme could only come from a reviewed change to committed seed data
 * — which means a **deploy to move a room**. That is the stated motivation for reversing the
 * organizer-administration exclusion, so the test that matters is not "the POST returned 201", it
 * is that the session an organizer typed into the administrative site appears in an attendee's
 * Agenda through the ordinary attendee read, with the right time, track, room and speaker.
 *
 * Two products, one API, one database — asserted end to end rather than inferred from two green
 * halves.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('authoring the programme (T026, FR-1001, SC-1001)', () => {
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

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const post = (rest: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: at(rest), headers: { cookie }, payload })

  const patch = (rest: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: at(rest), headers: { cookie }, payload })

  const remove = (rest: string) =>
    app.inject({ method: 'DELETE', url: at(rest), headers: { cookie } })

  const programme = async () => {
    const response = await app.inject({
      method: 'GET',
      url: at('/programme'),
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  it('creates, reads, updates and deletes a track', async () => {
    const created = await post('/tracks', { name: 'Runtime', colorToken: 'track-tech' })
    expect(created.statusCode).toBe(201)
    const id = created.json().id as string

    expect((await programme()).tracks.map((t: { name: string }) => t.name)).toContain('Runtime')

    const edited = await patch(`/tracks/${id}`, {
      name: 'Runtime & Tooling',
      colorToken: 'track-tech',
    })
    expect(edited.statusCode).toBe(200)
    expect((await programme()).tracks.map((t: { name: string }) => t.name)).toContain(
      'Runtime & Tooling',
    )

    expect((await remove(`/tracks/${id}`)).statusCode).toBe(204)
    expect((await programme()).tracks.map((t: { name: string }) => t.name)).not.toContain(
      'Runtime & Tooling',
    )
  })

  it('creates, reads, updates and deletes a room', async () => {
    const created = await post('/rooms', { name: 'Hall C' })
    expect(created.statusCode).toBe(201)
    const id = created.json().id as string

    expect((await programme()).rooms.map((r: { name: string }) => r.name)).toContain('Hall C')
    expect((await patch(`/rooms/${id}`, { name: 'Hall C — West' })).statusCode).toBe(200)
    expect((await remove(`/rooms/${id}`)).statusCode).toBe(204)
    expect((await programme()).rooms.map((r: { name: string }) => r.name)).not.toContain('Hall C')
  })

  it('creates, reads, updates and deletes a speaker', async () => {
    const created = await post('/speakers', {
      name: 'Ada Byron',
      title: 'Analyst',
      company: 'Analytical Engines',
    })
    expect(created.statusCode).toBe(201)
    const id = created.json().id as string

    const listed = (await programme()).speakers.find((s: { id: string }) => s.id === id)
    expect(listed).toMatchObject({ name: 'Ada Byron', title: 'Analyst' })

    expect(
      (await patch(`/speakers/${id}`, { name: 'Ada Byron', title: 'Author', company: null }))
        .statusCode,
    ).toBe(200)
    expect((await remove(`/speakers/${id}`)).statusCode).toBe(204)
  })

  it('rejects a track colour that is not a theme token (FR-1004)', async () => {
    // The product offers no free colour input anywhere, and the route is where that is enforced
    // rather than asserted. A colour value here would put the palette in two places and let a
    // form alter the design system without touching the design system (FR-136).
    const response = await post('/tracks', { name: 'Brand', colorToken: '#ff0000' })
    expect(response.statusCode).toBe(400)
  })

  it('creates a session and makes it visible in an ATTENDEE’s Agenda (SC-1001)', async () => {
    const created = await post('/sessions', sessionBody(fixture.assigned, { title: 'Live Edit' }))
    expect(created.statusCode).toBe(201)

    // The attendee half, through the ordinary attendee read. The organizer is registered for
    // this conference (fixture), so their own attendee session can read it — which is also a
    // small proof of FR-904: promotion changed nothing about their attendee experience.
    const signIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    const attendee = cookieHeader(sessionCookieFrom(signIn) as string)

    const catalog = await app.inject({
      method: 'GET',
      url: `/events/${fixture.assigned.eventId}/sessions`,
      headers: { cookie: attendee },
    })

    expect(catalog.statusCode).toBe(200)
    const session = catalog
      .json()
      .find((entry: { title: string }) => entry.title === 'Live Edit') as {
      startsAt: string
      cancelled: boolean
      track: { name: string }
      room: { name: string }
      speakers: { name: string }[]
    }

    expect(
      session,
      'A session an organizer created is absent from the attendee programme. This is the whole ' +
        'motivation for reversing the organizer-administration exclusion: until 014 a programme ' +
        'could only come from a reviewed change to committed seed data.',
    ).toBeDefined()

    expect(session.startsAt).toBe('2027-03-01T09:00:00.000Z')
    expect(session.cancelled).toBe(false)
    expect(session.track.name).toBe('Assigned Conference Track')
    expect(session.room.name).toBe('Assigned Conference Room')
    expect(session.speakers.map((speaker) => speaker.name)).toEqual(['Assigned Conference Speaker'])
  })

  it('edits a session and the attendee sees the edit', async () => {
    const created = await post('/sessions', sessionBody(fixture.assigned))
    const id = created.json().id as string

    const edited = await patch(
      `/sessions/${id}`,
      sessionBody(fixture.assigned, { title: 'Renamed', summary: 'Now with a summary' }),
    )
    expect(edited.statusCode).toBe(200)

    const listed = (await programme()).sessions.find((s: { id: string }) => s.id === id)
    expect(listed).toMatchObject({ title: 'Renamed', summary: 'Now with a summary' })
  })

  it('carries engagement counts on the programme, and they start at zero (FR-1025)', async () => {
    await post('/sessions', sessionBody(fixture.assigned))
    const listed = (await programme()).sessions[0]

    expect(
      listed.engagement,
      'The programme carries no engagement counts, so the organizer choosing between deleting ' +
        'and cancelling has nothing to decide on (FR-1025).',
    ).toEqual({ saved: 0, notes: 0, questions: 0, votes: 0 })
  })

  it('refuses to delete a track a session still references (FR-1017)', async () => {
    await post('/sessions', sessionBody(fixture.assigned))

    const response = await remove(`/tracks/${fixture.assigned.trackId}`)
    expect(response.statusCode).toBe(409)
    expect(
      response.json().message,
      'The refusal carries no reason. It describes the caller’s own conference — they can see ' +
        'the sessions and the fix is to move them — so a bare 409 would be unactionable.',
    ).toMatch(/session/i)
  })

  it('refuses to delete a room a session still references (FR-1017)', async () => {
    await post('/sessions', sessionBody(fixture.assigned))
    expect((await remove(`/rooms/${fixture.assigned.roomId}`)).statusCode).toBe(409)
  })
})
