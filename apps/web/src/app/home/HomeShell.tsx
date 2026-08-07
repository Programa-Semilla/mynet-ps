import type { Event } from '@mynet/data'
import type { ReactNode } from 'react'

import { ErrorBoundary } from '../ErrorBoundary.js'
import type { HomeCard, HomeCardSlot } from './contract.js'

/**
 * T014, T015 (002) — the Home shell: composition, containment, and the one place slots become
 * a layout (FR-155–FR-163).
 *
 * The shell knows about slots and widths. Cards know about neither. That split is what lets a
 * later feature add a card without touching a layout, and lets the layout change without
 * touching a card.
 */

/**
 * How the active conference resolves, above the cards (FR-159, FR-160).
 *
 * Resolved **once, here**, rather than by each event-scoped card: four cards each fetching the
 * active event would be four requests, four loading states that can disagree, and four chances
 * to forget the "registered for nothing" case.
 */
export type ActiveEventState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly event: Event }
  /** Registered for no conferences (FR-105). A valid answer, not a failure. */
  | { readonly status: 'none' }
  | { readonly status: 'failed'; readonly message: string; readonly retry: () => void }

export interface HomeShellProps {
  readonly cards: readonly HomeCard[]
  readonly activeEvent: ActiveEventState
  /** Rendered above the cards — the registered-for-nothing explanation, and switch failures. */
  readonly banner?: ReactNode
}

/**
 * T015 — **slot → width, in exactly one place** (FR-156).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Everything about how Home responds to width is these three lines and the grid below. A card
 * never names a column, a breakpoint, or a span, so no card can be broken by a layout change,
 * and a layout change never has to visit the cards.
 *
 *   Mobile  (<768px)        single column, everything stacked in slot order
 *   Tablet  (768–1279px)    two columns; `lead` spans both, `aside` folds below `primary`
 *   Desktop (>=1280px)      full-width `lead` above a `primary` column and an `aside` column
 *
 * The bands are half-open (`tokens.css`), so exactly one layout matches any width and there is
 * no width at which two both claim to apply. Nothing here sets a fixed width or a minimum, so
 * the floor at 320px is the mobile layout working rather than a fourth case (FR-020, T080).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const SLOT_LAYOUT: Record<HomeCardSlot, string> = {
  // Always the full width of the grid, at every band. It introduces the screen.
  lead: 'col-span-full',
  // Mobile: the only column. Tablet: the left of two. Desktop: the left of two.
  primary: 'col-span-full tablet:col-span-1',
  // Folds below `primary` at tablet by taking the second row of the same column set; at
  // desktop it becomes a genuine second column.
  aside: 'col-span-full tablet:col-span-1',
}

/** Ascending `order`; registry position breaks ties, and only ties. */
const inSlot = (cards: readonly HomeCard[], slot: HomeCardSlot): readonly HomeCard[] =>
  cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.slot === slot)
    .sort((a, b) => a.card.order - b.card.order || a.index - b.index)
    .map(({ card }) => card)

const SLOT_ORDER: readonly HomeCardSlot[] = ['lead', 'primary', 'aside']

export const HomeShell = ({ cards, activeEvent, banner }: HomeShellProps) => (
  <section aria-labelledby="home-heading" className="px-4 py-6 tablet:px-6">
    <h1 id="home-heading" className="sr-only">
      Home
    </h1>

    {banner}

    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:gap-6">
      {SLOT_ORDER.flatMap((slot) =>
        inSlot(cards, slot).map((card) => (
          <div key={card.id} data-card={card.id} className={SLOT_LAYOUT[slot]}>
            <CardBoundary card={card} activeEvent={activeEvent} />
          </div>
        )),
      )}
    </div>
  </section>
)

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Containment is the shell's, not the card author's** (FR-163).
 *
 * Every card is wrapped here, so a card author cannot forget it — because a card author never
 * writes it. A card that throws while rendering takes down its own region and nothing else,
 * and the region says which card is unavailable, which is only possible because the shell
 * holds the title without needing the card to survive to supply it.
 *
 * The boundary is keyed by card id, so a card that recovers on a later render is not held in a
 * failed state by a sibling's remount.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const CardBoundary = ({ card, activeEvent }: { card: HomeCard; activeEvent: ActiveEventState }) => (
  <ErrorBoundary
    // Unused by the contained fallback, which offers no recovery action of its own — the rest
    // of Home is still working, so there is nothing to recover *to*.
    onRecover={() => {}}
    renderFallback={() => <CardUnavailable title={card.title} />}
  >
    <CardContent card={card} activeEvent={activeEvent} />
  </ErrorBoundary>
)

/**
 * The scope discriminant decides what a card is given, and whether it renders at all.
 *
 * **An attendee-scoped card renders in every one of these states** — that is FR-160, and it is
 * why the attendee-scoped half of the contract has a real consumer rather than a test double
 * (T075). An event-scoped card cannot be rendered without a resolved event, and the compiler
 * enforces that rather than this function remembering to.
 */
const CardContent = ({ card, activeEvent }: { card: HomeCard; activeEvent: ActiveEventState }) => {
  if (card.scope === 'attendee') return <card.Component />

  switch (activeEvent.status) {
    case 'ready':
      return <card.Component event={activeEvent.event} />
    case 'loading':
      return <CardPending title={card.title} message="Loading…" />
    case 'none':
      // Not a failure: there is no conference for this card to be about (FR-105). Saying so is
      // the honest state, and it is visible rather than a hole in the layout (FR-161).
      return (
        <CardPending
          title={card.title}
          message="This will appear once you are registered for a conference."
        />
      )
    case 'failed':
      return <CardPending title={card.title} message={activeEvent.message} />
  }
}

/**
 * A card that cannot render its content, for a reason that is not the card's own fault.
 *
 * **Visible rather than absent** (FR-161): a card with nothing to show keeps its place in the
 * layout and says why. Disappearing would make the dashboard silently rearrange itself and
 * leave the attendee with no way to tell "nothing to show" from "something is broken".
 */
const CardPending = ({ title, message }: { title: string; message: string }) => (
  <section
    aria-label={title}
    className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-3"
  >
    <h2 className="mb-1 font-display text-base font-medium text-text-primary">{title}</h2>
    <p className="text-sm text-text-muted">{message}</p>
  </section>
)

/** The contained failure region for a card that threw (FR-163, SC-104). */
const CardUnavailable = ({ title }: { title: string }) => (
  <section
    aria-label={title}
    role="alert"
    className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-3"
  >
    <h2 className="mb-1 font-display text-base font-medium text-text-primary">{title}</h2>
    <p className="text-sm text-text-body">
      {/* Names what is unavailable, and makes clear the rest of Home is not. */}
      This card is unavailable right now. Everything else on Home still works.
    </p>
  </section>
)
