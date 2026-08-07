import { CalendarDays, Compass, Home, MessageSquare, Users, type LucideIcon } from 'lucide-react'
import { createElement, type ReactElement } from 'react'

import { SessionPanel } from './agenda/SessionPanel.js'
import { Agenda } from './destinations/Agenda.js'

/**
 * The five destinations, declared once (FR-012, FR-013).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The router, all three navigation forms, and the tests read this list. That is the point:
 * three navigation forms built from three hand-written lists would drift, and the drift would
 * show up as a destination reachable on desktop but not on mobile — which SC-004's "complete
 * navigation journey across all five destinations" would only catch at one width.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Order is deliberate and matches the prototype: Home first because it is the entry view, then
 * the attendee's own time (Agenda), then other people (Discover, Messages, Network).
 *
 * **Home and Agenda carry product content from 002.** Discover, Messages and Network remain
 * placeholders: each renders an identifiable region with a heading and `purpose` as an honest
 * statement that its content is not built yet, until the feature that owns it lands.
 */

export interface Destination {
  /** Distinct, stable, shareable address (FR-013). */
  readonly path: string
  /** The accessible name of every control that navigates here (FR-021). */
  readonly label: string
  /**
   * What this destination will answer once it has content. Shown on the destination itself so
   * the placeholder says something true rather than "coming soon".
   */
  readonly purpose: string
  readonly icon: LucideIcon
  /**
   * T016 (005) — **what renders this destination** (FR-233).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * The router used to decide by comparing the address to the literal `'/agenda'`. That
   * worked for exactly one destination with content, and it meant each of the four features
   * still to come — 006 Discover, 007 Messages, 008 Network, and 004's profile view — would
   * add another branch to the same `if` in `routes.tsx`. Four features editing one shared
   * expression is precisely the contention 002's per-domain file splits exist to avoid.
   *
   * Declaring it here inverts that: a destination says what renders it, and `routes.tsx`
   * stops naming any address literally. A later feature changes **this line only**, and the
   * router is not touched again. FR-233 requires the literal special case to be *retired* by
   * this change, not merely supplemented — so `routes.tsx` now has no address comparison
   * left in it at all.
   *
   * **Optional, because a destination without content is not broken.** Discover, Messages and
   * Network legitimately have no element yet; `undefined` means "render the placeholder",
   * which is a real state rather than a missing one.
   *
   * Built with `createElement` rather than JSX because this module is `.ts` and is read by the
   * router, all three navigation forms, and the tests. Renaming it to `.tsx` would churn a
   * shared file for syntax alone, which is the opposite of what this change is for.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly element?: ReactElement
  /**
   * T035 (005) — addresses **nested inside** this destination (FR-198, research D4).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * Declared here for exactly the reason `element` is. tasks.md places the nested session
   * route in `routes.tsx`; putting it there would have reintroduced a literal Agenda special
   * case into the router one line after FR-233 retired the last one, and 009 — which extends
   * the same panel — would have had to edit the router to do it.
   *
   * A destination owns its addresses. `routes.tsx` renders whatever is declared and names
   * none of them.
   *
   * **Nested, not sibling**: the parent stays mounted, so the programme is still behind the
   * panel, closing is a navigation rather than a refetch, and Back closes the panel through
   * the browser's own mechanism (FR-205).
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly children?: readonly { readonly path: string; readonly element: ReactElement }[]
}

export const DESTINATIONS: readonly Destination[] = [
  {
    path: '/',
    label: 'Home',
    purpose: 'What is happening next, and who you should meet today.',
    icon: Home,
  },
  {
    /*
      T085 (002) — Agenda now has content, so its `purpose` had to stop promising something it
      does not yet do. The destination renders the conference programme, read-only; saving a
      session, personal notes and Q&A arrive with feature 005, and "your personalised schedule"
      described that later state rather than this one.

      `purpose` is shown on placeholder destinations, so for Agenda it is now only a description
      — but leaving it stale would make the next reader think saving was already built.
    */
    path: '/agenda',
    label: 'Agenda',
    /*
      T028 (005) — `purpose` again describes what the destination actually is. 002 narrowed it
      from "your personalised schedule" to "the conference programme" because saving did not
      exist yet; 005 is the feature that makes it a personal schedule, so the wording that was
      premature then is accurate now.
    */
    purpose: 'The conference programme, and the sessions you saved from it.',
    icon: CalendarDays,
    element: createElement(Agenda),
    // `/agenda/<sessionId>` — the detail panel, rendered over the programme (FR-198).
    children: [{ path: ':sessionId', element: createElement(SessionPanel) }],
  },
  {
    path: '/discover',
    label: 'Discover',
    purpose: 'Attendees you might want to meet, with search and filters.',
    icon: Compass,
  },
  {
    path: '/messages',
    label: 'Messages',
    purpose: 'Your conversations with other attendees.',
    icon: MessageSquare,
  },
  {
    path: '/network',
    label: 'Network',
    purpose: 'Saved contacts, exchanged cards, and scheduled appointments.',
    icon: Users,
  },
] as const

/** Home is the default destination (FR-012). */
export const HOME = DESTINATIONS[0] as Destination

/**
 * The destination a given address resolves to, or undefined for a not-found address.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Resolves nested addresses to their owning destination** (005).
 *
 * This was an exact match, which was correct while every address *was* a destination. 005
 * added the first nested one — `/agenda/<sessionId>`, the session detail panel — and the exact
 * match then reported it as no destination at all. The consequences were not cosmetic and were
 * found in a browser rather than by reading:
 *
 *   - the top bar read **"Not found"** while a perfectly valid session panel was open, and
 *   - `RouteAnnouncer` announced **"Page not found"** to screen-reader users on every open.
 *
 * The second is the serious one. Opening a session is exactly the moment a screen-reader user
 * needs to be told what happened, and they were being told the page did not exist.
 *
 * A prefix match with a `/` boundary rather than `startsWith` alone: `/agendaX` must not
 * resolve to Agenda, and Home's `'/'` must not swallow every address in the product — which it
 * would, being a prefix of all of them. Home therefore stays exact-only, and the longest match
 * wins so a future destination nested under another still resolves to the nearer one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const destinationFor = (pathname: string): Destination | undefined => {
  const exact = DESTINATIONS.find((destination) => destination.path === pathname)
  if (exact) return exact

  return DESTINATIONS.filter(
    (destination) => destination.path !== HOME.path && pathname.startsWith(`${destination.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0]
}
