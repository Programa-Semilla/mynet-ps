import { NavLink } from 'react-router'

import { DESTINATIONS } from '../app/navigation.js'

/**
 * T074 — the reduced navigation rail (FR-017).
 *
 * Tablet band only, `768px–1279px`. "Reduced" is the icon-above-label treatment in a narrow
 * column, which gives the workspace the room FR-017 asks for so it can lay out two-column cards
 * and a stacked detail area.
 *
 * The label stays visible rather than becoming a tooltip. An icon-only rail would need an
 * `aria-label` to have an accessible name at all, and would leave sighted attendees guessing at
 * five glyphs — the accessible name would be correct and the affordance would still be poor.
 */
export const TabletRail = () => (
  <nav
    aria-label="Main"
    data-nav-layout="tablet"
    className="hidden w-(--spacing-rail-tablet) shrink-0 flex-col items-stretch gap-1 border-r border-border-subtle bg-surface-inverse px-2 py-4 tablet:flex desktop:hidden"
  >
    {DESTINATIONS.map(({ path, label, icon: Icon }) => (
      <NavLink
        key={path}
        to={path}
        end={path === '/'}
        className={({ isActive }) =>
          [
            'flex min-h-(--spacing-touch-target) flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-2xs font-medium transition-colors',
            isActive
              ? 'bg-accent-strong text-text-inverse'
              : 'text-navy-200 hover:bg-navy-700 hover:text-text-inverse',
          ].join(' ')
        }
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
        {label}
      </NavLink>
    ))}
  </nav>
)
