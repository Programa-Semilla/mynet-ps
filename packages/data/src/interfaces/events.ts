/**
 * T039 (001), split out by T001 (002) — conferences the attendee is registered for
 * (constitution Principle V, FR-044).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NO METHOD HERE ACCEPTS AN ATTENDEE IDENTIFIER, AND NONE EVER MAY.**
 *
 * This is the client-side half of the rule that makes FR-036 structural. The server binds
 * identity at the request boundary from the sign-in session cookie; the client has no
 * identifier to send and no parameter to send it in. `listRegistered()` means "the signed-in
 * attendee's" — there is no other attendee it could refer to.
 *
 * Adding an `attendeeId` parameter to any method below would reintroduce exactly the failure
 * this design exists to prevent, and would do so without failing any existing test. Don't.
 *
 * **An `eventId` is a different matter, and is permitted from 002 onward.** Per-event content
 * is reached by naming its event, and the server verifies the registration before any read
 * (FR-145–FR-147). That departure is recorded in plan.md's Complexity Tracking. It does not
 * loosen the rule above: an event identifier says *which conference*, never *which person*.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

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

export interface EventsRepository {
  /**
   * Events the signed-in attendee is registered for.
   *
   * An attendee registered for none receives an **empty array**, not an error (FR-040). The
   * caller renders an explicit empty state; an empty result is a valid answer, not a failure.
   */
  listRegistered(): Promise<Event[]>
}
