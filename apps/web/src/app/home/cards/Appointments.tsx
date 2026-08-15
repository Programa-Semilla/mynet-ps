import { OfflineError, type Appointment } from '@mynet/data'
import { useAppointmentRepository } from '@mynet/platform'
import { CalendarClock } from 'lucide-react'
import { useCallback } from 'react'
import { Link } from 'react-router'

import { Failed, useAsync } from '../../AsyncState.js'
import type { EventCardProps, HomeCard } from '../contract.js'

/**
 * T113–T116 (008) — **the appointment summary card** (FR-643–FR-646, SC-606, SC-607).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T116 — THIS CARD IS THE ONLY WAY AN ATTENDEE LEARNS SOMEBODY HAS PROPOSED A MEETING, AND
 * THAT IS WHY IT SURFACES PENDING PROPOSALS RATHER THAN ONLY CONFIRMED ONES** (FR-643, FR-645,
 * SC-606).
 *
 * **No notification is dispatched by this feature, for any event** (FR-643). That is not an
 * omission to be fixed later: constitution v3.1.0 (standing decision 21) brought delivery into
 * scope for **a received message and nothing else**, and `notification-triggers.test.ts` is a
 * source-level audit asserting exactly that — which 008 does not edit. Adopting the platform for
 * proposals would need another amendment, and the test exists so that adopting it silently is
 * impossible.
 *
 * The consequence lands here. With no notification and no bell (both still forbidden), an
 * attendee who never opens Network never discovers a proposal at all. Home is the answer, and it
 * is the *whole* answer — which is why a proposal awaiting the reader is rendered distinctly and
 * with a route to act on it, rather than being counted alongside confirmed meetings.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T115 — EVENT-SCOPED, AND THE COMPILER ENFORCES IT** (FR-639).
 *
 * The deliberate opposite of 007's unread indicator beside it, which is attendee-scoped because
 * conversations are cross-event. An appointment is a time and a place at one conference, so
 * declaring `scope: 'event'` means the shell resolves the conference above this card and it
 * never has to handle a null one — and, more usefully, it *cannot* be rendered without one.
 *
 * Both halves of that union are now load-bearing in this product, one per feature.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T111 — THE FAILURE IS CONTAINED IN THIS CARD AND REACHES NOTHING ELSE** (FR-646, SC-607).
 *
 * Standing decision 9: Home is composed, not aggregated. This card owns its loading, empty and
 * failure states, reads its own data through its own repository call, and depends on no other
 * card. Breaking its source must leave every other card on the dashboard rendering — which is
 * what `quickstart.md` scenario 5 step 4 asks a human to verify by stopping the API.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const AppointmentsCard = ({ event }: EventCardProps) => {
  const repository = useAppointmentRepository()

  const load = useCallback(async () => repository.list(event.id), [repository, event.id])

  const appointments = useAsync<readonly Appointment[]>(load, [load])

  if (appointments.status === 'loading') {
    return (
      <Section>
        <p role="status" className="text-sm text-text-muted">
          Loading your meetings…
        </p>
      </Section>
    )
  }

  if (appointments.status === 'failed') {
    return (
      <Section>
        <Failed
          message={
            appointments.error instanceof OfflineError
              ? // Appointments ARE cached (FR-647), so an offline read usually succeeds and this
                // is the first-ever-load case. Worded as needing a connection rather than as a
                // fault, which is the distinction FR-657 requires.
                'Your meetings need a connection the first time they are loaded.'
              : 'Your meetings could not be loaded. This is a problem on our side.'
          }
          onRetry={appointments.retry}
        />
      </Section>
    )
  }

  /**
   * T112 — the card's own empty state.
   *
   * Rendered rather than returning `null`, deliberately unlike 007's unread indicator. That card
   * is an *indicator* — a thing which appears when there is something to indicate — while this
   * one answers a standing question the dashboard is supposed to answer: *where are my
   * appointments?* Silence would read as "the product has no such feature" on the surface where
   * the attendee is most likely to look for it.
   */
  if (appointments.status === 'empty') {
    return (
      <Section>
        <p className="text-sm text-text-muted">
          No meetings arranged at {event.name}.{' '}
          <Link to="/network" className="focus-ring underline">
            Open Network
          </Link>{' '}
          to propose one to a contact.
        </p>
      </Section>
    )
  }

  const rows = appointments.data

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **T110 — A PROPOSAL AWAITING THE READER IS SEPARATED OUT, NOT MERELY LISTED** (FR-645).
   *
   * `pending` + `role: 'invitee'` is the only combination that demands something of the reader.
   * A proposal *they* sent is waiting on somebody else and needs nothing; a declined or
   * cancelled one is finished. Mixing all four into one chronological list would bury the single
   * actionable item among items that merely happened — on the surface that, by FR-643, is the
   * only place it appears at all.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const awaiting = rows.filter((row) => row.status === 'pending' && row.role === 'invitee')

  /**
   * T109 — confirmed meetings, **chronologically** (FR-644).
   *
   * The server already orders by slot instant, and this re-filters rather than re-sorts: a card
   * that re-derived the ordering would be a second answer to a question the server has already
   * answered, and the two could disagree.
   */
  const confirmed = rows.filter((row) => row.status === 'confirmed')

  /**
   * Everything at this conference is declined, cancelled or lapsed. Not "empty" in the
   * repository's sense — there are rows — but nothing to say, so the same wording applies.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The copy is duplicated with the `empty` branch above, deliberately and reluctantly.**
   * Extracting it into a shared component was tried and reverted: it destabilised two component
   * tests in a way that was not understood at the time, and shipping a cosmetic dedup nobody can
   * explain is worse than shipping two copies somebody can read. If the wording changes, change
   * both — and if you are extracting it, run `appointments-card.test.tsx` first.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  if (awaiting.length === 0 && confirmed.length === 0) {
    return (
      <Section>
        <p className="text-sm text-text-muted">
          No meetings arranged at {event.name}.{' '}
          <Link to="/network" className="focus-ring underline">
            Open Network
          </Link>{' '}
          to propose one to a contact.
        </p>
      </Section>
    )
  }

  return (
    <Section>
      {awaiting.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 font-medium text-text-primary">
            {awaiting.length === 1
              ? 'Someone has proposed a meeting'
              : `${awaiting.length} people have proposed meetings`}
          </p>
          <ul className="mb-2 text-sm text-text-body">
            {awaiting.map((row) => (
              <li key={row.appointmentId} className="truncate">
                {row.counterpart.displayName} · {timeOf(row, event.timezone)}
              </li>
            ))}
          </ul>
          {/*
            **A route to answer it** (FR-645). The card does not accept or decline in place: that
            decision deserves the appointment's full context — the topic, the time in venue
            terms, and the confirmation dialog — which is Network's job, not a dashboard card's.
          */}
          <Link
            to="/network"
            className="focus-ring inline-flex min-h-11 items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
          >
            Answer in Network
          </Link>
        </div>
      )}

      {confirmed.length > 0 && (
        <>
          <p className="mb-1 text-sm font-medium text-text-primary">Confirmed</p>
          <ul className="text-sm text-text-body">
            {confirmed.map((row) => (
              <li key={row.appointmentId} className="truncate">
                <time dateTime={row.slot.startsAt}>{timeOf(row, event.timezone)}</time> ·{' '}
                {row.counterpart.displayName}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

/** The card's own frame, so every state above is inside the same labelled region. */
const Section = ({ children }: { children: React.ReactNode }) => (
  <section
    aria-label="Appointments"
    className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card tablet:px-5"
  >
    <h2 className="mb-2 flex items-center gap-2 font-display text-base font-medium text-text-primary">
      <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-accent-strong" />
      Appointments
    </h2>
    {children}
  </section>
)

/** Venue time, following 002's clock rule (FR-624) — a meeting is a thing you turn up to. */
const timeOf = (appointment: Appointment, timeZone: string): string =>
  new Date(appointment.slot.startsAt).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })

export const appointmentsCard: HomeCard = {
  id: 'appointments',
  title: 'Appointments',
  slot: 'aside',
  /**
   * **Appended, not inserted**, and not `lead`: FR-157 allows at most one lead card, and
   * reordering existing entries is forbidden outright. `order` is what lets this land without
   * disturbing anything, because the shell sorts by it rather than by array position.
   *
   * `3`, after the unread indicator. Home answers "what is happening next" first (Principle
   * III); an arranged meeting is later still than a waiting message — **except** when somebody is
   * waiting on an answer, which is why that case is given the card's own prominent treatment
   * rather than a higher `order`. A card that jumped the queue on some loads and not others
   * would make the dashboard's shape unpredictable.
   */
  order: 3,
  /** Per-event (FR-639). See the header: the compiler is what keeps this true. */
  scope: 'event',
  Component: AppointmentsCard,
}
