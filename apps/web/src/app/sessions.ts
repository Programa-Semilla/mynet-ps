import type { Session } from '@mynet/data'

/**
 * T046, T047, T049 (002) — reading a programme against the venue's clock (FR-124, FR-137–FR-140).
 *
 * Shared by the Up next card, the rest-of-day card and Agenda, so "what counts as today" is
 * decided once. Three surfaces each deciding it separately is how they come to disagree at
 * 23:50 in one timezone.
 *
 * Sessions arrive as **absolute instants** (FR-124). Everything venue-local — which day a
 * session belongs to, what time it reads as — is computed here at display time.
 */

/** The venue's calendar date at an instant, as `YYYY-MM-DD`. */
export const venueDateOf = (instant: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)

/** A session's start time as the venue reads it, e.g. `09:00`. */
export const venueTimeOf = (iso: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))

/** A venue-local day heading, e.g. `Monday 14 September`. */
export const venueDayLabelOf = (iso: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))

/**
 * The next session that has not yet started.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Returns `null` when nothing remains, and the caller must say so** (FR-140). It deliberately
 * never falls back to the most recent past session: showing this morning's talk under a heading
 * that says "up next" is worse than an honest empty state, because the attendee cannot tell it
 * is wrong.
 *
 * Ties are resolved by id, matching the server's total order, so two simultaneous starts
 * resolve to the same one on every read and on every device rather than to whichever the
 * iteration happened to reach first.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const nextSession = (sessions: readonly Session[], now: Date): Session | null => {
  const upcoming = sessions.filter(
    (session) => new Date(session.startsAt).getTime() > now.getTime(),
  )
  if (upcoming.length === 0) return null

  return [...upcoming].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || (a.id < b.id ? -1 : 1),
  )[0] as Session
}

/**
 * What is left of the venue's today, after the session already named as "up next".
 *
 * Scoped to the venue's current date rather than "the next N sessions", so the card says
 * something true — "the rest of today" — instead of spilling into tomorrow's programme when the
 * afternoon is quiet.
 */
export const restOfVenueDay = (
  sessions: readonly Session[],
  now: Date,
  timezone: string,
  excludeId?: string,
): Session[] => {
  const today = venueDateOf(now, timezone)

  return sessions
    .filter((session) => {
      if (session.id === excludeId) return false
      if (new Date(session.startsAt).getTime() <= now.getTime()) return false
      return venueDateOf(new Date(session.startsAt), timezone) === today
    })
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || (a.id < b.id ? -1 : 1),
    )
}

/**
 * The whole programme, grouped into venue-local days in chronological order.
 *
 * A session crossing venue-local midnight belongs to **the date it starts** — a consequence of
 * grouping by the venue-local date of `startsAt`, not a separate rule (research D6).
 */
export const groupByVenueDay = (
  sessions: readonly Session[],
  timezone: string,
): Array<{ date: string; label: string; sessions: Session[] }> => {
  const days = new Map<string, Session[]>()

  for (const session of [...sessions].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || (a.id < b.id ? -1 : 1),
  )) {
    const date = venueDateOf(new Date(session.startsAt), timezone)
    days.set(date, [...(days.get(date) ?? []), session])
  }

  return [...days.entries()].map(([date, daySessions]) => ({
    date,
    label: venueDayLabelOf(daySessions[0]?.startsAt ?? `${date}T00:00:00Z`, timezone),
    sessions: daySessions,
  }))
}
