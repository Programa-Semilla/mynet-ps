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
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // Home's level-1 heading is its own name, like every other destination's.
  //
  // It was the greeting until 002, when Home became a card registry: the greeting moved into
  // the lead card and is now an `h2` inside it, because a card owns its own heading and the
  // shell cannot depend on which cards happen to be registered. The shell therefore supplies
  // the page's `h1` — visually hidden, since the greeting card is what a sighted attendee reads
  // as the title, but present so the outline names the destination consistently.
  //
  // The greeting is still asserted, by `signIn` and `expectOwnWorkspace` in `attendees.ts`,
  // which match on text rather than on level. FR-032's point — the workspace belongs to
  // somebody — is unchanged.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  { path: '/', label: 'Home', heading: 'Home' },
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

/**
 * The administrative destinations, as `AdminShell`'s rail declares them (013).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **HERE, RATHER THAN IN A SPEC FILE, SO THE "DECLARED ONCE" CLAIM IS TRUE.**
 *
 * This list began inside `admin-accessibility.spec.ts` while a comment elsewhere described it as
 * declared once — which it was not, and a second suite needing it would have copied it. The
 * responsive sweep is that second suite: FR-020's no-horizontal-scrolling obligation covers
 * *every* surface in the product, and until it was written the helper enforcing it had never been
 * pointed at an administrative page. Axe reports nothing about a page that scrolls sideways, so
 * the accessibility suite walking these same four addresses did not cover it.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The overview's heading is the greeting rather than the rail's label — it names the operator and
 * their tier, which is FR-924's "the tier is visible at all times".
 */
export interface AdminDestination {
  readonly path: string
  readonly heading: RegExp
  readonly label: string
}

export const ADMIN_DESTINATIONS: readonly AdminDestination[] = [
  { path: '/', heading: /signed in as/i, label: 'Overview' },
  { path: '/conferences', heading: /conferences/i, label: 'Conferences' },
  { path: '/reports', heading: /reports/i, label: 'Reports' },
  { path: '/operators', heading: /operators/i, label: 'Operators' },
]
