import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { prunePasswordResets } from './auth/password-reset.js'
import { pruneAttempts, pruneSessions } from './auth/throttle.js'
import { pruneVerifications } from './auth/verification.js'
import { pruneAdminSessions } from './admin/session.js'
import { AUDIT_RETENTION_DAYS, pruneAuditEntries } from './db/queries/admin-audit.js'
import { OPERATOR_RETENTION_DAYS, pruneDeactivatedOperators } from './db/queries/operators.js'
import { pruneExpiredReports, REPORT_RETENTION_DAYS } from './db/queries/reports.js'

/**
 * Periodic retention sweeps.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `pruneAttempts` and `pruneSessions` existed before this file and **nothing called either of
 * them**. Their comments described a retention policy the service did not implement, which is
 * worse than an acknowledged gap: a reader auditing FR-042 or Principle VIII would conclude
 * retention was handled.
 *
 * `sign_in_attempts` is written on every sign-in attempt and holds keyed hashes of every
 * address ever typed at the service — including addresses belonging to people who are not
 * attendees. `auth_sessions` accumulates a row per sign-in, each recording when a particular
 * attendee was using MyNet. Neither has any use past its window.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * A timer in-process rather than a scheduled job, because it needs no new infrastructure and
 * the work is a single indexed DELETE. `unref()` means it never holds the process open, so it
 * cannot delay shutdown. Every instance sweeping is harmless — the DELETEs are idempotent.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/**
 * T026 (004) — **the sweep, as a declared registry rather than a sequence of calls**
 * (FR-381–FR-384).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The list is exported because `tests/unit/deletion-coverage.test.ts` reads it. FR-370 requires
 * a test that fails when a personal-data table has **neither** a deletion cascade **nor** a
 * retention rule, and a guard that took the second half on trust would be asserting a comment.
 * Naming each swept table here makes "covered by a retention rule" a fact the guard can check
 * against the code that actually runs, so deleting a sweep breaks the build rather than
 * quietly extending retention to forever.
 *
 * **A feature that adds a personal-data table adds it to the cascade or to this list, in the
 * change that introduces it** (FR-383, constitution v2.3.0). There is no third option, and the
 * guard is what makes that true rather than customary.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface RetentionSweep {
  /** The physical table this removes rows from. Matched against the schema by the guard. */
  readonly table: string
  /** Stated window, in the words a reader needs (FR-381 asks for a *stated* schedule). */
  readonly window: string
  readonly reason: string
  run(): Promise<void>
}

export const RETENTION_SWEEPS: readonly RetentionSweep[] = [
  {
    table: 'sign_in_attempts',
    window: '2 hours',
    reason:
      'The one personal-data table NO cascade reaches, by design — it has no foreign key, so ' +
      'an attacker cannot clear their own trail by registering and deleting an account ' +
      '(research D10). The sweep is therefore not a second line here; it is the only one. ' +
      "FR-382 forbids lengthening the window: two hours is the throttle's one-hour counting " +
      'window plus margin, and the shortest correct window is the right one for a table of ' +
      'keyed hashes of every address ever typed at this service.',
    run: pruneAttempts,
  },
  {
    table: 'auth_sessions',
    window: '30 days after expiry or revocation',
    reason:
      'Cascade-reachable, so this is a second line. Each row records when a particular ' +
      'attendee was using MyNet, and an ended session can never authenticate anything again.',
    run: pruneSessions,
  },
  {
    table: 'attendee_verifications',
    window: 'once consumed or expired',
    reason:
      'FR-384. Cascade-reachable, so this is a second line against accumulation rather than ' +
      'the mechanism that makes deletion complete.',
    run: pruneVerifications,
  },
  {
    table: 'attendee_password_resets',
    window: 'once consumed or expired',
    reason:
      'FR-384, and it matters slightly more than verification: a consumed row is a record that ' +
      'a particular attendee recovered their account at a particular time, which nothing needs.',
    run: prunePasswordResets,
  },
  {
    // T019 (007) — research R3.
    table: 'abuse_reports',
    window: `${REPORT_RETENTION_DAYS} days`,
    reason:
      'Cascade-reachable from BOTH attendees, so this is a second line — it covers the case ' +
      'where neither party deletes. The window exists because **the row is not the record**: ' +
      "the durable artifact is the operator's mail (FR-547), and the row's only job is to " +
      'survive the gap between writing a report and dispatching it. Keeping it longer would ' +
      "retain one attendee's free-text accusation about another indefinitely, in a table " +
      'nothing in this product may read (FR-548). The accepted cost is recorded rather than ' +
      'hidden: a report can be lost if dispatch fails and the reported attendee then deletes ' +
      'their account — the erasure right was chosen over the evidence.',
    run: pruneExpiredReports,
  },
  {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // T027 (013) — **pseudonymise-plus-clock**, and it is the first two-stage rule in this list.
    //
    // Every sweep above is a single clock. This one has a prior step that is not a sweep at all:
    // an entry naming a living attendee is **cleared** when that attendee exercises erasure
    // (FR-997a), inside the deletion transaction, and only *then* does the clock start. That is
    // what makes the rule "pseudonymise-plus-clock" rather than a retention window, and it is
    // why `deletion-coverage.test.ts`'s allow-list entry has to state it in words: a reader
    // seeing only this line would conclude an audit entry survives an erasure for a year.
    //
    // **No cascade reaches this table, by design.** `subject_attendee_id` deliberately carries
    // no foreign key — see `schema/admin-audit.ts` for why all three of CASCADE, RESTRICT and
    // SET NULL are wrong here — so this sweep is not a second line. It is the only one.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    table: 'admin_audit_entries',
    window: `${AUDIT_RETENTION_DAYS} days after pseudonymisation`,
    reason:
      'FR-998. Pseudonymised entries are personal data about nobody identifiable, in exactly ' +
      'the sense `sign_in_attempts` is — pseudonymous rather than anonymous — so Principle ' +
      "VIII's third rule applies and a window is the only thing that can clear them. The " +
      'window **must not be shorter than the retention of the records it explains**: reports ' +
      'are swept at 90 days and resolutions cascade with them, so a year is comfortably past ' +
      'the point where an entry could be the only surviving account of an act. An entry still ' +
      'naming a living attendee is NOT swept — it is cleared when they are erased (FR-997a), ' +
      'and the clock starts then.',
    run: pruneAuditEntries,
  },
  {
    // T027 (013) — **deactivate-plus-clock**, and the clock alone is not the rule.
    //
    // An operator has no `attendees` row, so no cascade reaches this table either. FR-909
    // requires a deactivated operator to keep resolving on records that name them, so the sweep
    // removes only rows that are both long deactivated **and** referenced by nothing. See
    // `db/queries/operators.ts` for why that second condition is checked explicitly rather than
    // left to the foreign key to enforce by failing.
    table: 'operators',
    window: `${OPERATOR_RETENTION_DAYS} days after deactivation, and only once unreferenced`,
    reason:
      'FR-909, FR-984. There is no self-serve deletion here and no cascade can reach this ' +
      "table: Principle VIII's erasure right is an ATTENDEE's, and an operator is not one. " +
      'Deactivation (FR-908) is the terminal state, and the row is retained while any ' +
      '`admin_audit_entries` or `report_resolutions` row names it — a resolution attributed to ' +
      'nobody is an accountability record with the accountability removed.',
    run: pruneDeactivatedOperators,
  },
  {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 011 — **`operator_sessions`, registered at the deep-review gate because it was written
    // and then never wired up.**
    //
    // `pruneAdminSessions` existed in `admin/session.ts` with a comment calling itself "a
    // second line against accumulation", and **nothing called it** — no entry here, no route,
    // no test. That is the defect this file's own header was written to record: *"`pruneAttempts`
    // and `pruneSessions` existed before this file and nothing called either of them. Their
    // comments described a retention policy the service did not implement, which is worse than
    // an acknowledged gap."* The same mistake, one file over, in the feature that added it.
    //
    // The justification it carried — that the table is "classified by its cascades" from
    // `operators` and `attendees` — does not bound it. An operator is never deleted in normal
    // operation: deactivation is terminal, and the sweep above removes the row only once it is
    // unreferenced, which takes a year. So an operator's rows had no clock at all, and an
    // organizer's only had one if that attendee deleted their whole account.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    table: 'operator_sessions',
    window: '7 days after expiry or revocation',
    reason:
      'FR-983. Each row records when a named person was administering the product, which is ' +
      'the same argument `auth_sessions` is swept on — and for an organizer the row is ' +
      'attendee data. The cascades from `operators` and `attendees` are real but reach almost ' +
      'nothing: an operator is retained while any audit entry names them, so without this the ' +
      'table grows one permanent row per administrative sign-in, forever.',
    run: pruneAdminSessions,
  },
]

const maintenancePlugin = async (app: FastifyInstance): Promise<void> => {
  const sweep = async (): Promise<void> => {
    for (const { table, run } of RETENTION_SWEEPS) {
      try {
        await run()
      } catch (error) {
        // Per sweep rather than around the whole loop. Wrapping the lot meant one failing
        // DELETE silently skipped every sweep after it — and the skipped one would be a
        // retention obligation, not a cache. A failed sweep is not worth failing a request
        // over, and the next one retries; it is logged rather than swallowed so that a
        // persistently failing sweep is visible.
        app.log.error({ err: error, table }, 'retention sweep failed')
      }
    }
  }

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
  timer.unref()

  app.addHook('onClose', async () => {
    clearInterval(timer)
  })

  // One sweep shortly after boot, so a long-running deployment is not the only thing that ever
  // prunes. Deferred rather than immediate so it never competes with startup.
  const initial = setTimeout(() => void sweep(), 30_000)
  initial.unref()
  app.addHook('onClose', async () => {
    clearTimeout(initial)
  })
}

export default fp(maintenancePlugin, { name: 'maintenance' })
