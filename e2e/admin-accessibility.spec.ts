import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { ALAN, GRACE, SEED_PASSWORD } from './support/attendees.js'
import { ADMIN_DESTINATIONS, WIDTHS } from './support/destinations.js'
import { ADMIN_ORIGIN } from './support/env.js'
import { seedQuestionReport, signInAsOperator } from './support/operators.js'

/**
 * T147 (013) — **automated accessibility scanning for the administrative product** (FR-922,
 * SC-909).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A SECOND APPLICATION NEEDS ITS OWN SCAN, AND SHARING A STYLESHEET IS NOT COVERAGE.**
 *
 * `accessibility.spec.ts` scans MyNet's five destinations. Nothing it does reaches this origin:
 * different routes, different components, a different shell, a rail that is not `DesktopRail`.
 * The two products share `theme/tokens.css` and therefore their colours — which is an argument
 * that contrast *should* pass, and no argument at all about labels, focus order, headings, or
 * a control that only renders at one width.
 *
 * Same threshold as MyNet's, stated as a number rather than a judgement: **zero critical or
 * serious violations**, at all three widths (SC-909).
 *
 * **Dialogs are scanned open.** Four of this product's surfaces are modal dialogs, and a scan of
 * the page behind them says nothing about them — an unlabelled dialog, a heading that is not one,
 * or a control with no accessible name is invisible until the dialog is on screen.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()

const blocking = (violations: Awaited<ReturnType<typeof scan>>['violations']) =>
  violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

const describeViolations = (violations: Awaited<ReturnType<typeof scan>>['violations']): string =>
  violations
    .map(
      (v) => `${v.impact}: ${v.id} — ${v.help}\n    ${v.nodes.map((n) => n.target).join('\n    ')}`,
    )
    .join('\n')

test.describe('administrative accessibility', () => {
  test('the administrative sign-in screen is clean at every width', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto(`${ADMIN_ORIGIN}/`)
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `administrative sign-in at ${width.px}px (${width.layout}):\n` +
          describeViolations(blocking(violations)),
      ).toEqual([])
    }
  })

  for (const width of WIDTHS) {
    test(`every administrative destination is clean at ${width.px}px (${width.layout})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width: width.px, height: 900 } })
      const page = await context.newPage()

      try {
        await signInAsOperator(page)

        for (const destination of ADMIN_DESTINATIONS) {
          await page.goto(`${ADMIN_ORIGIN}${destination.path}`)
          await expect(
            page.getByRole('heading', { name: destination.heading, level: 1 }),
          ).toBeVisible()

          const { violations } = await scan(page)
          expect(
            blocking(violations),
            `${destination.label} at ${width.px}px:\n${describeViolations(blocking(violations))}`,
          ).toEqual([])
        }
      } finally {
        await context.close()
      }
    })
  }

  test('the administrative dialogs are clean while open', async ({ browser }) => {
    test.slow()

    // Its own report, so this file does not depend on another having run. Grace asks and Alan
    // reports, matching every other 011 spec — the block that reporting creates must not land on
    // Ada and Grace, whose card and meeting `network.spec.ts` depends on.
    await seedQuestionReport(
      { email: GRACE.email, password: SEED_PASSWORD },
      { email: ALAN.email, password: SEED_PASSWORD },
      'Product & Design Summit',
    )

    // Desktop only. A dialog's accessibility is a property of its own content — labels, roles,
    // focus — and those do not vary by viewport here; the three widths above cover the layouts.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    try {
      await signInAsOperator(page)

      const scanOpenDialog = async (what: string) => {
        await expect(page.getByRole('dialog')).toBeVisible()
        const { violations } = await scan(page)
        expect(
          blocking(violations),
          `${what} (open):\n${describeViolations(blocking(violations))}`,
        ).toEqual([])
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
      }

      await page.goto(`${ADMIN_ORIGIN}/reports`)
      await page
        .getByRole('link', { name: new RegExp(`reported ${GRACE.displayName}`, 'i') })
        .first()
        .click()

      await page.getByRole('button', { name: /remove this question/i }).click()
      await scanOpenDialog('the question-removal confirmation')

      await page.getByRole('button', { name: /record a resolution/i }).click()
      await scanOpenDialog('the resolution dialog')

      await page.goto(`${ADMIN_ORIGIN}/conferences`)
      await page
        .getByRole('button', { name: /add an organizer/i })
        .first()
        .click()
      await scanOpenDialog('the promotion dialog')

      await page.goto(`${ADMIN_ORIGIN}/operators`)
      await page.getByLabel(/operator identifier/i).fill('00000000-0000-4000-8000-000000000000')
      await page.getByRole('button', { name: /end their access/i }).click()
      await scanOpenDialog('the operator-deactivation confirmation')
    } finally {
      await context.close()
    }
  })
})
