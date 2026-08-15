/**
 * T039 (001), split out by T001 (002) — the failures presentation code must be able to tell
 * apart.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * These live with the interfaces rather than in the HTTP implementation — because presentation
 * code needs to recognise a refusal and show the server's message, and it must be able to do
 * that without importing the transport (FR-045).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Raised when a server-dependent action is attempted while offline (FR-053).
 *
 * A distinct type rather than a generic failure, because the client must be able to explain
 * *why* it refused. FR-053 forbids queueing silently and forbids showing the action as
 * succeeded; to do neither, the caller has to know this was connectivity and not a server
 * error.
 */
export class OfflineError extends Error {
  constructor(action: string, options?: ErrorOptions) {
    super(
      `${action} needs a connection. It has not been saved, and it has not been queued.`,
      options,
    )
    this.name = 'OfflineError'
  }
}

/**
 * Raised when the server refused a request and explained why (FR-059).
 *
 * Carries a `code` and an attendee-facing `message` and nothing else. No status, no headers, no
 * response object: those are HTTP's vocabulary, and a component that could see them would be
 * coupled to the fact that HTTP is what happens to be underneath.
 */
export class RequestRefusedError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'RequestRefusedError'
    this.code = code
  }
}

/** Raised when the sign-in session expired through inactivity (FR-028c). */
export class SessionExpiredError extends Error {
  constructor() {
    super('Signed out after a period of inactivity.')
    this.name = 'SessionExpiredError'
  }
}

/** Raised when there is no sign-in session at all — distinct from expiry (FR-028c). */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('Not signed in.')
    this.name = 'NotAuthenticatedError'
  }
}
