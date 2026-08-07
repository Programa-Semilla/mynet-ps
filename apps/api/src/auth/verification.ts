import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { attendeeVerifications } from '../db/schema/identity-tokens.js'
import { hashToken, issueToken } from './token.js'

/**
 * T024 (004) — email verification tokens (FR-318–FR-323, research D4).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **001's opaque-token pattern, reused rather than reinvented.** `auth/token.ts` already
 * produces 256 bits of randomness, stores only a SHA-256 of it, and records why a fast hash is
 * correct here where Argon2id is correct for a password: a 256-bit random value is not
 * guessable, so there is nothing for a slow hash to defend against and the cost would be paid
 * on every request.
 *
 * FR-323 — database access alone must not permit a link to be reconstructed — therefore holds
 * by the same argument that already holds for sign-in sessions, rather than by a new one
 * nobody has reviewed.
 *
 * **`tokenHashesEqual` is deliberately not used here**, and its absence is worth a sentence
 * because tasks.md names it. The lookup below is `WHERE token_hash = $1` — an indexed equality
 * inside PostgreSQL, exactly as `plugins/auth-context.ts` resolves a session. There is no
 * application-side comparison to make constant-time, and adding one after fetching by hash
 * would be theatre rather than defence.
 *
 * **`tokenHashesEqual` consequently has no caller anywhere in the codebase** — not here, not in
 * `password-reset.ts`, not in `plugins/auth-context.ts`. Every token comparison this product
 * makes is an indexed equality inside PostgreSQL. Said plainly rather than described as serving
 * "the paths that compare two hashes in JavaScript", because there are no such paths, and a
 * comment that supplies a justification a grep would refute is how dead code survives review.
 * It is kept for the day one appears; if none has by 006, delete it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Issues a verification link token for an attendee. The plaintext is returned once, here, and
 * never stored (FR-323).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Outstanding verification links are deliberately NOT invalidated by a new one**, which is
 * the opposite of what `issuePasswordReset` does. The asymmetry is intentional and would
 * otherwise read as an oversight:
 *
 * - FR-329 requires a new *reset* link to invalidate the outstanding one, because a reset link
 *   is a live credential and two of them is one more than anybody needs.
 * - No requirement says that of verification, and doing it would punish the ordinary mistake:
 *   an attendee who does not see the first message, asks for another, and then finds the first
 *   one after all. Refusing the link they are looking at, to enforce a rule nothing asks for,
 *   would be the product being clever at their expense.
 *
 * Accumulation is bounded anyway — resend is rate-limited (FR-322), the links expire (FR-320),
 * and the sweep removes them once expired or consumed (FR-384).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const issueVerification = async (attendeeId: string): Promise<{ token: string }> => {
  const { token, tokenHash } = issueToken()
  const expiresAt = new Date(Date.now() + loadConfig().auth.verificationLifetimeMs)

  await getDb().insert(attendeeVerifications).values({ attendeeId, tokenHash, expiresAt })

  return { token }
}

/**
 * Consumes a verification token, returning the attendee it belonged to, or `null`.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE STATEMENT, AND THAT IS WHAT MAKES IT SINGLE-USE** (FR-320).
 *
 * The check and the consumption are the same `UPDATE`: a row is claimed only if it is
 * unconsumed and unexpired *at the moment it is written*. Reading first and updating second
 * would leave a window in which two concurrent requests both see an unconsumed row and both
 * proceed — a double-submit or a mail client prefetching the link is enough to hit it.
 *
 * `RETURNING` is conclusive here: no row means the token was unknown, expired, or already
 * used, and **the caller cannot tell which** — the three are one refusal by construction
 * rather than by three careful branches (FR-321).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const consumeVerification = async (
  token: string,
): Promise<{ attendeeId: string } | null> => {
  const now = new Date()

  const rows = await getDb()
    .update(attendeeVerifications)
    .set({ consumedAt: now })
    .where(
      and(
        eq(attendeeVerifications.tokenHash, hashToken(token)),
        isNull(attendeeVerifications.consumedAt),
        gt(attendeeVerifications.expiresAt, now),
      ),
    )
    .returning({ attendeeId: attendeeVerifications.attendeeId })

  const row = rows[0]
  return row ? { attendeeId: row.attendeeId } : null
}

/**
 * T026 — removes verification rows that can never be used again (FR-384).
 *
 * A **second** line rather than the only one: these rows cascade from `attendees`, so account
 * deletion already reaches them. This exists so that consumed and expired material does not
 * accumulate in the ordinary case where nobody deletes anything.
 */
export const pruneVerifications = async (): Promise<void> => {
  await getDb()
    .delete(attendeeVerifications)
    .where(
      sql`${attendeeVerifications.consumedAt} is not null
          or ${attendeeVerifications.expiresAt} < now()`,
    )
}
