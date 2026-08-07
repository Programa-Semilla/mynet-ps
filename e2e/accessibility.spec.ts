import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'
import { DESTINATIONS, WIDTHS } from './support/destinations.js'

/**
 * T068 — automated accessibility scanning (FR-068, SC-005).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Zero critical or serious violations across all five destinations at all three widths.**
 *
 * Run at real viewports in a real browser rather than statically, because the violations that
 * matter here are the ones a static check cannot see: contrast against the rendered palette,
 * focus indicators, and controls that only appear at one width. The prototype passed inspection
 * and still shipped `focus:outline-none` on every input — constitution Principle IV names that
 * a defect, and this is the gate that would have caught it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The lint-level `jsx-a11y` rules are not a substitute and this is not a substitute for them:
 * one reads source, the other reads pixels.
 */

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

/** Critical and serious only — SC-005's threshold, stated as a number rather than a judgement. */
const blocking = (violations: Awaited<ReturnType<typeof scan>>['violations']) =>
  violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

const describeViolations = (violations: Awaited<ReturnType<typeof scan>>['violations']): string =>
  violations
    .map(
      (v) => `${v.impact}: ${v.id} — ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`,
    )
    .join('\n')

test.describe('accessibility', () => {
  test('the sign-in screen has no critical or serious violations', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await expect(page.getByLabel('Password')).toBeVisible()

      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `sign-in at ${width.px}px (${width.layout}):\n${describeViolations(blocking(violations))}`,
      ).toEqual([])
    }
  })

  for (const width of WIDTHS) {
    test(`every destination is clean at ${width.px}px (${width.layout})`, async ({ page }) => {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await signIn(page, ADA)

      for (const destination of DESTINATIONS) {
        await page.goto(destination.path)
        await expect(
          page.getByRole('heading', { name: destination.heading, level: 1 }),
        ).toBeVisible()

        const { violations } = await scan(page)
        expect(
          blocking(violations),
          `${destination.label} at ${width.px}px:\n${describeViolations(blocking(violations))}`,
        ).toEqual([])
      }
    })
  }

  /**
   * T082 (002) — **the controls this feature introduced** (FR-116, Principle IV).
   *
   * The destination sweep above scans pages at rest. The conference switcher is only rendered
   * once opened, so its menu — the one genuinely modal thing 002 adds — would never be scanned
   * by a suite that only visits addresses.
   */
  for (const width of WIDTHS) {
    test(`the open conference menu is clean at ${width.px}px (${width.layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await signIn(page, ADA)

      const trigger = page.getByRole('button', { name: /change conference/i })
      await expect(trigger).toBeVisible()
      await trigger.click()
      await expect(page.getByRole('menu')).toBeVisible()

      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `conference menu at ${width.px}px:\n${describeViolations(blocking(violations))}`,
      ).toEqual([])
    })
  }

  test('Agenda with a full programme is clean', async ({ page }) => {
    // Track chips are the one place 002 adds colour-coded content, and contrast against a tinted
    // chip is exactly what a static check cannot see.
    await page.goto('/')
    await signIn(page, ADA)
    await page.goto('/agenda')
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()

    const { violations } = await scan(page)
    expect(blocking(violations), describeViolations(blocking(violations))).toEqual([])
  })

  test('the not-found view is clean', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await page.goto('/not-a-destination')
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()

    const { violations } = await scan(page)
    expect(blocking(violations), describeViolations(blocking(violations))).toEqual([])
  })
})
