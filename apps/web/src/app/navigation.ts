import { CalendarDays, Compass, Home, MessageSquare, Users, type LucideIcon } from 'lucide-react'

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
 * These carry **no product content in this slice** (FR-023). Each destination renders an
 * identifiable region with a heading and an honest statement that its content is not built yet.
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
    purpose: 'The conference programme, in chronological order.',
    icon: CalendarDays,
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

/** The destination a given address resolves to, or undefined for a not-found address. */
export const destinationFor = (pathname: string): Destination | undefined =>
  DESTINATIONS.find((destination) => destination.path === pathname)
