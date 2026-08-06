import { createHmac } from 'node:crypto'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { authSessions } from '../db/schema/auth-sessions.js'
import { signInAttempts } from '../db/schema/sign-in-attempts.js'

/**
 * T037 — database-backed sign-in throttling (FR-031a–d, research.md D9).
 *
 * Database-backed rather than in-process, for two reasons that are not about scale: an
 * in-process counter is wrong the moment the API runs more than one instance, and it resets
 * on every deploy — which hands an attacker a reset button.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THERE IS NO LOCKOUT PATH IN THIS FILE, AND THERE MUST NEVER BE ONE.**
 *
 * FR-031b forbids permanent lockout, and quickstart.md Scenario 7 step 4 states why in one
 * line: email is the identifier, so a lock would let *anyone* deny an attendee access by
 * typing their address wrong enough times. Delay escalates to a ceiling and stops. The
 * correct credential always works, however many failures preceded it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Rolling window over which failures are counted. */
const WINDOW_MS = 60 * 60 * 1000

/**
 * Identifier thresholds. Escalation starts after 3 consecutive failures and grows to a
 * ceiling that caps sustained guessing at roughly 10 attempts per hour (research.md D9).
 */
export const IDENTIFIER_FREE_ATTEMPTS = 3
const IDENTIFIER_MAX_DELAY_MS = 6 * 60 * 1000

/**
 * Source thresholds sit an order of magnitude higher. A conference venue puts hundreds of
 * legitimate attendees behind one public address — the edge case the spec names explicitly.
 * Treating that address like a single guesser would lock out a whole conference hall.
 */
export const SOURCE_FREE_ATTEMPTS = 30
const SOURCE_MAX_DELAY_MS = 60 * 1000

export interface AttemptKey {
  readonly identifierHash: string
  readonly sourceHash: string
}

/**
 * Keyed hash, so the table can count per identifier while holding no readable address.
 *
 * HMAC rather than a plain digest: a bare SHA-256 of an email is trivially reversible by
 * dictionary, which would make this table a list of addresses that were typed at the service
 * — personal data about people who may not even be attendees (FR-042, Principle VIII).
 */
export const hashAttemptValue = (value: string): string =>
  createHmac('sha256', loadConfig().auth.attemptHashKey)
    .update(value.trim().toLowerCase(), 'utf8')
    .digest('hex')

/**
 * Records an attempt. **Never receives the submitted credential** — there is no parameter for
 * one, which is how FR-031c is guaranteed rather than remembered.
 */
export const recordAttempt = async ({
  identifierHash,
  sourceHash,
  succeeded,
}: AttemptKey & { succeeded: boolean }): Promise<void> => {
  await getDb().insert(signInAttempts).values({ identifierHash, sourceHash, succeeded })
}

interface FailureStreak {
  readonly count: number
  /** When the most recent failure happened. Undefined when there is no streak. */
  readonly lastFailureAt: Date | undefined
}

/**
 * Failures for one key within the rolling window.
 *
 * `resetOnSuccess` is the difference between the two dimensions, and it is not cosmetic:
 *
 * - **Identifier**: a streak, ended by a success. A legitimate attendee who mistypes three
 *   times and then gets in must not carry those failures forward.
 * - **Source**: an absolute count, *not* ended by a success. Resetting the source on any
 *   success let an attacker holding one valid account spray indefinitely from a single
 *   address — sign in to their own account every thirty guesses and the source counter never
 *   reaches its threshold. Source throttling is the only bound on a spray across thousands of
 *   identifiers (each of which gets three free attempts of its own), so it must not be
 *   resettable by the attacker at will (FR-031a).
 */
const countFailures = async (
  column: typeof signInAttempts.identifierHash | typeof signInAttempts.sourceHash,
  value: string,
  { resetOnSuccess }: { resetOnSuccess: boolean },
): Promise<FailureStreak> => {
  const since = new Date(Date.now() - WINDOW_MS)

  const rows = await getDb()
    .select({ succeeded: signInAttempts.succeeded, occurredAt: signInAttempts.occurredAt })
    .from(signInAttempts)
    .where(and(eq(column, value), gte(signInAttempts.occurredAt, since)))
    .orderBy(desc(signInAttempts.occurredAt))
    .limit(200)

  let count = 0
  let lastFailureAt: Date | undefined

  for (const row of rows) {
    if (row.succeeded) {
      if (resetOnSuccess) break
      continue
    }
    lastFailureAt ??= row.occurredAt
    count += 1
  }

  return { count, lastFailureAt }
}

/** Exponential escalation, clamped. The clamp is what keeps FR-031b true. */
const delayFor = (failures: number, freeAttempts: number, ceilingMs: number): number => {
  const excess = failures - freeAttempts
  if (excess <= 0) return 0
  return Math.min(2 ** (excess - 1) * 1000, ceilingMs)
}

/**
 * How much of the escalated delay is **still outstanding**, given how long the caller has
 * already waited since their last failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This subtraction is what makes the delay a delay.**
 *
 * Without it, `delayFor` returns a non-zero number for as long as the failure streak sits
 * inside the rolling window, and the caller in `sign-in.ts` refuses on anything non-zero. The
 * effect was a **one-hour lockout keyed on the email address** that no amount of waiting could
 * clear — and since anyone can type anyone's address, an attacker could hold an account shut
 * indefinitely by failing four times an hour.
 *
 * That is precisely what FR-031b forbids ("no permanent lockout may exist") and what SC-003a
 * measures as "the number of accounts an attacker can render permanently inaccessible is zero".
 * The header of this file always claimed the correct credential works however many failures
 * preceded it; until this subtraction existed, that claim was false.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const outstandingDelay = (
  streak: FailureStreak,
  freeAttempts: number,
  ceilingMs: number,
): number => {
  const required = delayFor(streak.count, freeAttempts, ceilingMs)
  if (required === 0 || !streak.lastFailureAt) return 0

  const waited = Date.now() - streak.lastFailureAt.getTime()
  return Math.max(0, required - waited)
}

/**
 * How long a **failed** attempt must be held before it is answered, in milliseconds.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is only ever consulted after a credential has already been rejected.**
 *
 * That ordering is the whole of FR-031b. When the throttle gated the request *before*
 * verification, an attacker could hold any account they could name permanently unreachable:
 * failures from anyone counted toward the streak, the outstanding delay was measured from the
 * newest failure, and only a *success* could clear it — but the gate refused the owner's
 * correct password before it was ever checked. A closed loop, and precisely the
 * "anyone who knows an attendee's email can deny them access" outcome FR-031b names.
 *
 * With verification first, the correct credential is never refused, however many failures
 * precede it, and SC-003a's "accounts an attacker can render permanently inaccessible" is zero
 * by construction rather than by clamping.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The larger of the two dimensions wins, so a well-behaved attendee behind a hostile shared
 * address is still protected, and a single hostile identifier is still throttled on an
 * otherwise quiet network.
 */
export const failureDelayMs = async ({
  identifierHash,
  sourceHash,
}: AttemptKey): Promise<number> => {
  const [identifier, source] = await Promise.all([
    countFailures(signInAttempts.identifierHash, identifierHash, { resetOnSuccess: true }),
    countFailures(signInAttempts.sourceHash, sourceHash, { resetOnSuccess: false }),
  ])

  return Math.max(
    outstandingDelay(identifier, IDENTIFIER_FREE_ATTEMPTS, IDENTIFIER_MAX_DELAY_MS),
    outstandingDelay(source, SOURCE_FREE_ATTEMPTS, SOURCE_MAX_DELAY_MS),
  )
}

/**
 * Serves as much of the delay as is reasonable to hold a request open for, and reports the
 * remainder as retry-after guidance.
 *
 * Returns the number of seconds still outstanding after sleeping, or 0 when the delay has been
 * served in full. A caller that receives a non-zero value should refuse with `too_many_attempts`.
 */
export const serveDelay = async (delayMs: number): Promise<number> => {
  if (delayMs <= 0) return 0

  // The bound is configuration, not a constant: sleeping for the full six-minute ceiling would
  // exceed every sensible request timeout, so the escalation is served up to this bound and the
  // remainder becomes guidance. The attacker still pays — each failed guess occupies a
  // connection for this long before it is answered.
  const served = Math.min(delayMs, loadConfig().auth.maxServedDelayMs)
  await new Promise((resolve) => setTimeout(resolve, served))

  return Math.ceil((delayMs - served) / 1000)
}

/**
 * Deletes attempt rows past their usefulness.
 *
 * Retention beyond the counting window is pointless and adds risk: these are keyed hashes of
 * every address ever typed at the service, including addresses belonging to people who are not
 * attendees (FR-042, Principle VIII). The margin over `WINDOW_MS` exists only so that a clock
 * skew or a slow sweep cannot delete rows the throttle is still counting.
 */
export const pruneAttempts = async (): Promise<void> => {
  await getDb()
    .delete(signInAttempts)
    .where(sql`${signInAttempts.occurredAt} < now() - interval '2 hours'`)
}

/**
 * Deletes sign-in sessions that ended long enough ago to be of no further use.
 *
 * Expired and revoked rows are dead weight: they can never authenticate anything, and each one
 * is a record of when a particular attendee was using MyNet.
 */
export const pruneSessions = async (): Promise<void> => {
  await getDb()
    .delete(authSessions)
    .where(
      sql`${authSessions.expiresAt} < now() - interval '30 days'
          or ${authSessions.revokedAt} < now() - interval '30 days'`,
    )
}
