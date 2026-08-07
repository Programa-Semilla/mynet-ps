import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn, switchToAnotherConference } from './support/attendees.js'
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

  test('a destination change is announced to assistive technology', async ({ page }) => {
    await signedIn(page)

    // FR-022 — a single-page navigation is silent without this. The live region is the only
    // thing that tells a screen-reader user their activation did anything at all.
    const announcer = page.locator('[aria-live="polite"][aria-atomic="true"]')

    for (const destination of DESTINATIONS.slice(1)) {
      await page.getByRole('link', { name: destination.label }).click()
      await expect(announcer).toContainText(destination.label)
    }

    await page.goto('/not-a-destination')
    await expect(announcer).toContainText('Page not found')
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

  /**
   * T083 (002) — **arrive → read what is next → switch → read what is next again, by keyboard
   * alone** (SC-108, FR-116).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * The journey above walks the five destinations. This walks the one 002 actually adds, and it
   * is the journey quickstart.md Scenario 7 describes: the switcher is the first genuinely modal
   * control in the product, and a menu that can only be opened with a pointer is a menu half the
   * conference cannot use.
   *
   * Focus must remain visible at every stop, which is the requirement the prototype failed
   * outright with `focus:outline-none`.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  test('the arrive-read-switch-read journey works by keyboard alone', async ({ page }) => {
    await signedIn(page)

    // Arrive: Home names a conference and what is happening next.
    await expect(page.locator('[data-card="greeting-day-context"]')).toBeVisible()
    await expect(page.locator('[data-card="up-next"]')).toBeVisible()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Compared on the greeting card, which always carries the conference name and location.
    // The up-next card was the obvious choice and is a time bomb: the seed uses fixed absolute
    // dates, and from 2026-10-08 both of Ada's conferences are in the past, so both render the
    // same "Nothing further today" string and the comparison fails for calendar reasons rather
    // than product ones.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const before = await page.locator('[data-card="greeting-day-context"]').textContent()

    // Switch, without touching the pointer.
    const trigger = page.getByRole('button', { name: /change conference/i })
    await tabTo(page, trigger)
    await expect(trigger).toBeFocused()

    const outline = await trigger.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.outlineWidth, style: style.outlineStyle }
    })
    expect(outline.style, 'the switcher must show a visible focus ring').not.toBe('none')
    expect(parseFloat(outline.width)).toBeGreaterThan(0)

    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()

    // Which conference we are actually in — read, not assumed. An explicit choice is durable
    // (FR-104) and the database is seeded once per run, so an earlier test may already have
    // switched.
    const startingLabel = (await trigger.getAttribute('aria-label')) ?? ''
    const target = ADA.events.find((name) => !startingLabel.includes(name))
    if (!target) throw new Error(`No conference to switch to from "${startingLabel}".`)

    // Escape first, to prove dismissal does not change the selection (FR-116).
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAccessibleName(startingLabel)

    // Then genuinely switch, by keyboard.
    await page.keyboard.press('Enter')
    const other = page.getByRole('menuitemradio', { name: new RegExp(target) })
    await tabTo(page, other)
    await page.keyboard.press('Enter')

    await expect(trigger).toHaveAccessibleName(new RegExp(target))

    // Read what is next again — and it must have changed, because SC-107 makes the two
    // programmes disjoint. Identical content here would mean a surface kept the old conference.
    await expect(page.locator('[data-card="up-next"]')).toBeVisible()
    await expect.poll(() => page.locator('[data-card="up-next"]').textContent()).not.toBe(before)
  })

  test('a conference switch leaves the browser address unchanged (FR-119)', async ({ page }) => {
    await signedIn(page)
    await page.goto('/agenda')
    const before = new URL(page.url()).pathname

    await switchToAnotherConference(page, ADA)

    // The active conference travels in requests, never in the address.
    expect(new URL(page.url()).pathname).toBe(before)
  })

  test('every conference-scoped surface follows a switch (SC-102)', async ({ page }) => {
    await signedIn(page)
    await page.goto('/agenda')

    // Capture what is actually on screen, not just its length. SC-102 requires that **no
    // surface still shows the previous conference** — `.not.toBe(before)` is satisfied by a
    // regression that appends the new programme to the old one, or leaves a single stale row.
    // SC-107's disjointness is exactly what makes the stronger assertion cheap.
    // `allTextContents()` does not auto-wait, so wait for the programme to render before
    // capturing it — otherwise this samples an empty page and asserts nothing.
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
    const titlesBefore = await page.getByRole('heading', { level: 3 }).allTextContents()
    expect(titlesBefore.length, 'the programme must be visible before switching').toBeGreaterThan(0)

    const target = await switchToAnotherConference(page, ADA)

    // The new programme renders — and is genuinely non-empty. Without this guard every
    // assertion below is satisfied by an Agenda that blanks after the switch, which is a
    // regression rather than a pass.
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
    const titlesAfter = await page.getByRole('heading', { level: 3 }).allTextContents()
    expect(titlesAfter.length, 'the new conference must render a programme').toBeGreaterThan(0)
    expect(
      titlesAfter.filter((title) => titlesBefore.includes(title)),
      'no session from the previous conference may survive the switch',
    ).toEqual([])

    // …and not one session from the previous conference survives anywhere on the page.
    for (const title of titlesBefore) {
      await expect(
        page.locator('main'),
        `"${title}" belongs to the previous conference and is still on screen after the switch`,
      ).not.toContainText(title)
    }

    // And Home, which was never remounted, agrees.
    await page.goto('/')
    await expect(page.getByRole('button', { name: /change conference/i })).toHaveAccessibleName(
      new RegExp(target),
    )
  })

  test('the developer instance legend is absent from a production build', async ({ page }) => {
    // This suite runs against `vite preview`, so this is a claim about the bundle an attendee
    // actually receives — not about the source. The legend is injected by a `serve`-only Vite
    // plugin and nothing in `src/` imports it; if either of those ever changes, this catches it.
    await page.goto('/')
    await expect(page.locator('[data-dev-legend]')).toHaveCount(0)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The DOM assertion alone is not enough, and that was found by breaking it.**
    //
    // Removing the plugin's `apply: 'serve'` makes it inject `<script src="/src/dev/mount.tsx">`
    // into the built HTML. That path does not exist in `dist`, so the browser 404s, nothing
    // mounts, and the check above passes — while the shipped page requests a file that is not
    // there. A gate that passes on a broken build is not a gate.
    //
    // Any `/src/` reference in built HTML means unbundled source was injected, which in this
    // application can only be development scaffolding.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(await page.content()).not.toContain('/src/')
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
