/**
 * T039 (001), split out by T001 (002) — the signed-in attendee, in domain terms
 * (constitution Principle V, FR-044).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY.**
 *
 * This is the client-side half of the rule that makes FR-036 structural. The server binds
 * identity at the request boundary from the sign-in session cookie; the client has no
 * identifier to send and no parameter to send it in. `getCurrent()` means "the signed-in
 * attendee's" — there is no other attendee it could refer to.
 *
 * Adding an `attendeeId` parameter to any method below would reintroduce exactly the failure
 * this design exists to prevent, and would do so without failing any existing test. Don't.
 *
 * The note is repeated in `events.ts` rather than left once in the barrel, because after the
 * split (FR-180) a reader arrives at the file that declares the method, not at the index. A
 * rule that is only visible from a file nobody opens is decoration.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** The signed-in attendee's own identity. Never anybody else's (FR-032). */
export interface Attendee {
  readonly id: string
  readonly email: string
  readonly displayName: string
}

export interface AttendeeRepository {
  /** The signed-in attendee. Takes no identifier — see the note at the top of this file. */
  getCurrent(): Promise<Attendee>
}
