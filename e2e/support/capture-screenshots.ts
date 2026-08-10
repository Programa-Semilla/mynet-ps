import { mkdir } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import { expect, test } from '@playwright/test'

import { ADA, signIn, useConference } from './attendees.js'

/**
 * T051 (010) — captures the manifest's install-prompt screenshots (FR-815a–FR-815c).
 *
 *     CAPTURE_SCREENSHOTS=1 DATABASE_URL=… pnpm exec playwright test
 *
 * The environment variable is not optional and naming the file is not enough: `playwright.config`
 * switches `testMatch` on it, and a positional filter narrows *within* `testMatch` rather than
 * overriding it — so the documented-looking `playwright test e2e/support/capture-screenshots.ts`
 * exits with "No tests found".
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **These are regenerable by construction, and that is the whole reason this is a script.**
 *
 * A manifest screenshot ages badly: it is a picture of an interface that keeps changing, and a
 * hand-captured one becomes a picture of a product that no longer exists, with nobody able to
 * remake it the same way. Driving the real end-to-end stack means "the screenshots are stale" is
 * a command rather than an afternoon.
 *
 * Nothing new is stood up to do it. `playwright.config.ts` already builds and serves a
 * production client, `global-setup.ts` already migrates and seeds the database, and
 * `attendees.ts` already supplies a signed-in fixture — this reuses all three.
 *
 * **FR-815e falls out for free, and it matters here more than usual.** The only data the
 * end-to-end stack contains is seeded fixture data, so no real address, avatar photograph or
 * message text can reach these images even by accident. This repository is **public**: a
 * committed screenshot is world-readable permanently, and there is no taking one back.
 *
 * They are deliberately **excluded from the precache** (`injectManifest.globIgnores`). The
 * platform fetches them when it shows an install prompt, which is an online act by definition;
 * precaching them would put the largest files in `public/` into every attendee's install
 * download to illustrate a prompt they have already accepted.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * This file lives under `e2e/support/` rather than beside the specs on purpose: it asserts
 * nothing about the product and must never run as part of the suite. It is a tool that happens
 * to be written as a test because that is what gives it a browser, a server and a seeded
 * database in one command.
 */

const OUT = fileURLToPath(new URL('../../apps/web/public/screenshots', import.meta.url))

/**
 * The two form factors a manifest distinguishes.
 *
 * `narrow` is the 390×844 frame the approved prototype is drawn at, so the phone screenshots
 * show the layout the design was reviewed against. `wide` is a desktop viewport — which is
 * **register entry 4 territory**, an unvalidated layout, and these images are the first time it
 * is depicted anywhere the owner will see it.
 */
const FRAMES = [
  { formFactor: 'narrow', width: 390, height: 844 },
  { formFactor: 'wide', width: 1280, height: 800 },
] as const

const SURFACES = [
  { name: 'home', path: '/', heading: 'Home' },
  { name: 'agenda', path: '/agenda', heading: 'Agenda' },
  { name: 'discover', path: '/discover', heading: 'Discover' },
] as const

test.describe('capture manifest screenshots', () => {
  for (const frame of FRAMES) {
    for (const surface of SURFACES) {
      test(`${surface.name} at ${frame.formFactor}`, async ({ page }) => {
        await mkdir(OUT, { recursive: true })

        await page.setViewportSize({ width: frame.width, height: frame.height })
        await page.goto('/')
        await signIn(page, ADA)
        await useConference(page, 'Product & Design Summit')

        await page.goto(surface.path)
        await expect(page.getByRole('heading', { name: surface.heading, level: 1 })).toBeVisible()

        // The brand mark is one of the things these images exist to show, so a capture taken
        // before it painted would defeat the purpose.
        //
        // `:visible` rather than `.first()`: both marks are in the document at every width and
        // CSS hides one of them, so the first in DOM order is the rail's — which at a narrow
        // viewport is precisely the one that is `display: none`.
        await expect(page.locator('[data-brand-mark]:visible')).toHaveCount(1)
        await page.waitForLoadState('networkidle')

        await page.screenshot({
          path: `${OUT}/${surface.name}-${frame.formFactor}.png`,
          // Viewport only. A full-page capture would be an arbitrary height that no longer
          // matches the `sizes` the manifest declares, and the gate would fail it.
          fullPage: false,
        })
      })
    }
  }
})
