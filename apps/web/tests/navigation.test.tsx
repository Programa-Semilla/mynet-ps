import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { DESTINATIONS } from '../src/app/navigation.js'
import { DesktopRail } from '../src/shell/DesktopRail.js'
import { MobileNav } from '../src/shell/MobileNav.js'
import { TabletRail } from '../src/shell/TabletRail.js'

/**
 * T066 — all three navigation forms (FR-016, FR-017, FR-018, FR-021, FR-022).
 *
 * Each form is exercised in isolation here rather than through the shell, because which form a
 * width selects is a CSS question that jsdom cannot answer — no stylesheet is applied, so every
 * form would appear "visible". That assertion belongs to `e2e/responsive.spec.ts`, where a real
 * browser applies real CSS at a real viewport.
 *
 * What *can* be settled here is the part that has nothing to do with width: every destination is
 * reachable from every form, every control has an accessible name, and the active destination is
 * announced to assistive technology and not only drawn differently (FR-022).
 */

const FORMS = [
  { name: 'desktop rail', Component: DesktopRail },
  { name: 'tablet rail', Component: TabletRail },
  { name: 'mobile bottom navigation', Component: MobileNav },
] as const

describe.each(FORMS)('$name', ({ Component }) => {
  const renderAt = (pathname: string) =>
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <Component />
      </MemoryRouter>,
    )

  it('offers every destination, each with an accessible name', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation')

    for (const destination of DESTINATIONS) {
      // `getByRole` matches on the accessible name, so this fails if the label is carried only
      // by an icon — the defect the prototype's hand-inlined SVGs invited.
      expect(within(nav).getByRole('link', { name: destination.label })).toBeInTheDocument()
    }

    expect(within(nav).getAllByRole('link')).toHaveLength(DESTINATIONS.length)
  })

  it('gives the navigation itself an accessible name', () => {
    renderAt('/')
    // Three navigation landmarks exist across the shell. Each needs a name, or assistive
    // technology announces "navigation" three times with no way to tell them apart.
    expect(screen.getByRole('navigation')).toHaveAccessibleName()
  })

  it.each(DESTINATIONS.map((d) => [d.label, d.path] as const))(
    'marks %s as the current destination when its address is open',
    (label, path) => {
      renderAt(path)
      const nav = screen.getByRole('navigation')

      // FR-022 — communicated to assistive technology, not only visually.
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')

      // And to exactly one destination. Two "current" links is worse than none.
      const current = within(nav)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
      expect(current).toHaveLength(1)
    },
  )

  it('does not mark any destination current on an address that matches none', () => {
    renderAt('/not-a-destination')
    const nav = screen.getByRole('navigation')

    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(0)
  })

  it('reaches every destination by keyboard alone', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const nav = screen.getByRole('navigation')

    // SC-004 — the complete journey without a pointer. Tabbing into the navigation must land on
    // each destination in turn; a link that cannot be focused cannot be visited.
    for (const destination of DESTINATIONS) {
      await user.tab()
      expect(within(nav).getByRole('link', { name: destination.label })).toHaveFocus()
    }
  })
})
