import { OfflineError, type Appointment } from '@mynet/data'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { HomeShell } from '../../src/app/home/HomeShell.js'
import { HOME_CARDS } from '../../src/app/home/registry.js'
import { PROGRAMME } from '../support/agenda.js'
import { SUMMIT, testServices, WithServices } from '../support/services.js'

/**
 * T109–T112 (008) — **Home's appointment summary** (FR-643–FR-646, SC-606, SC-607).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS CARD IS THE ONLY WAY AN ATTENDEE LEARNS SOMEBODY HAS PROPOSED A MEETING.**
 *
 * This feature dispatches **no notification, for any event** (FR-643) — constitution v3.1.0
 * brought delivery into scope for a received message and nothing else, and the notification bell
 * remains forbidden. So an attendee who never opens Network never discovers a proposal at all,
 * unless this card tells them.
 *
 * That is why T110's assertion is not "the proposal is listed" but "it is visibly distinct and
 * offers a route to answer it". A pending proposal buried in a chronological list of confirmed
 * meetings satisfies the first and fails the requirement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const COUNTERPART = {
  attendeeId: 'attendee-grace',
  displayName: 'Grace Hopper',
}

/** Confirmed, and the LATER of the two. */
const CONFIRMED_LATE: Appointment = {
  appointmentId: 'appointment-late',
  role: 'proposer',
  counterpart: { ...COUNTERPART, displayName: 'Late Meeting' },
  slot: {
    slotId: 'slot-late',
    startsAt: '2026-09-14T15:00:00.000Z',
    endsAt: '2026-09-14T15:30:00.000Z',
  },
  topic: 'The later one.',
  status: 'confirmed',
  createdAt: '2026-09-13T09:00:00.000Z',
  answeredAt: '2026-09-13T10:00:00.000Z',
}

const CONFIRMED_EARLY: Appointment = {
  ...CONFIRMED_LATE,
  appointmentId: 'appointment-early',
  counterpart: { ...COUNTERPART, displayName: 'Early Meeting' },
  slot: {
    slotId: 'slot-early',
    startsAt: '2026-09-14T07:30:00.000Z',
    endsAt: '2026-09-14T08:00:00.000Z',
  },
  topic: 'The earlier one.',
}

const AWAITING_THE_READER: Appointment = {
  ...CONFIRMED_LATE,
  appointmentId: 'appointment-awaiting',
  counterpart: COUNTERPART,
  role: 'invitee',
  status: 'pending',
  answeredAt: null,
  slot: {
    slotId: 'slot-awaiting',
    startsAt: '2026-09-14T12:00:00.000Z',
    endsAt: '2026-09-14T12:30:00.000Z',
  },
}

const healthy = {
  catalog: { listSessions: async () => PROGRAMME, listTracks: async () => [] },
  savedSessions: {
    listSaved: async () => [],
    save: async () => {},
    unsave: async () => {},
    markViewed: async () => {},
  },
}

const renderHome = (services: Parameters<typeof testServices>[0]) =>
  render(
    <WithServices services={testServices(services)}>
      <ActiveEventProvider>
        <MemoryRouter>
          <HomeShell cards={HOME_CARDS} activeEvent={{ status: 'ready', event: SUMMIT }} />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

const appointmentsDouble = (list: () => Promise<Appointment[]>) => {
  const base = testServices().repositories.appointments
  return { ...base, list }
}

const card = async () => within(await screen.findByRole('region', { name: /appointments/i }))

describe('the appointment summary card', () => {
  /**
   * T109 — confirmed meetings, **chronologically** (FR-644).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The card preserves the server's ordering rather than re-deriving it**, and this test is
   * written to match that rather than to disguise it. `listAppointments` orders by slot instant;
   * a card that sorted again would be a second answer to a question already answered, and the
   * two could disagree — which is the same reasoning `conversations` records for its absent
   * `status` column.
   *
   * So the input here is in **server order**, and what is asserted is that filtering to the
   * confirmed rows does not disturb it. The ordering itself is asserted where it is produced, in
   * `appointments-answer.test.ts` against a real database.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('T109 — lists confirmed meetings chronologically, preserving the server’s order (FR-644)', async () => {
    renderHome({
      ...healthy,
      appointments: appointmentsDouble(async () => [CONFIRMED_EARLY, CONFIRMED_LATE]),
    })

    const region = await card()
    const text = region.getByText(/early meeting/i).closest('ul')?.textContent ?? ''

    expect(text.indexOf('Early Meeting')).toBeLessThan(text.indexOf('Late Meeting'))
  })

  /**
   * T110 — **a proposal awaiting the reader is visibly distinct, and offers a route to answer
   * it** (FR-645, SC-606).
   *
   * Both halves are asserted, because either alone is satisfiable by an implementation that
   * fails the requirement: a distinct label with no action leaves the attendee nowhere to go,
   * and a route with no distinction leaves them not knowing they need it.
   */
  it('T110 — marks a proposal awaiting the reader distinctly, with a route to answer it (FR-645)', async () => {
    renderHome({
      ...healthy,
      appointments: appointmentsDouble(async () => [CONFIRMED_EARLY, AWAITING_THE_READER]),
    })

    const region = await card()

    // Distinct, in words rather than by colour alone (Principle IV).
    expect(region.getByText(/someone has proposed a meeting/i)).toBeInTheDocument()

    // And a route to act on it — which is the whole point, because no notification announces it.
    expect(region.getByRole('link', { name: /answer in network/i })).toHaveAttribute(
      'href',
      '/network',
    )
  })

  it('does not treat a proposal the reader SENT as awaiting them (FR-645)', async () => {
    // The reader is the proposer, so this is waiting on somebody else and demands nothing. A
    // card that counted it would put a permanent "answer this" prompt on Home.
    renderHome({
      ...healthy,
      appointments: appointmentsDouble(async () => [
        { ...AWAITING_THE_READER, role: 'proposer' as const },
      ]),
    })

    const region = await card()
    expect(region.queryByText(/someone has proposed a meeting/i)).not.toBeInTheDocument()
    expect(region.queryByRole('link', { name: /answer in network/i })).not.toBeInTheDocument()
  })

  it('T112 — renders its own empty state, naming the conference and a way to act', async () => {
    renderHome({ ...healthy, appointments: appointmentsDouble(async () => []) })

    const region = await card()

    // Rendered rather than returning null, deliberately unlike 007's unread indicator: this
    // answers a standing question the dashboard is supposed to answer, and silence would read as
    // "the product has no such feature" on the surface most likely to be checked.
    expect(region.getByText(/no meetings arranged at/i)).toBeInTheDocument()
    expect(region.getByRole('link', { name: /open network/i })).toBeInTheDocument()
  })

  it('treats a card with only declined and cancelled rows as empty', async () => {
    renderHome({
      ...healthy,
      appointments: appointmentsDouble(async () => [
        { ...CONFIRMED_EARLY, status: 'declined' as const },
        { ...CONFIRMED_LATE, status: 'cancelled' as const },
      ]),
    })

    const region = await card()
    // There are rows, but nothing to say about them. Listing "cancelled" meetings on the first
    // viewport would be noise about things that are not happening.
    expect(await region.findByText(/no meetings arranged at/i)).toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T111 — **its failure is contained, and it runs in BOTH directions** (FR-646, SC-607).
   *
   * Standing decision 9: a failing card must not blank the dashboard, and no card may depend on
   * another. Both directions are asserted because a shared error boundary or a shared loading
   * gate would break the second first — and the second is the one nobody thinks to check.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T111 — its failure leaves every other Home card rendering (FR-646, SC-607)', async () => {
    renderHome({
      ...healthy,
      appointments: appointmentsDouble(async () => {
        throw new Error('server fault')
      }),
    })

    const region = await card()
    expect(region.getByRole('alert')).toBeInTheDocument()
    expect(region.getByRole('button', { name: /try again/i })).toBeInTheDocument()

    // The rest of the dashboard is untouched.
    expect(await screen.findByRole('region', { name: 'Up next' })).toBeInTheDocument()
  })

  it('T111 — every OTHER card failing leaves this one working (FR-646, SC-607)', async () => {
    renderHome({
      catalog: {
        listSessions: async () => {
          throw new Error('server fault')
        },
        listTracks: async () => {
          throw new Error('server fault')
        },
      },
      savedSessions: {
        listSaved: async () => {
          throw new Error('server fault')
        },
        save: async () => {},
        unsave: async () => {},

        markViewed: async () => {},
      },
      appointments: appointmentsDouble(async () => [CONFIRMED_EARLY]),
    })

    const region = await card()
    expect(
      region.getByText(/early meeting/i),
      'The appointment card stopped rendering because unrelated cards failed. Home is composed, ' +
        'not aggregated (standing decision 9) — this card reads its own repository and must not ' +
        "inherit anybody else's failure.",
    ).toBeInTheDocument()
  })

  it('words an offline failure distinguishably from a fault on our side (FR-657)', async () => {
    renderHome({
      ...healthy,
      appointments: appointmentsDouble(async () => {
        throw new OfflineError('offline')
      }),
    })

    const region = await card()
    // Appointments ARE cached (FR-647), so an offline read usually succeeds — this is the
    // first-ever-load case, and it says so rather than blaming the account.
    expect(region.getByRole('alert')).toHaveTextContent(/need a connection/i)
  })
})
