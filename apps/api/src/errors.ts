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

export const tooManyAttempts = (retryAfterSeconds: number): AppError =>
  new AppError(
    'too_many_attempts',
    429,
    `Too many sign-in attempts. Try again in ${retryAfterSeconds} seconds.`,
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
