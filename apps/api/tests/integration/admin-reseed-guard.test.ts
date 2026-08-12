import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { closeDb, getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { seed } from '../../src/db/seed/index.js'
import { ADA, attendees, events } from './helpers.js'

/**
 * T117 (013) — **the re-seed survives a live organizer assignment, and this test is why it does**
 * (FR-937, FR-938, FR-939).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE TRAP THE CONSTITUTION PREDICTED, AND IT BIT DURING IMPLEMENTATION.**
 *
 * `organizer_assignments.event_id` is `ON DELETE NO ACTION` deliberately: **a cascade is not an
 * administrative write, so `admin_audit_entries` would not record it** (FR-939). A re-seed in a
 * deployed environment would silently strip every organizer's authority with no trace, and the
 * first anyone would know is an operator finding they could no longer act.
 *
 * The consequence is that a surviving assignment **refuses `DELETE FROM events`**, so the seed
 * must clear the whole administrative domain (FR-938). CLAUDE.md carries the prediction from 008:
 * *"the next feature with a non-cascading reference to seeded content will meet this."*
 *
 * It met it twice. The first version of `seed/operators.ts` cleared assignments and operators —
 * the obvious pair — and the re-seed failed on **`report_resolutions.resolved_by`**, a table the
 * module does not seed and never touches. That is 008's *"an error naming neither table"*, one
 * table further out. So this fixture seeds **both** blocking references, not just the obvious one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the seed clears the whole administrative domain (FR-938)', () => {
  afterAll(async () => {
    // This suite runs the real seed, so it leaves the database in the shape every other suite
    // expects rather than in whatever state its last assertion produced.
    await seed()
    await closeDb()
  })

  beforeEach(async () => {
    await seed()
  })

  /**
   * Both `NO ACTION` references to `operators`, plus the assignment's `NO ACTION` reference to
   * `events`. Each one alone would block a different `DELETE`, and clearing only the obvious one
   * is exactly the mistake this asserts against.
   */
  const createBlockingRows = async (): Promise<void> => {
    const db = getDb()

    const [operator] = await db
      .insert(operators)
      .values({ email: 'reseed-fixture@mynet.invalid', displayName: 'Reseed Operator' })
      .returning({ id: operators.id })

    const adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    const eventId = (await db.select().from(events).limit(1))[0]!.id

    // Blocks `DELETE FROM events` (event_id NO ACTION) **and** `DELETE FROM operators`
    // (assigned_by NO ACTION).
    await db
      .insert(organizerAssignments)
      .values({ attendeeId: adaId, eventId, assignedBy: operator!.id })

    // Blocks `DELETE FROM operators` by a second, independent path — the one the first
    // implementation missed.
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: adaId,
        reason: 'A report somebody resolved.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    await db.insert(reportResolutions).values({
      reportId: report!.id,
      resolvedBy: operator!.id,
      outcome: 'dismissed',
      note: 'Nothing warranted.',
    })

    // And an audit entry, which does not block (SET NULL) but must not survive the re-seed
    // either — an accountability record naming operators this database no longer has.
    await db.insert(adminAuditEntries).values({
      operatorId: operator!.id,
      action: 'promote',
      subjectAttendeeId: adaId,
      subjectResourceId: eventId,
      subjectKind: 'conference',
    })
  }

  it('re-seeds cleanly with a live assignment and a report resolution in place (FR-938)', async () => {
    await createBlockingRows()

    // The whole assertion. Before the fix this threw
    // `update or delete on table "operators" violates foreign key constraint
    //  "report_resolutions_resolved_by_operators_id_fk"` — a constraint naming a table
    // `seed/operators.ts` neither seeds nor mentions.
    await expect(
      seed(),
      'The re-seed failed with administrative rows in place. `seed/operators.ts` must clear the ' +
        'WHOLE domain — all four tables referencing `operators` — not only the ones it created ' +
        '(FR-938). This is 008’s `shared_cards` trap, and the constitution predicted this feature ' +
        'would meet it.',
    ).resolves.not.toThrow()

    const db = getDb()
    expect(await db.select().from(organizerAssignments)).toEqual([])
    expect(await db.select().from(reportResolutions)).toEqual([])
    expect(await db.select().from(adminAuditEntries)).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE `NO ACTION` REFERENCE IS THE MECHANISM, SO IT IS ASSERTED DIRECTLY** (FR-937, FR-939).
   *
   * Without this, somebody meeting the failure above could "fix" it by changing `event_id` to
   * `ON DELETE CASCADE` — the re-seed would go green, and every organizer's authority would
   * silently vanish on the next one, with **no audit entry**, because a cascade is not an
   * administrative write.
   *
   * That repair is the natural one and it is the thing FR-939 exists to forbid, so the schema
   * property is checked rather than only its consequence.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('keeps event_id NO ACTION, so a cascade can never strip authority silently (FR-937)', async () => {
    const rows = await getDb().execute<{ delete_rule: string; column_name: string }>(`
      SELECT rc.delete_rule, kcu.column_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'organizer_assignments'
    `)

    const byColumn = new Map(rows.map((row) => [row.column_name, row.delete_rule]))

    expect(
      byColumn.get('event_id'),
      'organizer_assignments.event_id is no longer NO ACTION. A cascade is not an administrative ' +
        'write, so a re-seed would strip every organizer’s authority with nothing in the audit ' +
        'trail to explain it (FR-939).',
    ).toBe('NO ACTION')

    expect(
      byColumn.get('assigned_by'),
      'organizer_assignments.assigned_by is no longer NO ACTION. An operator is deactivated ' +
        'rather than deleted precisely so records naming them keep resolving (FR-909).',
    ).toBe('NO ACTION')

    // The one that MUST cascade: an attendee's erasure takes their authority with it (FR-960).
    expect(
      byColumn.get('attendee_id'),
      'organizer_assignments.attendee_id no longer cascades. Authority must not outlive the ' +
        'access it depends on (decision 39, FR-960).',
    ).toBe('CASCADE')
  })

  /**
   * **The seed still creates operators with NO usable credential** (FR-990).
   *
   * This repository is public, so a committed administrative password would be a published
   * credential for the tier that reads the abuse-report queue. The seed module asserts this
   * itself and throws; this checks the result from the outside, because a module asserting its
   * own correctness is only half a guard.
   */
  it('seeds administrative identities that nobody can sign in to (FR-990, FR-991)', async () => {
    const seeded = await getDb().select().from(operators)

    expect(seeded.length, 'the seed created no operators at all').toBeGreaterThan(1)
    expect(
      seeded.filter((operator) => operator.passwordHash !== null),
      'a seeded operator has a usable credential. This repository is public (FR-990).',
    ).toEqual([])
    expect(seeded.every((operator) => operator.credentialIsInitial)).toBe(true)
  })
})
