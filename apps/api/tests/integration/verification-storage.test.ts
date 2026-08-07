import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { clearThrottle, resetDatabase, setupTestApp, SinkMailService, teardown } from './helpers.js'

/**
 * T052 (004) — **database access alone must not permit a link to be reconstructed**
 * (FR-323, FR-333, research D4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The threat is a database dump — a backup, a compromised replica, a support query run by
 * somebody with more access than judgement. If a live verification or reset token could be read
 * out of one, then holding a copy of the database would be holding every account in the
 * product: a reset link *is* the account.
 *
 * The defence is 001's session-token pattern reused unchanged: 256 bits of randomness, only its
 * SHA-256 stored, and the plaintext existing for exactly one moment inside one request. This
 * file asserts that property against a real database rather than trusting the argument.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('verification and reset material is unreconstructable from storage', () => {
  let app: FastifyInstance
  const mail = new SinkMailService()

  beforeAll(async () => {
    app = await setupTestApp({ mail })
    await resetDatabase()
    await clearThrottle()
    mail.clear()

    await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: 'storage@example.com',
        displayName: 'Storage',
        password: 'correct-horse-battery-staple',
      },
    })

    await app.inject({
      method: 'POST',
      url: '/auth/reset-request',
      payload: { email: 'storage@example.com' },
    })
  })

  afterAll(async () => {
    await teardown(app)
  })

  const tokenFrom = (kind: 'verification' | 'password-reset'): string => {
    const message = mail.lastTo('storage@example.com', kind)
    expect(message).toBeDefined()
    return new URL(message!.link).searchParams.get('token') as string
  }

  it.each(['attendee_verifications', 'attendee_password_resets'])(
    'stores no column of %s containing the token that was sent',
    async (table) => {
      const verification = tokenFrom('verification')
      const reset = tokenFrom('password-reset')

      // Every column, as text. A future column holding the plaintext "for debugging" would be
      // caught by this rather than by somebody noticing it in review.
      const rows = await getDb().execute<Record<string, unknown>>(sql.raw(`SELECT * FROM ${table}`))

      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          const text = String(value)
          expect(text, `${table}.${column} contains the verification token`).not.toContain(
            verification,
          )
          expect(text, `${table}.${column} contains the reset token`).not.toContain(reset)
        }
      }
    },
  )

  it('stores a hash that is not reversible to the token by inspection', async () => {
    const rows = await getDb().execute<{ token_hash: string }>(sql`
      SELECT token_hash FROM attendee_verifications
    `)

    // SHA-256, hex. Asserted on shape rather than by recomputing, because recomputing here
    // would prove only that this test knows the algorithm.
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('keeps the two kinds of material in separate tables, so no query can confuse them', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The tables have identical shapes and the temptation to merge them is real. Merged, a
    // missing `WHERE purpose = …` would let a **verification** link complete a **password
    // reset** — the discriminator would sit on the security-sensitive path, and forgetting it
    // is a one-character mistake with an account-takeover consequence.
    //
    // Two relations make that particular error unwriteable. This asserts the separation still
    // exists, because merging them is the sort of tidying that looks like an improvement.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const columns = await getDb().execute<{ table_name: string; column_name: string }>(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('attendee_verifications', 'attendee_password_resets')
        AND column_name IN ('purpose', 'kind', 'type')
    `)

    expect(
      columns,
      'A discriminator column means the two kinds of material share a relation, which is what ' +
        'lets a missing WHERE clause turn a verification link into a password reset.',
    ).toEqual([])
  })

  it('refuses a verification token on the reset route, and the reverse', async () => {
    // The behavioural half of the separation above. Neither token is usable on the other path,
    // and both refusals are the same 410 an unknown token produces.
    const asReset = await app.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { token: tokenFrom('verification'), password: 'a-completely-new-password' },
    })
    expect(asReset.statusCode).toBe(410)

    const asVerification = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { token: tokenFrom('password-reset') },
    })
    expect(asVerification.statusCode).toBe(410)
  })
})
