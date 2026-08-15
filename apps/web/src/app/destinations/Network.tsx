import { useCallback, useId, useState } from 'react'

import { useActiveEvent } from '../active-event.js'
import { Appointments } from '../network/Appointments.js'
import { Contacts } from '../network/Contacts.js'

/**
 * T046, T129–T132 (008) — the Network destination: the fifth and last empty one
 * (FR-643a, FR-659).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DESTINATION OWNS ITS ADDRESS.** `navigation.ts` declares this element on the Network
 * entry and nothing else; `routes.tsx` names no address literally. That is 005's FR-233
 * inherited rather than re-litigated, and 006 and 007 each extended their own entry the same
 * way — which is what let this feature add a destination without touching a neighbour's line.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **TWO VIEWS THAT DO NOT OBEY THE SAME RULES, WHICH IS WHY THEY ARE TWO VIEWS.**
 *
 * *Contacts* is **cross-event**: it lists everybody whose card the reader holds, from every
 * conference they have ever attended, and it keeps listing them after the conference ends and
 * after the sharer turns discoverability off (FR-612, FR-614).
 *
 * *Appointments* is **per-event**: a meeting is a time and a place at one conference, so this
 * view swaps entirely when the reader switches (FR-639).
 *
 * Presenting them as one merged list would require picking one rule and applying it to both, and
 * either choice is wrong — event-scoping the contacts destroys the feature's whole purpose, and
 * cross-event appointments are times with no venue.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T132 — A SEGMENTED CONTROL, NEVER A HORIZONTALLY SCROLLING STRIP** (FR-659).
 *
 * The approved prototype switches these with a scrolling row of pills. That is a **recorded
 * defect, not a pattern to reproduce**: the constitution forbids any content or primary action
 * requiring horizontal scrolling, and a switcher whose second option is off-screen makes half
 * this destination unreachable without a gesture nothing advertises.
 *
 * Two options fit at 320px comfortably, so the strip was never buying anything. Built from real
 * `<button>`s in a `tablet`-agnostic flex row, with `aria-pressed` carrying the state — a
 * `role="tablist"` was considered and rejected, because these are not tabs over one panel's
 * content but two independent views, and tab semantics would promise arrow-key navigation
 * between panels that do not behave like panels.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T129–T131 — the three widths, and the switcher only exists at one of them.**
 *
 * *Desktop* is **two panes side by side**: contacts beside appointments, both visible, because a
 * wide screen has room for the destination's whole answer at once. *Tablet* is the same two
 * regions **stacked**, contacts above appointments, in a two-column card grid.
 *
 * On both of those the segmented control is **not rendered at all** — there is nothing to switch
 * between when both are on screen, and a control that changes nothing is worse than no control.
 * *Mobile* is single column and one view at a time, which is where the switcher earns its place.
 *
 * Done by not rendering rather than by CSS `hidden`, the lesson 007 recorded: a hidden pane is
 * still in the accessibility tree in some combinations, so somebody reading linearly would walk
 * into a view they were told was not there. **The state is deliberately not in the address** —
 * unlike a conversation or a session panel, neither of these is a distinct thing to link to, and
 * `/network` is the shareable address for both.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

type View = 'contacts' | 'appointments'

export const Network = () => {
  const headingId = useId()
  const activeEvent = useActiveEvent()
  const [view, setView] = useState<View>('contacts')

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **A PROPOSAL MADE IN ONE PANE HAS TO APPEAR IN THE OTHER, AND NOTHING ELSE WOULD MAKE IT.**
   *
   * The scheduling dialog belongs to `Contacts`; the meeting it creates belongs to
   * `Appointments`. On desktop both panes are on screen at once, so without this an attendee
   * proposes a meeting, the dialog closes, and **the pane beside it does not change** — which
   * reads as the proposal having failed. An end-to-end run found exactly that: the meeting was
   * stored correctly and only appeared after a reload.
   *
   * A counter rather than shared state: the two views own their own reads, and lifting the
   * appointment list up here would make this component a data owner and give `Appointments` a
   * second source of truth for what the server holds. Bumping a number tells it to ask again,
   * which is the smallest thing that can be said.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const [proposals, setProposals] = useState(0)
  const onProposed = useCallback(() => setProposals((n) => n + 1), [])

  const eventName = activeEvent.status === 'ready' ? activeEvent.event.name : null

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col px-4 py-6 tablet:px-6">
      <h1 id={headingId} className="mb-1 font-display text-2xl font-semibold text-text-primary">
        Network
      </h1>
      <p className="mb-6 text-sm text-text-muted">
        The people whose cards you hold, and the meetings you have arranged.
      </p>

      {/*
        Mobile only — see the header. `desktop:hidden tablet:hidden` rather than a `mobile:` rule
        because the breakpoints here are min-width: everything is mobile until `tablet` overrides
        it.
      */}
      <div className="mb-4 tablet:hidden">
        <ViewSwitcher view={view} onChange={setView} />
      </div>

      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        One column on mobile, two from `tablet` up — stacked there by the grid falling back to a
        single column below `desktop`, and side by side above it.

        `min-w-0` on both columns is what stops a long company name or an unbroken email widening
        the grid past the viewport. It is the single most common cause of the horizontal
        scrolling FR-659 forbids, and it only shows up with real content in it — which is why 007
        recorded it and why it is repeated here rather than rediscovered.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      <div className="grid min-h-0 flex-1 gap-6 desktop:grid-cols-2 desktop:items-start">
        <div className={view === 'contacts' ? 'min-w-0' : 'hidden min-w-0 tablet:block'}>
          <Contacts onProposed={onProposed} />
        </div>
        <div className={view === 'appointments' ? 'min-w-0' : 'hidden min-w-0 tablet:block'}>
          <Appointments eventName={eventName} refreshToken={proposals} />
        </div>
      </div>
    </section>
  )
}

/**
 * The segmented control (T132, FR-658, FR-659).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`aria-pressed` rather than `aria-selected`**, because these are toggle buttons and not tabs
 * — see the destination's header for why tab semantics would promise behaviour these views do
 * not have.
 *
 * Both options are always visible and always reachable: `flex-1` splits the available width
 * evenly, so neither can be pushed off-screen however long its label becomes. That is the
 * property FR-659 is actually about; the visual treatment is secondary.
 *
 * The focus ring is on the button rather than on the group, so a keyboard reader can see which
 * of the two they are on rather than only which is active.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const ViewSwitcher = ({
  view,
  onChange,
}: {
  readonly view: View
  readonly onChange: (next: View) => void
}) => (
  <div
    role="group"
    aria-label="Show contacts or appointments"
    className="flex rounded-md border border-border-subtle bg-surface-raised p-1"
  >
    {(
      [
        ['contacts', 'Contacts'],
        ['appointments', 'Appointments'],
      ] as const
    ).map(([value, label]) => (
      <button
        key={value}
        type="button"
        aria-pressed={view === value}
        onClick={() => onChange(value)}
        className={`min-h-11 flex-1 rounded-sm px-4 py-2 text-sm font-medium ${
          view === value
            ? 'bg-accent-strong text-text-inverse'
            : 'text-text-body hover:bg-surface-sunken'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
)
