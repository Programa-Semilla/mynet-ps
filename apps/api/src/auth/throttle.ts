import { createHmac } from 'node:crypto'

import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
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
const IDENTIFIER_FREE_ATTEMPTS = 3
const IDENTIFIER_MAX_DELAY_MS = 6 * 60 * 1000

/**
 * Source thresholds sit an order of magnitude higher. A conference venue puts hundreds of
 * legitimate attendees behind one public address — the edge case the spec names explicitly.
 * Treating that address like a single guesser would lock out a whole conference hall.
 */
const SOURCE_FREE_ATTEMPTS = 30
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

/** Consecutive failures since the last success, within the rolling window. */
const consecutiveFailures = async (
  column: typeof signInAttempts.identifierHash | typeof signInAttempts.sourceHash,
  value: string,
): Promise<FailureStreak> => {
  const since = new Date(Date.now() - WINDOW_MS)

  const rows = await getDb()
    .select({ succeeded: signInAttempts.succeeded, occurredAt: signInAttempts.occurredAt })
    .from(signInAttempts)
    .where(and(eq(column, value), gte(signInAttempts.occurredAt, since)))
    .orderBy(desc(signInAttempts.occurredAt))
    .limit(100)

  let count = 0
  let lastFailureAt: Date | undefined

  for (const row of rows) {
    // A success resets the streak — this is what makes the delay recoverable rather than a
    // slow-motion lockout.
    if (row.succeeded) break
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
 * How long the caller must still wait before this attempt may proceed, in milliseconds. Zero
 * means proceed now.
 *
 * The larger of the two dimensions wins, so a well-behaved attendee behind a hostile shared
 * address is still protected, and a single hostile identifier is still throttled on an
 * otherwise quiet network.
 */
export const nextDelayMs = async ({ identifierHash, sourceHash }: AttemptKey): Promise<number> => {
  const [identifier, source] = await Promise.all([
    consecutiveFailures(signInAttempts.identifierHash, identifierHash),
    consecutiveFailures(signInAttempts.sourceHash, sourceHash),
  ])

  return Math.max(
    outstandingDelay(identifier, IDENTIFIER_FREE_ATTEMPTS, IDENTIFIER_MAX_DELAY_MS),
    outstandingDelay(source, SOURCE_FREE_ATTEMPTS, SOURCE_MAX_DELAY_MS),
  )
}

/** Prunes rows beyond the window. Retention past it is pointless and adds risk. */
export const pruneAttempts = async (): Promise<void> => {
  await getDb()
    .delete(signInAttempts)
    .where(sql`${signInAttempts.occurredAt} < now() - interval '24 hours'`)
}
