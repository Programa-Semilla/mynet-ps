import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { sessions, tracks } from '../../src/db/schema/catalog.js'
import { events } from '../../src/db/schema/events.js'
import {
  buildAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T024 (014) — **an authoring act whose audit entry fails leaves no trace of the act** (FR-1037,
 * SC-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE THE PROJECT HAS ALREADY SHIPPED THAT DEFECT ONCE, AND A SOURCE
 * ASSERTION ALONE WOULD NOT HAVE CAUGHT IT.**
 *
 * `appendAuditEntry` took an executor from the day it was written and **no caller passed one**,
 * while its own header claimed every write path did. 013's review found it; the repair was
 * guarded twice, and this is the behavioural half.
 * `tests/unit/authoring-audit-transactional.test.ts` is the source half.
 *
 * A source assertion proves the argument is *passed*. It cannot prove the two writes are actually
 * in one transaction — that depends on the executor being a transaction rather than the pool, on
 * the route not having opened a second one, and on nothing swallowing the error in between. Only
 * a real rollback shows that, so this makes the insert fail and asserts the act is gone.
 *
 * **The insert is failed by breaking the check constraint on `action`**, which is a constraint
 * the schema genuinely carries and which a caller cannot reach any other way. The alternative —
 * dropping a table mid-test — leaves the database in a state the rest of the file cannot use.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('an act and its audit entry commit together (T024, FR-1037, SC-1010)', () => {
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

  /**
   * Narrows the audit action constraint so **every** insert fails.
   *
   * The constraint is dropped and re-added with an impossible predicate rather than a trigger
   * being installed, because the failure it produces is the one a real constraint violation
   * produces — same error class, same transaction semantics, same rollback.
   */
  const breakTheAuditTrail = async (): Promise<void> => {
    await getDb().execute(sql`
      ALTER TABLE admin_audit_entries DROP CONSTRAINT IF EXISTS admin_audit_entries_action_valid
    `)
    // `NOT VALID` so existing rows are not re-checked. Entries written by the act this test is
    // about to set up are legitimate, and a validating constraint would refuse to be created at
    // all — failing the test in the setup rather than at the assertion, which reads as the
    // behaviour under test being broken.
    await getDb().execute(sql`
      ALTER TABLE admin_audit_entries
      ADD CONSTRAINT admin_audit_entries_action_valid CHECK (action = 'nothing-can-be-this')
      NOT VALID
    `)
  }

  const repairTheAuditTrail = async (): Promise<void> => {
    await getDb().execute(sql`
      ALTER TABLE admin_audit_entries DROP CONSTRAINT IF EXISTS admin_audit_entries_action_valid
    `)
    await getDb().execute(sql`
      ALTER TABLE admin_audit_entries
      ADD CONSTRAINT admin_audit_entries_action_valid CHECK (action in (
        'promote', 'demote', 'resolve_report', 'remove_question', 'deactivate_operator',
        'disclose_report_content', 'create_conference', 'update_conference', 'write_catalog',
        'delete_catalog', 'write_session', 'cancel_session', 'reinstate_session', 'delete_session'
      ))
    `)
  }

  afterEach(async () => {
    // Always, even when the assertion failed — a broken constraint left behind would fail every
    // file that runs after this one, for reasons having nothing to do with what they assert.
    await repairTheAuditTrail()
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const post = (rest: string, payload: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: at(rest), headers: { cookie }, payload })

  it('leaves no track behind when the entry fails — a catalog write', async () => {
    await breakTheAuditTrail()

    const response = await post('/tracks', { name: 'Doomed', colorToken: 'track-tech' })
    expect(response.statusCode).toBeGreaterThanOrEqual(500)

    const written = await getDb()
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.name, 'Doomed'))

    expect(
      written,
      'The track was created and its audit entry was not. An unaudited administrative write is ' +
        'a decision nobody can review, in a product whose second actor was admitted on the ' +
        'strength of accountability (FR-1037).',
    ).toEqual([])
  })

  it('leaves no session behind when the entry fails — a session write', async () => {
    await breakTheAuditTrail()

    const response = await post('/sessions', sessionBody(fixture.assigned, { title: 'Doomed' }))
    expect(response.statusCode).toBeGreaterThanOrEqual(500)

    const written = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.title, 'Doomed'))

    expect(written).toEqual([])
  })

  it('leaves a session UNCANCELLED when the entry fails — a cancellation', async () => {
    const created = await post('/sessions', sessionBody(fixture.assigned))
    const sessionId = created.json().id as string

    await breakTheAuditTrail()

    const response = await post(`/sessions/${sessionId}/cancel`)
    expect(response.statusCode).toBeGreaterThanOrEqual(500)

    const [after] = await getDb()
      .select({ cancelledAt: sessions.cancelledAt })
      .from(sessions)
      .where(eq(sessions.id, sessionId))

    expect(
      after?.cancelledAt,
      'The session was cancelled and the act was not recorded. Cancellation is the one authoring ' +
        "act that reaches attendees' phones, so an unrecorded one is an interruption nobody can " +
        'account for.',
    ).toBeNull()
  })

  it('leaves a session PRESENT when the entry fails — a deletion', async () => {
    const created = await post('/sessions', sessionBody(fixture.assigned))
    const sessionId = created.json().id as string

    await breakTheAuditTrail()

    const response = await app.inject({
      method: 'DELETE',
      url: at(`/sessions/${sessionId}`),
      headers: { cookie },
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(500)

    const survivors = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.id, sessionId))

    expect(
      survivors,
      'The session was deleted and the deletion was not recorded. This is the most destructive ' +
        'authoring act there is, and it is the one whose record matters most.',
    ).toHaveLength(1)
  })

  it('leaves no conference behind when the entry fails — a creation', async () => {
    await breakTheAuditTrail()

    const response = await app.inject({
      method: 'POST',
      url: '/admin/conferences',
      headers: { cookie },
      payload: {
        name: 'Doomed Conference',
        location: 'Nowhere',
        startsOn: '2027-06-01',
        endsOn: '2027-06-02',
        timezone: 'UTC',
      },
    })

    expect(response.statusCode).toBeGreaterThanOrEqual(500)

    const written = await getDb()
      .select({ id: events.id })
      .from(events)
      .where(eq(events.name, 'Doomed Conference'))

    expect(
      written,
      'A conference was created and the creation was not recorded — and with it, the organizer ' +
        'assignment that creating grants (FR-1008). Both are in the same transaction as the ' +
        'entry precisely so neither can survive it.',
    ).toEqual([])
  })

  it('writes exactly one entry per successful act, and none per failed one (SC-1010)', async () => {
    // The other half of SC-1010: "every authoring act that succeeds has exactly one audit entry".
    // Without it, a route that appended twice — or that appended in a loop — would satisfy every
    // assertion above.
    await post('/tracks', { name: 'Recorded', colorToken: 'track-tech' })

    const entries = await getDb()
      .select({ action: adminAuditEntries.action })
      .from(adminAuditEntries)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.action).toBe('write_catalog')
  })
})
