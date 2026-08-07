import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { attendeePasswordResets } from '../db/schema/identity-tokens.js'
import { hashToken, issueToken } from './token.js'

/**
 * T025 (004) — password-reset tokens (FR-326–FR-333, research D4).
 *
 * The same opaque-token pattern as `verification.ts` and as 001's sign-in sessions — see that
 * file's header for why the scheme is reused rather than reinvented, and why there is no
 * application-side constant-time comparison to make.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A RESET LINK IS THE ACCOUNT.** Everything below that differs from `verification.ts`
 * differs for that reason:
 *
 *   - a one-hour lifetime instead of twenty-four (FR-328);
 *   - issuing a new link **deletes** the outstanding one (FR-329);
 *   - completing a reset revokes every session on every device (FR-330, in the route).
 *
 * The two tables are separate for the same reason (see `schema/identity-tokens.ts`): merged,
 * a missing `WHERE` clause would let a verification link complete a password reset.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Issues a reset token, **invalidating any outstanding one for that attendee** (FR-329).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Invalidation is a DELETE inside the issuing transaction, not an `is_current` flag**
 * (research D4). A flag leaves the superseded row usable by any read that forgets to check it,
 * and the read that forgets would be on the path where forgetting means an expired link still
 * changes a password. A deleted row is unusable by every read there will ever be.
 *
 * The transaction is what makes the pair atomic: there is no instant at which both the old
 * link and the new one work, and none at which neither does.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const issuePasswordReset = async (attendeeId: string): Promise<{ token: string }> => {
  const { token, tokenHash } = issueToken()
  const expiresAt = new Date(Date.now() + loadConfig().auth.passwordResetLifetimeMs)

  await getDb().transaction(async (tx) => {
    await tx.delete(attendeePasswordResets).where(eq(attendeePasswordResets.attendeeId, attendeeId))
    await tx.insert(attendeePasswordResets).values({ attendeeId, tokenHash, expiresAt })
  })

  return { token }
}

/**
 * Consumes a reset token, returning the attendee it belonged to, or `null`.
 *
 * One statement, for the same reason `consumeVerification` is one: the check and the
 * consumption must not be separable, or a double-submit uses the link twice. Unknown, expired
 * and already-used are one refusal by construction (FR-328).
 *
 * **This is also what makes the deleted-account edge case correct**: a reset link followed
 * after its account was deleted finds no row — the cascade took it — and fails exactly as an
 * expired link does, disclosing nothing.
 */
export const consumePasswordReset = async (
  token: string,
): Promise<{ attendeeId: string } | null> => {
  const now = new Date()

  const rows = await getDb()
    .update(attendeePasswordResets)
    .set({ consumedAt: now })
    .where(
      and(
        eq(attendeePasswordResets.tokenHash, hashToken(token)),
        isNull(attendeePasswordResets.consumedAt),
        gt(attendeePasswordResets.expiresAt, now),
      ),
    )
    .returning({ attendeeId: attendeePasswordResets.attendeeId })

  const row = rows[0]
  return row ? { attendeeId: row.attendeeId } : null
}

/**
 * T026 — removes reset rows that can never be used again (FR-384).
 *
 * A second line rather than the only one: these cascade from `attendees`. It matters slightly
 * more here than for verification, because a consumed reset row is a record that a particular
 * attendee recovered their account at a particular time, and nothing needs to know that.
 */
export const prunePasswordResets = async (): Promise<void> => {
  await getDb()
    .delete(attendeePasswordResets)
    .where(
      sql`${attendeePasswordResets.consumedAt} is not null
          or ${attendeePasswordResets.expiresAt} < now()`,
    )
}
