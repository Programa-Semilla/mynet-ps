import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PRODUCT_NAME } from '../../src/app/branding.js'
import { ICONS, SCREENSHOTS } from '../../src/app/icons.js'

/**
 * T030–T035 (010) — **a declared icon with no file fails the build** (FR-832–FR-835).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS CLOSES A HOLE THAT NOTHING IN THIS PROJECT COVERED.**
 *
 * A web app manifest is static JSON. It may name `/icons/icon-512.png` when no such file has
 * ever existed, and every one of this project's ten correctness gates stays green: typecheck,
 * lint, unit, component, contract, migration verification, integration, accessibility,
 * end-to-end, and the production build. Vite copies `public/` verbatim and never asks whether a
 * manifest entry corresponds to anything in it.
 *
 * The failure surfaces exactly once — when a real person taps "Install" and the platform fetches
 * a name that 404s. On iOS the result is a blank icon; on Android the install prompt degrades
 * silently. Neither reaches CI, and neither reaches a developer running the suite.
 *
 * Two ways to get this wrong, and both are covered: a declaration with no file, and a file whose
 * **real** dimensions disagree with the `sizes` it was declared at. The second is the quieter of
 * the two, because the file exists and everything looks right.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY A TEST AND NOT A BUILD PLUGIN**, which is what "fails the build" might suggest.
 *
 * Screenshots are captured *from the built application*. A build that aborted on a
 * declared-but-missing screenshot could never produce the build that captures it — the two would
 * deadlock. As a unit test, `pnpm build` succeeds and `pnpm verify` fails, which is the honest
 * sequencing and still satisfies FR-835: this runs in the `unit` project, inside the gates.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Expectations are derived, never listed.** Every case below iterates the declarations
 * themselves, so a **new** icon is checked by existing and no allow-list is maintained (C1.3,
 * C1.4, FR-834). Adding one and forgetting the file is the failure; there is no third place to
 * update.
 */

const PUBLIC_DIR = join(import.meta.dirname, '../../public')
const INDEX_HTML = readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8')

/**
 * Reads a PNG's real dimensions from its IHDR — width at byte 16, height at 20, big-endian,
 * immediately after the 8-byte signature.
 *
 * Sixteen lines rather than a dependency: `sharp` is a native binary belonging to the asset
 * pipeline, and dragging it into the web package's test environment to read two integers would
 * be the larger cost by far.
 */
const pngSize = (path: string): { width: number; height: number; signature: boolean } => {
  const bytes = readFileSync(path)
  const signature = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), signature }
}

/** A declared `src`/`href` is root-relative; the file that answers it lives in `public/`. */
const publicPath = (src: string) => join(PUBLIC_DIR, src.replace(/^\//, ''))

/** Every `<link rel="…">` in the document head that names an icon. */
const iconLinks = [...INDEX_HTML.matchAll(/<link\s+([^>]*?)\/?>/g)]
  .map((match) => {
    const attributes = match[1] ?? ''
    return {
      rel: /rel="([^"]+)"/.exec(attributes)?.[1] ?? '',
      href: /href="([^"]+)"/.exec(attributes)?.[1] ?? '',
      sizes: /sizes="([^"]+)"/.exec(attributes)?.[1] ?? '',
    }
  })
  .filter((link) => link.rel === 'icon' || link.rel === 'apple-touch-icon')

const declared = [
  ...ICONS.map((icon) => ({ what: `manifest icon ${icon.src}`, src: icon.src, sizes: icon.sizes })),
  ...SCREENSHOTS.map((shot) => ({
    what: `manifest screenshot ${shot.src}`,
    src: shot.src,
    sizes: shot.sizes,
  })),
  ...iconLinks.map((link) => ({
    what: `<link rel="${link.rel}"> ${link.href}`,
    src: link.href,
    sizes: link.sizes,
  })),
]

describe('the gate can fail', () => {
  it('has declarations to check — an empty list would pass every case below vacuously', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(4)
    expect(iconLinks.length).toBeGreaterThanOrEqual(3)
    expect(declared.length).toBe(ICONS.length + SCREENSHOTS.length + iconLinks.length)
  })
})

describe('every declared asset exists (C1.1, C2.1, FR-832)', () => {
  it.each(declared)('$what resolves to a file', ({ src }) => {
    const path = publicPath(src)

    expect(
      existsSync(path),
      `Declared as "${src}" but no file exists at ${path}.\n` +
        `Either the declaration is wrong, or the asset was never generated:\n` +
        `  node scripts/generate-brand-assets.mjs`,
    ).toBe(true)
    expect(statSync(path).size).toBeGreaterThan(0)
  })
})

describe('every declared size is the file’s real size (C1.2, C2.2, FR-833)', () => {
  it.each(declared.filter((entry) => entry.sizes !== ''))(
    '$what is really $sizes',
    ({ src, sizes }) => {
      const path = publicPath(src)
      const [width, height] = sizes.split('x').map(Number)
      const actual = pngSize(path)

      expect(actual.signature, `${src} is declared image/png but is not a PNG`).toBe(true)
      expect(
        { width: actual.width, height: actual.height },
        `Declared "${sizes}" but the file is ${actual.width}x${actual.height}. ` +
          `A platform sizing an icon by its declaration renders it wrong.`,
      ).toEqual({ width, height })
    },
  )
})

describe('the declarations themselves', () => {
  /**
   * FR-841 — the monochrome variant is **booked follow-up work, not shipped**. Declaring
   * `purpose: "monochrome"` without a purpose-drawn asset gives platforms permission to
   * recolour the mark arbitrarily, which is worse than not offering one.
   */
  it('declares no monochrome purpose (C1.5)', () => {
    expect(ICONS.filter((icon) => icon.purpose === ('monochrome' as unknown))).toEqual([])
    expect(INDEX_HTML).not.toContain('monochrome')
  })

  it('declares a maskable icon, and sizes it for the safe circle rather than the side', () => {
    const maskable = ICONS.filter((icon) => icon.purpose === 'maskable')

    expect(maskable).toHaveLength(1)
    expect(maskable[0]?.sizes).toBe('512x512')
  })

  /**
   * FR-812 — iOS ignores `purpose: maskable` and paints transparency black, so the apple-touch
   * icon cannot be the maskable file under another name. Distinct `src` values are the cheap
   * structural half of that; the opacity itself is asserted in the generator's own suite.
   */
  it('gives the apple-touch icon its own file rather than reusing the maskable one', () => {
    const appleTouch = ICONS.find((icon) => icon.src.includes('apple-touch'))

    expect(appleTouch?.sizes).toBe('180x180')
    expect(appleTouch?.purpose).toBeUndefined()
    expect(ICONS.filter((icon) => icon.src === appleTouch?.src)).toHaveLength(1)
  })

  /**
   * C1.4, FR-834 — **nothing is excused.** The obvious way this gate rots is an exception list
   * that grows one entry at a time until it covers everything, and each entry looks reasonable
   * on the day it is added.
   *
   * So the assertion is that the checked set is the declared set, exactly: every manifest icon,
   * every manifest screenshot and every head link is carried into `declared` with nothing
   * filtered out. Excusing one asset means deleting a case rather than appending to a list, and
   * deleting a case is a conversation.
   */
  it('checks every declaration, with nothing excused (C1.4, FR-834)', () => {
    const checked = new Set(declared.map((entry) => entry.src))

    for (const icon of ICONS) expect(checked.has(icon.src)).toBe(true)
    for (const shot of SCREENSHOTS) expect(checked.has(shot.src)).toBe(true)
    for (const link of iconLinks) expect(checked.has(link.href)).toBe(true)

    // The size case skips only entries that declare no size — and every icon declares one.
    expect(declared.filter((entry) => entry.sizes === '')).toEqual([])
  })
})

/**
 * T056 (010) — **the screenshots are declared and NOT precached** (FR-815d, SC-815).
 *
 * Two facts that must hold together, and each is worthless alone: declaring them without
 * excluding them puts ~430KB of prompt illustration into every install download, and excluding
 * them without declaring them means the prompt shows a name and an icon.
 *
 * This reads the built worker rather than the config, because `globIgnores` is a pattern and a
 * pattern is a claim about what it matches. The build is the only place that claim is settled —
 * `'screenshots/**'` matching nothing at all would look identical in the config and be a
 * silently empty exclusion.
 *
 * Skipped when `dist/` is absent, and **loudly**: this runs in the `unit` project, which does
 * not build. `pnpm verify` runs `build` before `test:e2e`, and a developer running only the unit
 * layer gets the note rather than a false pass.
 */
describe('the precache manifest', () => {
  const worker = join(import.meta.dirname, '../../dist/sw.js')

  it.skipIf(!existsSync(worker))('precaches every icon and NOT one screenshot (SC-815)', () => {
    const built = readFileSync(worker, 'utf8')

    expect(built).not.toMatch(/screenshots\//)
    for (const icon of ICONS) {
      expect(built, `${icon.src} must be precached with the shell`).toContain(
        icon.src.replace(/^\//, ''),
      )
    }
  })
})

describe('the document head (C2.3, C2.4, C2.5)', () => {
  it('links an apple-touch-icon — this document had none before feature 010 (FR-813)', () => {
    expect(iconLinks.filter((link) => link.rel === 'apple-touch-icon')).toHaveLength(1)
  })

  it('links at least one favicon — nor did it have one of these (FR-816)', () => {
    expect(iconLinks.filter((link) => link.rel === 'icon').length).toBeGreaterThanOrEqual(1)
  })

  /**
   * FR-819 — the mark is added *beside* the product name, never in place of it. The single
   * branding constant stays the source of the product's name in every surface that carries one.
   */
  it('leaves the title and the description meta exactly as they were (C2.5)', () => {
    expect(INDEX_HTML).toContain(`<title>${PRODUCT_NAME}</title>`)
    expect(INDEX_HTML).toContain(
      'content="MyNet — your conference workspace: what is happening next, who to meet, and where your conversations live."',
    )
  })
})
