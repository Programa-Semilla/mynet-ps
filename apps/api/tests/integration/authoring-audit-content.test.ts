import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  sessionBody,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T025 (014) — **what an authoring entry records, and that there is still no way to read one**
 * (FR-1038, and 013's FR-999 unchanged).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **TWO CLAIMS, AND THE SECOND IS THE ONE A NEW ACT CATEGORY PUTS AT RISK.**
 *
 * FR-1038 asks the entry to record the principal, the conference, the act, the entity acted on
 * and the instant — and to leave **no read path over the trail in either product**. 013 built the
 * trail with no read path at all: `db/queries/admin-audit.ts` exports an append and a sweep, and
 * `audit-append-only.test.ts` asserts that by name-shape.
 *
 * 014 adds eight new actions and a new principal column, which is exactly the moment somebody
 * wants a screen showing "what has been changed in this conference". That screen would be the
 * read path FR-999 forbids, and it would also be an aggregate over changes — which FR-1031
 * forbids from the other direction. Neither is built, and this asserts both.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('what an authoring audit entry records (T025, FR-1038)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture
  let cookie: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    // Nothing cascades to `events`, so a fixture conference left behind blocks the NEXT file's
    // `seed()` — and the symptom lands there rather than here. See `clearAuthoringFixture`.
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)
    cookie = await organizerSession(app, ADA, SEED_PASSWORD)
  })

  const at = (rest: string): string => `/admin/conferences/${fixture.assigned.eventId}${rest}`

  const entries = () => getDb().select().from(adminAuditEntries)

  it('records the principal, the entity, the kind and the instant', async () => {
    const created = await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.assigned),
    })

    const sessionId = created.json().id as string
    const [entry] = await entries()

    expect(entry).toBeDefined()
    expect(entry?.action).toBe('write_session')
    expect(entry?.subjectResourceId).toBe(sessionId)
    expect(entry?.subjectKind).toBe('session')
    expect(entry?.occurredAt).toBeInstanceOf(Date)

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **The organizer lands in `actor_attendee_id`, not in `operator_id`.** A conference
    // organizer has no `operators` row by design (013), so this column exists precisely because
    // 013's six audited acts were all platform-tier and never had to answer the question.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    expect(entry?.actorAttendeeId).toBe(fixture.organizerId)
    expect(entry?.operatorId).toBeNull()
  })

  it('records nobody as the SUBJECT of an authoring act', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // `subject_attendee_id` means *whom the act was done to*, and an authoring act is done to
    // **content**. Filling it with, say, everybody who had saved the session would put an
    // attendee identifier into the record of every edit — and would then need pseudonymising on
    // a great many more erasures for no gain in accountability. 013's question-removal route
    // records the same reasoning.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.assigned),
    })

    const [entry] = await entries()
    expect(entry?.subjectAttendeeId).toBeNull()
  })

  it('names the conference on a conference-level act', async () => {
    await app.inject({
      method: 'PATCH',
      url: at(''),
      headers: { cookie },
      payload: { name: 'Renamed Conference' },
    })

    const [entry] = await entries()
    expect(entry?.action).toBe('update_conference')
    expect(entry?.subjectResourceId).toBe(fixture.assigned.eventId)
    expect(entry?.subjectKind).toBe('conference')
  })

  it('records each act category under its own action, not one generic name', async () => {
    const created = await app.inject({
      method: 'POST',
      url: at('/sessions'),
      headers: { cookie },
      payload: sessionBody(fixture.assigned),
    })
    const sessionId = created.json().id as string

    await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/cancel`),
      headers: { cookie },
    })
    await app.inject({
      method: 'POST',
      url: at(`/sessions/${sessionId}/reinstate`),
      headers: { cookie },
    })
    await app.inject({
      method: 'POST',
      url: at('/tracks'),
      headers: { cookie },
      payload: { name: 'Another', colorToken: 'track-tech' },
    })

    const recorded = (await entries()).map((entry) => entry.action)

    expect(
      recorded,
      'The act categories collapsed into one name. `cancel_session` and `delete_session` are ' +
        'deliberately separate because cancellation preserves every note, question and vote ' +
        'while deletion is permitted only where none exists — an entry that could not tell them ' +
        'apart would be unable to answer the only question anybody asks of it.',
    ).toEqual(['write_session', 'cancel_session', 'reinstate_session', 'write_catalog'])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-999 SURVIVES: THERE IS STILL NO READ PATH OVER THE TRAIL, IN EITHER PRODUCT.**
   *
   * Asserted three ways, because they fail independently: no route, no query function, and no
   * client mention. A screen showing "recent changes in this conference" would satisfy an obvious
   * product instinct and break all three at once.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  describe('and there is still no way to read one (FR-999)', () => {
    const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))
    const adminSrc = fileURLToPath(new URL('../../../admin/src/', import.meta.url))

    const filesUnder = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return filesUnder(path)
        return /\.tsx?$/.test(entry.name) ? [path] : []
      })

    /** 009's rule: every name below appears in the prose explaining the absence. */
    const codeOnly = (path: string): string =>
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ')

    it('exports no reader from the audit query layer', async () => {
      const module: Record<string, unknown> = await import('../../src/db/queries/admin-audit.js')

      const readers = Object.keys(module).filter((name) =>
        /^(list|get|find|read|search|fetch)/i.test(name),
      )

      expect(
        readers,
        'A read function has appeared in the audit query layer. The trail records THAT a ' +
          'disclosure or an act happened — never what was disclosed — and a function returning ' +
          'entries would turn the record into a second copy of the thing v4.1.0 carefully ' +
          'bounded (FR-999).',
      ).toEqual([])
    })

    it('registers no route that returns audit entries', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/admin/audit',
        headers: { cookie },
      })

      expect(response.statusCode).toBe(404)
    })

    it('never mentions the trail in the administrative client', () => {
      const mentions = filesUnder(adminSrc)
        .filter((path) => /adminAuditEntries|admin_audit_entries|auditEntr/i.test(codeOnly(path)))
        .map((path) => path.slice(adminSrc.length))

      expect(
        mentions,
        'The administrative client names the audit trail. There is no screen for it and this ' +
          'feature does not build one — 014 adds eight new act categories, which is exactly when ' +
          'somebody wants a "recent changes" view. That view is the read path FR-999 forbids, ' +
          'and it is also an aggregate over changes, which FR-1031 forbids from the other side.',
      ).toEqual([])
    })

    it('never selects from the trail anywhere in the API but its own module', () => {
      const readers = filesUnder(apiSrc)
        .filter((path) => /\badminAuditEntries\b/.test(codeOnly(path)))
        .map((path) => path.slice(apiSrc.length))
        .sort()

      expect(
        readers,
        'A module outside the four declared below names the trail. Appending goes through ' +
          '`appendAuditEntry`; a fifth reader is either a read path FR-999 forbids or a second ' +
          'place the retention rule is decided.',
      ).toEqual([
        // The append-and-sweep module, and the table definition.
        'db/queries/admin-audit.ts',
        // The operator retention sweep, which may not clear a deactivated operator while an
        // entry still names them (FR-909). It reads for an anti-join and returns no entry.
        'db/queries/operators.ts',
        'db/schema/admin-audit.ts',
        // The fixture, which clears the table so `DELETE FROM operators` can proceed.
        'db/seed/operators.ts',
      ])
    })
  })
})
