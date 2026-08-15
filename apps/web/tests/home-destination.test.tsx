import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../src/app/active-event.js'
import { Home } from '../src/app/destinations/Home.js'
import { SUMMIT, testServices, WithServices } from './support/services.js'

/**
 * The `Home` destination itself (US1 scenarios 1–3, FR-105, FR-121–FR-125, FR-170).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Added after a deep review found that **`Home` was never rendered by any test**. Every
 * component test rendered `HomeShell` directly with a hand-built `activeEvent`, so the banner
 * wiring — `NoConferencesNotice` for "registered for none", `ActiveEventFailure` for an
 * unresolvable conference — was unexercised, and the whole FR-105 chain (204 → `null` →
 * `status: 'none'` → explicit empty state) was never joined up.
 *
 * `describeDayContext` was in the same position: `day-context.test.ts` covers the pure
 * `dayContextFor`, but nothing asserted the words an attendee actually reads. Nothing would
 * have failed if the `after` branch had printed "Day 5 of 4".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the Home destination', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const renderHome = (repositories: Parameters<typeof testServices>[0] = {}) =>
    render(
      <WithServices services={testServices(repositories)}>
        {/*
          004 — the registered-for-nothing state now offers a way to join (T049, FR-308), and a
          link needs a router. Before self sign-up existed the notice could only describe what
          would eventually appear, because registration was something a seed script did to you.
        */}
        <MemoryRouter>
          <ActiveEventProvider>
            <Home />
          </ActiveEventProvider>
        </MemoryRouter>
      </WithServices>,
    )

  describe('day context, in the words the attendee reads (FR-122)', () => {
    it('names the conference, its location and the day number during the conference', async () => {
      vi.setSystemTime(new Date('2026-09-15T10:00:00Z')) // day two at the venue
      renderHome()

      // Awaited on the day text specifically: the conference NAME also appears in the
      // attendee-scoped conferences card, which resolves a tick earlier, so matching on the name
      // would assert against the wrong card and pass before the greeting had rendered.
      expect(await screen.findByText('Day 2 of 4')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Hello, Ada Lovelace' })).toBeInTheDocument()
      expect(screen.getAllByText('Product & Design Summit').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Barcelona, Spain').length).toBeGreaterThan(0)
    })

    it('says how long until a conference that has not started, with NO day number', async () => {
      vi.setSystemTime(new Date('2026-09-11T10:00:00Z'))
      renderHome()

      expect(await screen.findByText('Starts in 3 days')).toBeInTheDocument()
      expect(screen.queryByText(/Day \d+ of/)).not.toBeInTheDocument()
    })

    it('says a conference has ended, with NO day number (US1 scenario 2)', async () => {
      // The branch nothing reached before: every fixture sat inside the conference, so a
      // `describeDayContext` that printed "Day 5 of 4" here would have gone unnoticed.
      vi.setSystemTime(new Date('2026-09-25T10:00:00Z'))
      renderHome()

      expect(await screen.findByText('This conference has ended')).toBeInTheDocument()
      expect(screen.queryByText(/Day \d+ of/)).not.toBeInTheDocument()
    })

    it('says "Starts tomorrow" rather than "Starts in 1 days"', async () => {
      vi.setSystemTime(new Date('2026-09-13T10:00:00Z'))
      renderHome()

      expect(await screen.findByText('Starts tomorrow')).toBeInTheDocument()
    })
  })

  describe('registered for no conferences (FR-105, US1 scenario 3)', () => {
    it('renders the explicit empty state, and no error', async () => {
      renderHome({ activeEvent: { getActive: async () => null, setActive: async () => SUMMIT } })

      // The whole chain: the repository maps 204 to null, the provider maps null to `none`,
      // and Home renders — since 004 — an invitation to act rather than a statement of what
      // will eventually appear.
      expect(await screen.findByText(/not registered for any conferences yet/i)).toBeInTheDocument()

      // ───────────────────────────────────────────────────────────────────────────────────────
      // **T049 (004), FR-308 — a way to join, not an instruction to wait.**
      //
      // This assertion used to read `getByText(/will appear here/i)`, which was accurate while
      // registration was something a seed script did to you. Self sign-up makes that wrong in
      // the way that matters: the person reading this can act, and the old wording told them to
      // wait for somebody who does not exist.
      // ───────────────────────────────────────────────────────────────────────────────────────
      expect(screen.getByRole('link', { name: /join a conference/i })).toHaveAttribute(
        'href',
        '/join',
      )

      // A valid answer, not a failure — it must not be announced as one.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('an unresolvable conference', () => {
    it('renders a failure banner with a working retry, not the empty state', async () => {
      vi.setSystemTime(new Date('2026-09-15T10:00:00Z'))
      const getActive = vi
        .fn<() => Promise<typeof SUMMIT | null>>()
        .mockRejectedValueOnce(new Error('server fault'))
        .mockResolvedValue(SUMMIT)

      renderHome({ activeEvent: { getActive, setActive: async () => SUMMIT } })

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toMatch(/could not tell which conference/i)
      // Never the empty state: "we do not know" must not be rendered as "you have none".
      expect(screen.queryByText(/not registered for any conferences yet/i)).not.toBeInTheDocument()

      // And the retry actually re-reads.
      await userEvent.click(screen.getByRole('button', { name: /try again/i }))
      await waitFor(() => expect(getActive).toHaveBeenCalledTimes(2))
      expect(await screen.findByText('Day 2 of 4')).toBeInTheDocument()
    })
  })
})
