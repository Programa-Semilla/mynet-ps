import { useId } from 'react'

import type { Destination } from '../navigation.js'

/**
 * T078 — a destination that is structurally present and honestly empty (FR-023).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * These carry **no product content**, and that is the requirement rather than a shortfall.
 * This slice's job is the foundation: sign-in, identity-scoped data, the responsive shell,
 * addressability, and the pipeline. Agenda, Discover, Messages, and Network get their content
 * in the slices that own them (FR-039).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * What they must do is be *targetable*: a named region with a level-1 heading, so navigation
 * and accessibility verification have something real to assert against rather than a blank div
 * that would pass every check by containing nothing.
 *
 * The copy states what the destination will answer and that it is not built yet. "Coming soon"
 * would say less and promise more.
 */
export const DestinationPlaceholder = ({ destination }: { destination: Destination }) => {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="px-4 py-6 tablet:px-6">
      <h1 id={headingId} className="mb-1 font-display text-2xl font-semibold text-text-primary">
        {destination.label}
      </h1>
      <p className="mb-6 text-sm text-text-muted">{destination.purpose}</p>

      <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
        <p className="mb-1 font-medium text-text-primary">Not built yet</p>
        <p className="max-w-prose text-sm text-text-body">
          This slice establishes the foundation MyNet needs — signing in, your own data, and this
          workspace on any device. {destination.label} arrives with the work that builds it.
        </p>
      </div>
    </section>
  )
}
