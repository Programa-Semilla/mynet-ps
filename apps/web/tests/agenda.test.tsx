import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ActiveEventProvider } from '../src/app/active-event.js'
import { Agenda } from '../src/app/destinations/Agenda.js'
import { aSession, testServices, WithServices, type TestSession } from './support/services.js'

/**
 * T032 (002) — the Agenda destination (FR-137, FR-139, US2 scenario 6).
 *
 * The last test in this file is the one worth reading: Agenda must offer **no** save, add or
 * remove control, and must not present their absence as a disabled promise. Those arrive with
 * feature 005, and an affordance for a capability that does not exist is a promise the product
 * cannot keep — the same reason the top bar carries no notification bell.
 */
describe('Agenda', () => {
  // Wrapped in the real provider rather than a stubbed context: Agenda's contract is with the
  // one active-conference source above the router (FR-113), and a test that bypassed it would
  // not notice if that wiring broke.
  const renderWith = (sessions: TestSession[]) =>
    render(
      <WithServices
        services={testServices({
          catalog: { listSessions: async () => sessions, listTracks: async () => [] },
        })}
      >
        <ActiveEventProvider>
          {/*
            005 — a router, because a session title is now a link to its detail panel
            (FR-198). The 002 assertions below are otherwise untouched: this wrapper is what
            keeps them able to run, not a change to what they claim.
          */}
          <MemoryRouter initialEntries={['/agenda']}>
            <Routes>
              <Route path="/agenda" element={<Agenda />}>
                <Route path=":sessionId" element={null} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ActiveEventProvider>
      </WithServices>,
    )

  const MORNING = aSession({
    id: 'a',
    title: 'Opening Keynote',
    startsAt: '2026-09-14T07:00:00.000Z', // 09:00 Madrid
    endsAt: '2026-09-14T08:00:00.000Z',
    track: { id: 't1', name: 'Keynote', colorToken: 'track-keynote' },
  })
  const AFTERNOON = aSession({
    id: 'b',
    title: 'Open Studio',
    startsAt: '2026-09-14T12:00:00.000Z', // 14:00 Madrid
    endsAt: '2026-09-14T13:00:00.000Z',
    speakers: [],
  })
  const NEXT_DAY = aSession({
    id: 'c',
    title: 'Roadmaps That Survive Contact',
    startsAt: '2026-09-15T07:30:00.000Z', // 09:30 Madrid, day two
    endsAt: '2026-09-15T08:30:00.000Z',
  })

  it('lists every session in chronological order', async () => {
    // Offered out of order on purpose: the ordering must be the component's doing.
    renderWith([NEXT_DAY, AFTERNOON, MORNING])

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual([
      'Opening Keynote',
      'Open Studio',
      'Roadmaps That Survive Contact',
    ])
  })

  it('groups sessions into venue-local days', async () => {
    renderWith([MORNING, AFTERNOON, NEXT_DAY])

    // Two days, labelled in the venue's terms rather than the reader's.
    const dayOne = await screen.findByRole('region', { name: /Monday 14 September/i })
    const dayTwo = screen.getByRole('region', { name: /Tuesday 15 September/i })

    expect(within(dayOne).getByText('Opening Keynote')).toBeInTheDocument()
    expect(within(dayTwo).getByText('Roadmaps That Survive Contact')).toBeInTheDocument()
  })

  it('names each track in text as well as coding it by colour', async () => {
    renderWith([MORNING])

    // Colour is never the sole carrier of meaning (Principle IV), so the name must be readable.
    expect(await screen.findByText('Keynote')).toBeInTheDocument()
  })

  it('shows the venue-local start time, not the reader’s', async () => {
    renderWith([MORNING])

    // 07:00Z is 09:00 in Barcelona. A device-local render would say something else.
    expect(await screen.findByText('09:00')).toBeInTheDocument()
  })

  it('renders an explicit empty state for a conference with no programme (FR-139)', async () => {
    renderWith([])

    expect(await screen.findByText(/no published programme/i)).toBeInTheDocument()
    // An empty programme is not a failure, and must not be announced as one.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a failure as a failure, with a retry (FR-058)', async () => {
    render(
      <WithServices
        services={testServices({
          catalog: {
            listSessions: async () => {
              throw new Error('server fault')
            },
            listTracks: async () => [],
          },
        })}
      >
        <ActiveEventProvider>
          <Agenda />
        </ActiveEventProvider>
      </WithServices>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    // Never the empty state: the attendee must not be told there is no programme when we simply
    // do not know what the programme is.
    expect(screen.queryByText(/no published programme/i)).not.toBeInTheDocument()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T023 (005) — **002's US2 scenario 6, superseded and UPDATED rather than deleted**
   * (FR-236).
   *
   * This test used to assert the **absence** of a save control on Agenda, and the absence was
   * deliberate: 002 shipped the programme read-only, on the reasoning that a greyed-out star
   * is an affordance for a capability that does not exist — the same reason the top bar still
   * carries no notification bell.
   *
   * 005 is the feature that makes the capability exist, so the assertion is inverted here in
   * place. Deleting it would have left no record that the absence was ever a decision; keeping
   * it as an inversion means the history reads correctly in a diff — *this was deliberately
   * absent, and it is now deliberately present.*
   *
   * The half that has **not** changed is asserted below too: still no disabled control, still
   * no affordance for anything 005 did not build. Q&A and note editing are not reachable from
   * a programme row, and 009 must not find a greyed-out promise of them here.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('now offers a save control on every session — 002 asserted its absence (FR-236)', async () => {
    renderWith([MORNING, AFTERNOON, NEXT_DAY])
    await screen.findByText('Opening Keynote')

    // One per session, labelled with what activating it will do (FR-189, FR-196).
    expect(screen.getAllByRole('button', { name: /save .* to your agenda/i })).toHaveLength(3)
    expect(
      screen.getByRole('button', { name: /save Opening Keynote to your agenda/i }),
    ).toBeInTheDocument()
  })

  it('still promises no capability it does not have, and disables nothing', async () => {
    renderWith([MORNING, AFTERNOON, NEXT_DAY])
    await screen.findByText('Opening Keynote')

    // Audience questions arrive in 009. A control for them now would be exactly the empty
    // promise 002 refused to make about saving.
    for (const pattern of [/question/i, /upvote/i, /share/i, /invite/i]) {
      expect(
        screen.queryByRole('button', { name: pattern }),
        `Agenda must not offer a "${String(pattern)}" control — 005 did not build it.`,
      ).not.toBeInTheDocument()
    }

    // A disabled save control would lose focus mid-list while a write was in flight, which is
    // why the control stays enabled and relies on the write being idempotent (FR-187).
    expect(screen.queryAllByRole('button').filter((b) => b.hasAttribute('disabled'))).toHaveLength(
      0,
    )
  })
})
