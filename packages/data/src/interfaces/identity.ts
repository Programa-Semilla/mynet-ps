import type { Event } from './events.js'

/**
 * T030 (004) — becoming an attendee, recovering an account, and leaving (FR-300–FR-333,
 * FR-364–FR-379).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY** (FR-378, FR-385).
 *
 * The rule 001 stated for `AttendeeRepository` and 005 restated for the agenda holds without
 * exception on the most sensitive surface the product has: `deleteAccount()` and
 * `exportPersonalData()` mean *the signed-in attendee's*, because there is no other attendee
 * they could refer to. Adding a parameter to either would reintroduce the exact failure the
 * design exists to prevent, and would do so without failing an existing test.
 *
 * The three unauthenticated methods — `signUp`, `requestPasswordReset`, `resetPassword` — take
 * an address or a token because they necessarily precede a session. **None of them returns
 * anything about an account**, which is what keeps them from becoming membership oracles.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **A new file rather than a member of an existing interface** (FR-180's per-domain split).
 * 004 and 006 therefore contend over one appended export line each in `interfaces/index.ts`
 * and nowhere else.
 */

/** The outcome of entering a join code (FR-312, FR-313). */
export interface JoinResult {
  readonly event: Event
  /**
   * True when the attendee was already registered.
   *
   * **Not an error** (FR-312). The caller says so plainly rather than treating a repeat as a
   * failure — a person who taps twice on a slow connection has done nothing wrong.
   */
  readonly alreadyRegistered: boolean
}

/**
 * What the export contains, from the client's side: an opaque document.
 *
 * Deliberately **not** a structured type mirroring the server's. The client's only job is to
 * hand the attendee the file; typing every field here would create a second declaration of the
 * personal-data surface that could fall out of step with the one the export guard checks
 * (FR-377), and the client would then be asserting completeness it cannot verify.
 */
export type PersonalDataExport = Record<string, unknown>

export interface IdentityRepository {
  /**
   * Creates an account and signs in (FR-300, FR-301, FR-306).
   *
   * Resolves with nothing: the session travels as an HttpOnly cookie the browser manages, so
   * there is no token for the client to hold, store, or accidentally log.
   *
   * Rejects when the address is already registered — a refusal the caller **must** state
   * plainly (FR-303). That disclosure is a decision, not an oversight: it is unachievable
   * alongside FR-306 to hide it, so rate limiting is what defends enumeration instead.
   */
  signUp(account: { email: string; displayName: string; password: string }): Promise<void>

  /** Registers for the conference a join code names (FR-310). */
  joinConference(joinCode: string): Promise<JoinResult>

  /**
   * Leaves a conference without deleting the account (FR-317c).
   *
   * **The conference's saved sessions and notes go with it**, and the caller must say so before
   * confirming. The profile is untouched — it is cross-event.
   */
  withdrawFromConference(eventId: string): Promise<void>

  /** Completes verification from a link (FR-319, FR-320). Rejects when expired or used. */
  verifyEmail(token: string): Promise<void>

  /** Requests a new verification message for the signed-in attendee (FR-321, FR-322). */
  resendVerification(): Promise<void>

  /**
   * Requests a password reset (FR-326).
   *
   * **Resolves whether or not an account exists** (FR-327), and the caller must present one
   * outcome for both. A method that rejected for an unknown address would make the client an
   * account-existence oracle that the server carefully is not.
   */
  requestPasswordReset(email: string): Promise<void>

  /** Sets a new password from a reset link (FR-328, FR-330). Every session is then invalid. */
  resetPassword(token: string, password: string): Promise<void>

  /** Everything the product holds about the signed-in attendee (FR-373). */
  exportPersonalData(): Promise<PersonalDataExport>

  /**
   * Deletes the signed-in attendee's account (FR-364).
   *
   * **Hard, cascading, and irreversible** (FR-365, FR-368). The caller must obtain an explicit
   * confirmation stating that it cannot be undone and that no copy is kept (FR-367) before
   * calling this. There is no undo method here because there is no undo.
   */
  deleteAccount(): Promise<void>
}
