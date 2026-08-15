import { defineConfig, devices } from '@playwright/test'

import { ADMIN_ORIGIN, WEB_ORIGIN } from './e2e/support/env.js'

/**
 * End-to-end and accessibility configuration (FR-068, SC-005).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **These run against a production build served by `vite preview`, not the dev server.**
 *
 * The dev server would be faster, and wrong. Two of this slice's obligations only exist in the
 * built artifact: the service worker and its precache manifest (FR-051, FR-055) are not
 * produced in development, and the asset budget (FR-072) is a property of the bundle. An
 * end-to-end suite that passes against something the attendee never receives is the "gate that
 * does not fail when broken" SC-010 warns about.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The API is deliberately **not** a `webServer` entry. `e2e/support/api-process.ts` owns it,
 * because SC-003's redeployment clause requires restarting it from inside a test.
 */
/**
 * Whether this run is the screenshot capture tool rather than the test suite.
 *
 * Exact match, and never in CI: substituting the suite is a thing a person does deliberately at a
 * terminal, not something an inherited environment should be able to do to a verification run.
 */
const capturingScreenshots = ((): boolean => {
  const flag = process.env['CAPTURE_SCREENSHOTS']
  if (flag === undefined) return false

  if (flag !== '1') {
    throw new Error(
      `CAPTURE_SCREENSHOTS must be exactly "1" to run the capture tool; got "${flag}". ` +
        `Any other value would silently replace the end-to-end suite.`,
    )
  }
  if (process.env['CI']) {
    throw new Error(
      'CAPTURE_SCREENSHOTS is set in CI. The capture tool writes files into the working tree and ' +
        'asserts nothing; it must never stand in for the end-to-end suite on a verification run.',
    )
  }
  return true
})()

export default defineConfig({
  testDir: './e2e',

  /**
   * T051 (010) — **the screenshot capture tool is never part of the suite.**
   *
   * `e2e/support/capture-screenshots.ts` regenerates the manifest's install-prompt images. It is
   * written as a Playwright test because that is what gives it a browser, a built client, a
   * running API and a seeded database in one command — but it asserts nothing about the product
   * and it *writes files into the repository*, so running it as a gate would rewrite committed
   * assets on every verification.
   *
   * Switching `testMatch` rather than skipping it inside the file is deliberate. A permanently
   * skipped test in the suite reads as a disabled gate, and under this project's rules a check
   * that did not execute has not passed. This way the capture tool is simply **not a test** on
   * any ordinary run, and the suite is not a test on a capture run.
   *
   *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test
   *
   * **The flag is compared to `'1'` exactly, and refused outright in CI.** Branching on
   * truthiness would make `CAPTURE_SCREENSHOTS=0` and `=false` both replace the entire suite —
   * and the suite that would vanish is the one carrying this project's cross-attendee isolation
   * evidence. A stale exported variable or a copied CI matrix entry could turn `pnpm verify`
   * green while executing none of it, which is the same "check that did not run reporting
   * success" that `forbidOnly` below exists to prevent for the narrower `.only` case.
   */
  testMatch: capturingScreenshots ? '**/capture-screenshots.ts' : '**/*.spec.@(ts|js)',

  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',

  // Specs share one seeded database and one API. Running files in parallel would let one
  // spec's sign-out revoke a session another is mid-way through using.
  fullyParallel: false,
  workers: 1,

  // A `.only` left in a spec silently narrows the suite to one test while still reporting
  // green — precisely the "check that did not execute reporting success" FR-064 forbids.
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,

  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: WEB_ORIGIN,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * 011 — **TWO SERVERS, BECAUSE THERE ARE TWO PRODUCTS ON TWO ORIGINS.**
   *
   * Both build before they serve, and neither reuses an existing server, for the reason the web
   * entry has always given: reusing one that is already listening silently skips the build and
   * tests the previous run's bundle — not a slow feedback loop but a wrong answer.
   *
   * The administrative entry is a **second origin** rather than a path on the first, which is the
   * local stand-in for `admin.<host>` (decision 37). `e2e/support/env.ts` records what the port
   * reproduces and what it does not.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  webServer: [
    {
      command: 'pnpm --filter @mynet/web build && pnpm --filter @mynet/web preview --strictPort',
      url: WEB_ORIGIN,
      // Generous because the command includes a production build.
      timeout: 240_000,
      // **Never reuse.** The command above builds and then serves, so reusing a server that is
      // already listening silently skips the build and tests the previous run's bundle. That is
      // not a slow feedback loop, it is a wrong answer: a change can appear to fail after it was
      // fixed, or — far worse — appear to pass after it was broken. The few seconds a rebuild
      // costs are the price of the suite meaning what it says (SC-010).
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command:
        'pnpm --filter @mynet/admin build && pnpm --filter @mynet/admin preview --strictPort',
      url: ADMIN_ORIGIN,
      timeout: 240_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
