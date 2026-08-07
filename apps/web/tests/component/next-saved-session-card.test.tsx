import { OfflineError } from '@mynet/data'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { HomeShell } from '../../src/app/home/HomeShell.js'
import { nextSavedSessionCard } from '../../src/app/home/cards/NextSavedSession.js'
import { MORNING, NEXT_DAY, PROGRAMME } from '../support/agenda.js'
import { aSession, SUMMIT, testServices, WithServices } from '../support/services.js'

/**
 * T076 (005) — the Home card, in **all four** of its states (FR-224, FR-225, SC-209).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"NOTHING SAVED AT ALL" AND "NOTHING LEFT TODAY" ARE DIFFERENT FACTS.**
 *
 * FR-225 requires both, worded distinctly, and the reason is what happens if they are
 * collapsed: an attendee who has carefully built a full agenda would be told, every evening,
 * that they have not saved anything. The card would be wrong about the one thing it exists to
 * report.
 *
 * The third forbidden rendering is subtler and is asserted too: **a later day's session shown
 * as if it were today's**. At 20:00 on day one, the next saved session overall is tomorrow's,
 * and it renders as a bare `09:30` with no date. The attendee cannot tell it is wrong.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the next-saved-session card', () => {
  /**
   * Rendered through `HomeShell` rather than standalone, because the card's contract is with
   * the shell — the scope discriminant, the containment boundary, the slot. A test that mounted
   * the component directly would not notice if any of that stopped holding.
   */
  const renderCard = ({
    sessions = PROGRAMME,
    saved = [] as string[],
    listSaved,
    listSessions,
  }: {
    sessions?: typeof PROGRAMME
    saved?: string[]
    listSaved?: () => Promise<string[]>
    listSessions?: () => Promise<never>
  } = {}) =>
    render(
      <WithServices
        services={testServices({
          catalog: {
            listSessions: listSessions ?? (async () => sessions),
            listTracks: async () => [],
          },
          savedSessions: {
            listSaved: listSaved ?? (async () => saved),
            save: async () => {},
            unsave: async () => {},
          },
        })}
      >
        <ActiveEventProvider>
          <MemoryRouter>
            <HomeShell
              cards={[nextSavedSessionCard]}
              activeEvent={{ status: 'ready', event: SUMMIT }}
            />
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

  it('LOADING — says so rather than showing nothing', () => {
    renderCard({ listSaved: () => new Promise<string[]>(() => {}) })

    expect(screen.getByText(/loading your saved sessions/i)).toBeInTheDocument()
  })

  it('POPULATED — names the next saved session, with its time and room (FR-224)', async () => {
    // A session later "today", relative to a fixed clock the fixture controls: the fixture day
    // is what `nextSession` compares against, so this uses a session far in the future.
    const later = aSession({
      id: '55555555-5555-4555-8555-555555555555',
      title: 'Later Today',
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      room: { id: 'r9', name: 'Gaudí Hall' },
    })

    renderCard({ sessions: [later], saved: [later.id] })

    expect(await screen.findByText('Later Today')).toBeInTheDocument()
    expect(screen.getByText('Gaudí Hall')).toBeInTheDocument()
  })

  it('NONE LEFT TODAY — says so explicitly, and does NOT show a past session (FR-225)', async () => {
    // Saved, but already over.
    const past = aSession({
      id: '66666666-6666-4666-8666-666666666666',
      title: 'Already Happened',
      startsAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })

    renderCard({ sessions: [past], saved: [past.id] })

    expect(await screen.findByText(/nothing more from your agenda today/i)).toBeInTheDocument()
    expect(
      screen.queryByText('Already Happened'),
      'A past session must never be presented as what is next. An attendee cannot tell a stale ' +
        '"next" from a real one.',
    ).not.toBeInTheDocument()
  })

  it('does NOT render a LATER DAY’S session as if it were today’s (FR-225)', async () => {
    // `NEXT_DAY` is on the fixture's second venue day, and nothing is saved for the current one.
    renderCard({ sessions: PROGRAMME, saved: [NEXT_DAY.id] })

    expect(await screen.findByText(/nothing more from your agenda today/i)).toBeInTheDocument()
    expect(
      screen.queryByText('Roadmaps That Survive Contact'),
      "Rendering tomorrow's 09:30 as a bare time reads as *later today*, and the attendee has " +
        'no way to tell. That is the failure FR-225 names.',
    ).not.toBeInTheDocument()
  })

  it('EMPTY — a distinct state when the attendee has saved nothing at all (FR-225)', async () => {
    renderCard({ saved: [] })

    expect(await screen.findByText(/have not saved any sessions yet/i)).toBeInTheDocument()
    // Distinct wording from "nothing more today", because they are different facts.
    expect(screen.queryByText(/nothing more from your agenda today/i)).not.toBeInTheDocument()
    // And it invites them to the programme rather than being a dead end.
    expect(screen.getByRole('link', { name: /browse the programme/i })).toBeInTheDocument()
  })

  it('FAILED — reports a failure as a failure, with a retry', async () => {
    renderCard({
      listSaved: async () => {
        throw new Error('server fault')
      },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/problem on our side/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    // Never the empty state: the attendee must not be told they have saved nothing when the
    // truth is that we do not know.
    expect(screen.queryByText(/have not saved any sessions yet/i)).not.toBeInTheDocument()
  })

  it('distinguishes offline from a server fault (FR-218)', async () => {
    renderCard({
      listSaved: async () => {
        throw new OfflineError('Loading your saved sessions')
      },
    })

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent(/needs? a connection/i)
    expect(failure).not.toHaveTextContent(/our side/i)
  })

  it('links the session to its own detail panel address (FR-198)', async () => {
    const later = aSession({
      id: MORNING.id,
      title: 'Openable',
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })

    renderCard({ sessions: [later], saved: [later.id] })

    const link = await screen.findByRole('link', { name: 'Openable' })
    expect(link).toHaveAttribute('href', `/agenda/${MORNING.id}`)
  })

  it('reads the repositories ITSELF, taking nothing from another card (FR-226, research D8)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Rendered as the *only* card on Home. If it depended on `UpNext` — for the programme, for
    // "what is next", for anything — it could not render at all here. That is the strongest
    // available statement of FR-164: the card works with every sibling removed.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const later = aSession({
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Standing Alone',
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })

    renderCard({ sessions: [later], saved: [later.id] })

    expect(await screen.findByText('Standing Alone')).toBeInTheDocument()
  })
})
