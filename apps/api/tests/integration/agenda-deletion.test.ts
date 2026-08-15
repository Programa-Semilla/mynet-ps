import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { savedSessions, sessionNotes } from '../../src/db/schema/agenda.js'
import { attendees } from '../../src/db/schema/attendees.js'
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
 * T071 (005) — **deleting an attendee deletes their saved sessions and notes**
 * (US5 scenario 5, Principle VIII).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONLY AUTOMATED PROOF OF THE RETENTION COMMITMENT THIS FEATURE DECLARES.**
 *
 * 005 stores the product's first attendee-authored free text, and the register's data-retention
 * entry was written expecting 004 to arrive first. Constitution v2.2.0 corrected that: 005
 * ships on a **narrow declared commitment** — saved sessions and notes are deleted with the
 * account, and no export path ships — as a declared limit under Principle IX rather than a
 * silent omission.
 *
 * "Deleted with the account" is a promise, and this is what makes it a mechanism. The cascade
 * is schema-level rather than application-level precisely so a future deletion path cannot
 * forget it — but a schema-level guarantee that nobody asserts is still only a claim about a
 * migration nobody re-read.
 *
 * **There is no deletion endpoint**, and that is not an oversight: account deletion is part of
 * the full retention obligation, which is still open and still blocks 004. What exists today is
 * the storage-level guarantee, and this asserts exactly that and claims nothing more.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('deleting an attendee', () => {
  let app: FastifyInstance
  let cookie: string
  let summitId: string
  let attendeeId: string
  let sessionIds: string[]

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
    if (!token) throw new Error('Sign-in failed.')
    cookie = token

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    attendeeId = (me.json() as { id: string }).id

    const [event] = await getDb()
      .select()
      .from(events)
      .where(eq(events.name, 'Product & Design Summit'))
    if (!event) throw new Error('Seed did not produce the summit.')
    summitId = event.id

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${summitId}/sessions`,
      headers: { cookie: cookieHeader(cookie) },
    })
    sessionIds = (programme.json() as Array<{ id: string }>).map((session) => session.id)
    if (sessionIds.length < 2) throw new Error('The seeded summit programme is too small.')
  })

  afterAll(async () => {
    await teardown(app)
    // The seed is restored by the next file's `resetDatabase`, but leaving the database without
    // Ada would make a failure here look like a failure there.
    await resetDatabase()
  })

  it('removes the attendee’s saved sessions and notes with the account', async () => {
    // ── Build a real agenda through the API, not by inserting rows ────────────────────────
    for (const sessionId of sessionIds.slice(0, 2)) {
      await app.inject({
        method: 'PUT',
        url: `/events/${summitId}/agenda/saved/${sessionId}`,
        headers: { cookie: cookieHeader(cookie) },
      })
    }
    await app.inject({
      method: 'PUT',
      url: `/events/${summitId}/agenda/notes/${sessionIds[0] as string}`,
      headers: { cookie: cookieHeader(cookie) },
      payload: { body: 'Personal content that must not outlive the account.' },
    })

    const savedBefore = await getDb()
      .select()
      .from(savedSessions)
      .where(eq(savedSessions.attendeeId, attendeeId))
    const notesBefore = await getDb()
      .select()
      .from(sessionNotes)
      .where(eq(sessionNotes.attendeeId, attendeeId))

    // Without this the deletion below would prove nothing: an empty table stays empty.
    expect(savedBefore).toHaveLength(2)
    expect(notesBefore).toHaveLength(1)

    // ── Delete the account ────────────────────────────────────────────────────────────────
    await getDb().delete(attendees).where(eq(attendees.id, attendeeId))

    const savedAfter = await getDb()
      .select()
      .from(savedSessions)
      .where(eq(savedSessions.attendeeId, attendeeId))
    const notesAfter = await getDb()
      .select()
      .from(sessionNotes)
      .where(eq(sessionNotes.attendeeId, attendeeId))

    expect(
      savedAfter,
      'Saved sessions must be deleted with the account. The cascade is the declared retention ' +
        'commitment, and it is schema-level so a future deletion path cannot forget it.',
    ).toEqual([])
    expect(
      notesAfter,
      'Notes are this product’s first attendee-authored free text. Leaving them behind would be ' +
        'the retention failure Principle VIII exists to prevent.',
    ).toEqual([])
  })

  it('leaves the conference programme untouched — the attendee owned their agenda, not it', async () => {
    // The cascade must not run the other way. Deleting an attendee is not an edit to seeded
    // conference content, which nothing may write to at any privilege (FR-191).
    const remaining = await getDb().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM sessions WHERE event_id = ${summitId}::uuid`,
    )

    expect(remaining[0]?.n).toBe(sessionIds.length)
  })
})
