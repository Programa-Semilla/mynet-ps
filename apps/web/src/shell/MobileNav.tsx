import { NavLink } from 'react-router'

import { DESTINATIONS } from '../app/navigation.js'

/**
 * T075 — the mobile bottom navigation (FR-018).
 *
 * Mobile band only, `<768px`, and the only form the prototype had.
 *
 * **Touch sizing is a requirement, not a nicety.** Every target is at least
 * `--spacing-touch-target` (44px) in both directions, asserted in `e2e/responsive.spec.ts`
 * rather than eyeballed. Five destinations at 320px leaves 64px per target, so the floor holds
 * at the narrowest supported width — which is why the labels are `2xs` and the row does not
 * scroll (FR-020).
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the bar clear of a home indicator on an installed
 * PWA, where there is no browser chrome below it.
 */
export const MobileNav = () => (
  <nav
    aria-label="Main"
    data-nav-layout="mobile"
    className="fixed inset-x-0 bottom-(--spacing-dev-legend) z-10 flex items-stretch justify-around border-t border-border-subtle bg-surface-inverse pb-[env(safe-area-inset-bottom)] tablet:hidden"
  >
    {DESTINATIONS.map(({ path, label, icon: Icon }) => (
      <NavLink
        key={path}
        to={path}
        end={path === '/'}
        className={({ isActive }) =>
          [
            'flex min-h-(--spacing-touch-target) min-w-(--spacing-touch-target) flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors',
            isActive ? 'text-accent' : 'text-navy-200',
          ].join(' ')
        }
      >
        <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
        {label}
      </NavLink>
    ))}
  </nav>
)
