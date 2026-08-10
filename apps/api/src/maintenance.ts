import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { prunePasswordResets } from './auth/password-reset.js'
import { pruneAttempts, pruneSessions } from './auth/throttle.js'
import { pruneVerifications } from './auth/verification.js'
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
