import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mintPlatformScope } from '../../src/admin/scope.js'
import { getDb } from '../../src/db/client.js'
import { promoteToOrganizer } from '../../src/db/queries/admin-assignments.js'
import { appendAuditEntry } from '../../src/db/queries/admin-audit.js'
import { listReports } from '../../src/db/queries/admin-reports.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { ADA, attendees, registrations, setupTestApp, teardown } from './helpers.js'

/**
 * **THE ACT AND THE ENTRY THAT ACCOUNTS FOR IT COMMIT TOGETHER, OR NEITHER DOES** (FR-994).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WRITTEN BECAUSE THE GUARANTEE WAS STATED AND NOT IMPLEMENTED.**
 *
 * `appendAuditEntry` has taken an executor since it was written, and its header asserted in bold
 * that *"callers pass their transaction when they have one, and every write path does."* Not one
 * of the five did. Every administrative act ran its write, committed it, and then appended an
 * entry in a separate statement — so a failing insert left the act done and unrecorded, which is
 * exactly the state FR-994 exists to forbid. Three of five review agents found it independently.
 *
 * The source-level half is in `admin-audit-completeness.test.ts`, which fails when a caller drops
 * the argument. **This is the behavioural half**, and it is here because a passed argument that
 * does not actually roll anything back would satisfy that guard while changing nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **The insert is failed by an undeclared action, not by a broken operator reference.**
 *
 * The obvious lever — an `operatorId` naming no operator — fails the *act* first, because
 * `organizer_assignments.assigned_by` references `operators` too. The act would never happen and
 * the test would pass while proving nothing about ordering. An action outside the declared six
 * violates the check constraint on `admin_audit_entries` alone, so the act succeeds and only the
 * entry fails: the precise sequence the guarantee is about.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'atomicity-fixture@mynet.invalid'

describe('an administrative act and its audit entry are one transaction (FR-994)', () => {
  let app: FastifyInstance
  let operatorId: string
  let adaId: string
  let eventId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(abuseReports)
    await db.delete(organizerAssignments)
    await db.delete(operators)

    const [operator] = await db
      .insert(operators)
      .values({ email: OPERATOR_EMAIL, displayName: 'Atomicity Operator' })
      .returning({ id: operators.id })
    operatorId = operator!.id

    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    eventId = (
      await db
        .select({ eventId: registrations.eventId })
        .from(registrations)
        .where(eq(registrations.attendeeId, adaId))
    )[0]!.eventId
  })

  it('rolls the act back when its audit entry cannot be written', async () => {
    const scope = mintPlatformScope(operatorId)
    const db = getDb()

    await expect(
      db.transaction(async (tx) => {
        const outcome = await promoteToOrganizer(scope, { eventId, attendeeId: adaId }, tx)
        // The act itself succeeds. That is the precondition for this test meaning anything: if
        // the promotion failed here, the empty table below would prove nothing about ordering.
        expect(outcome, 'the promotion did not happen, so the rollback proves nothing').toBe(
          'promoted',
        )

        await appendAuditEntry(
          {
            operatorId,
            action: 'not_a_declared_action' as never,
            subjectAttendeeId: adaId,
            subjectResourceId: eventId,
            subjectKind: 'conference',
          },
          tx,
        )
      }),
    ).rejects.toThrow()

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // **The assertion that matters.** Before the fix this list held one row: an attendee who is
    // an organizer of a conference, with nothing anywhere recording who made them one or when.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    expect(
      await db.select().from(organizerAssignments),
      'The promotion survived the failure of the entry that accounts for it. An administrative ' +
        'act that commits unrecorded is precisely what FR-994 promises cannot happen — the ' +
        'second actor was admitted on the strength of that accountability (decision 32).',
    ).toEqual([])

    expect(await db.select().from(adminAuditEntries)).toEqual([])
  })

  it('commits both when the entry is valid', async () => {
    // The positive case. Without it a `promoteToOrganizer` broken to always fail would make the
    // test above pass while the feature did nothing at all.
    const scope = mintPlatformScope(operatorId)
    const db = getDb()

    await db.transaction(async (tx) => {
      await promoteToOrganizer(scope, { eventId, attendeeId: adaId }, tx)
      await appendAuditEntry(
        {
          operatorId,
          action: 'promote',
          subjectAttendeeId: adaId,
          subjectResourceId: eventId,
          subjectKind: 'conference',
        },
        tx,
      )
    })

    expect(await db.select().from(organizerAssignments)).toHaveLength(1)
    expect(await db.select().from(adminAuditEntries)).toHaveLength(1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE FOURTH BRANDED SCOPE IS ENFORCED AT THE QUERY, LIKE THE OTHER THREE** (FR-905).
   *
   * `assertVerifiedOperator` existed, was documented as being *"called at the query layer, not
   * only at the route"*, and was called nowhere. `assertVerifiedScope` is called in `catalog.ts`,
   * `directory.ts`, `account.ts`, `profiles.ts` and `agenda.ts`; `assertVerifiedParticipation` in
   * `conversations.ts` and `messages.ts`. This one had neither the placement nor a test for it.
   *
   * `admin-scope-brand.test.ts` proves the *function* refuses a forgery. This proves a **query**
   * consults it — the difference between a guard existing and a guard being used.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses an administrative query handed an unbranded scope (FR-905)', async () => {
    const forged = { operatorId, attendeeId: null, tier: 'platform' as const }

    await expect(
      listReports(forged as never),
      'The report queue answered a scope no guard issued. The brand is the only thing standing ' +
        'between a shape-compatible object and the third Principle VIII exception.',
    ).rejects.toThrow()
  })
})
