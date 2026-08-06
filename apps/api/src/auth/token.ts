import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * T036 — opaque sign-in session tokens (FR-026).
 *
 * The token is high-entropy random bytes and carries **no** structure: nothing to parse,
 * nothing to tamper with, no claims to forge. That is the whole reason D8 chose opaque
 * server-side sessions over a JWT — a tampered session is refused because the value simply
 * will not be found, not because a signature check happened to run.
 *
 * **Only the hash is ever stored.** A database read yields nothing replayable, which is the
 * same argument as password hashing applied to sessions (data-model.md).
 */

/** 32 bytes = 256 bits. Base64url so it is cookie-safe without escaping. */
const TOKEN_BYTES = 32

export interface IssuedToken {
  /** Goes to the client in an HttpOnly cookie. Never stored, never logged. */
  readonly token: string
  /** Goes to `auth_sessions.token_hash`. */
  readonly tokenHash: string
}

/**
 * SHA-256, not Argon2id — deliberately, and this is the one place a fast hash is correct.
 *
 * Password hashing must be slow because passwords are low-entropy and guessable. A 256-bit
 * random token is not guessable, so there is nothing for a slow hash to defend against; using
 * one here would add a CPU-expensive operation to *every authenticated request* (the session
 * is looked up per request by FR-028b) and buy nothing.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex')

export const issueToken = (): IssuedToken => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

/**
 * Constant-time comparison, for paths that compare hashes in application code rather than
 * letting the database do it. Lengths are compared first because `timingSafeEqual` throws on
 * a length mismatch.
 */
export const tokenHashesEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
