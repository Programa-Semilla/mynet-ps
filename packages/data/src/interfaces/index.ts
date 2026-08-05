/**
 * T039 — repository interfaces, expressed in domain terms (constitution Principle V, FR-044).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY.**
 *
 * This is the client-side half of the rule that makes FR-036 structural. The server binds
 * identity at the request boundary from the sign-in session cookie; the client has no
 * identifier to send and no parameter to send it in. `getCurrent()` and `listRegistered()`
 * mean "the signed-in attendee's" — there is no other attendee they could refer to.
 *
 * Adding an `attendeeId` parameter to any method below would reintroduce exactly the failure
 * this design exists to prevent, and would do so without failing any existing test. Don't.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Method names are identical in the interface, the HTTP implementation, and every test
 * double (tasks.md → Shared Interfaces).
 */

/** The signed-in attendee's own identity. Never anybody else's (FR-032). */
export interface Attendee {
  readonly id: string
  readonly email: string
  readonly displayName: string
}

/**
 * A conference the attendee is registered for.
 *
 * `dayNumber` and `totalDays` are **absent by design**. The prototype shows "day N of M"; that
 * is derived from the dates and the current time, and storing or transporting it would go
 * stale the moment the clock moved (data-model.md).
 */
export interface Event {
  readonly id: string
  readonly name: string
  readonly location: string
  readonly startsOn: string
  readonly endsOn: string
}

export interface AttendeeRepository {
  /** The signed-in attendee. Takes no identifier — see the note at the top of this file. */
  getCurrent(): Promise<Attendee>
}

export interface EventsRepository {
  /**
   * Events the signed-in attendee is registered for.
   *
   * An attendee registered for none receives an **empty array**, not an error (FR-040). The
   * caller renders an explicit empty state; an empty result is a valid answer, not a failure.
   */
  listRegistered(): Promise<Event[]>
}

/** Every repository, in one shape (research.md D10). */
export interface Repositories {
  readonly attendee: AttendeeRepository
  readonly events: EventsRepository
}

/**
 * Raised when a server-dependent action is attempted while offline (FR-053).
 *
 * A distinct type rather than a generic failure, because the client must be able to explain
 * *why* it refused. FR-053 forbids queueing silently and forbids showing the action as
 * succeeded; to do neither, the caller has to know this was connectivity and not a server
 * error.
 */
export class OfflineError extends Error {
  constructor(action: string) {
    super(`${action} needs a connection. It has not been saved, and it has not been queued.`)
    this.name = 'OfflineError'
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
