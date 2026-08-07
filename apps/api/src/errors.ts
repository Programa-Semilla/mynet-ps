/**
 * Attendee-facing error shapes.
 *
 * FR-059: an attendee-facing error explains what happened and what to do next, and never
 * exposes internal detail, stack traces, or database errors.
 * FR-060: the server records enough to diagnose the failure, with no credentials, session
 * tokens, or message content in the record.
 *
 * Those two pull in opposite directions, so the split is explicit: `publicMessage` goes to
 * the attendee, everything else goes to the log.
 */

export type ErrorCode =
  /** FR-030 — one generic refusal for both "no such identifier" and "wrong credential". */
  | 'invalid_credentials'
  /** FR-031d — throttled, revealing nothing about whether the identifier exists. */
  | 'too_many_attempts'
  /** FR-028c — the session expired through inactivity. Distinguishable from never having signed in. */
  | 'session_expired'
  /** FR-028c — no session at all. */
  | 'not_authenticated'
  | 'not_found'
  | 'validation_failed'
  | 'internal_error'
  /**
   * FR-303 (004) — the address already has an account.
   *
   * **This deliberately discloses registration status**, and the disclosure is a decision taken
   * at the specification review rather than an oversight. Non-disclosure is unachievable
   * alongside FR-306: a new address signs the person in and an existing one does not, so the
   * two outcomes are distinguishable whatever the wording says — a non-disclosure requirement
   * here would have been satisfied on paper and defeated in practice. Enumeration is defended
   * by rate limiting, which is what actually defends it.
   *
   * **The password-reset path keeps its non-disclosure guarantee** (FR-327), where the outcome
   * genuinely is identical either way. Do not copy this reasoning there.
   */
  | 'address_registered'
  /** FR-321, FR-328 (004) — a verification or reset link that is expired, used, or unknown. */
  | 'link_expired'
  /** FR-347 (004) — an image over the stated size limit. */
  | 'image_too_large'
  /** FR-347 (004) — not a decodable image of an accepted type, determined by inspection. */
  | 'image_unreadable'

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode
  readonly publicMessage: string
  readonly details: Record<string, unknown> | undefined

  constructor(
    code: ErrorCode,
    statusCode: number,
    publicMessage: string,
    details?: Record<string, unknown>,
  ) {
    super(publicMessage)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.publicMessage = publicMessage
    this.details = details
  }
}

/**
 * FR-030 — a **single** refusal for every sign-in failure cause.
 *
 * One factory, so there is no second code path that could accidentally return a different
 * status, body, or wording for "unknown identifier" versus "wrong credential". Producing them
 * from one place is what makes them indistinguishable by construction rather than by careful
 * review of two call sites.
 */
export const invalidCredentials = (): AppError =>
  new AppError(
    'invalid_credentials',
    401,
    'That email and password combination did not match. Check both and try again.',
  )

/**
 * 004 — the noun is a parameter because this is no longer a sign-in-only refusal (FR-059).
 *
 * 001 had one caller and could name it in the string. The per-action counters (FR-307a) gave it
 * seven, and telling somebody who mistyped a join code that they have made too many *sign-in*
 * attempts sends them to solve a problem they do not have. The counters were separated; the
 * wording has to follow them.
 *
 * The `code` and `statusCode` are identical for every action on purpose — the refusal's shape is
 * what a throttling probe can observe, and only the attendee-facing sentence varies.
 */
export const tooManyAttempts = (retryAfterSeconds: number, what = 'sign-in attempts'): AppError =>
  new AppError(
    'too_many_attempts',
    429,
    `Too many ${what}. Try again in ${retryAfterSeconds} seconds.`,
    { retryAfterSeconds },
  )

export const sessionExpired = (): AppError =>
  new AppError(
    'session_expired',
    401,
    'You were signed out after a period of inactivity. Sign in again to continue.',
  )

export const notAuthenticated = (): AppError =>
  new AppError('not_authenticated', 401, 'Sign in to continue.')

/**
 * FR-036 — refuse without disclosing whether the record exists.
 *
 * Deliberately identical whether the row is absent or belongs to someone else. A 403 for
 * "exists but not yours" and a 404 for "does not exist" would let an attacker enumerate other
 * attendees' records by watching which status came back.
 */
export const notFound = (): AppError => new AppError('not_found', 404, 'That is not available.')

/**
 * FR-303 (004) — the address already has an account.
 *
 * The wording offers both exits, because being told "already registered" and left there is a
 * dead end for the two people who see it: the person who forgot they had an account, and the
 * person whose address somebody else used.
 */
export const addressRegistered = (): AppError =>
  new AppError(
    'address_registered',
    409,
    'That email address already has an account. Sign in instead, or reset your password if you have forgotten it.',
  )

/**
 * FR-321, FR-328 (004) — one refusal for a link that no longer works.
 *
 * **Unknown, expired and already-used are deliberately the same**, produced from one factory
 * for the same reason `invalidCredentials` is: two call sites returning "the same" 410 would
 * drift, and a link that reported *which* of the three had happened would let anyone holding a
 * used link learn that it had once been valid.
 */
export const linkExpired = (): AppError =>
  new AppError(
    'link_expired',
    410,
    'That link is no longer valid. Links can be used once, and they expire — request a new one.',
  )

/** FR-347 (004) — refused **before any bytes are stored**, with the limit stated. */
export const imageTooLarge = (maxBytes: number): AppError =>
  new AppError(
    'image_too_large',
    413,
    `That image is too large. The limit is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    { maxBytes },
  )

/**
 * FR-347 (004) — not a decodable image of an accepted type.
 *
 * Determined by **inspecting the bytes**, never by the declared content type or the filename,
 * both of which the caller chooses (research D8).
 */
export const imageUnreadable = (): AppError =>
  new AppError(
    'image_unreadable',
    415,
    'That file could not be read as an image. JPEG, PNG, WebP, AVIF and GIF are accepted.',
  )
