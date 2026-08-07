import type { Event } from '@mynet/data'
import type { FC } from 'react'

/**
 * T012 (002) — the Home card contract (FR-155–FR-165, research D8).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Home is composed, not aggregated** (constitution, "Data scoping, content provenance, and
 * composition"). It is a registry of independent cards; each owns its loading, empty and
 * failure states; a card that fails must not blank the dashboard or stop any other card from
 * rendering; and no card may depend on another card's presence, ordering, or data.
 *
 * Seven features after this one contribute a card. This file is the contract they build
 * against, and it is deliberately small — everything it does not say is something a later
 * feature is free to decide for itself inside its own card.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Where a card sits. Slots are named by **role, not by position** — the shell maps them to the
 * three widths (FR-156), and it does so in exactly one place, so a card never states a column
 * or a breakpoint and cannot be broken by a layout change it did not make.
 *
 * - `lead`   — the one card that introduces the screen. At most one, ever (FR-157).
 * - `primary`— the substance of the dashboard.
 * - `aside`  — supporting material that may fold below the primary column when space is short.
 */
export type HomeCardSlot = 'lead' | 'primary' | 'aside'

/** What an event-scoped card receives, and the only thing the shell passes it. */
export interface EventCardProps {
  /**
   * The **resolved** active conference. Never null, never loading: the shell resolves it above
   * the cards and does not render an event-scoped card until it has one (FR-159). A card
   * therefore never writes `if (!event)`, because there is no such state to handle.
   */
  readonly event: Event
}

interface HomeCardBase {
  /** Stable and unique across the registry. Used as the React key and in test selectors. */
  readonly id: string
  /**
   * What this card is called. The shell does **not** render it as a heading — a card owns its
   * own heading and its own empty and failure wording. This is what the containment boundary
   * names when the card itself cannot render (FR-163): "Up next is unavailable" is only
   * possible because the shell knows the title without the card having to survive to supply it.
   */
  readonly title: string
  readonly slot: HomeCardSlot
  /** Ascending within a slot. Ties are resolved by registry position. */
  readonly order: number
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The discriminant is the whole point of this union** (FR-158–FR-160).
 *
 * An **event-scoped** card's component *requires* `EventCardProps`, so the shell cannot render
 * it before the active conference resolves — the compiler will not let it.
 *
 * An **attendee-scoped** card's component *cannot accept* one, so it cannot quietly grow a
 * dependency on the active conference and then break when there isn't one. That half matters
 * more than it looks: FR-160 requires attendee-scoped cards to keep rendering when the active
 * event is unresolvable, and a card that had been silently reading the event would be the
 * thing that fails exactly when it is needed.
 *
 * Both halves hold **by typing rather than by review**, which is why this is a discriminated
 * union and not a single card kind with an ambient hook. That alternative was considered and
 * rejected in brainstorm #02: the compiler could not then tell a card that legitimately
 * ignores the event from one that forgot to handle its absence.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export type HomeCard =
  | (HomeCardBase & { readonly scope: 'event'; readonly Component: FC<EventCardProps> })
  | (HomeCardBase & { readonly scope: 'attendee'; readonly Component: FC })

/**
 * **A card receives its declared scope's props and nothing else** — no registry handle, no
 * sibling reference, no shared store. That absence is how FR-164 is enforced: there is no
 * expression a card author could write to reach another card, which is why no test tries
 * (plan.md, "Two requirements verified structurally rather than by a test").
 */
