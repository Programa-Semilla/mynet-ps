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
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

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
      await page.getByRole('radio', { name: 'My agenda' }).check()
      await expect(page.getByText(/nothing on your agenda yet/i)).toBeVisible()

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

  /**
   * T083 (009) — **the Q&A section with content, and with its nested dialog open.**
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * The panel scan above already covers this section, but only in its **empty** state — no list,
   * no upvote controls, no withdrawal control and no second dialog. Those are where this
   * feature's accessibility risk actually is: a toggle whose pressed state is conveyed to
   * assistive technology, a label composed from two elements, and a `<dialog>` opened on top of
   * an already-modal one, which is the arrangement most likely to leave the background reachable.
   *
   * Scanned at mobile, where the controls are tightest and contrast is most likely to fall short.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  test('the Q&A section is clean with questions and an open confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')
    await page.goto('/agenda')

    await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const question = `An accessible question. ${Date.now()}`
    await page.getByRole('textbox', { name: /ask a question/i }).fill(question)
    await page.getByRole('button', { name: /post question/i }).click()
    await expect(page.getByText(question, { exact: true })).toBeVisible()

    const populated = await scan(page)
    expect(
      blocking(populated.violations),
      `Q&A with a question:
${describeViolations(blocking(populated.violations))}`,
    ).toEqual([])

    // …and with the withdrawal confirmation open on top of the panel. Two dialogs in the top
    // layer at once is the state no other test in this file reaches.
    await page
      .getByRole('button', { name: /^withdraw$/i })
      .first()
      .click()
    await expect(page.getByRole('dialog', { name: /withdraw this question/i })).toBeVisible()

    const nested = await scan(page)
    expect(
      blocking(nested.violations),
      `Q&A with a nested confirmation:
${describeViolations(blocking(nested.violations))}`,
    ).toEqual([])
  })

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
    await expect(page.getByRole('region', { name: 'Next on your programme' })).toBeVisible()

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

  /**
   * T139 (007) — **Messages, its thread, its composer and both safety dialogs** (FR-582, FR-583,
   * FR-584, SC-515).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The destination sweep above visits `/messages` at all three widths, and until 007 it scanned
   * a placeholder. It now scans a real two-pane workspace — but the sweep alone would still miss
   * the three surfaces where a violation does the most harm, because none of them exists at rest:
   *
   *   - **The open thread**, whose message bubbles are the one place this feature adds
   *     colour-carried meaning (a sent message on the accent, a received one on the surface).
   *     Contrast on those is exactly what a static check cannot see.
   *   - **The block and report dialogs**, which are modals — the surface where a missing
   *     accessible name or an unreachable close control is worst, and the one the prototype got
   *     wrong outright (Principle IV names it a defect, not an open question).
   *
   * The report dialog is scanned with its confirmation **disabled**, which is its ordinary state
   * on opening (FR-546): a disabled control still has to be named and still has to be reachable.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('Messages with a real conversation is clean', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')
    await page.goto('/messages')

    // Awaited on a row rather than on the heading: the heading renders while the list is still
    // loading, so scanning too early would scan a spinner and report it clean.
    await expect(page.locator('a[href^="/messages/"]').first()).toBeVisible()

    const { violations } = await scan(page)
    expect(blocking(violations), describeViolations(blocking(violations))).toEqual([])
  })

  for (const width of WIDTHS) {
    test(`the open thread and its composer are clean at ${width.px}px (${width.layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: width.px, height: 900 })
      await page.goto('/')
      await signIn(page, ADA)
      await useConference(page, 'Product & Design Summit')
      await page.goto('/messages')

      await page.locator('a[href^="/messages/"]').first().click()
      await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()

      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `open thread at ${width.px}px:\n${describeViolations(blocking(violations))}`,
      ).toEqual([])
    })
  }

  for (const dialog of [
    { control: /^block /i, heading: /^block /i, label: 'block confirmation' },
    { control: /^report /i, heading: /^report /i, label: 'report dialog' },
  ]) {
    test(`the ${dialog.label} is clean`, async ({ page }) => {
      await page.goto('/')
      await signIn(page, ADA)
      await useConference(page, 'Product & Design Summit')
      await page.goto('/messages')

      await page.locator('a[href^="/messages/"]').first().click()
      await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()

      await page.getByRole('button', { name: dialog.control }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('dialog').getByRole('heading')).toHaveText(dialog.heading)

      const { violations } = await scan(page)
      expect(
        blocking(violations),
        `${dialog.label}:\n${describeViolations(blocking(violations))}`,
      ).toEqual([])
    })
  }

  /**
   * T139 (007) — **the block-management list on the account surface** (FR-541a).
   *
   * It lives beside "who can find me" rather than as a sixth destination, so the destination
   * sweep never reaches it. Scanned in its **empty** state, which is the one almost every
   * account is in and therefore the one nearly every reader sees.
   */
  test('the block list on the account surface is clean', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await page.goto('/account')

    await expect(page.getByRole('heading', { name: /people you have blocked/i })).toBeVisible()

    const { violations } = await scan(page)
    expect(blocking(violations), describeViolations(blocking(violations))).toEqual([])
  })
})
