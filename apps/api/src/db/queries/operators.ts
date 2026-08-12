import { and, eq, isNotNull, isNull, lt, notExists, sql } from 'drizzle-orm'

import { assertVerifiedOperator, type PlatformScope } from '../../admin/scope.js'
import { getDb } from '../client.js'
import { adminAuditEntries } from '../schema/admin-audit.js'
import { operators, type Operator } from '../schema/operators.js'
import { organizerAssignments } from '../schema/organizer-assignments.js'
import { reportResolutions } from '../schema/report-resolutions.js'

/**
 * T017, T140 (011) — reads and lifecycle writes for the platform-operator identity (FR-900,
 * FR-908, FR-909).
 *
 * **There is no `deleteOperator` here, and there is no route that could call one.** Principle
 * VIII's erasure right belongs to an *attendee*, and an operator is not one; deactivation is the
 * terminal state, and the sweep below is the only thing that ever removes a row.
 */

/** Resolved by address for the single-lookup sign-in path (FR-914, FR-915). */
export const findOperatorByEmail = async (email: string): Promise<Operator | undefined> => {
  const rows = await getDb().select().from(operators).where(eq(operators.email, email)).limit(1)
  return rows[0]
}

export const findOperatorById = async (id: string): Promise<Operator | undefined> => {
  const rows = await getDb().select().from(operators).where(eq(operators.id, id)).limit(1)
  return rows[0]
}

/**
 * Ends an operator's access permanently and immediately (FR-908).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Immediate means their live sessions stop working, not that they stop working at next
 * sign-in.** `requireOperator` re-reads the operator row on every request and refuses a
 * deactivated one, so no session revocation is needed here and none is performed — which is the
 * simpler and stricter arrangement, because a revocation loop can miss a row and a guard cannot.
 *
 * Idempotent: deactivating an already-deactivated operator leaves the original instant alone.
 * The instant is when access ended, and a second call must not move it — the retention clock
 * below runs from it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const deactivateOperator = async (
  unverified: PlatformScope,
  id: string,
  db: Pick<ReturnType<typeof getDb>, 'update'> = getDb(),
): Promise<boolean> => {
  assertVerifiedOperator(unverified)

  const rows = await db
    .update(operators)
    .set({ deactivatedAt: sql`now()` })
    .where(and(eq(operators.id, id), isNull(operators.deactivatedAt)))
    .returning({ id: operators.id })

  return rows.length > 0
}

/**
 * How long a deactivated operator's row survives once **nothing names it** (FR-909, FR-984).
 *
 * Ninety days after the last record referring to them is gone. Short, because by then the row
 * identifies a person who no longer works here and explains nothing that still exists.
 */
export const OPERATOR_RETENTION_DAYS = 90

/**
 * The retention sweep for `operators` — **deactivate-plus-clock** (FR-909, FR-984).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE CLOCK IS NOT THE WHOLE RULE, AND THE `NOT EXISTS` HALF IS THE PART THAT MATTERS.**
 *
 * FR-909 requires a deactivated operator to keep resolving on **records that name them** — an
 * audit entry, a report resolution — because a resolution attributed to nobody is an
 * accountability record with the accountability removed. So this sweeps only rows that are
 * *both* long deactivated *and* referenced by nothing.
 *
 * A clock alone would be wrong in a way that only surfaces later: it would eventually delete an
 * operator while a `report_resolutions.resolved_by` row still pointed at them, and that
 * reference is `NO ACTION` — so the DELETE would fail rather than silently corrupt anything.
 * Failing loudly is the better of the two bad outcomes, but a sweep that reliably errors is a
 * retention rule that never runs, and `maintenance.ts` logs and continues past a failing sweep.
 *
 * Checked against **all three** referring tables explicitly rather than by catching the
 * constraint violation, so the rule is legible here rather than deduced from an error handler.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THERE ARE THREE, AND THIS CHECKED TWO.**
 *
 * `organizer_assignments.assigned_by` is `NOT NULL` and `ON DELETE NO ACTION` (migration 0009),
 * which `admin-reseed-guard.test.ts` states in as many words — an assignment row blocks
 * `DELETE FROM operators` exactly as it blocks `DELETE FROM events`. It was missing here, so a
 * deactivated operator who had ever promoted anybody made this statement raise a foreign-key
 * violation.
 *
 * The failure was silent and permanent, which is why it is worth the extra clause rather than an
 * error handler: `maintenance.ts` logs a failing sweep and continues, so the row would never be
 * removed and nothing would say so — the "sweep that reliably errors is a retention rule that
 * never runs" case this file's own header warns about, reached by the one referrer it forgot.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const pruneDeactivatedOperators = async (): Promise<void> => {
  const db = getDb()

  await db.delete(operators).where(
    and(
      isNotNull(operators.deactivatedAt),
      lt(
        operators.deactivatedAt,
        sql`now() - ${sql.raw(`interval '${OPERATOR_RETENTION_DAYS} days'`)}`,
      ),
      notExists(
        db
          .select({ one: sql`1` })
          .from(adminAuditEntries)
          .where(eq(adminAuditEntries.operatorId, operators.id)),
      ),
      notExists(
        db
          .select({ one: sql`1` })
          .from(reportResolutions)
          .where(eq(reportResolutions.resolvedBy, operators.id)),
      ),
      // The third referrer. `assigned_by` is NOT NULL and NO ACTION, so a surviving assignment
      // — live or revoked, since revoked rows are kept as history — refuses the delete.
      notExists(
        db
          .select({ one: sql`1` })
          .from(organizerAssignments)
          .where(eq(organizerAssignments.assignedBy, operators.id)),
      ),
    ),
  )
}
