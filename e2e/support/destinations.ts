import { ADA } from './attendees.js'

/**
 * The five destinations as the browser sees them.
 *
 * This mirrors `apps/web/src/app/navigation.ts` rather than importing it — that module pulls in
 * React and an icon library, which has no business running inside the test runner's Node
 * process. `apps/web/tests/unit/navigation-mirror.test.ts` asserts the two lists agree, so the
 * duplication cannot drift silently.
 */

export interface E2eDestination {
  readonly path: string
  /** The accessible name of the control that navigates here. */
  readonly label: string
  /** The level-1 heading the destination renders, by which the region is recognised. */
  readonly heading: string
}

export const DESTINATIONS: readonly E2eDestination[] = [
  // Home greets the signed-in attendee rather than repeating its own name — the whole point of
  // FR-032 is that the workspace belongs to somebody.
  { path: '/', label: 'Home', heading: `Hello, ${ADA.displayName}` },
  { path: '/agenda', label: 'Agenda', heading: 'Agenda' },
  { path: '/discover', label: 'Discover', heading: 'Discover' },
  { path: '/messages', label: 'Messages', heading: 'Messages' },
  { path: '/network', label: 'Network', heading: 'Network' },
]

export interface Width {
  readonly px: number
  readonly layout: 'mobile' | 'tablet' | 'desktop'
}

/**
 * One representative width per layout band, for suites that walk every destination at every
 * width. The bands are the half-open intervals FR-019 and research.md D16 fix:
 * mobile `<768`, tablet `768–1279`, desktop `≥1280`.
 */
export const WIDTHS: readonly Width[] = [
  { px: 375, layout: 'mobile' },
  { px: 900, layout: 'tablet' },
  { px: 1440, layout: 'desktop' },
]

/**
 * The widths that matter for the no-horizontal-scrolling obligation (FR-020, SC-006).
 *
 * 320 is the stated floor. The three pairs straddling each boundary are where a mistake in the
 * half-open intervals would actually show: 767/768 and 1279/1280 are the widths at which two
 * layouts could both apply, or neither could.
 */
export const SCROLL_WIDTHS: readonly number[] = [
  320, 360, 375, 414, 600, 767, 768, 834, 1024, 1279, 1280, 1440, 1920,
]
