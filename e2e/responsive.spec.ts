import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'
import { DESTINATIONS, SCROLL_WIDTHS, WIDTHS } from './support/destinations.js'

/**
 * T080, T081 — the responsive obligations, asserted rather than reviewed
 * (FR-019, FR-020, FR-024, SC-006).
 *
 * Every requirement here failed in the prototype, which is a fixed 390×844 phone frame centred
 * on a navy page: there is no desktop layout, no tablet layout, and nothing that reflows. The
 * assertions below are what stop that shape from coming back.
 */

const signedIn = async (page: Page): Promise<void> => {
  await page.goto('/')
  await signIn(page, ADA)
}

/** How far the document can be scrolled sideways. Must be zero at every width (FR-020). */
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      // The widest element that sticks out, to make a failure diagnosable rather than just red.
      widest: [...document.querySelectorAll('*')]
        .map((element) => ({
          selector:
            element.tagName.toLowerCase() +
            (element.id ? `#${element.id}` : '') +
            (typeof element.className === 'string' && element.className
              ? `.${element.className.split(/\s+/).slice(0, 3).join('.')}`
              : ''),
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .filter((entry) => entry.right > doc.clientWidth + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 3),
    }
  })

test.describe('responsive layout', () => {
  test('no destination requires horizontal scrolling at any width from 320px', async ({ page }) => {
    await signedIn(page)

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })

      for (const destination of DESTINATIONS) {
        await page.goto(destination.path)
        await expect(
          page.getByRole('heading', { name: destination.heading, level: 1 }),
        ).toBeVisible()

        const { overflow, widest } = await horizontalOverflow(page)
        expect(
          overflow,
          `${destination.label} overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
        ).toBeLessThanOrEqual(0)
      }
    }
  })

  /**
   * T080 (002) — **the top bar now carries a conference switcher as well** (FR-020, SC-006).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * At 320px that row holds the product name, the conference name, the attendee's name and the
   * sign-out control. It is the tightest row in the product, and the one most likely to push
   * the page sideways — which is why the switcher truncates and the attendee's name is hidden
   * below the tablet band rather than everything being allowed to shrink equally.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  test('the top bar with a conference switcher does not scroll sideways at any width', async ({
    page,
  }) => {
    await signedIn(page)

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByRole('heading', { name: `Hello, ${ADA.displayName}` })).toBeVisible()

      const { overflow, widest } = await horizontalOverflow(page)
      expect(
        overflow,
        `the top bar overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
      ).toBeLessThanOrEqual(0)
    }
  })

  test('the open conference menu does not scroll sideways either', async ({ page }) => {
    await signedIn(page)

    // The mobile presentation is a full-width overlay, which is exactly the shape that overflows
    // if it is given a fixed width instead of being allowed to fit its viewport.
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')

      const trigger = page.getByRole('button', { name: /change conference/i })
      await expect(trigger).toBeVisible()
      await trigger.click()
      await expect(page.getByRole('menu')).toBeVisible()

      const { overflow, widest } = await horizontalOverflow(page)
      expect(
        overflow,
        `the conference menu overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
      ).toBeLessThanOrEqual(0)

      await page.keyboard.press('Escape')
    }
  })

  test('Agenda does not scroll sideways with a full programme at any width', async ({ page }) => {
    await signedIn(page)

    // Agenda carries the longest rows in the product — time, title, track chip, room and
    // speakers on one line — so it is where a min-width mistake shows first.
    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/agenda')
      await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()

      const { overflow, widest } = await horizontalOverflow(page)
      expect(
        overflow,
        `Agenda overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
      ).toBeLessThanOrEqual(0)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T087, T088, T089 (005) — the session detail panel, **measured** at all three bands
   * (FR-199, SC-211).
   *
   * The panel is the first overlay in the product and the first element rendered in the
   * browser's **top layer**, which is outside the page's normal flow and therefore outside
   * every layout assumption the tests above encode. It also inherits a user-agent
   * `max-width: calc(100% - 6px - 2em)` that no class of ours overrides by accident — which is
   * how a "full-width" mobile sheet turned out to be 282px on a 320px screen until a
   * measurement said so.
   *
   * Component tests cannot reach any of this: jsdom applies no user-agent stylesheet and
   * computes no layout. This is the assertion.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('the session detail panel does not scroll sideways at any width', async ({ page }) => {
    await signedIn(page)

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/agenda')
      await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
      await expect(page.getByRole('dialog')).toBeVisible()

      const { overflow, widest } = await horizontalOverflow(page)
      expect(
        overflow,
        `the open panel overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
      ).toBeLessThanOrEqual(0)
    }
  })

  test('the panel is a FULL-WIDTH sheet at mobile and a centred overlay above it', async ({
    page,
  }) => {
    await signedIn(page)

    const measure = async (width: number) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/agenda')
      await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      const box = await page.getByRole('dialog').boundingBox()
      return box?.width ?? 0
    }

    // Mobile: essentially the whole viewport. The declared layout is a full-width overlay, and
    // a card with gutters is a different design that nobody chose.
    const mobile = await measure(320)
    expect(mobile, 'the mobile panel must span the viewport').toBeGreaterThan(300)

    // Tablet and desktop: constrained and centred, with the programme visible behind it.
    const tablet = await measure(900)
    expect(tablet, 'the tablet panel must be constrained, not full width').toBeLessThan(900)
    expect(tablet).toBeGreaterThan(320)

    const desktop = await measure(1440)
    expect(desktop, 'the desktop panel must stay a centred overlay').toBeLessThan(1440)
  })

  test('the Agenda filter and save controls are touch-sized at mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await signedIn(page)
    await page.goto('/agenda')
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()

    // FR-197 — 44px is the floor. Measured at 320px, where a target that only *looks* big
    // enough at 375px is actually squeezed.
    for (const name of ['All sessions', 'Saved']) {
      const label = page.getByText(name, { exact: true })
      const box = await label.boundingBox()
      expect(box, name).not.toBeNull()
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44)
    }

    const save = page.getByRole('button', { name: /to your agenda/i }).first()
    const saveBox = await save.boundingBox()
    expect(saveBox).not.toBeNull()
    expect(saveBox!.height, 'save control height').toBeGreaterThanOrEqual(44)
    expect(saveBox!.width, 'save control width').toBeGreaterThanOrEqual(44)
  })

  test('the sign-in screen does not scroll sideways either', async ({ page }) => {
    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByLabel('Password')).toBeVisible()

      const { overflow, widest } = await horizontalOverflow(page)
      expect(
        overflow,
        `sign-in overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
      ).toBeLessThanOrEqual(0)
    }
  })

  test('exactly one navigation form is presented at every width', async ({ page }) => {
    await signedIn(page)

    // FR-019 — no width matches two layouts, and no width matches none. Both halves matter: the
    // second is how a viewport ends up with no way to navigate at all.
    for (const width of [...SCROLL_WIDTHS]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')

      const navigations = page.getByRole('navigation')
      await expect(navigations, `at ${width}px`).toHaveCount(1)

      // And every destination is reachable from whichever form it is.
      for (const destination of DESTINATIONS) {
        await expect(
          page.getByRole('link', { name: destination.label }),
          `${destination.label} at ${width}px`,
        ).toBeVisible()
      }
    }
  })

  test('each width band presents the navigation form its requirement names', async ({ page }) => {
    await signedIn(page)

    for (const width of WIDTHS) {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')

      // FR-016, FR-017, FR-018 — each band's form is identified, so "exactly one navigation"
      // cannot be satisfied by presenting the mobile bar on a 1440px desktop.
      //
      // Identified by `data-nav-layout` rather than by accessible name: all three are announced
      // as "Main" because that is what an attendee should hear. Naming them "Desktop
      // navigation" to make the test easier would degrade the product to suit the test.
      await expect(page.getByRole('navigation'), `at ${width.px}px`).toHaveAttribute(
        'data-nav-layout',
        width.layout,
      )
    }
  })

  test('mobile controls are touch-sized', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await signedIn(page)

    // FR-018 — the token is 44px, which is the floor, not an aspiration.
    for (const destination of DESTINATIONS) {
      const box = await page.getByRole('link', { name: destination.label }).boundingBox()
      expect(box, destination.label).not.toBeNull()
      expect(box!.height, `${destination.label} height`).toBeGreaterThanOrEqual(44)
      expect(box!.width, `${destination.label} width`).toBeGreaterThanOrEqual(44)
    }
  })

  test('content stays within a readable measure on a very wide viewport', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1200 })
    await signedIn(page)

    // The edge case behind T077: without a maximum measure, a 2560px display stretches a line of
    // text across the whole screen and it stops being readable.
    const main = page.getByRole('main')
    const box = await main.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThan(2560)
  })

  test('layout reflows at 200% text zoom without losing content or function', async ({ page }) => {
    await signedIn(page)

    // FR-024 — emulated as a doubled root font size rather than browser zoom, which is what
    // "200% *text* zoom" means: page zoom scales everything and proves nothing about reflow.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })

    for (const destination of DESTINATIONS) {
      await page.goto(destination.path)
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })

      await expect(page.getByRole('heading', { name: destination.heading, level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: destination.label })).toBeVisible()

      const { overflow } = await horizontalOverflow(page)
      expect(overflow, `${destination.label} overflows at 200% text zoom`).toBeLessThanOrEqual(0)
    }
  })

  test('non-essential animation is suppressed when reduced motion is requested', async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })

    try {
      const page = await context.newPage()
      await signedIn(page)

      // FR-024. The rule in tokens.css collapses durations to effectively instant rather than to
      // zero, so transition-end handlers still fire — this asserts the collapse, not removal.
      const durations = await page.evaluate(() =>
        [...document.querySelectorAll('*')].flatMap((element) => {
          const style = getComputedStyle(element)
          return [style.transitionDuration, style.animationDuration]
        }),
      )

      const slow = durations.filter((value) =>
        value.split(',').some((part) => {
          const seconds = part.trim().endsWith('ms')
            ? parseFloat(part) / 1000
            : parseFloat(part) || 0
          return seconds > 0.05
        }),
      )
      expect(slow).toEqual([])
    } finally {
      await context.close()
    }
  })
})
