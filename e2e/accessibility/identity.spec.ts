import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from '../support/attendees.js'

/**
 * T128 (004) — axe over every surface this feature adds (SC-310).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS WHERE VISIBLE FOCUS AND CONTRAST ARE ACTUALLY CHECKED.**
 *
 * The component suite asserts the accessibility *tree* — names, bindings, announced reasons —
 * because that is what jsdom can decide. It cannot see a focus ring, cannot compute contrast,
 * and cannot tell whether a control is reachable at 320px. Those are properties of a rendered
 * page, and this is the only place in the project that has one.
 *
 * Run against a **production build**, like the rest of the end-to-end suite: an accessibility
 * result from something the attendee never receives is worth nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** WCAG 2.1 A and AA, matching the axe checks elsewhere in this project. */
const scan = async (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

test.describe('the surfaces 004 introduces are accessible', () => {
  test.describe('without a session', () => {
    for (const [name, path] of [
      ['sign-up', '/sign-up'],
      ['reset request', '/reset-password-request'],
      ['reset password', '/reset-password?token=not-a-real-token'],
      ['verify', '/verify?token=not-a-real-token'],
    ] as const) {
      test(`${name} has no detectable violations`, async ({ page }) => {
        await page.goto(path)
        // Waits for the surface rather than scanning a blank document — a clean scan of nothing
        // is the "gate that passes while checking nothing" this codebase warns about.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const results = await scan(page)
        expect(results.violations).toEqual([])
      })
    }
  })

  test.describe('inside the shell', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await signIn(page, ADA)
    })

    for (const [name, path, heading] of [
      ['join a conference', '/join', /join a conference/i],
      ['profile', '/profile', /your profile/i],
      ['profile editor', '/profile/edit', /edit your profile/i],
      ['account', '/account', /your account/i],
    ] as const) {
      test(`${name} has no detectable violations`, async ({ page }) => {
        await page.goto(path)
        // `level: 1` because these surfaces contain section headings that also match — the
        // account page has "Delete your account" under "Your account". Without it the locator is
        // ambiguous once the profile has loaded, which the code-split chunks made the common
        // case rather than the rare one.
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()

        const results = await scan(page)
        expect(results.violations).toEqual([])
      })
    }

    test('the deletion confirmation is accessible while open', async ({ page }) => {
      await page.goto('/account')
      await page.getByRole('button', { name: /delete my account/i }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // A modal is the surface where accessibility failures are least recoverable: everything
      // behind it is inert, so a keyboard user who cannot reach its controls is stuck.
      const results = await scan(page)
      expect(results.violations).toEqual([])
    })

    test('the deletion confirmation returns focus to its opener on Escape', async ({ page }) => {
      await page.goto('/account')
      const opener = page.getByRole('button', { name: /delete my account/i })
      await opener.click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()

      // `<dialog>` does not restore focus reliably, which is why the component does it
      // explicitly — and why it is asserted in a real browser rather than in jsdom.
      await expect(opener).toBeFocused()
    })

    test('every new surface is reachable and operable at 320px', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 })

      for (const path of ['/join', '/profile', '/profile/edit', '/account']) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        // SC-309 — no content or primary action may require horizontal scrolling.
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        )
        expect(overflows, `${path} scrolls horizontally at 320px`).toBe(false)
      }
    })
  })
})
