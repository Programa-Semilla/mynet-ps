import { defineConfig, devices } from '@playwright/test'

import { WEB_ORIGIN } from './e2e/support/env.js'

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
export default defineConfig({
  testDir: './e2e',

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

  webServer: {
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
})
