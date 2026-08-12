import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { pruneAuditEntries } from '../../src/db/queries/admin-audit.js'
import { pruneDeactivatedOperators } from '../../src/db/queries/operators.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { events } from '../../src/db/schema/events.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { RETENTION_SWEEPS } from '../../src/maintenance.js'
import { clearThrottle, resetDatabase, setupTestApp, SinkMailService, teardown } from './helpers.js'

/**
 * T127 (004) — **records no cascade can reach are absent once past the stated window**
 * (FR-381–FR-384, SC-308).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SPECIFICATION WAS WRONG ABOUT THIS, AND THE CORRECTION IS WHAT THESE TESTS PROTECT.**
 *
 * An earlier draft required a retention clock to be built and assumed a **90-day** window for
 * `sign_in_attempts`. Both were wrong about code that has run since 001: `maintenance.ts` sweeps
 * hourly and deletes those rows after **two hours**. Implementing the draft as written would
 * have *lengthened* retention of pseudonymous personal data forty-fold — a regression dressed as
 * a requirement (research D1).
 *
 * So FR-381–FR-384 were rewritten to protect what exists and extend it, and these assertions
 * are the protection: the window is asserted as an exact value, not as an upper bound, because
 * an upper bound would have accepted the 90 days.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the retention sweep (SC-308)', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    mail.clear()
  })

  const runAll = async (): Promise<void> => {
    for (const sweep of RETENTION_SWEEPS) await sweep.run()
  }

  const countIn = async (table: string): Promise<number> => {
    const rows = await getDb().execute<{ count: string }>(
      sql.raw(`SELECT count(*)::text AS count FROM ${table}`),
    )
    return Number(rows[0]?.count)
  }

  it('sweeps every table it declares, and each states a window and a reason (FR-381)', () => {
    expect(RETENTION_SWEEPS.length).toBeGreaterThanOrEqual(4)

    for (const sweep of RETENTION_SWEEPS) {
      expect(sweep.window.trim().length).toBeGreaterThan(0)
      expect(sweep.reason.trim().length).toBeGreaterThan(20)
    }
  })

  it('holds sign_in_attempts to TWO HOURS, which FR-382 forbids lengthening', () => {
    const attempts = RETENTION_SWEEPS.find((sweep) => sweep.table === 'sign_in_attempts')

    // Exact, not "at most". An upper-bound assertion would have accepted the 90 days the
    // specification draft asked for.
    expect(attempts?.window).toBe('2 hours')
  })

  it('removes sign_in_attempts past the window — the one record no cascade reaches', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'somebody@example.com', password: 'wrong' },
    })
    expect(await countIn('sign_in_attempts')).toBeGreaterThan(0)

    await getDb().execute(sql`
      UPDATE sign_in_attempts SET occurred_at = now() - interval '3 hours'
    `)
    await runAll()

    expect(await countIn('sign_in_attempts')).toBe(0)
  })

  it('keeps sign_in_attempts INSIDE the window, so throttling stays correct (FR-383)', async () => {
    // The other half of the requirement: purging must not interfere with the correctness of
    // throttling within the active window. A sweep that deleted rows the throttle is still
    // counting would silently reset every attacker's streak.
    await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: 'recent@example.com', password: 'wrong' },
    })

    const before = await countIn('sign_in_attempts')
    await runAll()

    expect(await countIn('sign_in_attempts')).toBe(before)
  })

  it('removes consumed and expired verification material (FR-384)', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'sweep-verification@example.com',
        displayName: 'Sweep',
        password: 'correct-horse-battery-staple',
      },
    })
    expect(await countIn('attendee_verifications')).toBeGreaterThan(0)

    // Unexpired and unconsumed rows must survive — the sweep removes what can never be used
    // again, not everything.
    await runAll()
    expect(await countIn('attendee_verifications')).toBeGreaterThan(0)

    await getDb().execute(sql`
      UPDATE attendee_verifications SET expires_at = now() - interval '1 minute'
    `)
    await runAll()
    expect(await countIn('attendee_verifications')).toBe(0)
  })

  it('removes consumed reset material, which is a record of a recovery nobody needs', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'sweep-reset@example.com',
        displayName: 'Sweep Reset',
        password: 'correct-horse-battery-staple',
      },
    })
    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'sweep-reset@example.com' },
    })

    expect(await countIn('attendee_password_resets')).toBeGreaterThan(0)

    await getDb().execute(sql`UPDATE attendee_password_resets SET consumed_at = now()`)
    await runAll()

    expect(await countIn('attendee_password_resets')).toBe(0)
  })

  it('leaves live reset material alone, so recovery still works mid-sweep', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'live-reset@example.com',
        displayName: 'Live',
        password: 'correct-horse-battery-staple',
      },
    })
    mail.clear()
    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'live-reset@example.com' },
    })

    await runAll()

    const message = mail.lastTo('live-reset@example.com', 'password-reset')
    const token = new URL(message!.link).searchParams.get('token') as string

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token, password: 'a-brand-new-passphrase' },
    })

    expect(
      reset.statusCode,
      'The sweep removes what can never be used again. A live link is not that.',
    ).toBe(204)
  })

  it('keeps sweeping when one table fails, rather than skipping the rest', async () => {
    // The failure mode a single try/catch around the loop would produce: one failing DELETE
    // silently skips every sweep after it — and each of those is a retention obligation.
    const outcomes: string[] = []

    for (const sweep of RETENTION_SWEEPS) {
      try {
        await sweep.run()
        outcomes.push(sweep.table)
      } catch {
        outcomes.push(`${sweep.table}:failed`)
      }
    }

    expect(outcomes).toHaveLength(RETENTION_SWEEPS.length)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * 011 — **THE OPERATOR SWEEP MUST NOT RAISE WHEN THE OPERATOR PROMOTED SOMEBODY.**
   *
   * Added at the deep-review gate. `pruneDeactivatedOperators` skipped operators still named by
   * `admin_audit_entries` or `report_resolutions` — and **not** by `organizer_assignments`, whose
   * `assigned_by` is `NOT NULL` and `ON DELETE NO ACTION`. So a long-deactivated operator who had
   * ever promoted anybody made the `DELETE` raise a foreign-key violation.
   *
   * The consequence is worse than a failed delete: `maintenance.ts` logs a failing sweep and
   * continues, so the error was silent and the row would never be removed — "a sweep that
   * reliably errors is a retention rule that never runs", which is the hazard that module's own
   * header warns about, reached through the one referrer it forgot to check.
   *
   * The test asserts the sweep **completes**, because the defect was an exception rather than a
   * wrong row count. Nothing else in the suite executes this function at all.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('completes when a deactivated operator still has an organizer assignment (FR-909)', async () => {
    const db = getDb()

    const [operator] = await db
      .insert(operators)
      .values({
        email: 'swept-operator@mynet.invalid',
        displayName: 'Long Deactivated',
        passwordHash: null,
        credentialIsInitial: false,
        // Comfortably past the retention window, so the row is a candidate for deletion.
        deactivatedAt: sql`now() - interval '400 days'`,
      })
      .returning({ id: operators.id })

    const [attendee] = await db.select({ id: attendees.id }).from(attendees).limit(1)
    const [event] = await db.select({ id: events.id }).from(events).limit(1)

    // Revoked, deliberately: revoked rows are kept as history, so they still refuse the delete.
    await db.insert(organizerAssignments).values({
      attendeeId: attendee!.id,
      eventId: event!.id,
      assignedBy: operator!.id,
      revokedAt: new Date(),
    })

    await expect(
      pruneDeactivatedOperators(),
      'the operator sweep raised because a deactivated operator was still named by an organizer ' +
        'assignment. `assigned_by` is NO ACTION, so the row must be skipped explicitly — and a ' +
        'raising sweep is silent, because maintenance logs and continues.',
    ).resolves.toBeUndefined()

    // Skipped rather than deleted: the assignment still explains who granted that authority.
    const survivors = await db
      .select({ id: operators.id })
      .from(operators)
      .where(eq(operators.id, operator!.id))
    expect(survivors).toHaveLength(1)

    await db.delete(organizerAssignments)
    await db.delete(operators)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **011 — THE OPERATOR SWEEP ACTUALLY REMOVES A ROW NOTHING NAMES** (FR-909, FR-984).
   *
   * The test above asserts the sweep *completes* when a referrer exists. On its own that is
   * satisfied by a sweep that deletes nothing ever, which is precisely the failure mode
   * `maintenance.ts`'s header warns about — "a sweep that reliably errors is a retention rule
   * that never runs" reads the same for a sweep that reliably skips.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('removes a deactivated operator past the window that nothing still names (FR-909)', async () => {
    const db = getDb()

    const [operator] = await db
      .insert(operators)
      .values({
        email: 'unreferenced-operator@mynet.invalid',
        displayName: 'Nothing Names Them',
        passwordHash: null,
        credentialIsInitial: false,
        deactivatedAt: sql`now() - interval '400 days'`,
      })
      .returning({ id: operators.id })

    await pruneDeactivatedOperators()

    expect(
      await db.select({ id: operators.id }).from(operators).where(eq(operators.id, operator!.id)),
      'A deactivated operator past the retention window, named by nothing, survived the sweep. ' +
        'Deactivation is terminal and the row identifies a person who no longer works here.',
    ).toHaveLength(0)
  })

  it('leaves a recently deactivated operator alone, and an active one entirely alone', async () => {
    const db = getDb()

    await db.insert(operators).values([
      {
        email: 'recently-deactivated@mynet.invalid',
        displayName: 'Recently Gone',
        deactivatedAt: sql`now() - interval '1 day'`,
      },
      { email: 'still-serving@mynet.invalid', displayName: 'Still Here' },
    ])

    await pruneDeactivatedOperators()

    expect(
      await countIn('operators'),
      'The sweep took an operator inside the window, or one who is still active. The window ' +
        'runs from when access ended, and an active operator has no clock at all.',
    ).toBe(2)

    await db.delete(operators)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **011 — THE AUDIT SWEEP IS PSEUDONYMISE-PLUS-CLOCK, AND BOTH HALVES MATTER** (FR-998).
   *
   * `pruneAuditEntries` had no behavioural test at all. Its predicate has two conjuncts and each
   * protects a different thing: `subject_attendee_id IS NULL` keeps a trail that still names a
   * **living** attendee, because that accountability is still live; the age bound is what stops
   * a pseudonymised entry surviving forever.
   *
   * Dropping either is invisible to every other test. Dropping the first deletes accountability
   * for people who are still here; dropping the second retains it indefinitely.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **A KNOWN DISCREPANCY IS ENCODED HERE RATHER THAN HIDDEN.**
   *
   * `maintenance.ts` declares this window as *"365 days after pseudonymisation"*, and
   * `admin-audit.ts` says the clock "starts then". **It does not** — the predicate measures
   * `occurred_at`, so an entry that occurred 400 days ago and was pseudonymised yesterday is
   * swept on the next pass rather than a year later. Closing that gap needs a
   * `pseudonymised_at` column and therefore a migration, so it is recorded as an open item
   * rather than changed here. The last assertion below pins the behaviour that actually ships,
   * so nobody discovers it by reading the comment and believing it.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  describe('the administrative audit sweep (FR-998)', () => {
    const insertEntry = async (input: {
      subjectAttendeeId: string | null
      occurredAgo: string
    }): Promise<string> => {
      const db = getDb()
      const [operator] = await db
        .insert(operators)
        .values({
          email: `audit-${Math.abs(hash(input.occurredAgo))}@mynet.invalid`,
          displayName: 'Acting',
        })
        .onConflictDoNothing()
        .returning({ id: operators.id })

      const operatorId =
        operator?.id ?? (await db.select({ id: operators.id }).from(operators).limit(1))[0]!.id

      const [entry] = await db
        .insert(adminAuditEntries)
        .values({
          operatorId,
          action: 'promote',
          subjectAttendeeId: input.subjectAttendeeId,
          occurredAt: sql`now() - ${sql.raw(`interval '${input.occurredAgo}'`)}`,
        })
        .returning({ id: adminAuditEntries.id })

      return entry!.id
    }

    /** Stable per-string suffix, so the fixture operators do not collide on the unique address. */
    const hash = (value: string): number =>
      [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) | 0, 7)

    beforeEach(async () => {
      const db = getDb()
      await db.delete(adminAuditEntries)
      await db.delete(organizerAssignments)
      await db.delete(operators)
    })

    it('removes a pseudonymised entry past the window', async () => {
      const id = await insertEntry({ subjectAttendeeId: null, occurredAgo: '400 days' })

      await pruneAuditEntries()

      expect(
        await getDb()
          .select({ id: adminAuditEntries.id })
          .from(adminAuditEntries)
          .where(eq(adminAuditEntries.id, id)),
      ).toHaveLength(0)
    })

    it('keeps an entry that still names an attendee, however old it is', async () => {
      const db = getDb()
      const [attendee] = await db.select({ id: attendees.id }).from(attendees).limit(1)
      const id = await insertEntry({
        subjectAttendeeId: attendee!.id,
        occurredAgo: '4000 days',
      })

      await pruneAuditEntries()

      expect(
        await db
          .select({ id: adminAuditEntries.id })
          .from(adminAuditEntries)
          .where(eq(adminAuditEntries.id, id)),
        'An audit entry naming a living attendee was swept on age alone. That accountability is ' +
          'still live — the clock is meant to start when THEY are erased (FR-997a, FR-998), and ' +
          'this is the conjunct that expresses it.',
      ).toHaveLength(1)
    })

    it('keeps a recently pseudonymised entry inside the window', async () => {
      const id = await insertEntry({ subjectAttendeeId: null, occurredAgo: '10 days' })

      await pruneAuditEntries()

      expect(
        await getDb()
          .select({ id: adminAuditEntries.id })
          .from(adminAuditEntries)
          .where(eq(adminAuditEntries.id, id)),
        'A pseudonymous entry inside the window was swept. The floor is not arbitrary: it must ' +
          'outlast the 90-day report retention it explains, or the act is left unexplained.',
      ).toHaveLength(1)
    })

    it('measures the window from occurred_at, not from pseudonymisation — the known gap', async () => {
      // An entry written long ago and pseudonymised *today*. The declared window says it has a
      // year left; the shipped predicate sweeps it now. Asserted so the discrepancy is visible
      // in a test run rather than only in a comment somebody has to read.
      const id = await insertEntry({ subjectAttendeeId: null, occurredAgo: '400 days' })

      await pruneAuditEntries()

      expect(
        await getDb()
          .select({ id: adminAuditEntries.id })
          .from(adminAuditEntries)
          .where(eq(adminAuditEntries.id, id)),
        'This assertion encodes CURRENT behaviour, not desired behaviour. If it starts failing, ' +
          'somebody has added a `pseudonymised_at` column and the window now runs from erasure ' +
          'as `maintenance.ts` and `admin-audit.ts` both already claim — in which case delete ' +
          'this test and correct the two comments.',
      ).toHaveLength(0)
    })
  })
})
