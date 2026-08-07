import { useAuth } from '../../../auth/useAuth.js'
import { dayContextFor, timeOfDayGreeting, type DayContext } from '../../day-context.js'
import type { EventCardProps, HomeCard } from '../contract.js'

/**
 * T026 (002) — the greeting and day context (FR-120–FR-125, FR-170).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This card is where two prototype defects stop being true.**
 *
 * The prototype greeted "Good morning, Sarah" on "Tuesday, March 18" regardless of who was
 * looking or what day it was. The name now comes from the sign-in session, the time-of-day
 * wording from the reader's own clock (FR-123), and the day number from the **venue's** clock
 * (FR-120) — so an attendee reading from Lima is told Barcelona's day, which is the one the
 * conference is actually on.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * `scope: 'event'`, so the shell hands it a resolved conference and it never handles absence.
 */
const GreetingDayContextCard = ({ event }: EventCardProps) => {
  const { attendee } = useAuth()

  // Read once per render rather than held in state: this is a clock, and a stored copy would be
  // wrong from the moment it was taken. Nothing here re-renders on a timer, so the wording is
  // correct as of the last render — which is what "day N of M" needs and no more.
  const now = new Date()
  const context = dayContextFor(event, now)

  return (
    <section
      aria-label="Your conference today"
      className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card tablet:px-6 tablet:py-5"
    >
      <h2 className="font-display text-2xl font-semibold text-text-primary">
        {/* The heading every e2e journey identifies Home by, and the one the prototype faked. */}
        {attendee ? `Hello, ${attendee.displayName}` : 'Hello'}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{timeOfDayGreeting(now)}</p>

      <p className="mt-4 font-display text-lg font-medium text-text-primary">{event.name}</p>
      <p className="text-sm text-text-body">{event.location}</p>

      <p className="mt-2 text-sm text-text-body">
        {/*
          Machine-readable alongside the human wording, so the dates are available to assistive
          technology and to anything that parses the page, without the visible text having to be
          the awkward shape a machine wants.
        */}
        <time dateTime={event.startsOn}>{describeDayContext(context)}</time>
      </p>
    </section>
  )
}

/**
 * The three cases FR-122 names, each said plainly.
 *
 * **No day number before it starts or after it ends** — "Day 0 of 4" is nonsense, and "Day 5 of
 * 4" is worse. The union returned by `dayContextFor` makes those unrepresentable rather than
 * merely unwritten.
 */
const describeDayContext = (context: DayContext): string => {
  switch (context.status) {
    case 'during':
      return `Day ${context.dayNumber} of ${context.totalDays}`
    case 'before':
      return context.daysUntil === 1 ? 'Starts tomorrow' : `Starts in ${context.daysUntil} days`
    case 'after':
      return 'This conference has ended'
  }
}

export const greetingDayContextCard: HomeCard = {
  id: 'greeting-day-context',
  title: 'Your conference today',
  slot: 'lead',
  order: 0,
  scope: 'event',
  Component: GreetingDayContextCard,
}
