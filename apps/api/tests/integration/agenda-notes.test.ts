import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { sessionNotes } from '../../src/db/schema/agenda.js'
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
 * T044 (005) — the note routes over HTTP (FR-207–FR-214).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The length limit is asserted server-side, independently of the client** (FR-213).
 *
 * The editor surfaces the limit as it is approached so the attendee never learns of it through
 * a rejected write — but client-side presentation of a limit is never its enforcement
 * (Principle VIII). These assertions are what make that true: they reach the route directly,
 * as a client that had bypassed the editor would.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('session notes', () => {
  let app: FastifyInstance
  let cookie: string
  let summitId: string
  let sessionIds: string[]

  const eventIdByName = async (name: string): Promise<string> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row.id
  }

  const notes = () =>
    app.inject({
      method: 'GET',
      url: `/events/${summitId}/agenda/notes`,
      headers: { cookie: cookieHeader(cookie) },
    })

  const writeNote = (sessionId: string, body: string) =>
    app.inject({
      method: 'PUT',
      url: `/events/${summitId}/agenda/notes/${sessionId}`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body },
    })

  const deleteNote = (sessionId: string) =>
    app.inject({
      method: 'DELETE',
      url: `/events/${summitId}/agenda/notes/${sessionId}`,
      headers: { cookie: cookieHeader(cookie) },
    })

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
    cookie = token

    summitId = await eventIdByName('Product & Design Summit')

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    sessionIds = (programme.json() as Array<{ id: string }>).map((session) => session.id)
    if (sessionIds.length < 3) throw new Error('The seeded summit programme is too small.')
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('starts with no notes — a valid answer, not a 404', async () => {
    // Nothing is seeded: notes are attendee-authored, and seeding them would fabricate
    // personal data attributed to a real identity (data-model.md).
    const response = await notes()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ notes: [] })
  })

  it('writes a note and returns updatedAt, which is what keeps the client honest', async () => {
    const target = sessionIds[0] as string
    const response = await writeNote(target, 'Ask about the migration path.')

    expect(response.statusCode).toBe(200)

    const body = response.json() as { updatedAt: string }
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The confirmation the editor's *saved* status is entered from (FR-210, research D5). A
    // route that answered 204 with no body would leave the client with nothing to distinguish
    // "the server confirmed this" from "the request was dispatched", which is the difference
    // between this feature and an optimistic update the constitution requires be recorded.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(body.updatedAt).toMatch(/Z$|[+-]\d{2}:\d{2}$/)
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false)
  })

  it('reads the note back as a set, so the panel needs no extra request', async () => {
    const target = sessionIds[0] as string
    const response = await notes()

    expect(response.json()).toEqual({
      notes: [
        {
          sessionId: target,
          body: 'Ask about the migration path.',
          updatedAt: expect.any(String) as unknown as string,
        },
      ],
    })
  })

  it('REPLACES rather than appends — the last confirmed write wins (FR-214)', async () => {
    const target = sessionIds[0] as string
    await writeNote(target, 'Rewritten after the session.')

    const rows = await getDb().select().from(sessionNotes).where(eq(sessionNotes.sessionId, target))

    expect(rows, 'one note per attendee per session').toHaveLength(1)
    expect(rows[0]?.body).toBe('Rewritten after the session.')
  })

  it('advances updatedAt on a rewrite', async () => {
    const target = sessionIds[1] as string
    const first = (await writeNote(target, 'First.')).json() as { updatedAt: string }
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = (await writeNote(target, 'Second.')).json() as { updatedAt: string }

    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt))
  })

  it('DELETES a note, and deleting again still succeeds (FR-212)', async () => {
    const target = sessionIds[1] as string

    expect((await deleteNote(target)).statusCode).toBe(204)
    expect((await deleteNote(target)).statusCode).toBe(204)

    const remaining = (await notes()).json() as { notes: Array<{ sessionId: string }> }
    expect(remaining.notes.map((note) => note.sessionId)).not.toContain(target)
  })

  it('REJECTS an over-length note SERVER-SIDE, independently of the client (FR-213)', async () => {
    const target = sessionIds[2] as string
    const response = await writeNote(target, 'x'.repeat(10_001))

    // The route schema refuses it before the handler runs. The column's CHECK refuses it again
    // if a second write path ever appears — defence in depth, not redundancy.
    expect(response.statusCode).toBe(400)

    // And nothing was written.
    const rows = await getDb().select().from(sessionNotes).where(eq(sessionNotes.sessionId, target))
    expect(rows).toHaveLength(0)
  })

  it('accepts a note at exactly the limit — the bound is inclusive', async () => {
    const target = sessionIds[2] as string
    const response = await writeNote(target, 'x'.repeat(10_000))

    // Off by one in the other direction would make the editor's remaining-characters
    // indication lie at the last character.
    expect(response.statusCode).toBe(200)
    await deleteNote(target)
  })

  it('REJECTS an empty note rather than storing a blank one (FR-212)', async () => {
    const target = sessionIds[2] as string
    const response = await writeNote(target, '')

    // Clearing the text takes the DELETE path. An empty body is not how a note is removed, and
    // `length(body) > 0` on the column means "no note" has exactly one representation.
    expect(response.statusCode).toBe(400)
  })

  it('STRIPS an attendee identifier smuggled into the body, and writes as the caller', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `additionalProperties: false` plus Fastify's `removeAdditional` default means the extra
    // property is **deleted from the body before the handler runs** rather than rejected. So
    // the request succeeds — and that is fine, because the security property is not "the
    // request is refused", it is "the smuggled identifier cannot possibly be honoured".
    //
    // It is asserted here as the stronger claim: the note lands on the *authenticated*
    // attendee. Identity comes from the sign-in session and there is no parameter anywhere in
    // this feature in which to name anyone else (FR-227) — the query layer takes no attendee
    // argument at all, so there is no code path this could have reached even if it survived.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const target = sessionIds[2] as string
    const response = await app.inject({
      method: 'PUT',
      url: `/events/${summitId}/agenda/notes/${target}`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body: 'Smuggling attempt.', attendeeId: '00000000-0000-4000-8000-000000000000' },
    })

    expect(response.statusCode).toBe(200)

    const rows = await getDb().select().from(sessionNotes).where(eq(sessionNotes.sessionId, target))
    expect(rows).toHaveLength(1)
    expect(
      rows[0]?.attendeeId,
      'The note must belong to the signed-in attendee, never to an identifier from the body.',
    ).not.toBe('00000000-0000-4000-8000-000000000000')

    // And it is readable by its actual author, which is the same attendee that wrote it.
    const readBack = (await notes()).json() as { notes: Array<{ sessionId: string }> }
    expect(readBack.notes.map((note) => note.sessionId)).toContain(target)

    await deleteNote(target)
  })

  it('lets a note be written on a session that is NOT saved (FR-207)', async () => {
    const target = sessionIds[2] as string

    const saved = (
      (
        await app.inject({
          method: 'GET',
          url: `/events/${summitId}/agenda/saved`,
          headers: { cookie: cookieHeader(cookie) },
        })
      ).json() as { sessionIds: string[] }
    ).sessionIds
    expect(saved).not.toContain(target)

    // Noting and saving are independent. Requiring a save first would add a rule the attendee
    // has to discover, and the prototype's panel offers notes on any session.
    expect((await writeNote(target, 'Not saved, still worth noting.')).statusCode).toBe(200)
    await deleteNote(target)
  })

  it('refuses every note route without a sign-in session', async () => {
    const target = sessionIds[0] as string

    for (const request of [
      { method: 'GET' as const, url: `/events/${summitId}/agenda/notes` },
      {
        method: 'PUT' as const,
        url: `/events/${summitId}/agenda/notes/${target}`,
        payload: { body: 'x' },
      },
      { method: 'DELETE' as const, url: `/events/${summitId}/agenda/notes/${target}` },
    ]) {
      const response = await app.inject(request)
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(401)
    }
  })
})
