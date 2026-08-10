import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PRODUCT_NAME } from '../../src/app/branding.js'
import { ICONS, SCREENSHOTS } from '../../src/app/icons.js'
import { INTRINSIC, MARK_SOURCE } from '../../src/shell/BrandMark.js'

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

/**
 * The document with HTML comments removed.
 *
 * `index.html` carries a long comment *about* icon links, immediately above the links themselves.
 * Matching over the raw text cannot tell a live `<link>` from one inside that comment, so the day
 * somebody comments a link out rather than deleting it — or writes an example into the note — the
 * gate would demand a file that is deliberately not referenced.
 */
const HEAD = INDEX_HTML.replace(/<!--[\s\S]*?-->/g, '')

/** Reads one attribute, tolerating either quote style. */
const attribute = (name: string, attributes: string): string =>
  new RegExp(`${name}=("([^"]*)"|'([^']*)')`)
    .exec(attributes)
    ?.slice(2)
    .find((value) => value !== undefined) ?? ''

/** Every `<link rel="…">` in the document head that names an icon. */
const iconLinks = [...HEAD.matchAll(/<link\s+([^>]*?)\/?>/g)]
  .map((match) => ({
    rel: attribute('rel', match[1] ?? ''),
    href: attribute('href', match[1] ?? ''),
    sizes: attribute('sizes', match[1] ?? ''),
  }))
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

/**
 * The check itself, as a function, so the failure path can be **demonstrated** rather than
 * assumed (SC-810).
 *
 * A gate whose negative case has never executed is a gate nobody has seen work. Extracting the
 * body lets the suite run it against a declaration that is known to be wrong and require it to
 * throw — which is what the by-hand quickstart step was for, done automatically.
 */
const checkDeclaration = ({ src, sizes }: { src: string; sizes: string }): void => {
  const path = publicPath(src)

  if (!existsSync(path)) {
    throw new Error(
      `Declared as "${src}" but no file exists at ${path}.\n` +
        `Either the declaration is wrong, or the asset was never generated:\n` +
        `  node scripts/generate-brand-assets.mjs`,
    )
  }
  if (statSync(path).size === 0) throw new Error(`${src} exists but is empty.`)

  const actual = pngSize(path)
  if (!actual.signature) throw new Error(`${src} is declared image/png but is not a PNG.`)

  if (sizes !== '') {
    const [width, height] = sizes.split('x').map(Number)
    if (actual.width !== width || actual.height !== height) {
      throw new Error(
        `Declared "${sizes}" but the file is ${actual.width}x${actual.height}. ` +
          `A platform sizing an icon by its declaration renders it wrong.`,
      )
    }
  }
}

describe('the gate can fail', () => {
  /**
   * Floors on **all three** declaration sources. `SCREENSHOTS` was originally left out, which
   * meant the entire screenshot half of the feature could be deleted with every gate green: an
   * empty array makes `declared` shorter, the manifest key vanish, and every case below pass
   * vacuously — including the precache check, which asserts an *absence*.
   */
  it('has declarations to check — an empty list would pass every case below vacuously', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(4)
    expect(SCREENSHOTS.length).toBeGreaterThanOrEqual(2)
    expect(iconLinks.length).toBeGreaterThanOrEqual(3)
    expect(declared.length).toBe(ICONS.length + SCREENSHOTS.length + iconLinks.length)
  })

  it('offers both install-prompt form factors', () => {
    expect(new Set(SCREENSHOTS.map((shot) => shot.form_factor))).toEqual(
      new Set(['narrow', 'wide']),
    )
  })

  /**
   * A `<link>` the parser cannot read is silently dropped from `declared`, which turns "a new
   * declaration fails by existing" into "a new declaration is ignored". So every link that looks
   * like an icon must survive parsing.
   */
  it('parses every icon-ish <link> in the document rather than dropping ones it cannot read', () => {
    const iconish = [...HEAD.matchAll(/<link\b[^>]*icon[^>]*>/g)]

    expect(iconLinks.length, 'a <link> mentioning an icon was not parsed').toBe(iconish.length)
  })

  it('FAILS on a declaration whose file is absent', () => {
    expect(() => checkDeclaration({ src: '/icons/does-not-exist.png', sizes: '192x192' })).toThrow(
      /no file exists/,
    )
  })

  it('FAILS when the file’s real size disagrees with the declaration', () => {
    expect(() => checkDeclaration({ src: '/icons/icon-512.png', sizes: '192x192' })).toThrow(
      /but the file is 512x512/,
    )
  })
})

describe('every declared asset exists at its declared size (C1.1, C1.2, C2.1, C2.2)', () => {
  it.each(declared)('$what', ({ src, sizes }) => {
    expect(() => checkDeclaration({ src, sizes })).not.toThrow()
  })
})

/**
 * The two in-app marks are outside the manifest and outside `index.html`, so nothing above sees
 * them — yet `BrandMark.tsx` hand-declares their pixel size on every `<img>` it renders, and that
 * is what reserves the box before the image loads. A stale value reintroduces layout shift in the
 * top bar at 320px, the one row FR-825 says nothing may move in.
 */
describe('the in-app mark matches the size BrandMark declares for it', () => {
  it.each(Object.entries(MARK_SOURCE))('the %s mark is really %s', (_colourway, src) => {
    const actual = pngSize(publicPath(src))

    expect({ width: actual.width, height: actual.height }).toEqual(INTRINSIC)
  })
})

describe('the declarations themselves', () => {
  /**
   * FR-841 — the monochrome variant is **booked follow-up work, not shipped**. Declaring
   * `purpose: "monochrome"` without a purpose-drawn asset gives platforms permission to
   * recolour the mark arbitrarily, which is worse than not offering one.
   */
  it('declares no monochrome purpose (C1.5)', () => {
    // Asserted over the runtime values, with no cast. The previous form filtered for
    // `'monochrome' as unknown` — a predicate the declared type makes unsatisfiable, so the cast
    // existed only to stop the compiler pointing that out, and the case could never fail. The
    // real route by which `monochrome` arrives is somebody widening `IconDeclaration['purpose']`,
    // and this form catches that because it checks what the array actually holds.
    expect(ICONS.every((icon) => icon.purpose === undefined || icon.purpose === 'maskable')).toBe(
      true,
    )
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
 * **The precache assertion is deliberately NOT here.** It lives in `scripts/brand-audit.mjs`,
 * which `pnpm verify` runs immediately after `pnpm build`.
 *
 * It was here, guarded by `it.skipIf(!existsSync('../../dist/sw.js'))`, and that guard made it a
 * check that never ran: CI's `test-unit` job does not build, and `pnpm verify` runs `test:unit`
 * *before* `build`. So it skipped on every CI run and, locally, read whatever `dist/sw.js` an
 * earlier build had left lying around — asserting about a worker that was not the one the current
 * source produces. Under this project's own rule a check that did not execute has not passed, and
 * a skipped test in a green suite is exactly the false pass that rule names.
 *
 * The lesson generalises: a unit test cannot assert anything about build output, because the unit
 * layer is defined as the one that does not build. Reach for the post-build audit instead.
 */

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
