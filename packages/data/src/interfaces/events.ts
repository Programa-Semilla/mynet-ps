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
  /**
   * T011 (002) — the venue's IANA zone, e.g. `Europe/Madrid` (FR-120).
   *
   * Carried so the client can compute day context without a second request, and **so it
   * computes it against the venue's clock rather than the device's**. An attendee reading from
   * Lima must see Barcelona's day number; without this field the only available answer is the
   * device's, which is right for people at the venue and wrong for everyone else.
   */
  readonly timezone: string
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

/**
 * T011 (002) — which conference the attendee is currently working in (FR-100–FR-104).
 *
 * Takes no attendee identifier, per the note at the top of this file: there is exactly one
 * active event per signed-in attendee, and it is theirs by definition.
 */
export interface ActiveEventRepository {
  /**
   * The active event — the attendee's recorded choice, or the derived one when they have never
   * chosen (FR-102).
   *
   * **`null` means "registered for no conferences"** (FR-105), which is a valid answer and not
   * a failure. It never means "we could not tell": a failure throws, so the caller can render
   * an explicit empty state without wondering whether it is showing absence or ignorance.
   */
  getActive(): Promise<Event | null>

  /**
   * Records an explicit choice, which is then honoured indefinitely (FR-104) — it is **not**
   * re-derived when the chosen conference ends.
   *
   * Returns the newly active event rather than nothing, so a client that issued two switches
   * in quick succession can tell which one the server actually recorded without a second
   * request (FR-118, research D9).
   *
   * Rejects an event the attendee is not registered for, indistinguishably from one that does
   * not exist (FR-148).
   */
  setActive(eventId: string): Promise<Event>
}
