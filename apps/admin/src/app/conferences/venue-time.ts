/**
 * T-review (014) — **the venue's clock, decided once for the administrative site.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE PROGRAMME LIST RENDERED RAW UTC INSTANTS WHILE THE FORM ONE COMPONENT OVER RENDERED
 * VENUE-LOCAL WALL TIME.**
 *
 * `ProgrammeEditor` printed `{session.startsAt} → {session.endsAt}` — the absolute instants
 * exactly as they came off the wire — and `SessionForm` converted the same two values into the
 * venue's zone and named the zone beside the field. Two readings of one value, three lines apart
 * on the same screen.
 *
 * It is not a cosmetic difference. **FR-1012's refusal is evaluated in venue-local time**, so an
 * organizer told "that session falls outside the conference's dates" was reading a UTC timestamp
 * that could not show them why — and in any westward zone a late-evening session displays on the
 * *following* day, so the list disagreed with the refusal about which day a session was even on.
 *
 * The conversion helpers were private to `SessionForm`, which is what allowed the list to grow its
 * own answer. They live here now, for the same reason `apps/web/src/app/sessions.ts` exists on the
 * attendee side: three surfaces each deciding what the venue's clock says is how they come to
 * disagree at 23:50.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Formatters, cached per (locale, timezone, options).
 *
 * `Intl.DateTimeFormat` construction resolves locale and timezone data and is among the most
 * expensive operations on the Intl surface. A forty-session programme re-renders after **every**
 * write here — `ProgrammeEditor` re-reads rather than patching locally, deliberately — so an
 * uncached formatter is two constructions per session per write. `sessions.ts` carries the same
 * cache on the attendee side and records the same reasoning.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>()

const formatter = (
  locale: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const cacheKey = `${locale}:${timezone}:${JSON.stringify(options)}`
  let cached = formatterCache.get(cacheKey)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options })
    formatterCache.set(cacheKey, cached)
  }
  return cached
}

/**
 * The offset a timezone is at on a given instant, in minutes.
 *
 * `Intl` is the only way to ask without a timezone library, and this is the standard shape: format
 * the instant in the target zone, read it back as if it were UTC, and take the difference. It
 * handles daylight saving correctly because the answer is computed **at the instant in question**
 * rather than from a fixed offset — which is exactly the mistake a stored offset would make for a
 * conference spanning a transition.
 */
const offsetMinutesAt = (instant: Date, timezone: string): number => {
  const parts = formatter('en-US', timezone, {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour'),
    at('minute'),
    at('second'),
  )

  return (asUtc - instant.getTime()) / 60_000
}

/**
 * A venue-local wall time (`2027-03-01T09:00`) as an absolute instant (FR-124).
 *
 * Two passes, and the second is not redundant: the first guess uses the offset at the *UTC*
 * reading of the wall time, which is wrong for an instant that falls the other side of a daylight
 * transition. Re-computing the offset at the corrected instant converges for every real zone.
 */
export const instantOf = (wallTime: string, timezone: string): string => {
  const naive = new Date(`${wallTime}:00Z`)
  const firstGuess = new Date(naive.getTime() - offsetMinutesAt(naive, timezone) * 60_000)
  const corrected = new Date(naive.getTime() - offsetMinutesAt(firstGuess, timezone) * 60_000)
  return corrected.toISOString()
}

/** The inverse, for populating a `datetime-local` field when editing. */
export const wallTimeOf = (iso: string, timezone: string): string => {
  const instant = new Date(iso)
  const local = new Date(instant.getTime() + offsetMinutesAt(instant, timezone) * 60_000)
  return local.toISOString().slice(0, 16)
}

/**
 * A session's span as the venue reads it, e.g. `Mon 1 Mar, 09:00 – 10:00`.
 *
 * **The date is included and the end time is not repeated with it.** FR-1012 and FR-1014 are both
 * rules about which *day* a session falls on, so a span rendered as times alone would leave the
 * organizer unable to check the refusal they were given — and a session crossing venue-local
 * midnight is legal (it belongs to the date it starts), which is precisely the case a time-only
 * rendering hides.
 */
export const venueSpanOf = (startsAt: string, endsAt: string, timezone: string): string => {
  const day = formatter('en-GB', timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(startsAt))

  const time = (iso: string): string =>
    formatter('en-GB', timezone, { hour: '2-digit', minute: '2-digit', hour12: false }).format(
      new Date(iso),
    )

  const endDay = formatter('en-GB', timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(endsAt))

  // A session that ends on a different venue day says so, rather than reading as though it ended
  // before it began.
  return endDay === day
    ? `${day}, ${time(startsAt)} – ${time(endsAt)}`
    : `${day}, ${time(startsAt)} – ${endDay}, ${time(endsAt)}`
}
