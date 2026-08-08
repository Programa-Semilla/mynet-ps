import type { DirectoryPage, DirectoryQuery, Event } from '@mynet/data'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { anAttendee, renderDiscover } from '../support/discover.js'
import { SUMMIT } from '../support/services.js'

/**
 * T056 (006) — switching conference re-renders the directory and retains **nothing** from the
 * previous one (FR-401a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"INCLUDING IN ANY IN-FLIGHT OR PARTIALLY RENDERED PAGE" IS THE HARD HALF.**
 *
 * FR-401a's first clause is easy and any implementation satisfies it: change the conference,
 * fetch again, render the answer. The clause that costs something is the second one, because
 * the failure it describes is a race rather than a bug you can see by reading:
 *
 *   a slow first page for conference A lands *after* conference B's, and A's attendees are
 *   appended to B's directory under B's name.
 *
 * That is not a flicker. It is other people's personal data rendered against a conference they
 * are not registered for — the precise thing SC-102 forbids and the reason `useDirectory`
 * carries a sequence guard as well as a render-time reset.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const OTHER: Event = {
  id: 'event-horizons',
  name: 'Frontend Horizons',
  location: 'Lisbon, Portugal',
  startsOn: '2026-10-05',
  endsOn: '2026-10-07',
  timezone: 'Europe/Lisbon',
}

const AT_SUMMIT = anAttendee({
  attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111',
  displayName: 'Summit Sam',
})
const AT_HORIZONS = anAttendee({
  attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222',
  displayName: 'Horizons Hana',
})

/** A directory keyed by conference, so a leak between them is observable rather than assumed. */
const perConference = (
  responses: Record<string, DirectoryPage>,
  options: { readonly delay?: Record<string, number> } = {},
) => {
  const asked: string[] = []

  return {
    asked,
    repository: {
      list: async (eventId: string, _query: DirectoryQuery): Promise<DirectoryPage> => {
        asked.push(eventId)
        const wait = options.delay?.[eventId] ?? 0
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
        return responses[eventId] ?? { attendees: [], nextCursor: null }
      },
      get: async () => null,
      readAvatar: async () => null,
    },
  }
}

describe('switching conference re-renders the directory (FR-401a)', () => {
  it('asks for the conference in the active-conference provider, not a remembered one', async () => {
    const directory = perConference({
      [OTHER.id]: { attendees: [AT_HORIZONS], nextCursor: null },
    })

    renderDiscover({
      overrides: {
        directory: directory.repository,
        activeEvent: { getActive: async () => OTHER, setActive: async () => OTHER },
      },
    })

    expect(await screen.findByText('Horizons Hana')).toBeInTheDocument()
    expect(directory.asked).toEqual([OTHER.id])
  })

  /**
   * The race. The previous conference's read is made to resolve *after* the new one's, which is
   * exactly the ordering a slow connection produces and exactly the ordering that appends the
   * wrong conference's attendees.
   */
  it('discards a slower in-flight page from the previous conference (FR-401a)', async () => {
    const directory = perConference(
      {
        [SUMMIT.id]: { attendees: [AT_SUMMIT], nextCursor: null },
        [OTHER.id]: { attendees: [AT_HORIZONS], nextCursor: null },
      },
      // The Summit read takes far longer, so it lands last.
      { delay: { [SUMMIT.id]: 120 } },
    )

    let active: Event = SUMMIT as unknown as Event
    renderDiscover({
      switchTargets: [OTHER.id],
      overrides: {
        directory: directory.repository,
        activeEvent: {
          getActive: async () => active,
          setActive: async (eventId: string) => {
            active = eventId === OTHER.id ? OTHER : (SUMMIT as unknown as Event)
            return active
          },
        },
      },
    })

    // Switch before the first conference's page has landed, through the same path the real
    // conference switcher takes.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: `switch to ${OTHER.id}` }))

    await screen.findByText('Horizons Hana')

    // …and stay there. The slow Summit response resolves during this window and must be
    // dropped rather than appended.
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(
      screen.queryByText('Summit Sam'),
      "A slower page from the previous conference must not be appended to the new conference's " +
        'directory. That is not a flicker — it is other people rendered against a conference ' +
        'they are not registered for (FR-401a, SC-102).',
    ).not.toBeInTheDocument()
    expect(screen.getByText('Horizons Hana')).toBeInTheDocument()
  })

  it('shows nothing from the previous conference while the new one is still loading', async () => {
    const directory = perConference(
      {
        [SUMMIT.id]: { attendees: [AT_SUMMIT], nextCursor: null },
        [OTHER.id]: { attendees: [AT_HORIZONS], nextCursor: null },
      },
      { delay: { [OTHER.id]: 150 } },
    )

    let active: Event = SUMMIT as unknown as Event
    renderDiscover({
      switchTargets: [OTHER.id],
      overrides: {
        directory: directory.repository,
        activeEvent: {
          getActive: async () => active,
          setActive: async (eventId: string) => {
            active = eventId === OTHER.id ? OTHER : (SUMMIT as unknown as Event)
            return active
          },
        },
      },
    })

    await screen.findByText('Summit Sam')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: `switch to ${OTHER.id}` }))

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The ORDERING is asserted, not the eventual state — and that is the whole test.**
    //
    // `waitFor(() => expect(Summit Sam).not.toBeInTheDocument())` alone polls happily past the
    // 150ms delay, so it also passes against an implementation that clears the old cards only
    // when the replacement ARRIVES. That implementation is exactly what this test exists to
    // reject: it leaves the previous conference's attendees on screen under the new
    // conference's name for the whole of the request (SC-102).
    //
    // Asserting both conditions in ONE `waitFor` body demands a moment where the old cards are
    // gone AND the new ones have not landed — a window that exists only if the clear happened
    // during render.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await waitFor(() => {
      expect(screen.queryByText('Summit Sam')).not.toBeInTheDocument()
      expect(screen.queryByText('Horizons Hana')).not.toBeInTheDocument()
    })

    expect(await screen.findByText('Horizons Hana')).toBeInTheDocument()
  })
})
