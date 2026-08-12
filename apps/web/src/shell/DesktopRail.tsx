import { NavLink } from 'react-router'

import { DESTINATIONS } from '../app/navigation.js'
import { PRODUCT_NAME } from '../app/branding.js'
import { BrandMark } from './BrandMark.js'

/**
 * T073 — the persistent left navigation rail (FR-016).
 *
 * Desktop widths only, `≥1280px`. Which width band this belongs to is expressed in CSS rather
 * than in JavaScript: `display: none` removes the other two forms from the accessibility tree
 * and the tab order as well as from the page, so at any width there is exactly one navigation
 * for a screen reader to find (FR-019). Choosing the form in JavaScript would mean reading the
 * viewport through a browser API, which feature code does not do (FR-045).
 *
 * The prototype has no desktop layout at all — it is a fixed 390×844 phone frame centred on a
 * navy page. This is new work, and CLAUDE.md records that the client has not yet validated it.
 */
export const DesktopRail = () => (
  <nav
    aria-label="Main"
    data-nav-layout="desktop"
    className="hidden w-(--spacing-rail-desktop) shrink-0 flex-col gap-1 border-r border-border-subtle bg-surface-inverse px-3 py-5 desktop:flex"
  >
    {/*
      T038 (010) — the mark beside the product name, in the **coral** colourway (FR-822).

      The colourway is not a preference. This rail is `bg-surface-inverse`, and the navy mark on
      it would be invisible while passing every assertion available: present, correctly sized,
      correctly hidden from assistive technology (FR-820b, SC-814). The product name stays live
      text — the mark joins it rather than replacing it.

      This is the only surface that carries the mark at desktop width. The top bar hides its own
      there, because two marks a few centimetres apart is worse than one (FR-824).
    */}
    <span className="mb-4 flex items-center gap-2 px-3 font-display text-lg font-semibold text-text-inverse">
      <BrandMark colourway="coral" className="h-6" />
      {PRODUCT_NAME}
    </span>

    {DESTINATIONS.map(({ path, label, icon: Icon }) => (
      <NavLink
        key={path}
        to={path}
        // Without `end`, "/" would match every address and Home would always look current.
        end={path === '/'}
        className={({ isActive }) =>
          [
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            // FR-022 — the visual half. `aria-current="page"`, which NavLink sets for us, is the
            // half that reaches assistive technology, and neither substitutes for the other.
            isActive
              ? 'bg-accent-strong text-text-inverse'
              : 'text-navy-200 hover:bg-navy-700 hover:text-text-inverse',
          ].join(' ')
        }
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
        {label}
      </NavLink>
    ))}
  </nav>
)
