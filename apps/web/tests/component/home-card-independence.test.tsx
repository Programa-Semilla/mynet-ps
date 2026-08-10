import { OfflineError, type Session } from '@mynet/data'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { HomeShell } from '../../src/app/home/HomeShell.js'
import { HOME_CARDS } from '../../src/app/home/registry.js'
import { PROGRAMME } from '../support/agenda.js'
import { SUMMIT, testServices, WithServices } from '../support/services.js'

/**
 * T078, T082 (005) — **every other card still renders when one fails, and Home never blanks**
 * (FR-164, FR-222, SC-210, SC-212).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CACHE IS WHY THIS TEST HAD TO BE WRITTEN AGAIN.**
 *
 * 002 already asserted card containment. 005 introduces something 002 did not have: three
 * cards now read the **same conference programme through one shared cache entry**. Sharing a
 * read is exactly the mechanism that could silently couple cards that the composition contract
 * requires stay independent — one card's rejection becoming another's, or one card waiting on
 * another's retry.
 *
 * FR-222 says it plainly: reads may be shared "**without any card depending on another card's
 * presence or data**", and "when a shared read fails, each card MUST render its own failure
 * state independently". That is asserted here, against the real registry.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('Home when one card fails', () => {
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

  it('renders EVERY OTHER CARD when the saved-session read fails (SC-212)', async () => {
    renderHome({
      catalog: { listSessions: async () => PROGRAMME, listTracks: async () => [] },
      savedSessions: {
        // Only 005's card reads this. Its failure must be contained to it.
        listSaved: async () => {
          throw new Error('server fault')
        },
        save: async () => {},
        unsave: async () => {},
      },
    })

    // The failing card says so, in its own region.
    const failing = await screen.findByRole('region', { name: 'Next saved session' })
    expect(failing).toHaveTextContent(/could not be loaded/i)

    // And every other card renders. Home is not blank.
    for (const name of ['Up next', 'Rest of your day', 'Your conferences']) {
      expect(
        await screen.findByRole('region', { name }),
        `${name} must survive another card's failure`,
      ).toBeInTheDocument()
    }
  })

  it('renders 005’s card when a SHARED read fails for another card’s reason (FR-222)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The programme is read by `UpNext`, `RestOfDay` **and** 005's card. When that shared read
    // fails, all three must fail *independently* — each rendering its own failure state —
    // rather than one swallowing the rejection and leaving the others hanging on a promise
    // nobody will settle.
    // ───────────────────────────────────────────────────────────────────────────────────────
    renderHome({
      catalog: {
        listSessions: async () => {
          throw new OfflineError('Loading the programme')
        },
        listTracks: async () => [],
      },
      savedSessions: { listSaved: async () => [], save: async () => {}, unsave: async () => {} },
    })

    for (const name of ['Up next', 'Rest of your day', 'Next saved session']) {
      const region = await screen.findByRole('region', { name })
      expect(region, `${name} must render its own failure state`).toHaveTextContent(/connection/i)
    }

    // And the card that does not read the programme at all is untouched.
    expect(await screen.findByRole('region', { name: 'Your conferences' })).toBeInTheDocument()
  })

  it('HOME IS NEVER BLANK, even when every read fails', async () => {
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
      savedSessions: {
        listSaved: async () => {
          throw new Error('server fault')
        },
        save: async () => {},
        unsave: async () => {},
      },
      // ───────────────────────────────────────────────────────────────────────────────────────
      // 007 — **every read means every read.** The unread indicator renders nothing at zero
      // (FR-531), so leaving its repository at the quiet default would have this assertion
      // failing for the wrong reason: the card would be absent because it had nothing to say
      // rather than because it vanished on failure.
      //
      // Failing it is what the test is actually about — a dot that silently stops appearing
      // would let an attendee conclude nobody had messaged them (FR-533, SC-517).
      // ───────────────────────────────────────────────────────────────────────────────────────
      conversations: {
        list: async () => [],
        hasUnread: async () => {
          throw new Error('server fault')
        },
        openWith: async () => ({ conversationId: '', messageId: '', sentAt: '' }),
        markRead: async () => {},
      },
    })

    // Every card keeps its place in the layout and says what is true, rather than disappearing
    // and letting the dashboard silently rearrange itself (FR-161).
    for (const card of HOME_CARDS) {
      expect(
        await screen.findByRole('region', { name: card.title }),
        `${card.id} vanished instead of reporting`,
      ).toBeInTheDocument()
    }
  })

  it('a card that THROWS while rendering is contained, and names itself (FR-163)', async () => {
    // The other containment path: not a failed read, but a card whose component throws.
    const exploding = {
      id: 'exploding',
      title: 'Exploding card',
      slot: 'primary' as const,
      order: 99,
      scope: 'attendee' as const,
      Component: () => {
        throw new Error('this card is broken')
      },
    }

    // React logs the caught error; silencing keeps the run's output about the assertion.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <WithServices
        services={testServices({
          catalog: { listSessions: async () => PROGRAMME, listTracks: async () => [] },
        })}
      >
        <ActiveEventProvider>
          <MemoryRouter>
            <HomeShell
              cards={[...HOME_CARDS, exploding]}
              activeEvent={{ status: 'ready', event: SUMMIT }}
            />
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

    // `role="alert"`, not `region`: the shell's containment fallback announces itself, because
    // a card that vanished into a silent placeholder would be indistinguishable from one that
    // simply had nothing to say.
    expect(await screen.findByRole('alert', { name: 'Exploding card' })).toHaveTextContent(
      /everything else on Home still works/i,
    )
    // 005's card is unaffected by a sibling throwing.
    expect(await screen.findByRole('region', { name: 'Next saved session' })).toBeInTheDocument()

    consoleError.mockRestore()
  })
})

/**
 * T082 (005) — **SC-210: adding this card issues NO MORE programme reads than before it.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The whole justification for a third reader of the conference programme on Home is that the
 * cache serves the repeats. Without that, this feature would have made the first viewport
 * one-third more expensive to render, and "cards are independent" would have become a cost
 * the attendee pays on every load.
 *
 * Counted through the **decorated** repository, because that is what the application wires and
 * therefore what the attendee actually experiences. Counting the undecorated one would measure
 * the cards' intent rather than the network.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('SC-210 — the cost of adding a third reader', () => {
  const countingCatalog = (calls: string[]) => ({
    listSessions: async (eventId: string) => {
      calls.push(eventId)
      return PROGRAMME as unknown as Session[]
    },
    listTracks: async () => [],
  })

  const renderWith = async (cards: typeof HOME_CARDS, calls: string[]) => {
    const { cached } = await import('@mynet/data/http')
    const store = new Map<string, { payload: unknown; retrievedAt: string }>()

    const catalog = cached(
      countingCatalog(calls),
      {
        read: async (key: string) => (store.get(key) as never) ?? null,
        write: async (key: string, payload: unknown) => {
          store.set(key, { payload, retrievedAt: new Date().toISOString() })
        },
        purge: async () => {},
      },
      { attendeeId: 'attendee-ada' },
      { listSessions: 'programme' },
    )

    render(
      <WithServices services={testServices({ catalog })}>
        <ActiveEventProvider>
          <MemoryRouter>
            <HomeShell cards={cards} activeEvent={{ status: 'ready', event: SUMMIT }} />
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

    // Wait for every card that reads the programme to have rendered its content.
    await screen.findAllByRole('region')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  it('issues no more programme reads WITH the card than WITHOUT it', async () => {
    const without: string[] = []
    await renderWith(
      HOME_CARDS.filter((card) => card.id !== 'next-saved-session'),
      without,
    )

    const withCard: string[] = []
    await renderWith(HOME_CARDS, withCard)

    expect(
      withCard.length,
      `adding the card took programme reads from ${without.length} to ${withCard.length}. The ` +
        'cache at the repository boundary is what is supposed to absorb the third reader ' +
        '(SC-210, research D1).',
    ).toBeLessThanOrEqual(without.length)
  })

  it('serves the whole of Home from ONE programme read', async () => {
    const calls: string[] = []
    await renderWith(HOME_CARDS, calls)

    // Three cards, one request. Each card still called its own repository — they simply did not
    // each cost a round trip.
    expect(calls).toHaveLength(1)
  })
})
