import { and, isNotNull, lt, sql } from 'drizzle-orm'

import { getDb } from '../client.js'
import { adminAuditEntries, type AdminAuditAction } from '../schema/admin-audit.js'

/**
 * T034 (011) — **the audit trail: append and sweep, and nothing else** (FR-994–FR-999,
 * research R6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS APPEND-AND-SWEEP ONLY, AND THAT IS FR-996's ENTIRE IMPLEMENTATION.**
 *
 * There is no `updateAuditEntry`, no `deleteAuditEntry`, no `listAuditEntries`, no
 * `getAuditEntry`. Append-only is not enforced by a database trigger or by a convention people
 * are asked to remember — it is enforced by **there being no function that could do otherwise**,
 * asserted by name-shape over this module's exports in `tests/unit/audit-append-only.test.ts`.
 *
 * That is the mechanism `catalog-read-only.test.ts` already uses for FR-191, and 007's
 * `db/queries/reports.ts` uses for FR-548. Its header says the thing worth repeating here: the
 * absent function is absent *not because nobody has needed one yet*, but because it is the first
 * half of something the governance forbids.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE TWO ABSENCES ARE DIFFERENT AND BOTH MATTER.**
 *
 *   - **No update or delete** is FR-996. An accountability record an operator can edit accounts
 *     for nothing, and the operator with the most reason to edit it is the one it indicts.
 *
 *   - **No read** is FR-999. The trail records *that* a disclosure happened — never what was
 *     disclosed — and a route returning entries would turn the record into a second copy of the
 *     thing v4.1.0's third Principle VIII exception carefully bounded. There is no
 *     administrative screen for this and this feature does not build one.
 *
 * `pruneAuditEntries` is neither: it selects nothing and returns a count of rows removed. It is
 * **the single exception to append-only**, and it lives here rather than outside the module
 * because a sweep that could not be found is a retention rule nobody maintains.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * What one administrative act records.
 *
 * `operatorId` is required at the call site even though the column is nullable: the column is
 * nullable so the *sweep* can eventually clear a deactivated operator, not so a caller can omit
 * one. An entry written with no operator would be an accountability record accounting for
 * nobody.
 */
export interface AuditEntryDraft {
  readonly operatorId: string
  readonly action: AdminAuditAction
  /**
   * The attendee this act concerns, if any. **Cleared on their erasure** (FR-997a) — see
   * `schema/admin-audit.ts` for why this is a plain column with no foreign key.
   */
  readonly subjectAttendeeId?: string | undefined
  readonly subjectResourceId?: string | undefined
  readonly subjectKind?: string | undefined
}

/**
 * Records one administrative act (FR-994) or one content disclosure (FR-995).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Callers pass their transaction when they have one, and every write path does.**
 *
 * An audit entry that lands while the act it records is rolled back is a record of something
 * that did not happen; an act that commits while its entry is rolled back is an unrecorded
 * administrative write. Both are wrong, and taking the executor as a parameter is what lets the
 * caller put the two in one transaction. `db` defaults to the pool for the one caller that has
 * no transaction to join — the disclosure entry on `GET /admin/reports/:reportId`, which is a
 * read.
 *
 * Note what this deliberately does **not** do: it does not swallow its own failure. 007's
 * report-mail dispatch is isolated from the block it accompanies because a failed dispatch must
 * not undo a safety action; the opposite holds here. If the entry cannot be written, the
 * administrative act must not commit — an unaudited promotion is worse than a failed one.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const appendAuditEntry = async (
  entry: AuditEntryDraft,
  db: Pick<ReturnType<typeof getDb>, 'insert'> = getDb(),
): Promise<void> => {
  await db.insert(adminAuditEntries).values({
    operatorId: entry.operatorId,
    action: entry.action,
    subjectAttendeeId: entry.subjectAttendeeId ?? null,
    subjectResourceId: entry.subjectResourceId ?? null,
    subjectKind: entry.subjectKind ?? null,
  })
}

/**
 * How long a **pseudonymised** entry survives (FR-998).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **ONE YEAR, AND THE FLOOR IS NOT ARBITRARY: IT MUST NOT BE SHORTER THAN THE RETENTION OF THE
 * RECORDS IT EXPLAINS.**
 *
 * `abuse_reports` is swept at 90 days and `report_resolutions` cascades with it, so a resolution
 * can be a quarter old. An audit trail expiring before the resolution it accounts for would
 * leave the act unexplained — which is the one failure mode an accountability record has.
 *
 * A year is comfortably past that and is the shortest window that still lets somebody ask "who
 * removed this, and when" about anything that happened in the season just gone. Stated as a
 * constant rather than configuration, for the reason 007 gives about `REPORT_RETENTION_DAYS`:
 * lengthening a retention window for personal data is a decision that belongs in a review, not
 * in an environment variable.
 *
 * **Only pseudonymised entries are swept.** An entry still naming a living attendee is
 * accountability that is still live; it is cleared when *they* are erased (FR-997a), and the
 * clock starts then. That is what "pseudonymise-plus-clock" means, and it is why this predicate
 * reads `subject_attendee_id IS NULL` rather than only an age.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const AUDIT_RETENTION_DAYS = 365

/**
 * The single exception to append-only. Selects nothing; returns nothing.
 *
 * **An entry that never named an attendee is swept on age alone**, which is correct rather than
 * an oversight: `deactivate_operator` and most `resolve_report` entries name a resource and no
 * person, and they are pseudonymous from birth in exactly the sense a cleared one is.
 */
export const pruneAuditEntries = async (): Promise<void> => {
  await getDb()
    .delete(adminAuditEntries)
    .where(
      and(
        sql`${adminAuditEntries.subjectAttendeeId} is null`,
        lt(
          adminAuditEntries.occurredAt,
          sql`now() - ${sql.raw(`interval '${AUDIT_RETENTION_DAYS} days'`)}`,
        ),
      ),
    )
}

/**
 * Clears every reference to one attendee, in the caller's transaction (FR-997a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS A PSEUDONYMISATION, NOT A DELETION, AND THE DISTINCTION IS THE REQUIREMENT.**
 *
 * The operator's act survives — who did it, what they did, when. What goes is *whom it was done
 * to*. FR-997b forbids a soft-delete flag or a sentinel row, and a cleared nullable column is
 * neither: there is **no row meaning "deleted attendee"** and nothing is reconstructible.
 *
 * **Hashing was rejected** and the reasoning generalises: a hash of a UUID drawn from a known set
 * is reversible by enumeration in one pass, which makes it a tombstone in disguise.
 *
 * It lives in this module rather than in `db/queries/account.ts` because the *rule* belongs to
 * the audit trail — but it is **called from the account-deletion transaction** (T138), which is a
 * file 004 owns. That crossing is declared in plan.md's "files this feature writes that another
 * feature owns", as 008 declared its two.
 *
 * Why this is an `UPDATE` in application code rather than `ON DELETE SET NULL` on a real foreign
 * key: `schema/admin-audit.ts` gives the full answer. In short, `SET NULL` produces the right
 * outcome and couples a **retention decision** to a constraint, so the reasoning would live in a
 * migration nobody reads.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const pseudonymiseAuditEntriesFor = async (
  attendeeId: string,
  db: Pick<ReturnType<typeof getDb>, 'update'> = getDb(),
): Promise<void> => {
  await db
    .update(adminAuditEntries)
    .set({ subjectAttendeeId: null })
    .where(
      and(
        isNotNull(adminAuditEntries.subjectAttendeeId),
        sql`${adminAuditEntries.subjectAttendeeId} = ${attendeeId}`,
      ),
    )
}
