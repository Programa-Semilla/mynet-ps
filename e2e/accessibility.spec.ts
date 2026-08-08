import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn, useConference } from './support/attendees.js'
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

  /**
   * T098 (006) — **Discover with a populated directory, and the profile view over it.**
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The destination sweep above already visits `/discover` at all three widths — and until 006
   * it scanned a placeholder. It now scans a real directory, which is the point: the
   * violations that matter here are the ones only rendered content produces. Contrast on the
   * availability chip against its tinted background, the search field's focus ring, and the
   * interest chips are all things a static check cannot see and an empty destination does not
   * have.
   *
   * The profile view needs its own scan for the reason the conference menu does: it is a
   * `<dialog>` that only exists once opened, so a suite that visits addresses at rest would
   * never look at it — and a modal is precisely where a missing accessible name or an
   * unreachable close control does the most harm.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('Discover with a populated directory is clean', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned. The active conference is durable and earlier specs switch it — `useConference`
    // records the run that taught us. Without this these pass only because this file happens to
    // sort first, and a rename or a shard split turns them into failures from another file.
    await useConference(page, 'Product & Design Summit')
    await page.goto('/discover')
    // Awaited on a CARD rather than on the heading: the heading renders while the directory is
    // still loading, so scanning too early would scan a spinner and report it clean.
    await expect(page.getByRole('heading', { name: 'Grace Hopper', level: 3 })).toBeVisible()

    const { violations } = await scan(page)
    expect(blocking(violations), describeViolations(blocking(violations))).toEqual([])
  })

  for (const width of WIDTHS) {
    test(`the open profile view is clean at ${width.px}px (${width.layout})`, async ({ page }) => {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await signIn(page, ADA)
      await page.goto('/discover')

      await page.getByRole('heading', { name: 'Grace Hopper', level: 3 }).getByRole('link').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: 'Grace Hopper', level: 2 }),
      ).toBeVisible()

      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `profile view at ${width.px}px:\n${describeViolations(blocking(violations))}`,
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T083 (005) — the surfaces this feature adds, at all three widths.
   *
   * Three of them are new *kinds* of thing for this product rather than more of the same:
   *
   *   - **the first true modal**, which is where focus confinement, background inertness and
   *     Escape all have to be right at once, and which the register names as a settled
   *     requirement the prototype failed;
   *   - **a segmented control built from visually suppressed radios**, which is the classic way
   *     to lose a focus indicator without removing one — the ring draws around a box with no
   *     extent;
   *   - **a free-text editor with a live status region**, announced rather than coloured.
   *
   * Scanned at every width because a control that only appears at one width is exactly what a
   * single-viewport sweep misses.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  for (const width of WIDTHS) {
    test(`the Agenda filter and save controls are clean at ${width.px}px (${width.layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await signIn(page, ADA)
      await page.goto('/agenda')
      await expect(page.getByRole('radio', { name: 'All sessions' })).toBeAttached()

      const all = await scan(page)
      expect(
        blocking(all.violations),
        `Agenda, All filter at ${width.px}px:\n${describeViolations(blocking(all.violations))}`,
      ).toEqual([])

      // The Saved view with its empty state, which is what a reviewer sees first.
      await page.getByRole('radio', { name: 'Saved' }).check()
      await expect(page.getByText(/nothing saved yet/i)).toBeVisible()

      const saved = await scan(page)
      expect(
        blocking(saved.violations),
        `Agenda, Saved filter at ${width.px}px:\n${describeViolations(blocking(saved.violations))}`,
      ).toEqual([])
    })

    test(`the session detail panel is clean at ${width.px}px (${width.layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await signIn(page, ADA)
      await page.goto('/agenda')

      await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('textbox', { name: /private notes/i })).toBeVisible()

      // The whole page, not only the dialog: a modal that is correct in isolation can still
      // leave the background reachable, and axe reads the document as the browser presents it.
      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `session panel at ${width.px}px:\n${describeViolations(blocking(violations))}`,
      ).toEqual([])
    })
  }

  test('the note editor is clean with a failure showing', async ({ page, context }) => {
    // The failure state carries an alert, a retry button and red-on-tinted text — the one
    // combination in this feature where contrast is most likely to fall short, and one that a
    // scan of the happy path would never reach.
    await page.goto('/')
    await signIn(page, ADA)
    await page.goto('/agenda')
    await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await context.setOffline(true)
    try {
      await page.getByRole('textbox', { name: /private notes/i }).fill('Written with no signal.')
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })

      const { violations } = await scan(page)
      expect(blocking(violations), describeViolations(blocking(violations))).toEqual([])
    } finally {
      await context.setOffline(false)
    }
  })

  test('Home is clean with the saved-session card present', async ({ page }) => {
    // 005 appends a card to the first viewport, which Principle III makes a success criterion.
    await page.goto('/')
    await signIn(page, ADA)
    await expect(page.getByRole('region', { name: 'Next saved session' })).toBeVisible()

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
