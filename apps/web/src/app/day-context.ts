/**
 * T024 (002) — "day N of M", computed against the **venue's** clock (FR-120–FR-125, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **DERIVED HERE, NEVER STORED AND NEVER TRANSPORTED** (FR-121).
 *
 * `dayNumber` and `totalDays` appear nowhere in the schema and nowhere in the contract. They
 * are a function of two dates, a timezone, and the current instant, and any stored copy is
 * wrong as soon as the clock moves. The shipped interface note in `@mynet/data` records the
 * same rule; this module is where the derivation actually lives.
 *
 * **The venue's zone, not the device's.** A device-local computation is correct for everyone
 * standing at the conference and wrong for everyone reading from anywhere else. That bug is
 * invisible when you develop in the venue's timezone, which is precisely why FR-120 names it.
 *
 * **No date library** (constitution: the dependency set is derived from actual need). One
 * `Intl.DateTimeFormat` call with an explicit `timeZone` resolves "what is today's date at the
 * venue", and the rest is subtraction on calendar dates. Revisit if 005's schedule work needs
 * more than this.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ConferenceDates {
  /** `YYYY-MM-DD`, the venue's local first day. */
  readonly startsOn: string
  /** `YYYY-MM-DD`, the venue's local last day, inclusive. */
  readonly endsOn: string
  /** IANA zone of the venue, e.g. `Europe/Madrid`. */
  readonly timezone: string
}

/**
 * Where today falls relative to the conference (FR-122).
 *
 * A discriminated union rather than a nullable day number, so "has not started" and "has ended"
 * cannot collapse into the same falsy check and get rendered as "Day 0 of 4".
 */
export type DayContext =
  | { readonly status: 'before'; readonly daysUntil: number; readonly totalDays: number }
  | { readonly status: 'during'; readonly dayNumber: number; readonly totalDays: number }
  | { readonly status: 'after'; readonly totalDays: number }

/**
 * The calendar date at a given instant in a given zone, as `YYYY-MM-DD`.
 *
 * `en-CA` because it formats as ISO-8601, which sorts and parses without further work.
 */
const dateAt = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)

/**
 * Whole days between two `YYYY-MM-DD` dates.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Counting calendar dates is what satisfies FR-125**, and it is why both dates are read at
 * UTC midnight rather than in the venue's zone. A daylight-saving transition makes a local day
 * 23 or 25 hours long; dividing elapsed milliseconds by 24 hours then gains or loses a day
 * somewhere inside the conference. Anchoring both ends to UTC midnight removes the transition
 * from the arithmetic entirely — the dates have already been resolved in the venue's zone by
 * `dateAt`, so no offset remains to go wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const daysBetween = (from: string, to: string): number => {
  const MS_PER_DAY = 86_400_000
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}

export const dayContextFor = (conference: ConferenceDates, now: Date): DayContext => {
  const today = dateAt(now, conference.timezone)

  // Inclusive of both ends: a conference running the 14th to the 17th is four days, and the
  // 17th is day four rather than the day after it ended.
  const totalDays = daysBetween(conference.startsOn, conference.endsOn) + 1

  if (today < conference.startsOn) {
    return { status: 'before', daysUntil: daysBetween(today, conference.startsOn), totalDays }
  }

  if (today > conference.endsOn) {
    return { status: 'after', totalDays }
  }

  return { status: 'during', dayNumber: daysBetween(conference.startsOn, today) + 1, totalDays }
}

/**
 * "Good morning" and friends, from the **device** clock (FR-123).
 *
 * Deliberately the opposite choice from the day number above, and the two are not in tension:
 * the day number is a fact about the conference, so it follows the venue; the greeting is about
 * the person reading it, so it follows them. An attendee reading at breakfast in Lima is having
 * a morning whatever time it is in Barcelona.
 *
 * This is where the prototype's hardcoded "Good morning, Sarah" stopped being true — the name
 * comes from the session, and the time of day from the reader's own clock.
 */
export const timeOfDayGreeting = (now: Date): string => {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}
