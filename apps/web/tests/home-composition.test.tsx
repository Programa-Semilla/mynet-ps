import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HomeCard } from '../src/app/home/contract.js'
import { HomeShell } from '../src/app/home/HomeShell.js'
import { yourConferencesCard } from '../src/app/home/cards/YourConferences.js'
import { SUMMIT, testServices, WithServices } from './support/services.js'

/**
 * T077 (002) — **a broken card does not take Home down** (FR-160–FR-165, SC-104).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Containment is demonstrated with a card that genuinely throws, not asserted about one that
 * might. The constitution's requirement is that a failing card "MUST NOT blank the dashboard or
 * prevent any other card from rendering" — which is a claim about what happens during a real
 * React render, and nothing short of a real throw exercises it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A card that fails while rendering. The fault injection FR-165 asks for. */
const explodingCard: HomeCard = {
  id: 'exploding',
  title: 'Deliberately broken',
  slot: 'primary',
  order: 99,
  scope: 'attendee',
  Component: () => {
    throw new Error('this card is broken on purpose')
  },
}

const healthyCard: HomeCard = {
  id: 'healthy',
  title: 'Healthy card',
  slot: 'primary',
  order: 0,
  scope: 'attendee',
  Component: () => <p>Healthy content</p>,
}

const eventScopedCard: HomeCard = {
  id: 'event-scoped',
  title: 'Needs a conference',
  slot: 'primary',
  order: 1,
  scope: 'event',
  Component: ({ event }) => <p>{event.name}</p>,
}

describe('Home composition', () => {
  beforeEach(() => {
    // React logs caught render errors. Expected here, and noise in the report.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('contains a throwing card to its own region, and every other card still renders (SC-104)', () => {
    render(
      <WithServices>
        <HomeShell
          cards={[healthyCard, explodingCard]}
          activeEvent={{ status: 'ready', event: SUMMIT }}
        />
      </WithServices>,
    )

    // The failure is named — the reader can tell *what* is unavailable, not merely that
    // something is.
    const failed = screen.getByRole('alert')
    expect(failed).toHaveAccessibleName('Deliberately broken')
    expect(failed.textContent).toMatch(/unavailable/i)

    // …and the neighbour is untouched.
    expect(screen.getByText('Healthy content')).toBeInTheDocument()
  })

  it('is never blank — the shell survives every card failing at once', () => {
    render(
      <WithServices>
        <HomeShell
          cards={[explodingCard, { ...explodingCard, id: 'exploding-2', title: 'Also broken' }]}
          activeEvent={{ status: 'ready', event: SUMMIT }}
        />
      </WithServices>,
    )

    expect(screen.getAllByRole('alert')).toHaveLength(2)
    // The dashboard region itself is still there, which is the difference between a degraded
    // Home and a white screen.
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('a card whose DATA request fails shows its own failure state and affects no other card', async () => {
    render(
      <WithServices
        services={testServices({
          events: {
            listRegistered: async () => {
              throw new Error('server fault')
            },
          },
        })}
      >
        <HomeShell
          cards={[healthyCard, yourConferencesCard]}
          activeEvent={{ status: 'ready', event: SUMMIT }}
        />
      </WithServices>,
    )

    const failure = await screen.findByRole('alert')
    // Its own state, with a retry — a data failure is recoverable in a way a render crash is not.
    expect(within(failure).getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByText('Healthy content')).toBeInTheDocument()
  })

  /**
   * FR-160 — **the split the attendee-scoped half of the contract exists for.**
   *
   * With no resolvable conference, event-scoped cards must say they are unavailable while
   * attendee-scoped ones carry on. If this ever fails, Home goes empty for an attendee whose
   * conference could not be resolved — which is exactly when they most need something on screen.
   */
  it('keeps attendee-scoped cards rendering when the conference cannot be resolved', async () => {
    render(
      <WithServices>
        <HomeShell
          cards={[eventScopedCard, yourConferencesCard]}
          activeEvent={{
            status: 'failed',
            message: 'We could not tell which conference you are in.',
            retry: () => {},
          }}
        />
      </WithServices>,
    )

    // The attendee-scoped card renders its real content.
    expect(await screen.findByText('Product & Design Summit')).toBeInTheDocument()

    // The event-scoped one says it is unavailable rather than rendering nothing.
    const unavailable = screen.getByRole('region', { name: 'Needs a conference' })
    expect(unavailable.textContent).toMatch(/could not tell which conference/i)
  })

  it('renders a visible state for an event-scoped card while the conference loads', () => {
    render(
      <WithServices>
        <HomeShell cards={[eventScopedCard]} activeEvent={{ status: 'loading' }} />
      </WithServices>,
    )

    expect(screen.getByRole('region', { name: 'Needs a conference' })).toBeInTheDocument()
  })

  it('a card with nothing to show stays visible rather than disappearing (FR-161)', async () => {
    render(
      <WithServices services={testServices({ events: { listRegistered: async () => [] } })}>
        <HomeShell cards={[yourConferencesCard]} activeEvent={{ status: 'ready', event: SUMMIT }} />
      </WithServices>,
    )

    // Present, and saying what is true. A card that vanished would make Home silently rearrange
    // itself and leave no way to tell "nothing to show" from "something is broken".
    const card = await screen.findByRole('region', { name: 'Your conferences' })
    expect(card.textContent).toMatch(/will appear here/i)
  })

  it('gives each card its own region in the layout, keyed by id', () => {
    const { container } = render(
      <WithServices>
        <HomeShell
          cards={[healthyCard, explodingCard]}
          activeEvent={{ status: 'ready', event: SUMMIT }}
        />
      </WithServices>,
    )

    expect(container.querySelector('[data-card="healthy"]')).toBeInTheDocument()
    expect(container.querySelector('[data-card="exploding"]')).toBeInTheDocument()
  })

  it('orders cards within a slot by `order`, not by registry position', () => {
    const { container } = render(
      <WithServices>
        <HomeShell
          cards={[
            { ...healthyCard, id: 'second', order: 2 },
            { ...healthyCard, id: 'first', order: 1 },
          ]}
          activeEvent={{ status: 'ready', event: SUMMIT }}
        />
      </WithServices>,
    )

    const ids = [...container.querySelectorAll('[data-card]')].map((el) =>
      el.getAttribute('data-card'),
    )
    // Two features appending concurrently must not reorder each other by winning a merge.
    expect(ids).toEqual(['first', 'second'])
  })
})
