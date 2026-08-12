/**
 * T028 (010) — the application's icon declarations, as data (FR-832).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **This module exists so that something other than a real device can check these names.**
 *
 * A web app manifest may declare an icon whose file is not there. That passes typecheck, lint,
 * unit, component, contract, migration, integration, accessibility, end-to-end **and** the
 * production build — all ten of this project's correctness gates — and fails only at the moment
 * somebody installs the application on a phone. Before this feature, nothing here could catch it.
 *
 * The declarations therefore live outside `vite.config.ts`, which cannot be imported by a test
 * without dragging every plugin in with it. `apps/web/tests/unit/icon-declarations.test.ts`
 * derives its expectations from this list — never from a hard-coded copy of it — so a **new**
 * icon is checked by existing, and a removed file fails the build rather than the install.
 *
 * The pattern is established rather than novel: `vite.config.ts` already imports `PRODUCT_NAME`
 * from `./branding.js` for exactly this reason. What deliberately stays in the config is
 * `readColourToken`, which does file I/O the browser program must never see.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every file below is derived from the brand board by `scripts/generate-brand-assets.mjs`.
 * None is hand-exported, and none may be hand-edited: regeneration must reproduce it byte for
 * byte (FR-806).
 */

/** One manifest icon entry. Mirrors the subset of the manifest spec this application uses. */
export interface IconDeclaration {
  /** Root-relative, and resolved against `apps/web/public` by both the build and the gate. */
  readonly src: string
  /** `"<width>x<height>"`. The gate reads the PNG's real IHDR and requires them to agree. */
  readonly sizes: string
  readonly type: 'image/png'
  readonly purpose?: 'maskable'
}

/**
 * The icons the manifest declares.
 *
 * `apple-touch-icon.png` is declared here as well as linked from `index.html`. It does not have
 * to be — iOS reads the link, not the manifest — and it is, because **an undeclared asset is an
 * unchecked one**. Leaving it out would make it the single icon this feature ships that the gate
 * derives no expectation from, in the feature whose whole purpose is closing that hole (FR-828).
 */
export const ICONS: readonly IconDeclaration[] = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  /**
   * The mark sits inside the 80%-**diameter safe circle**, measured on its bounding-box
   * diagonal. Sizing it to 80% of the icon's side instead puts the node terminals outside the
   * region a circular mask keeps, and clips them — see `maskableMarkHeight` in the generator.
   */
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  /**
   * Fully opaque, and therefore not the maskable file under another name: iOS ignores
   * `purpose: maskable` and paints transparency black (FR-812).
   */
  { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
]

/** One manifest screenshot entry. */
export interface ScreenshotDeclaration {
  readonly src: string
  readonly sizes: string
  readonly type: 'image/png'
  readonly form_factor: 'narrow' | 'wide'
  readonly label: string
}

/**
 * Screenshots for the rich install prompt, so it shows the product rather than a name and an
 * icon.
 *
 * **These are captured from the built application** by `e2e/support/capture-screenshots.ts`, not
 * hand-taken, which is what keeps them regenerable as the interface changes (FR-815c). They are
 * excluded from the precache by `injectManifest.globIgnores`, because a prompt illustration is
 * not something an offline shell needs and it is the largest thing in `public/` (FR-815d).
 *
 * They depict **seeded fixture data only** — which the capture method guarantees, since that is
 * the only data the end-to-end stack contains. This repository is public, so a committed
 * screenshot is world-readable permanently (FR-815e).
 *
 * **The order here is the reason this list came last.** A screenshot is captured *from the built
 * application*, so it cannot be declared before it exists without the gate failing on a file
 * nothing has produced yet — capture, then declare (research R6).
 */
export const SCREENSHOTS: readonly ScreenshotDeclaration[] = [
  {
    src: '/screenshots/home-narrow.png',
    sizes: '390x844',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'Home — what is happening next at the conference',
  },
  {
    src: '/screenshots/agenda-narrow.png',
    sizes: '390x844',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'Agenda — the personal schedule, in chronological order',
  },
  {
    src: '/screenshots/discover-narrow.png',
    sizes: '390x844',
    type: 'image/png',
    form_factor: 'narrow',
    label: 'Discover — attendees worth meeting',
  },
  {
    src: '/screenshots/home-wide.png',
    sizes: '1280x800',
    type: 'image/png',
    form_factor: 'wide',
    label: 'Home — what is happening next at the conference',
  },
  {
    src: '/screenshots/agenda-wide.png',
    sizes: '1280x800',
    type: 'image/png',
    form_factor: 'wide',
    label: 'Agenda — the personal schedule, in chronological order',
  },
  {
    src: '/screenshots/discover-wide.png',
    sizes: '1280x800',
    type: 'image/png',
    form_factor: 'wide',
    label: 'Discover — attendees worth meeting',
  },
]
