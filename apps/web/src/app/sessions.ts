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

/**
 * Formatters, cached per timezone.
 *
 * `Intl.DateTimeFormat` construction resolves locale and timezone data and is among the most
 * expensive operations on the Intl surface; reuse is the standard mitigation. Without this,
 * rendering an N-session programme constructed roughly 2N formatters — one per session in
 * `groupByVenueDay`, one per session in `SessionRow` — on every re-render, with the timezone
 * argument constant throughout. At a 500-session conference that is ~1000 constructions of an
 * object that can be three, on the destination FR-137 makes the programme's home.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>()

const formatter = (
  locale: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  // The options are fixed per call site, so the locale and timezone identify the formatter.
  const cacheKey = `${locale}:${timezone}:${JSON.stringify(options)}`
  let cached = formatterCache.get(cacheKey)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options })
    formatterCache.set(cacheKey, cached)
  }
  return cached
}

/**
 * The venue's calendar date at an instant, as `YYYY-MM-DD`.
 *
 * `en-CA` because it formats as ISO-8601, which sorts and compares as a string without further
 * work — every "is this the same venue day" comparison in this file relies on that.
 */
export const venueDateOf = (instant: Date, timezone: string): string =>
  formatter('en-CA', timezone, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  )

/** A session's start time as the venue reads it, e.g. `09:00`. */
export const venueTimeOf = (iso: string, timezone: string): string =>
  formatter('en-GB', timezone, { hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  )

/** A venue-local day heading, e.g. `Monday 14 September`. */
export const venueDayLabelOf = (iso: string, timezone: string): string =>
  formatter('en-GB', timezone, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(iso),
  )

/**
 * The next session that has not yet started, **on the venue's current day**.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Scoped to today, and that scoping is the requirement rather than an optimisation.**
 *
 * FR-140 says the card must "state explicitly when no session remains **today** rather than
 * showing nothing or a past session". Searching the whole programme instead looks equivalent
 * and is not: at 20:00 on day one of a four-day conference, the next session in the whole
 * programme is tomorrow's 09:30 — and it renders as a bare `09:30` with no date, which reads as
 * *later today*. The attendee cannot tell it is wrong, which is exactly the failure the
 * requirement names.
 *
 * A one-day fixture cannot catch this, because "nothing left today" and "nothing left at all"
 * are then the same condition. `apps/web/tests/unit/sessions.test.ts` uses two days.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ties are resolved by id, matching the server's total order, so two simultaneous starts
 * resolve to the same one on every read and on every device rather than to whichever the
 * iteration happened to reach first.
 */
export const nextSession = (
  sessions: readonly Session[],
  now: Date,
  timezone: string,
): Session | null => {
  const today = venueDateOf(now, timezone)

  const upcoming = sessions.filter(
    (session) =>
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **T054 (014) — A CANCELLED SESSION IS NOT AN ANSWER TO "WHERE DO I GO NOW"** (FR-1022a).
      //
      // This is the **one surface in the product where a cancelled session is omitted rather
      // than marked**, and the exception is deliberate. FR-1022 presents cancellation everywhere
      // else — the programme, Agenda, the detail panel, the rest-of-day timeline — because an
      // attendee needs to see that something will not happen. "Up next" asks a different
      // question, and it is the most prominent thing in the first viewport: naming a cancelled
      // session there sends somebody across a venue to an empty room.
      //
      // **One change point, serving both cards** (research R8). `UpNext` and `NextSavedSession`
      // both call this, so FR-1022a is satisfied for both by editing one filter — while
      // `RestOfDay` renders the full list from `restOfVenueDay` below and is deliberately
      // unaffected. That the composition allowed this is 002's and 005's doing: the computation
      // lives in a module rather than in each card, and Home's registry forbids a card editing
      // a neighbour.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      !session.cancelled &&
      new Date(session.startsAt).getTime() > now.getTime() &&
      venueDateOf(new Date(session.startsAt), timezone) === today,
  )
  if (upcoming.length === 0) return null

  // T013 (006) — `?? null` rather than `[0] as Session`. The length check above already
  // guarantees a first element, so the assertion was true; it was still an instruction to stop
  // checking, on a function whose return type is `Session | null` and can express the answer.
  return (
    [...upcoming].sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || (a.id < b.id ? -1 : 1),
    )[0] ?? null
  )
}

/**
 * What is left of the venue's today, after the session already named as "up next".
 *
 * Scoped to the venue's current date rather than "the next N sessions", so the card says
 * something true — "the rest of today" — instead of spilling into tomorrow's programme when the
 * afternoon is quiet.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T055 (014) — CANCELLED SESSIONS STAY HERE, MARKED, AND THAT IS THE REQUIREMENT** (FR-1022).
 *
 * It would be easy to inherit `nextSession`'s new filter on the reasoning that both functions
 * are about "what is coming". They are not: this one lists **the rest of the day**, and an
 * attendee whose 14:00 was cancelled needs to see that in the timeline they are reading — the
 * cancellation is the information. Omitting it here would make the afternoon look like it always
 * had a gap.
 *
 * `apps/web/tests/unit/sessions.test.ts` asserts the asymmetry, because the two functions sit
 * six lines apart and the difference between them is one condition.
 * ─────────────────────────────────────────────────────────────────────────────────────────
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
    // Push into the existing array rather than rebuilding it — the copy-on-insert form was
    // quadratic in the number of sessions sharing a venue-local day.
    const day = days.get(date)
    if (day) day.push(session)
    else days.set(date, [session])
  }

  return [...days.entries()].map(([date, daySessions]) => ({
    date,
    label: venueDayLabelOf(daySessions[0]?.startsAt ?? `${date}T00:00:00Z`, timezone),
    sessions: daySessions,
  }))
}
