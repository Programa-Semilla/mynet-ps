import argon2 from 'argon2'

import { loadConfig } from '../config.js'

/**
 * T035 — Argon2id password hashing (FR-031, research.md D8).
 *
 * Argon2id is chosen over bcrypt for memory-hardness. **The cost is the point**: D4 chose a
 * conventional Node runtime over an edge runtime precisely because edge CPU-time limits fight
 * with a deliberately expensive hash. If this ever feels too slow, the fix is not to weaken
 * the parameters.
 *
 * A **pepper** is applied in addition to Argon2id's own per-hash salt. The salt defeats
 * rainbow tables and is stored alongside the hash; the pepper is server-side configuration
 * that is never in the database, so a database dump alone is not enough to mount an offline
 * attack. It is not rotatable in place — changing it invalidates every existing hash, which
 * `.env.example` says out loud.
 */

/**
 * OWASP's recommended Argon2id baseline: 19 MiB memory, 2 iterations, 1 degree of
 * parallelism. Stated explicitly rather than left to library defaults, because a library
 * default that changes underneath us would silently change our security posture.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

const peppered = (plain: string): string => `${plain}${loadConfig().auth.passwordPepper}`

export const hashPassword = async (plain: string): Promise<string> =>
  argon2.hash(peppered(plain), ARGON2_OPTIONS)

/**
 * Verification never throws on a malformed or unrecognised hash — it returns false.
 *
 * FR-030 requires sign-in failure to be indistinguishable across causes. A hash that fails to
 * parse must look exactly like a wrong password to the caller, not like a 500 that tells an
 * attacker they found a row with corrupt data.
 */
export const verifyPassword = async (plain: string, hash: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, peppered(plain))
  } catch {
    return false
  }
}
