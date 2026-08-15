import { OfflineError } from '@mynet/data'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { HomeShell } from '../../src/app/home/HomeShell.js'
import { HOME_CARDS } from '../../src/app/home/registry.js'
import { PROGRAMME } from '../support/agenda.js'
import { SUMMIT, testServices, WithServices } from '../support/services.js'

/**
 * T091 (007) — **the unread card fails alone** (FR-533, SC-517).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **STANDING DECISION 9, ASSERTED FOR THE CARD MOST LIKELY TO BREAK IT.**
 *
 * Home is composed, not aggregated: a failing card must not blank the dashboard, and no card may
 * depend on another. 002 and 005 asserted that for cards reading conference content. This card is
 * the first that reads something **cross-event**, from a repository nothing else on Home touches
 * — so the coupling it could introduce is a new one, and it runs in both directions:
 *
 *   - the unread read failing must leave five healthy cards rendering, and
 *   - **every other read failing must leave the indicator working**, which is the direction a
 *     shared error boundary or a shared loading gate would break first.
 *
 * It has its own address (`GET /conversations/unread`) precisely so the second direction is true
 * — a card that derived its answer from the conversation list would inherit that list's failures.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const quietConversations = {
  list: async () => [],
  hasUnread: async () => false,
  openWith: async () => ({ conversationId: '', messageId: '', sentAt: '' }),
  markRead: async () => {},
}

const healthy = {
  catalog: { listSessions: async () => PROGRAMME, listTracks: async () => [] },
  commitments: {
    listSaved: async () => [],
    save: async () => {},
    unsave: async () => {},
    markViewed: async () => {},
    // 014 tranche 2 — enrolment no-ops; `places` rejects so the figure is omitted (FR-1070b).
    enrol: async () => {},
    release: async () => {},
    places: async () => Promise.reject(new Error('places not configured in this test')),
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

describe('the unread indicator and the rest of Home', () => {
  it('its failure leaves EVERY OTHER CARD rendering (FR-533, SC-517)', async () => {
    renderHome({
      ...healthy,
      conversations: {
        ...quietConversations,
        hasUnread: async () => {
          throw new Error('server fault')
        },
      },
    })

    // The failing card says so, in its own region, with a retry.
    const failing = await screen.findByRole('region', { name: 'Unread messages' })
    expect(within(failing).getByRole('alert')).toHaveTextContent(/problem on our side/i)

    for (const name of ['Up next', 'Rest of your day', 'Your conferences']) {
      expect(
        await screen.findByRole('region', { name }),
        `${name} must survive the unread card's failure`,
      ).toBeInTheDocument()
    }
  })

  it('IT KEEPS WORKING when every other read fails — the other direction', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The direction a shared loading gate or a shared error boundary would break first, and the
    // reason the indicator has its own address rather than deriving from the conversation list.
    // ───────────────────────────────────────────────────────────────────────────────────────
    renderHome({
      catalog: {
        listSessions: async () => {
          throw new Error('server fault')
        },
        listTracks: async () => {
          throw new Error('server fault')
        },
      },
      events: {
        listRegistered: async () => {
          throw new Error('server fault')
        },
      },
      commitments: {
        listSaved: async () => {
          throw new Error('server fault')
        },
        save: async () => {},
        unsave: async () => {},

        markViewed: async () => {},
        // 014 tranche 2 — enrolment no-ops; `places` rejects so the figure is omitted (FR-1070b).
        enrol: async () => {},
        release: async () => {},
        places: async () => Promise.reject(new Error('places not configured in this test')),
      },
      directory: {
        list: async () => {
          throw new Error('server fault')
        },
        get: async () => null,
        readAvatar: async () => null,
      },
      conversations: { ...quietConversations, hasUnread: async () => true },
    })

    const indicator = await screen.findByRole('region', { name: 'Unread messages' })
    expect(within(indicator).getByRole('link', { name: /unread messages/i })).toHaveAttribute(
      'href',
      '/messages',
    )
  })

  it('reports its own offline state distinguishably, and only its own', async () => {
    renderHome({
      ...healthy,
      conversations: {
        ...quietConversations,
        hasUnread: async () => {
          throw new OfflineError('unread')
        },
      },
    })

    const region = await screen.findByRole('region', { name: 'Unread messages' })
    expect(within(region).getByRole('alert')).toHaveTextContent(/needs a connection/i)

    // Nothing is cached (FR-563), so it asks for a connection rather than offering something
    // stale — and the cards that *are* healthy are unaffected by the wording or the failure.
    expect(await screen.findByRole('region', { name: 'Up next' })).toBeInTheDocument()
  })

  it('is ABSENT rather than empty when there is nothing unread (FR-531)', async () => {
    renderHome({ ...healthy, conversations: quietConversations })

    // Home still renders; the indicator simply is not part of it.
    expect(await screen.findByRole('region', { name: 'Up next' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Unread messages' })).not.toBeInTheDocument()
  })

  it('does not read the conversation LIST at all, so it cannot inherit its failures', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Asserted by making the list throw and the cheap question succeed. A card that derived its
    // answer from the list — the obvious implementation, and one request fewer — would fail
    // here, which is exactly why the contract gave the indicator its own address.
    // ───────────────────────────────────────────────────────────────────────────────────────
    let listReads = 0

    renderHome({
      ...healthy,
      conversations: {
        ...quietConversations,
        list: async () => {
          listReads += 1
          throw new Error('the list is broken')
        },
        hasUnread: async () => true,
      },
    })

    expect(await screen.findByRole('region', { name: 'Unread messages' })).toBeInTheDocument()
    expect(
      listReads,
      'the card must not transfer the whole conversation list to render a dot',
    ).toBe(0)
  })
})
