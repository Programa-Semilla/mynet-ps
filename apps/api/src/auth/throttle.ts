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

/** Consecutive failures since the last success, within the rolling window. */
const consecutiveFailures = async (
  column: typeof signInAttempts.identifierHash | typeof signInAttempts.sourceHash,
  value: string,
): Promise<number> => {
  const since = new Date(Date.now() - WINDOW_MS)

  const rows = await getDb()
    .select({ succeeded: signInAttempts.succeeded })
    .from(signInAttempts)
    .where(and(eq(column, value), gte(signInAttempts.occurredAt, since)))
    .orderBy(desc(signInAttempts.occurredAt))
    .limit(100)

  let count = 0
  for (const row of rows) {
    // A success resets the streak — this is what makes the delay recoverable rather than a
    // slow-motion lockout.
    if (row.succeeded) break
    count += 1
  }
  return count
}

/** Exponential escalation, clamped. The clamp is what keeps FR-031b true. */
const delayFor = (failures: number, freeAttempts: number, ceilingMs: number): number => {
  const excess = failures - freeAttempts
  if (excess <= 0) return 0
  return Math.min(2 ** (excess - 1) * 1000, ceilingMs)
}

/**
 * How long the caller must wait before this attempt may proceed, in milliseconds. Zero means
 * proceed now.
 *
 * The larger of the two dimensions wins, so a well-behaved attendee behind a hostile shared
 * address is still protected, and a single hostile identifier is still throttled on an
 * otherwise quiet network.
 */
export const nextDelayMs = async ({ identifierHash, sourceHash }: AttemptKey): Promise<number> => {
  const [identifierFailures, sourceFailures] = await Promise.all([
    consecutiveFailures(signInAttempts.identifierHash, identifierHash),
    consecutiveFailures(signInAttempts.sourceHash, sourceHash),
  ])

  return Math.max(
    delayFor(identifierFailures, IDENTIFIER_FREE_ATTEMPTS, IDENTIFIER_MAX_DELAY_MS),
    delayFor(sourceFailures, SOURCE_FREE_ATTEMPTS, SOURCE_MAX_DELAY_MS),
  )
}

/** Prunes rows beyond the window. Retention past it is pointless and adds risk. */
export const pruneAttempts = async (): Promise<void> => {
  await getDb()
    .delete(signInAttempts)
    .where(sql`${signInAttempts.occurredAt} < now() - interval '24 hours'`)
}
