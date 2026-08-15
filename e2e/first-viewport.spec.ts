import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'
import { WIDTHS } from './support/destinations.js'

/**
 * T081 (002) — **the first viewport answers the attendee's first question without scrolling**
 * (SC-101, constitution Principle III).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `responsive.spec.ts` covers the horizontal axis — nothing may require sideways scrolling.
 * **Nothing covered the vertical one**, which is where this success criterion actually lives:
 * "the first viewport MUST make the product understandable without scrolling".
 *
 * A layout can satisfy every horizontal obligation and still push the next session below the
 * fold on a 900px-tall desktop window, and no existing gate would notice. This is that gate.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Three things must be above the fold, because they are what make the product legible in one
 * glance: which conference this is, what day of it today is, and what is happening next.
 */

/** True when the element's box lies entirely within the initial viewport height. */
const isAboveTheFold = async (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((sel) => {
    const element = document.querySelector(sel)
    if (!element) return false
    const box = element.getBoundingClientRect()
    // `top >= 0` as well, so an element scrolled *off the top* does not count as visible.
    return box.top >= 0 && box.bottom <= window.innerHeight
  }, selector)

test.describe('first viewport (SC-101)', () => {
  for (const width of WIDTHS) {
    test(`the conference, the day and what is next are all visible at ${width.layout} width`, async ({
      page,
    }) => {
      // A conservative height: a laptop with browser chrome, not a tall external monitor. If it
      // fits here it fits everywhere taller.
      await page.setViewportSize({ width: width.px, height: 720 })
      await page.goto('/')
      await signIn(page, ADA)

      // The page must not already be scrolled — everything below is about the *initial* view.
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

      const greeting = page.locator('[data-card="greeting-day-context"]')
      const upNext = page.locator('[data-card="up-next"]')

      await expect(greeting).toBeVisible()
      await expect(upNext).toBeVisible()

      // The conference name and its day context.
      expect(
        await isAboveTheFold(page, '[data-card="greeting-day-context"]'),
        'The conference name and day context must be in the first viewport without scrolling ' +
          '(SC-101). This is the first thing the attendee reads.',
      ).toBe(true)

      // …and what is happening next, which Principle III ranks above everything else on Home.
      expect(
        await isAboveTheFold(page, '[data-card="up-next"]'),
        'The next session must be in the first viewport without scrolling (SC-101). It is the ' +
          "answer to the attendee's highest-priority question.",
      ).toBe(true)
    })
  }

  test('the conference is identifiable from the top bar before any card loads', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 720 })
    await page.goto('/')
    await signIn(page, ADA)

    // The switcher names the active conference, so "which conference am I in" is answerable
    // from the shell even while the cards are still resolving.
    const switcher = page.getByRole('button', { name: /change conference/i })
    await expect(switcher).toBeVisible()
    expect(await isAboveTheFold(page, 'header')).toBe(true)
  })
})
