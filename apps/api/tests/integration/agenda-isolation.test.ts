import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions, sessionNotes } from '../../src/db/schema/agenda.js'
import { events } from '../../src/db/schema/events.js'
import {
  ADA,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T069 (005) — **nobody reads or writes another attendee's agenda** (FR-190, FR-208, FR-232,
 * SC-205, US5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE MOST IMPORTANT FILE THIS FEATURE ADDS.**
 *
 * Notes are the product's first attendee-authored free text. A failure here is a personal-data
 * breach rather than a defect, and leaked data stays leaked — which is why Principle VIII
 * requires this to be automated rather than reviewed.
 *
 * The test is deliberately hostile. It does not check that the happy path returns the right
 * rows; it tries, by every means the HTTP surface allows, to make the server hand Grace
 * something of Ada's, and asserts that none of them work.
 *
 * **Exercised against the server directly, never through the client** (FR-232). If any of this
 * passed only because the UI hides something, it would prove nothing at all: the client is
 * presentation, and an attacker does not use it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * T074 (014) — the saved-session identifiers out of the agenda payload.
 *
 * The read returned `{ sessionIds: string[] }` until 014 and now returns
 * `{ sessions: { sessionId, changedSinceViewed }[] }`: the marker travels on the existing payload
 * rather than on a read of its own, because a `listChangedSessions` would be a read whose subject
 * is *things that happened* — the surface FR-1031 forbids (research R7).
 *
 * Projected here so the assertions below stay about **which sessions are saved**, which is what
 * they were always about.
 */
const savedIdsOf = (body: unknown): string[] =>
  (body as { sessions: { sessionId: string }[] }).sessions.map((entry) => entry.sessionId)

describe("another attendee's agenda", () => {
  let app: FastifyInstance
  let adaCookie: string
  let graceCookie: string
  /** Both attendees are registered for this one, which is what makes the test sharp. */
  let summitId: string
  let adaSessionId: string
  let adaSecondSessionId: string

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
    if (!token) throw new Error(`Sign-in failed for ${email}.`)
    return token
  }

  const as = (cookie: string) => ({
    saved: () =>
      app.inject({
        method: 'GET',
        url: `/events/${summitId}/agenda/saved`,
        headers: { cookie: cookieHeader(cookie) },
      }),
    notes: () =>
      app.inject({
        method: 'GET',
        url: `/events/${summitId}/agenda/notes`,
        headers: { cookie: cookieHeader(cookie) },
      }),
    save: (sessionId: string) =>
      app.inject({
        method: 'PUT',
        url: `/events/${summitId}/agenda/saved/${sessionId}`,
        headers: { cookie: cookieHeader(cookie) },
      }),
    unsave: (sessionId: string) =>
      app.inject({
        method: 'DELETE',
        url: `/events/${summitId}/agenda/saved/${sessionId}`,
        headers: { cookie: cookieHeader(cookie) },
      }),
    writeNote: (sessionId: string, body: string) =>
      app.inject({
        method: 'PUT',
        url: `/events/${summitId}/agenda/notes/${sessionId}`,
        headers: { cookie: cookieHeader(cookie) },
        payload: { body },
      }),
    deleteNote: (sessionId: string) =>
      app.inject({
        method: 'DELETE',
        url: `/events/${summitId}/agenda/notes/${sessionId}`,
        headers: { cookie: cookieHeader(cookie) },
      }),
  })

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    adaCookie = await signIn(ADA)
    graceCookie = await signIn(GRACE)
    summitId = await eventIdByName('Product & Design Summit')

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(adaCookie) },
    })
    const ids = (programme.json() as Array<{ id: string }>).map((session) => session.id)
    const [first, second] = ids
    if (!first || !second) throw new Error('The seeded summit programme is too small.')
    adaSessionId = first
    adaSecondSessionId = second

    // Ada builds an agenda: one saved session and one private note.
    await as(adaCookie).save(adaSessionId)
    await as(adaCookie).writeNote(adaSessionId, "Ada's private note. Nobody else may read this.")
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real, or every assertion below is trivially true', async () => {
    // Guard against the suite passing because Ada has nothing to leak.
    const saved = savedIdsOf((await as(adaCookie).saved()).json())
    const notes = (await as(adaCookie).notes()).json() as { notes: Array<{ body: string }> }

    expect(saved).toContain(adaSessionId)
    expect(notes.notes[0]?.body).toContain("Ada's private note")
  })

  it('GRACE CANNOT READ ADA’S SAVED SESSIONS (FR-190)', async () => {
    const response = await as(graceCookie).saved()

    // 200 — Grace is registered for this conference, so the read is legitimate. What she gets
    // back is *her own* set, which is empty.
    expect(response.statusCode).toBe(200)
    expect(
      (response.json() as { sessions: { sessionId: string }[] }).sessions.map(
        (entry) => entry.sessionId,
      ),
      "Grace's saved set must be hers. The route takes no attendee identifier, so there is no " +
        'expression that could have returned Ada’s.',
    ).toEqual([])
  })

  it('GRACE CANNOT READ ADA’S NOTES (FR-208)', async () => {
    const response = await as(graceCookie).notes()

    expect(response.statusCode).toBe(200)
    const body = JSON.stringify(response.json())
    expect(body).not.toContain("Ada's private note")
    expect(response.json()).toEqual({ notes: [] })
  })

  it('Grace writing a note on the SAME session does not touch Ada’s', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The composite primary key is `(attendee_id, session_id)`, so two attendees noting the
    // same session are two rows. A key of `session_id` alone would make this an overwrite —
    // Grace silently destroying Ada's note by writing her own.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await as(graceCookie).writeNote(adaSessionId, "Grace's own note on the same session.")

    const ada = (await as(adaCookie).notes()).json() as { notes: Array<{ body: string }> }
    const grace = (await as(graceCookie).notes()).json() as { notes: Array<{ body: string }> }

    expect(ada.notes[0]?.body).toContain("Ada's private note")
    expect(grace.notes[0]?.body).toContain("Grace's own note")

    const rows = await getDb()
      .select()
      .from(sessionNotes)
      .where(eq(sessionNotes.sessionId, adaSessionId))
    expect(rows, 'two attendees, two rows').toHaveLength(2)

    await as(graceCookie).deleteNote(adaSessionId)
  })

  it('Grace DELETING a note removes only her own', async () => {
    await as(graceCookie).writeNote(adaSessionId, 'Temporary.')
    await as(graceCookie).deleteNote(adaSessionId)

    const ada = (await as(adaCookie).notes()).json() as { notes: Array<{ body: string }> }
    expect(
      ada.notes[0]?.body,
      "A delete is scoped by the attendee from the session. Grace's delete must not reach Ada's row.",
    ).toContain("Ada's private note")
  })

  it('Grace UNSAVING a session does not unsave it for Ada', async () => {
    await as(graceCookie).unsave(adaSessionId)

    const ada = savedIdsOf((await as(adaCookie).saved()).json())
    expect(ada).toContain(adaSessionId)
  })

  it('Grace SAVING a session does not appear in Ada’s set', async () => {
    await as(graceCookie).save(adaSecondSessionId)

    const ada = savedIdsOf((await as(adaCookie).saved()).json())
    expect(ada).not.toContain(adaSecondSessionId)

    const rows = await getDb()
      .select()
      .from(savedSessions)
      .where(eq(savedSessions.sessionId, adaSecondSessionId))
    expect(rows).toHaveLength(1)

    await as(graceCookie).unsave(adaSecondSessionId)
  })

  it.each([
    ['a query parameter', 'attendeeId'],
    ['a differently-cased query parameter', 'attendee_id'],
    ['an author parameter', 'authorId'],
  ])('ignores an attendee identifier smuggled in via %s', async (_label, parameter) => {
    // Ada's own id, sent by Grace. If any of these were honoured, Grace would read Ada's notes.
    const adaMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    const adaId = (adaMe.json() as { id: string }).id

    const response = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/agenda/notes?${parameter}=${adaId}`,
      headers: { cookie: cookieHeader(graceCookie) },
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.stringify(response.json())).not.toContain("Ada's private note")
  })

  it('ignores an attendee identifier smuggled in via a header', async () => {
    const adaMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(adaCookie) },
    })
    const adaId = (adaMe.json() as { id: string }).id

    const response = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/agenda/notes`,
      headers: {
        cookie: cookieHeader(graceCookie),
        'x-attendee-id': adaId,
        'x-user-id': adaId,
        'x-on-behalf-of': adaId,
      },
    })

    expect(JSON.stringify(response.json())).not.toContain("Ada's private note")
  })

  it('refuses a fabricated session token outright', async () => {
    for (const request of [
      { method: 'GET' as const, url: `/events/${summitId}/agenda/saved` },
      { method: 'GET' as const, url: `/events/${summitId}/agenda/notes` },
    ]) {
      const response = await app.inject({
        ...request,
        headers: { cookie: cookieHeader('a-token-that-was-never-issued') },
      })
      expect(response.statusCode).toBe(401)
    }
  })

  it('never returns a note body to anybody but its author, across every route', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The sweep. Every route this feature introduces, driven as Grace, with every response body
    // searched for Ada's text. A future route added to this file that forgot the scoping would
    // have to also avoid ever echoing a body to fail to be caught here.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const responses = [
      await as(graceCookie).saved(),
      await as(graceCookie).notes(),
      await as(graceCookie).save(adaSessionId),
      await as(graceCookie).unsave(adaSessionId),
      await as(graceCookie).writeNote(adaSessionId, 'Grace probing.'),
      await as(graceCookie).deleteNote(adaSessionId),
    ]

    for (const response of responses) {
      expect(response.body).not.toContain("Ada's private note")
    }

    // And Ada's note is still there afterwards, untouched by any of it.
    const ada = (await as(adaCookie).notes()).json() as { notes: Array<{ body: string }> }
    expect(ada.notes[0]?.body).toContain("Ada's private note")
  })
})
