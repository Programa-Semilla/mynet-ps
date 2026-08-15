import { Compass } from 'lucide-react'
import { useId } from 'react'
import { Link, useLocation } from 'react-router'

import { HOME } from '../app/navigation.js'

/**
 * T071 — the not-found view (FR-015).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Inside the shell, and never a blank screen** — including offline, where a stale link or a
 * mistyped address is more likely rather than less. The navigation stays available, so the
 * attendee is one control away from somewhere real instead of stranded.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * It shows the address that did not match. An attendee who followed a broken link from a
 * conference programme can see *what* was wrong and report it; "not found" alone cannot be
 * acted on by anybody.
 */
export const NotFound = () => {
  const headingId = useId()
  const { pathname } = useLocation()

  return (
    <section aria-labelledby={headingId} className="px-4 py-6 tablet:px-6">
      <h1 id={headingId} className="mb-1 font-display text-2xl font-semibold text-text-primary">
        Page not found
      </h1>

      <div className="max-w-prose rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
        <p className="mb-2 text-sm text-text-body">
          There is nothing at <code className="font-mono text-text-primary">{pathname}</code>. The
          link may be out of date, or the address may have a typo.
        </p>

        <Link
          to={HOME.path}
          className="mt-2 inline-flex items-center gap-2 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
        >
          <Compass aria-hidden="true" size={16} strokeWidth={1.75} />
          Go to {HOME.label}
        </Link>
      </div>
    </section>
  )
}
