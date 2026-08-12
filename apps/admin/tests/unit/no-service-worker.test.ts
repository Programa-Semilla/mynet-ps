import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T013 (011) — **the administrative product is not installable and has no offline behaviour**
 * (FR-923, research R1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ABSENCE THAT SEPARATES THE TWO PRODUCTS, AND IT IS ENFORCED FROM THREE SIDES.**
 *
 *   1. `vite.config.ts` loads no `VitePWA` plugin, so no manifest and no worker are emitted.
 *   2. `mynet/no-direct-platform-access` reports `serviceWorker` as a capability reference —
 *      but only where it resolves as a global, and only outside `main.tsx`, which is the one
 *      file that rule is switched off in.
 *   3. **This test**, which reads the source as text and therefore catches the cases the other
 *      two cannot: a dynamic import, a string handed to a helper, a `virtual:pwa-register`
 *      import that would fail to typecheck only because the plugin is absent today.
 *
 * Three mechanisms for one absence is more than this codebase usually spends. It is justified
 * because Principle VI's obligation — an installable, offline-capable PWA — is *product-wide* in
 * the constitution and was scoped to the attendee product only by v4.1.0. Somebody reading
 * Principle VI without that context would add a worker here believing they were fixing a gap.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Why an offline admin product would be wrong, not merely unnecessary.** An operator acting on
 * stale conference state is a different kind of error from an attendee reading a stale agenda:
 * resolving a report twice, promoting somebody who has withdrawn, or removing a question that is
 * already gone. 008's caching defect and 009's refusal to decorate at all are the same
 * reasoning applied to reads; this applies it to the whole product.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const adminSrc = fileURLToPath(new URL('../../src/', import.meta.url))
const adminRoot = fileURLToPath(new URL('../../', import.meta.url))

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** 009's stripper. The words below appear throughout the comments explaining their absence. */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const files = sourceFiles(adminSrc)

const offenders = (pattern: RegExp): string[] =>
  files
    .filter((path) => pattern.test(codeOnly(path)))
    .map((path) => path.slice(adminSrc.length))
    .sort()

describe('011 — the administrative client registers no service worker', () => {
  it('found source files to scan', () => {
    expect(files.length).toBeGreaterThan(2)
  })

  it('names no service worker API (FR-923)', () => {
    expect(
      offenders(/\bserviceWorker\b|\bregisterSW\b|\bworkbox\b/i),
      'The administrative client references a service worker. It is not installable and has no ' +
        'offline behaviour (FR-923) — and an operator acting on stale state is a different kind ' +
        'of error from an attendee reading a stale agenda.',
    ).toEqual([])
  })

  it('imports no PWA virtual module (FR-923)', () => {
    expect(
      offenders(/virtual:pwa-register|vite-plugin-pwa/),
      'The administrative client imports a PWA virtual module. `vite.config.ts` deliberately ' +
        'loads no such plugin, so this would be a build error today — the assertion exists so ' +
        'that adding the plugin back does not make it quietly correct.',
    ).toEqual([])
  })

  it('declares no web app manifest (FR-923)', () => {
    const html = readFileSync(join(adminRoot, 'index.html'), 'utf8').replace(
      /<!--[\s\S]*?-->/g,
      ' ',
    )
    expect(
      /rel\s*=\s*["']manifest["']|apple-touch-icon|apple-mobile-web-app/i.test(html),
      'The administrative document declares a manifest or an iOS install hint. There is no ' +
        'install for this product, and research R1 chose a separate application precisely so ' +
        'that this is a document with nothing to exclude.',
    ).toBe(false)
  })

  it('loads no PWA plugin in its build (FR-923)', () => {
    const config = readFileSync(join(adminRoot, 'vite.config.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
    expect(
      /VitePWA|vite-plugin-pwa/.test(config),
      'The administrative build loads the PWA plugin. Its absence is what makes FR-923 ' +
        'structural rather than configured (research R1).',
    ).toBe(false)
  })
})
