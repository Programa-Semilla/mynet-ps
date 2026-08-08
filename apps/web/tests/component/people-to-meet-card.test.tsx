import type { DirectoryEntry } from '@mynet/data'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { HomeShell } from '../../src/app/home/HomeShell.js'
import { HOME_CARDS } from '../../src/app/home/registry.js'
import { PROGRAMME } from '../support/agenda.js'
import { anAttendee } from '../support/discover.js'
import { EMPTY_PROFILE, SUMMIT, testServices, WithServices } from '../support/services.js'

/**
 * T090–T092 (006) — the People to meet card (FR-446–FR-449).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **RENDERED THROUGH THE REAL `HOME_CARDS` REGISTRY, NOT IN ISOLATION.**
 *
 * The properties under test are about **composition**: that the card fails alone, that every
 * sibling renders beside it, and that Home never blanks. Rendering the component by itself would
 * assert none of those — it would assert that a card renders, which nobody doubts. 005's
 * `home-card-independence.test.tsx` makes the same choice for the same reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const RANKED: DirectoryEntry[] = [
  anAttendee({
    attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111',
    displayName: 'Trina Three',
    sharedInterestCount: 3,
  }),
  anAttendee({
    attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222',
    displayName: 'Tobias Two',
    sharedInterestCount: 2,
  }),
  anAttendee({
    attendeeId: 'cccccccc-3333-4333-8333-333333333333',
    displayName: 'Oona One',
    sharedInterestCount: 1,
  }),
]

/** The reader has interests, unless a test says otherwise — FR-449's other branch. */
const WITH_INTERESTS = { ...EMPTY_PROFILE, interests: ['Design systems', 'Documentation'] }

const renderHome = (overrides: Parameters<typeof testServices>[0]) =>
  render(
    <WithServices
      services={testServices({
        catalog: { listSessions: async () => PROGRAMME, listTracks: async () => [] },
        profile: { ...testServices().repositories.profile, getOwn: async () => WITH_INTERESTS },
        ...overrides,
      })}
    >
      <ActiveEventProvider>
        <MemoryRouter>
          <HomeShell cards={HOME_CARDS} activeEvent={{ status: 'ready', event: SUMMIT }} />
        </MemoryRouter>
      </ActiveEventProvider>
    </WithServices>,
  )

describe('the People to meet card (FR-447)', () => {
  it('shows the ranked co-attendees, each with its shared-interest count', async () => {
    renderHome({
      directory: {
        list: async () => ({ attendees: RANKED, nextCursor: null }),
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const card = await screen.findByRole('region', { name: 'People to meet' })

    expect(card).toHaveTextContent('Trina Three')
    expect(card).toHaveTextContent('3 in common')
    expect(card).toHaveTextContent('Tobias Two')
    expect(card).toHaveTextContent('2 in common')
    expect(card).toHaveTextContent('Oona One')
    expect(card).toHaveTextContent('1 in common')
  })

  it('preserves the order the directory returned, rather than re-sorting', async () => {
    renderHome({
      directory: {
        list: async () => ({ attendees: RANKED, nextCursor: null }),
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const card = await screen.findByRole('region', { name: 'People to meet' })
    const names = [...card.querySelectorAll('li')].map(
      (item) => item.querySelector('a')?.textContent,
    )

    // FR-447a promises the action opens Discover *in the order the card was drawn from*, which
    // is only keepable if there is one ordering. Re-sorting here would be the second one.
    expect(names).toEqual(['Trina Three', 'Tobias Two', 'Oona One'])
  })

  it('asks for AT MOST FIVE (FR-447)', async () => {
    const asked: (number | undefined)[] = []

    renderHome({
      directory: {
        list: async (_eventId: string, query: { limit?: number }) => {
          asked.push(query.limit)
          return { attendees: RANKED, nextCursor: null }
        },
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    await screen.findByRole('region', { name: 'People to meet' })

    // Bounded in the **request**, not by slicing a full page on the client: this is a
    // first-viewport card beside four others, and fetching a conference to show five of it
    // would be a cost nobody can see.
    expect(asked[0]).toBeLessThanOrEqual(5)
  })

  it('opens Discover in the same order it was drawn from (FR-447a)', async () => {
    renderHome({
      directory: {
        list: async () => ({ attendees: RANKED, nextCursor: null }),
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const card = await screen.findByRole('region', { name: 'People to meet' })
    const action = [...card.querySelectorAll('a')].find((link) =>
      /see everyone/i.test(link.textContent ?? ''),
    )

    // No query, no sort parameter — which is what makes "the same order" true rather than
    // coincidental: the directory's *default* order is the ranking.
    expect(action).toHaveAttribute('href', '/discover')
  })
})

describe('the card’s own empty states (FR-449)', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **"YOU HAVE SET NO INTERESTS" AND "NOBODY TO SUGGEST" ARE DIFFERENT FACTS.**
   *
   * The ranking signal is shared interests, so a reader who has set none is not being ranked at
   * all — everybody scores zero and the five "suggestions" are arbitrary strangers presented as
   * though somebody chose them. Collapsing the two states would tell that reader the conference
   * is empty, which is both untrue and unactionable.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('tells a reader with NO INTERESTS what to do, and every other card renders (FR-448, FR-449)', async () => {
    renderHome({
      // EMPTY_PROFILE has no interests — the state a new account is in.
      profile: { ...testServices().repositories.profile, getOwn: async () => EMPTY_PROFILE },
      directory: {
        list: async () => ({ attendees: RANKED, nextCursor: null }),
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const card = await screen.findByRole('region', { name: 'People to meet' })
    expect(card).toHaveTextContent(/add a few interests/i)
    expect(card.querySelector('a[href="/profile/edit"]')).not.toBeNull()

    // …and it does not present the five arbitrary strangers as suggestions anyway.
    expect(card).not.toHaveTextContent('Trina Three')

    for (const name of ['Up next', 'Rest of your day', 'Your conferences']) {
      expect(await screen.findByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('says nobody to suggest, distinctly, when the directory is empty', async () => {
    renderHome({
      directory: {
        list: async () => ({ attendees: [], nextCursor: null }),
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const card = await screen.findByRole('region', { name: 'People to meet' })
    expect(card).toHaveTextContent(/nobody to suggest/i)
    expect(card).not.toHaveTextContent(/add a few interests/i)
    // Worded so it discloses no cause, exactly as Discover's own empty state is (FR-415).
    expect(card).not.toHaveTextContent(/discoverab|verif/i)
  })
})

/**
 * T092 — **the card's failure is isolated, and Home is not blank** (FR-448, SC-212).
 *
 * This is the property standing decision 9 exists for, and the one that is easiest to lose: a
 * card that threw during render rather than rendering a failure state would take the whole
 * dashboard with it, and every other card on it would be perfectly healthy.
 */
describe('the card fails alone (FR-448)', () => {
  it('renders its own failure, and every sibling card renders beside it', async () => {
    renderHome({
      directory: {
        list: async () => {
          throw new Error('server fault')
        },
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const failing = await screen.findByRole('region', { name: 'People to meet' })
    expect(failing).toHaveTextContent(/problem on our side/i)
    expect(failing.querySelector('button')).not.toBeNull()

    for (const name of ['Up next', 'Rest of your day', 'Your conferences', 'Next saved session']) {
      expect(
        await screen.findByRole('region', { name }),
        `${name} must survive this card's failure`,
      ).toBeInTheDocument()
    }
  })

  it('does not take Home down when the READER’S OWN PROFILE read fails', async () => {
    // The card reads two things. Either failing must be contained the same way — and the second
    // is easy to forget, because it is the read that exists only to tell two empty states apart.
    renderHome({
      profile: {
        ...testServices().repositories.profile,
        getOwn: async () => {
          throw new Error('server fault')
        },
      },
      directory: {
        list: async () => ({ attendees: RANKED, nextCursor: null }),
        get: async () => null,
        readAvatar: async () => null,
      },
    })

    const failing = await screen.findByRole('region', { name: 'People to meet' })
    expect(failing).toHaveTextContent(/could not be loaded/i)

    expect(await screen.findByRole('region', { name: 'Up next' })).toBeInTheDocument()
  })
})
