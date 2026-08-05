import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'
import { DESTINATIONS, WIDTHS } from './support/destinations.js'

/**
 * T067 — addressability, history, and the not-found view (FR-014, FR-015, SC-007).
 *
 * `GroundZero/requirements.md` describes a single-route demo and the prototype switches
 * destinations through in-memory state. FR-013 overrides that by a recorded owner decision, and
 * this is where the override is held to: five distinct addresses that survive being typed,
 * shared, bookmarked, and traversed with the browser's own back and forward buttons.
 */

const signedIn = async (page: Page): Promise<void> => {
  await page.goto('/')
  await signIn(page, ADA)
}

/** The region a destination renders, identified by its heading (FR-023). */
const destinationHeading = (page: Page, label: string) =>
  page.getByRole('heading', { name: label, level: 1 })

test.describe('navigation', () => {
  test('every destination is reachable from the navigation, at every width', async ({ page }) => {
    await signedIn(page)

    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.px, height: 900 })

      for (const destination of DESTINATIONS) {
        // Exactly one navigation is displayed at any width, so an unqualified role query finds
        // the right one without the test needing to know which form that is.
        await page.getByRole('link', { name: destination.label }).click()

        await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(destination.path)}$`))
        await expect(destinationHeading(page, destination.heading)).toBeVisible()
      }
    }
  })

  test('opening a destination address directly renders it without passing through Home', async ({
    page,
  }) => {
    await signedIn(page)

    for (const destination of DESTINATIONS) {
      // A fresh load at the address, not a click. FR-014's "without first passing through Home"
      // is what makes a shared link land where it says it will.
      await page.goto(destination.path)

      await expect(destinationHeading(page, destination.heading)).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(destination.path)}$`))

      // The navigation state matches the address it was opened at (FR-014).
      await expect(page.getByRole('link', { name: destination.label })).toHaveAttribute(
        'aria-current',
        'page',
      )
    }
  })

  test('history traversal keeps the address and the displayed destination consistent', async ({
    page,
  }) => {
    await signedIn(page)

    const visited = DESTINATIONS.slice(1)
    for (const destination of visited) {
      await page.getByRole('link', { name: destination.label }).click()
      await expect(destinationHeading(page, destination.heading)).toBeVisible()
    }

    // SC-007 — in 100% of transitions. Walking all the way back, then all the way forward,
    // asserting both halves at every stop rather than only at the ends.
    for (const destination of [...visited].reverse().slice(1)) {
      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(destination.path)}$`))
      await expect(destinationHeading(page, destination.heading)).toBeVisible()
    }

    for (const destination of visited.slice(1)) {
      await page.goForward()
      await expect(page).toHaveURL(new RegExp(`${escapeForRegExp(destination.path)}$`))
      await expect(destinationHeading(page, destination.heading)).toBeVisible()
    }
  })

  test('an address matching no destination shows a not-found view inside the shell', async ({
    page,
  }) => {
    await signedIn(page)
    await page.goto('/not-a-destination')

    // FR-015 — recognisable, *within the shell*, and offering a route back to Home. Never a
    // blank screen and never a bare browser error page.
    await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
    await expect(page.getByRole('navigation')).toBeVisible()

    await page.getByRole('link', { name: 'Go to Home' }).click()
    await expect(destinationHeading(page, DESTINATIONS[0]!.heading)).toBeVisible()
  })

  test('an unauthenticated visitor opening a destination address is asked to sign in', async ({
    page,
  }) => {
    // FR-025 — the guard applies to every address, not only to the entry view. A shared link to
    // /network must not render attendee data to somebody who has not signed in.
    for (const destination of DESTINATIONS) {
      await page.goto(destination.path)
      await expect(page.getByLabel('Password')).toBeVisible()
      await expect(destinationHeading(page, destination.heading)).toHaveCount(0)
    }
  })

  test('the complete journey across all five destinations works by keyboard alone', async ({
    page,
  }) => {
    await signedIn(page)

    for (const destination of DESTINATIONS.slice(1)) {
      // Tabbed to, not focused programmatically. `:focus-visible` deliberately does not match a
      // script-driven `.focus()` — Chromium reserves the ring for keyboard interaction — so
      // asserting against `element.focus()` would test a state no attendee ever sees, and would
      // fail even on a perfectly accessible page.
      const link = page.getByRole('link', { name: destination.label })
      await tabTo(page, link)

      // SC-004 — a visible focus indicator at 100% of stops. `:focus-visible` in tokens.css
      // supplies it globally; this asserts nothing has removed it.
      await expect(link).toBeFocused()
      const outline = await link.evaluate((element) => {
        const style = getComputedStyle(element)
        return { width: style.outlineWidth, style: style.outlineStyle }
      })
      expect(outline.style).not.toBe('none')
      expect(parseFloat(outline.width)).toBeGreaterThan(0)

      await page.keyboard.press('Enter')
      await expect(destinationHeading(page, destination.heading)).toBeVisible()
    }
  })
})

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Presses Tab until the given locator holds focus.
 *
 * The bound is generous but finite: a control that cannot be reached by Tab at all is the defect
 * SC-004 exists to catch, and this must fail rather than loop forever.
 */
const tabTo = async (page: Page, target: ReturnType<Page['getByRole']>): Promise<void> => {
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Could not reach the control with the keyboard within 30 Tab presses.')
}
