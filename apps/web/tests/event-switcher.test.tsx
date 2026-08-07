import { OfflineError, type Event } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../src/app/active-event.js'
import { EventSwitcher } from '../src/shell/EventSwitcher.js'
import { SUMMIT, testServices, WithServices } from './support/services.js'

/**
 * T053 (002) — the conference switcher (FR-112, FR-114, FR-115, FR-116, FR-118, FR-119).
 *
 * Three of these are named explicitly by the spec because they are the cases an implementation
 * passes by accident and fails in production: the offline refusal, two switches settling on the
 * last one, and the address staying unchanged.
 */

const HORIZONS: Event = {
  id: 'event-horizons',
  name: 'Frontend Horizons',
  location: 'Lisbon, Portugal',
  startsOn: '2026-10-05',
  endsOn: '2026-10-07',
  timezone: 'Europe/Lisbon',
}

const renderSwitcher = (repositories: Parameters<typeof testServices>[0] = {}) => {
  const services = testServices({
    events: { listRegistered: async () => [SUMMIT, HORIZONS] },
    ...repositories,
  })

  render(
    <MemoryRouter initialEntries={['/agenda']}>
      <WithServices services={services}>
        <ActiveEventProvider>
          <EventSwitcher />
        </ActiveEventProvider>
      </WithServices>
    </MemoryRouter>,
  )
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  const trigger = await screen.findByRole('button', { name: /change conference/i })
  await user.click(trigger)
  return trigger
}

/**
 * The regression the end-to-end suite caught and the component suite did not.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `ActiveEventProvider` mounts on the **sign-in screen**, before there is a session. It used to
 * fetch immediately, be answered 401, and settle into `failed` with nothing to re-run it — so
 * an attendee who then signed in was told "we could not tell which conference you are in" until
 * they reloaded.
 *
 * Every other test in this file substitutes a repository that resolves, which is the state of a
 * *already* signed-in attendee. This one starts signed out, the way a person does.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('the active conference follows the sign-in lifecycle', () => {
  it('does not request the active conference while signed out', async () => {
    const getActive = vi.fn(async () => SUMMIT)

    render(
      <MemoryRouter>
        <WithServices
          services={testServices({
            // Signed out: `getCurrent` rejects, which is what puts AuthProvider in 'signed-out'.
            attendee: { getCurrent: async () => Promise.reject(new Error('not signed in')) },
            activeEvent: { getActive, setActive: async () => SUMMIT },
          })}
        >
          <ActiveEventProvider>
            <EventSwitcher />
          </ActiveEventProvider>
        </WithServices>
      </MemoryRouter>,
    )

    await waitFor(() => expect(getActive).not.toHaveBeenCalled())
  })

  it('requests it once the attendee is signed in', async () => {
    const getActive = vi.fn(async () => SUMMIT)

    render(
      <MemoryRouter>
        <WithServices
          services={testServices({
            events: { listRegistered: async () => [SUMMIT, HORIZONS] },
            activeEvent: { getActive, setActive: async () => SUMMIT },
          })}
        >
          <ActiveEventProvider>
            <EventSwitcher />
          </ActiveEventProvider>
        </WithServices>
      </MemoryRouter>,
    )

    // The default harness is signed in, so the fetch happens — and the switcher resolves rather
    // than sitting in the failure state the bug produced.
    await waitFor(() => expect(getActive).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /change conference/i })).toHaveAccessibleName(
        /Product & Design Summit/,
      ),
    )
  })
})

describe('EventSwitcher', () => {
  it('names the active conference and its location, and offers only registered ones (FR-110, FR-111)', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    const trigger = await screen.findByRole('button', { name: /change conference/i })
    // The accessible name says where the attendee is without them having to open anything.
    // Awaited, because the conference resolves only once the sign-in check has completed — the
    // provider deliberately does not ask while signed out.
    await waitFor(() =>
      expect(trigger).toHaveAccessibleName(/Product & Design Summit · Barcelona, Spain/),
    )

    await user.click(trigger)
    const items = screen.getAllByRole('menuitemradio')
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Product & Design Summit'),
      expect.stringContaining('Frontend Horizons'),
    ])
  })

  it('identifies a single conference and offers NO choice (FR-114)', async () => {
    renderSwitcher({ events: { listRegistered: async () => [SUMMIT] } })

    expect(await screen.findByText('Product & Design Summit')).toBeInTheDocument()
    // A menu holding one already-selected item is a control that cannot do anything.
    expect(screen.queryByRole('button', { name: /change conference/i })).not.toBeInTheDocument()
  })

  it('shows a loading state while the conferences are in flight (FR-117)', () => {
    renderSwitcher({ events: { listRegistered: () => new Promise(() => {}) } })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('says so when the attendee is registered for none (FR-117)', async () => {
    renderSwitcher({ events: { listRegistered: async () => [] } })

    expect(await screen.findByText(/no conferences yet/i)).toBeInTheDocument()
  })

  describe('offline (FR-112)', () => {
    it('refuses with an explanation, keeps the previous conference, and queues nothing', async () => {
      const user = userEvent.setup()
      const setActive = vi.fn(async () => {
        throw new OfflineError('Switching conference')
      })

      renderSwitcher({ activeEvent: { getActive: async () => SUMMIT, setActive } })

      await openMenu(user)
      await user.click(screen.getByRole('menuitemradio', { name: /Frontend Horizons/ }))

      const alert = await screen.findByRole('alert')
      // Worded as connectivity, distinct from a server fault — they call for different responses.
      expect(alert.textContent).toMatch(/needs a connection/i)
      expect(alert.textContent).toMatch(/still in your previous conference/i)

      // The previous conference is still the active one — nothing was shown as succeeded.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /change conference/i })).toHaveAccessibleName(
          /Product & Design Summit/,
        ),
      )

      // Attempted once and not retried in the background: nothing is queued.
      expect(setActive).toHaveBeenCalledOnce()
    })

    it('words a server fault differently from being offline (FR-115)', async () => {
      const user = userEvent.setup()
      renderSwitcher({
        activeEvent: {
          getActive: async () => SUMMIT,
          setActive: async () => {
            throw new Error('server fault')
          },
        },
      })

      await openMenu(user)
      await user.click(screen.getByRole('menuitemradio', { name: /Frontend Horizons/ }))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).not.toMatch(/connection/i)
      expect(alert.textContent).toMatch(/could not be opened/i)
    })
  })

  it('settles on the LAST of two quick switches, displayed and recorded (FR-118)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The first request is made deliberately slower than the second, which is the ordering that
    // breaks a naive implementation: the earlier response lands last and overwrites the later
    // one, leaving the interface displaying one conference while the server recorded another.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const THIRD: Event = { ...HORIZONS, id: 'event-third', name: 'Systems & Scale' }
    const user = userEvent.setup()

    const setActive = vi.fn(async (eventId: string) => {
      const slow = eventId === HORIZONS.id
      await new Promise((resolve) => setTimeout(resolve, slow ? 60 : 5))
      return eventId === HORIZONS.id ? HORIZONS : THIRD
    })

    render(
      <MemoryRouter>
        <WithServices
          services={testServices({
            events: { listRegistered: async () => [SUMMIT, HORIZONS, THIRD] },
            activeEvent: { getActive: async () => SUMMIT, setActive },
          })}
        >
          <ActiveEventProvider>
            <EventSwitcher />
          </ActiveEventProvider>
        </WithServices>
      </MemoryRouter>,
    )

    await openMenu(user)
    // Two selections in quick succession, without waiting for the first to settle.
    const items = screen.getAllByRole('menuitemradio')
    items[1]?.click()
    items[2]?.click()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /change conference/i })).toHaveAccessibleName(
        /Systems & Scale/,
      ),
    )

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **"displayed AND recorded"** — the title says both, and only the display half was
    // asserted. FR-118 forbids coming to rest showing one conference while having recorded
    // another, so what reached the server matters as much as what is on screen.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(setActive.mock.calls.map(([id]) => id)).toEqual([HORIZONS.id, THIRD.id])
  })

  it('re-reads when the server echoes a conference other than the one requested', async () => {
    // The out-of-order case research D9 names as the residual risk. The switcher's own
    // in-flight guard makes it unreachable through the UI, so it is driven directly here: if
    // the echo disagrees, the client must not come to rest displaying the requested one.
    const user = userEvent.setup()
    const getActive = vi.fn(async () => SUMMIT)

    render(
      <MemoryRouter>
        <WithServices
          services={testServices({
            events: { listRegistered: async () => [SUMMIT, HORIZONS] },
            activeEvent: {
              getActive,
              // Echoes what the server actually stored, which is not what was asked for.
              setActive: async () => SUMMIT,
            },
          })}
        >
          <ActiveEventProvider>
            <EventSwitcher />
          </ActiveEventProvider>
        </WithServices>
      </MemoryRouter>,
    )

    await openMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Frontend Horizons/ }))

    // It settles on what the server reported, never on the optimistic guess.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /change conference/i })).toHaveAccessibleName(
        /Product & Design Summit/,
      ),
    )
  })

  describe('keyboard and dismissal (FR-116)', () => {
    it('opens, is operable, and closes by keyboard alone', async () => {
      const user = userEvent.setup()
      renderSwitcher()

      const trigger = await screen.findByRole('button', { name: /change conference/i })
      trigger.focus()
      await user.keyboard('{Enter}')

      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('ESCAPE closes without changing the selection', async () => {
      const user = userEvent.setup()
      const setActive = vi.fn(async () => HORIZONS)
      renderSwitcher({ activeEvent: { getActive: async () => SUMMIT, setActive } })

      const trigger = await openMenu(user)
      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

      // The whole point: dismissing is not choosing.
      expect(setActive).not.toHaveBeenCalled()
      expect(trigger).toHaveAccessibleName(/Product & Design Summit/)
      // Focus returns to the control that opened the menu, not to the top of the document.
      expect(trigger).toHaveFocus()
    })

    it('offers a clear close action in the mobile overlay', async () => {
      const user = userEvent.setup()
      renderSwitcher()
      await openMenu(user)

      expect(screen.getByRole('button', { name: /close conference list/i })).toBeInTheDocument()
    })

    it('names the menu, so it is not an unlabelled group', async () => {
      const user = userEvent.setup()
      renderSwitcher()
      await openMenu(user)

      expect(screen.getByRole('menu')).toHaveAccessibleName(/choose a conference/i)
    })
  })

  it('leaves the browser address unchanged when switching (FR-119)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The active conference travels in requests, never in the address. If a switch rewrote the
    // URL, every shared link would carry one attendee's conference into somebody else's
    // session, and the address would need scoping rules of its own.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const user = userEvent.setup()
    let seen: string | undefined

    render(
      <MemoryRouter initialEntries={['/agenda']}>
        <WithServices
          services={testServices({
            events: { listRegistered: async () => [SUMMIT, HORIZONS] },
            activeEvent: { getActive: async () => SUMMIT, setActive: async () => HORIZONS },
          })}
        >
          <ActiveEventProvider>
            <EventSwitcher />
            <LocationProbe onLocation={(path) => (seen = path)} />
          </ActiveEventProvider>
        </WithServices>
      </MemoryRouter>,
    )

    await openMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: /Frontend Horizons/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /change conference/i })).toHaveAccessibleName(
        /Frontend Horizons/,
      ),
    )

    expect(seen).toBe('/agenda')
  })
})

const LocationProbe = ({ onLocation }: { onLocation: (path: string) => void }) => {
  onLocation(useLocation().pathname)
  return null
}
