import type { Page } from '@playwright/test'

/**
 * Waits for the service worker to control the page, which is what makes the shell available
 * offline at all. One definition for the two offline suites — the FR-1146 fix was applied to
 * two identical copies in one change, which is the divergence-in-waiting the deep review
 * flagged; a third offline suite imports this rather than pasting a fourth copy.
 *
 * A truthiness check, never `!== null` (T022 — 012, FR-1146): on an engine with no
 * `serviceWorker` at all, `navigator.serviceWorker?.controller` is `undefined`, and
 * `undefined !== null` is TRUE — so the old comparison resolved instantly exactly where there
 * was nothing to wait for, and every offline assertion downstream ran against a page no worker
 * would serve. Wrong on Chromium too: `undefined` is also what an aborted registration yields.
 */
export const awaitServiceWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
    timeout: 20_000,
  })
}
