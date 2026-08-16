import { expect, test, type Locator, type Page } from '@playwright/test'

import { ADA, ALAN, GRACE, SEED_PASSWORD, signIn, useConference } from './support/attendees.js'
import { ADMIN_DESTINATIONS, DESTINATIONS, SCROLL_WIDTHS, WIDTHS } from './support/destinations.js'
import { ADMIN_ORIGIN } from './support/env.js'
import { seedQuestionReport, signInAsOperator } from './support/operators.js'

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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **FIX-403 — HOW FAR ONE ELEMENT CAN BE SCROLLED SIDEWAYS *INSIDE ITSELF*, WHICH IS A DIFFERENT
 * QUESTION FROM THE ONE ABOVE AND THE ONLY ONE THAT CATCHES FIX-4's DEFECT.**
 *
 * `horizontalOverflow` asks whether the *document* scrolls sideways, and an inner
 * `overflow-x-auto` container exists precisely to answer no — it absorbs its own overflow and the
 * page stays exactly as wide as the viewport. That is why the administrative site could ship its
 * only mobile navigation as a horizontally scrolling strip, at every width from 320px up, while
 * the sweep below reported it clean and would have gone on doing so forever.
 *
 * So this measures the container: **its own `scrollWidth` against its own `clientWidth`**. A
 * scroll container cannot mask that, because that difference *is* what it scrolls.
 *
 * `overflowX` comes back too, because the two halves diagnose different mistakes: a positive
 * difference under `visible` is content pushing out of a box, and a positive difference under
 * `auto` or `scroll` is a strip somebody has to swipe.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
const selfOverflow = (element: Locator) =>
  element.evaluate((node) => ({
    overflow: node.scrollWidth - node.clientWidth,
    overflowX: getComputedStyle(node).overflowX,
    // The descendants sticking out past its content box, so a failure names a control rather
    // than a number.
    widest: [...node.querySelectorAll('*')]
      .map((child) => ({
        text: (child.textContent ?? '').trim().slice(0, 24),
        right: Math.round(child.getBoundingClientRect().right),
      }))
      .filter((entry) => entry.right > Math.round(node.getBoundingClientRect().right) + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3),
  }))

/**
 * Centred means the gaps on either side match. Compared with a tolerance rather than for
 * equality because sub-pixel layout and a scrollbar both shift it slightly — and because the
 * failure this catches is not a few pixels off, it is the dialog against the edge.
 *
 * **Module scope so both dialog tests share one definition.** 011 adds four more dialogs on a
 * second origin, and a second copy of this would be a second place for the tolerance and the
 * explanation to drift apart.
 */
const expectCentred = async (on: Page, what: string): Promise<void> => {
  const box = await on.getByRole('dialog').boundingBox()
  expect(box, `${what}: the dialog must be laid out`).not.toBeNull()

  const viewport = on.viewportSize()
  expect(viewport).not.toBeNull()

  const left = box!.x
  const right = viewport!.width - (box!.x + box!.width)

  expect(
    Math.abs(left - right),
    `${what}: the dialog is not centred — ${Math.round(left)}px to its left and ` +
      `${Math.round(right)}px to its right. A modal <dialog> centres itself with the ` +
      "user-agent's `margin: auto`, and Tailwind's Preflight zeroes it. See the `dialog` " +
      'rule in theme/tokens.css.',
  ).toBeLessThanOrEqual(2)

  // Vertically too. A dialog shorter than the viewport is centred; a tall one is clamped by
  // its own max-height and sits flush, so this only asserts it is not jammed at the top.
  expect(box!.y, `${what}: the dialog is flush against the top edge`).toBeGreaterThan(0)
}

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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **EVERY MODAL DIALOG IS CENTRED — WHICH THE TEST ABOVE DOES NOT CHECK, AND THAT IS HOW
   * THIS SHIPPED BROKEN.**
   *
   * The test above measures the panel's *width* and never its *position*, so a dialog pinned
   * to the top-left corner satisfies it completely. Two of them were: the user-agent
   * stylesheet centres a `showModal()` dialog with `margin: auto`, Tailwind's Preflight sets
   * `margin: 0` on every element, and `ConfirmDialog` and `ScheduleDialog` never carried the
   * local `m-auto` that `SessionPanel` and `AttendeeProfile` had each rediscovered.
   *
   * It is a failure no behavioural test can see. The dialog opens, traps focus, closes on
   * Escape and reads correctly to a screen reader; it is simply in the wrong place. Only an
   * eye — or this — catches it, which is why the base rule now lives in `theme/tokens.css`
   * and why this asserts the outcome rather than the class name.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('every modal dialog is centred in the viewport, not pinned to a corner', async ({
    page,
    browser,
  }) => {
    // Desktop, where a mispositioned dialog is most obvious and the gutters are widest.
    await page.setViewportSize({ width: 1440, height: 900 })
    await signedIn(page)

    // 005 — the session detail panel.
    await page.goto('/agenda')
    await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectCentred(page, 'the session detail panel')
    await page.keyboard.press('Escape')

    // ─────────────────────────────────────────────────────────────────────────────────────
    // 006 — the attendee profile. Grace specifically, because the last dialog below needs her
    // to hold Ada's card and this test must not depend on another spec file having run first.
    // Sharing is idempotent (FR-604), so a re-run is harmless.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await page.goto('/discover')
    await page.getByRole('heading', { name: GRACE.displayName, level: 3 }).getByRole('link').click()
    const profile = page.getByRole('dialog')
    await expect(profile.getByRole('heading', { name: GRACE.displayName })).toBeVisible()
    await expectCentred(page, 'the attendee profile')

    await profile.getByRole('button', { name: /share your card with/i }).click()
    // 016 — the confirmation states the EXCHANGE (FR-1021, FR-1022). It said "your card is now
    // with …" until C1 made sharing mutual, and this assertion is only here to wait for the
    // status region before pressing Escape — but a stale phrase would have failed the whole
    // responsive sweep for a reason having nothing to do with layout.
    await expect(profile.getByRole('status')).toContainText(/have exchanged cards/i)
    await page.keyboard.press('Escape')

    // ─────────────────────────────────────────────────────────────────────────────────────
    // 008 — the scheduling dialog. **This is the one that was reported**, and it needs a
    // second attendee: proposing requires holding the invitee's card, and it is Grace who
    // holds Ada's.
    // ─────────────────────────────────────────────────────────────────────────────────────
    // A second context rather than a sign-out, because Ada is still signed in on `page` and
    // this needs a different attendee at the same width — the pattern `network.spec.ts` uses.
    const graceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await useConference(gracePage, 'Product & Design Summit')

    await gracePage.goto('/network')
    await gracePage
      .getByRole('button', { name: /propose a meeting with/i })
      .first()
      .click()
    await expect(gracePage.getByRole('dialog')).toBeVisible()
    await expectCentred(gracePage, 'the scheduling dialog')

    await graceContext.close()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T146 (013) — **the administrative product's four dialogs, on the other origin.**
   *
   * A separate test rather than more steps in the one above, because it needs a different
   * origin and a different principal — and because the defect this catches is per-dialog. 008
   * shipped two mispositioned dialogs while the two written before them were fine; the class of
   * mistake is *forgetting the rule on the next one*, so what matters is that every new dialog
   * is enumerated here.
   *
   * The administrative client imports the same `theme/tokens.css`, so the base `dialog` rule
   * should carry across — **should** being exactly the assumption 008 made about `m-auto` and
   * the reason this measures rather than asserts a class name. It is also the first time the
   * rule is exercised on a second application, which is the point at which "it is in the shared
   * stylesheet" stops being an argument and starts being a claim.
   *
   * **Nothing here confirms.** Every dialog is opened, measured, and dismissed with Escape —
   * which doubles as a check that Escape reaches each one. Resolving a report or removing a
   * question would change state other specs read.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('every administrative dialog is centred too, and Escape dismisses each', async ({
    browser,
  }) => {
    test.slow()

    // Its own report, so this does not depend on `admin-moderation.spec.ts` having run — and
    // so the question is still there to be removable, which the one that spec acts on is not.
    // Grace asks and Alan reports, matching that spec's pairing for the reason it records: the
    // block reporting creates must not land on Ada and Grace, whose card and meeting the test
    // above depends on.
    await seedQuestionReport(
      { email: GRACE.email, password: SEED_PASSWORD },
      { email: ALAN.email, password: SEED_PASSWORD },
      'Product & Design Summit',
    )

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const operator = await context.newPage()

    try {
      await signInAsOperator(operator)

      // ── The report queue's two dialogs.
      await operator.goto(`${ADMIN_ORIGIN}/reports`)
      await operator
        .getByRole('link', { name: new RegExp(`reported ${GRACE.displayName}`, 'i') })
        .first()
        .click()

      await operator.getByRole('button', { name: /remove this question/i }).click()
      await expect(operator.getByRole('dialog')).toBeVisible()
      await expectCentred(operator, 'the question-removal confirmation')
      await operator.keyboard.press('Escape')
      await expect(operator.getByRole('dialog')).toBeHidden()

      await operator.getByRole('button', { name: /record a resolution/i }).click()
      await expect(operator.getByRole('dialog')).toBeVisible()
      await expectCentred(operator, 'the resolution dialog')
      await operator.keyboard.press('Escape')
      await expect(operator.getByRole('dialog')).toBeHidden()

      // ── Promotion.
      await operator.goto(`${ADMIN_ORIGIN}/conferences`)
      await operator
        .getByRole('button', { name: /add an organizer/i })
        .first()
        .click()
      await expect(operator.getByRole('dialog')).toBeVisible()
      await expectCentred(operator, 'the promotion dialog')
      await operator.keyboard.press('Escape')
      await expect(operator.getByRole('dialog')).toBeHidden()

      // ── Operator deactivation. The identifier is typed rather than chosen, so the dialog can
      // be opened without naming a real operator — and this deliberately never confirms.
      await operator.goto(`${ADMIN_ORIGIN}/operators`)
      await operator.getByLabel(/operator identifier/i).fill('00000000-0000-4000-8000-000000000000')
      await operator.getByRole('button', { name: /end their access/i }).click()
      await expect(operator.getByRole('dialog')).toBeVisible()
      await expectCentred(operator, 'the operator-deactivation confirmation')
      await operator.keyboard.press('Escape')
      await expect(operator.getByRole('dialog')).toBeHidden()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // T096 (014) — **the two dialogs this feature adds, enumerated here for the reason the
      // header gives: the class of mistake is forgetting the rule on the NEXT one.**
      //
      // 008 shipped two mispositioned dialogs while the two written before them were fine, and
      // both passed every behavioural test — they opened, trapped focus, closed on Escape and
      // read correctly. A width assertion never looks at position, which is how they survived.
      //
      // Neither confirms anything. The cancellation dialog in particular is opened on a seeded
      // session and dismissed: this suite seeds once for the whole run, so cancelling here
      // would change the programme every later spec reads.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await operator.goto(`${ADMIN_ORIGIN}/conferences`)
      await operator.getByRole('button', { name: 'Create a conference' }).click()
      await expect(operator.getByRole('dialog')).toBeVisible()
      await expectCentred(operator, 'the create-conference dialog')
      await operator.keyboard.press('Escape')
      await expect(operator.getByRole('dialog')).toBeHidden()

      // The cancel-or-delete decision, reached through the programme editor. A platform
      // operator holds authority over every conference (FR-1002), so no assignment is needed.
      await operator.getByRole('link', { name: 'Product & Design Summit' }).first().click()
      await expect(
        operator.getByRole('heading', { name: 'Product & Design Summit', level: 1 }),
      ).toBeVisible()

      await operator
        .getByRole('button', { name: /cancel or delete/i })
        .first()
        .click()
      await expect(operator.getByRole('dialog')).toBeVisible()
      await expectCentred(operator, 'the session cancel-or-delete dialog')
      await operator.keyboard.press('Escape')
      await expect(operator.getByRole('dialog')).toBeHidden()
    } finally {
      await context.close()
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-020 COVERS THE ADMINISTRATIVE SITE TOO, AND NOTHING WAS CHECKING IT.**
   *
   * `horizontalOverflow` is pointed at every attendee surface in this file and, until this test,
   * at no administrative one. The gap was easy to miss because `admin-accessibility.spec.ts`
   * walks these same four addresses at three widths and reports them clean — **axe says nothing
   * about a page that scrolls sideways**, so a suite that looks thorough covered a different
   * obligation entirely.
   *
   * The administrative pages are the ones most likely to fail it: they are tables of
   * identifiers, addresses and timestamps, which is the content that does not reflow. 320px is
   * the stated floor and is where a table given a fixed column width shows immediately.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  test('no administrative destination scrolls sideways at any width (FR-020)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const operator = await context.newPage()

    try {
      await signInAsOperator(operator)

      for (const width of SCROLL_WIDTHS) {
        await operator.setViewportSize({ width, height: 900 })

        for (const destination of ADMIN_DESTINATIONS) {
          await operator.goto(`${ADMIN_ORIGIN}${destination.path}`)
          await expect(
            operator.getByRole('heading', { name: destination.heading, level: 1 }),
          ).toBeVisible()

          const { overflow, widest } = await horizontalOverflow(operator)
          expect(
            overflow,
            `${destination.label} overflows by ${overflow}px at ${width}px. ` +
              `Widest: ${JSON.stringify(widest)}`,
          ).toBeLessThanOrEqual(0)
        }
      }
    } finally {
      await context.close()
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FIX-402, FIX-403 — THE ADMINISTRATIVE NAVIGATION ITSELF, MEASURED RATHER THAN THE PAGE
   * AROUND IT.**
   *
   * The sweep above is the document-level one and it is not enough here, for a reason that is
   * worth stating rather than rediscovering: `AdminShell`'s only navigation below 768px used to
   * be `flex gap-1 overflow-x-auto`, a strip you swipe to reach a destination. Principle IV's
   * mobile layout calls for bottom navigation and forbids any primary action requiring
   * horizontal scrolling — and **a destination you have to swipe to reach is a primary action
   * requiring horizontal scrolling.** The strip nonetheless kept `documentElement.scrollWidth`
   * exactly equal to `clientWidth`, which is what a scroll container is *for*, so the sweep
   * above passed on it at all thirteen widths.
   *
   * Constitution v5.4.0's R3 ratified MyNet's desktop and tablet layouts and **carved this
   * product out of that ratification as a defect** — fiat may close a judgement but cannot make
   * a non-compliance compliant. This is the assertion that closes it.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  test('the administrative navigation never scrolls sideways inside itself (FIX-402)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const operator = await context.newPage()

    try {
      await signInAsOperator(operator)

      for (const width of SCROLL_WIDTHS) {
        await operator.setViewportSize({ width, height: 900 })
        await operator.goto(`${ADMIN_ORIGIN}/`)
        await expect(
          operator.getByRole('heading', { name: /signed in as/i, level: 1 }),
        ).toBeVisible()

        const navigation = operator.getByRole('navigation')
        const { overflow, overflowX, widest } = await selfOverflow(navigation)

        expect(
          overflow,
          `the administrative navigation overflows itself by ${overflow}px at ${width}px ` +
            `(overflow-x: ${overflowX}). Widest: ${JSON.stringify(widest)}. Below 768px this is ` +
            'the bottom bar and it must wrap rather than scroll; a scroll container here would ' +
            'satisfy the document-level sweep while hiding destinations.',
        ).toBeLessThanOrEqual(0)

        // And every destination is genuinely reachable at that width, which is the obligation
        // the measurement is a proxy for. A bar that fits because it dropped a destination is
        // not a bar that fits.
        for (const destination of ADMIN_DESTINATIONS) {
          await expect(
            navigation.getByRole('link', { name: destination.label, exact: true }),
            `${destination.label} at ${width}px`,
          ).toBeVisible()
        }
      }
    } finally {
      await context.close()
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FIX-401 — THREE LAYOUTS, IDENTIFIED BY MEASURING THEM.**
   *
   * MyNet renders three navigation components and stamps each with `data-nav-layout`, so the
   * test above this one can name the band it expects. `AdminShell` is deliberately **one element
   * with responsive classes** — one navigation landmark, one tab order, one tier-filtered list,
   * with nothing that can disagree with itself — and the price of that choice is that there is no
   * attribute to read. So each layout is recognised by its geometry, which is the stronger
   * assertion in any case: an attribute can say "tablet" while the layout is anything at all.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────────
   * **FIX-404 — WHAT THIS TEST MUST NEVER BECOME.**
   *
   * R3 *ratified* the 768–1279px divergence between the two products: MyNet's rail is icon-only
   * in that band, this one is labelled, and that is now a decision. **A test asserting the two
   * products' rails match there would contradict R3** — it would reopen a settled judgement in
   * the costume of a defect. This file therefore compares this rail to *nothing in MyNet*. It
   * asserts the opposite: that the administrative rail is still **labelled** at 900px, which
   * pins the ratified divergence in place instead of quietly erasing it.
   * ───────────────────────────────────────────────────────────────────────────────────────────
   */
  test('the administrative shell presents three distinct navigation layouts (FIX-401)', async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const operator = await context.newPage()

    try {
      await signInAsOperator(operator)

      const measure = async (width: number) => {
        await operator.setViewportSize({ width, height: 900 })
        await operator.goto(`${ADMIN_ORIGIN}/`)
        await expect(
          operator.getByRole('heading', { name: /signed in as/i, level: 1 }),
        ).toBeVisible()

        const box = await operator.getByRole('navigation').boundingBox()
        expect(box, `the navigation must be laid out at ${width}px`).not.toBeNull()
        return box!
      }

      // ── Mobile, <768px: bottom navigation. Full width, short, and against the bottom edge.
      const mobile = await measure(375)
      expect(
        Math.round(mobile.width),
        'at 375px the navigation is not full width, so it is not a bottom bar',
      ).toBeGreaterThanOrEqual(374)
      expect(
        Math.round(mobile.y + mobile.height),
        'at 375px the navigation is not against the bottom of the viewport (FR-018 — mobile is ' +
          'bottom navigation, and this shell shipped with a strip at the top instead)',
      ).toBeGreaterThanOrEqual(899)
      expect(mobile.height, 'at 375px the navigation is as tall as a rail, not a bar').toBeLessThan(
        300,
      )

      // ── Tablet, 768–1279px: a reduced rail. A left column, narrower than desktop's.
      const tablet = await measure(900)
      expect(Math.round(tablet.x), 'at 900px the navigation is not against the left edge').toBe(0)
      expect(
        tablet.height,
        'at 900px the navigation is not a full-height rail',
      ).toBeGreaterThanOrEqual(899)

      // FIX-404. **Labelled, because R3 ratified that this product diverges from MyNet's
      // icon-only rail in exactly this band.** Nothing here compares the two rails.
      const rail = operator.getByRole('navigation')
      for (const destination of ADMIN_DESTINATIONS) {
        await expect(
          rail.getByRole('link', { name: destination.label, exact: true }),
          `${destination.label} at 900px must still carry its label — R3 ratified this rail as ` +
            'labelled where MyNet\'s is icon-only, and "reduced" here means narrower, not mute',
        ).toHaveText(destination.label)
      }

      // ── Desktop, ≥1280px: the persistent rail, wider than the reduced one.
      const desktop = await measure(1440)
      expect(Math.round(desktop.x), 'at 1440px the navigation is not against the left edge').toBe(0)
      expect(
        desktop.height,
        'at 1440px the navigation is not a full-height rail',
      ).toBeGreaterThanOrEqual(899)

      // ── And the three are distinct, which is the requirement itself. Two of them being a
      // left-hand column of the same width is the defect FIX-4 was raised for: a rail that does
      // not reduce is one layout wearing two names.
      expect(
        tablet.width,
        `the tablet rail is ${tablet.width}px and the desktop rail is ${desktop.width}px. ` +
          'Principle IV asks for a *reduced* rail at tablet; equal widths mean the shell has two ' +
          'layouts, not three.',
      ).toBeLessThan(desktop.width)
      expect(
        mobile.width,
        'the mobile navigation is no wider than the desktop rail, so it is a rail rather than a bar',
      ).toBeGreaterThan(desktop.width)
    } finally {
      await context.close()
    }
  })

  test('the Agenda filter and save controls are touch-sized at mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await signedIn(page)
    await page.goto('/agenda')
    await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible()

    // FR-197 — 44px is the floor. Measured at 320px, where a target that only *looks* big
    // enough at 375px is actually squeezed.
    for (const name of ['All sessions', 'My agenda']) {
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
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

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
      //
      // **`exact`, since 007.** Playwright matches an accessible name by substring, and Home now
      // carries an unread-message card whose link is named "You have unread messages…" — which
      // matched the query for the *Messages* destination and made this a strict-mode violation.
      // The nav links are named exactly for their destination, so the exact form is what this
      // assertion always meant; the loose form merely had nothing to collide with before.
      for (const destination of DESTINATIONS) {
        await expect(
          page.getByRole('link', { name: destination.label, exact: true }),
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
      // `exact`, for the reason recorded on the navigation sweep above: a Home card's link name
      // can contain a destination's label without being a navigation control.
      const box = await page
        .getByRole('link', { name: destination.label, exact: true })
        .boundingBox()
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

  /**
   * T140 (007) — **Messages with real content, at every supported width** (FR-580, FR-586,
   * SC-516).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The destination sweep above already walks `/messages`, and until 007 it walked a
   * placeholder. Real content is what actually overflows: a conversation preview, an unbroken
   * URL in a message, and a two-pane grid whose tracks default to `auto` — meaning their
   * *min-content* width — so one long word widens the whole page rather than truncating.
   *
   * The component suite asserts the structure that prevents this (`minmax(0, …)`, `min-w-0`,
   * `break-words`). Only a browser can say whether the document actually scrolls, which is what
   * FR-586 is about.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('Messages does not scroll sideways at any width, with a thread open', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')

    await page.goto('/messages')
    await page.locator('a[href^="/messages/"]').first().click()
    await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()

    // A message no line-breaking algorithm can help with — the one piece of attendee content
    // that genuinely can widen a column, and the one a conference message most often contains.
    await page
      .getByRole('textbox', { name: /message/i })
      .fill(`https://example.com/${'a-very-long-unbroken-path-segment'.repeat(4)}`)
    await page.getByRole('button', { name: /send message/i }).click()

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(
        overflow,
        `Messages overflowed by ${overflow}px at ${width}px with a long URL in the thread. ` +
          'No content or primary action may require horizontal scrolling (FR-586).',
      ).toBeLessThanOrEqual(0)
    }
  })

  /**
   * T140 (007) — **the conversation list is vertical, never a horizontally scrolling strip**
   * (FR-580).
   *
   * The prototype puts a horizontal row of avatars above the thread, and Principle II makes
   * correcting it a settled requirement rather than a judgement: choosing which conversation to
   * read is the primary action of this destination, and a strip hides everything past the fourth
   * behind a gesture with no keyboard equivalent.
   *
   * Measured on the list's own box rather than on the document, because a container that scrolls
   * internally does not widen the page — which is exactly how this defect would survive the
   * assertion above.
   */
  test('the conversation list itself never scrolls sideways', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')
    await page.goto('/messages')

    const rows = page.locator('a[href^="/messages/"]')
    await expect(rows.first()).toBeVisible()

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await expect(rows.first()).toBeVisible()

      const overflow = await rows.first().evaluate((row) => {
        const list = row.closest('ul')
        return list ? list.scrollWidth - list.clientWidth : 0
      })

      expect(
        overflow,
        `The conversation list scrolls sideways by ${overflow}px at ${width}px. FR-580 forbids ` +
          "reproducing the prototype's horizontally-scrolling switcher.",
      ).toBeLessThanOrEqual(0)
    }
  })

  /**
   * T140 (007) — **one pane at mobile, two from tablet up.**
   *
   * The structural half is asserted in the component suite; this is the measured half. At 320px
   * the list must not be beside the thread, because a 140px-wide list column is not a usable
   * control and squeezing two panes into a phone is what produces the overflow above.
   */
  test('Messages is one pane at mobile and two from tablet up', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')
    await page.goto('/messages')

    const rows = page.locator('a[href^="/messages/"]')
    await expect(rows.first()).toBeVisible()
    await rows.first().click()
    await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()

    await page.setViewportSize({ width: 320, height: 900 })
    await expect(
      rows.first(),
      'At 320px the thread replaces the list rather than sitting beside it, and an explicit back ' +
        'affordance is how the reader returns (FR-580).',
    ).toBeHidden()
    await expect(page.getByRole('link', { name: /back to conversations/i })).toBeVisible()

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(rows.first(), 'from tablet up both panes are on screen').toBeVisible()
    await expect(page.getByRole('textbox', { name: /message/i })).toBeVisible()
  })

  /**
   * T048 (010) — **exactly one brand mark is visible at every width** (FR-824, SC-805).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The mark lives in two places — the desktop rail and the top bar — and at desktop width both
   * are on screen at once. Two marks a few centimetres apart is worse than none, so the top bar
   * hides its own above 1280px.
   *
   * That hiding is CSS, and CSS is exactly what the component suite cannot see: jsdom applies no
   * stylesheet, so both marks are "present" there and always will be. This is the only layer
   * that can tell one from two.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('exactly one brand mark is visible at every width, and never two at desktop', async ({
    page,
  }) => {
    await signedIn(page)

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()

      const marks = page.locator('[data-brand-mark]:visible')
      await expect(marks, `at ${width}px the product must carry exactly one mark`).toHaveCount(1)

      // And it must be the colourway that is visible against the surface it landed on: coral on
      // the navy rail at desktop, navy on the raised top bar below it (FR-822, FR-823, SC-814).
      await expect(marks, `at ${width}px`).toHaveAttribute(
        'data-brand-mark',
        width >= 1280 ? 'coral' : 'navy',
      )
    }
  })

  /**
   * T049 (010) — **the mark displaced nothing at 320px** (FR-825, SC-806).
   *
   * The top bar's own source comment fixes the rule: at 320px the label, the conference
   * switcher, the profile control and the sign-out control share one row, and something has to
   * give — *a label rather than a control*. Adding a mark to that row is precisely the change
   * that breaks it, so the three controls are named individually rather than trusting the
   * overflow measurement alone. A control pushed off-screen and a control that merely truncated
   * look identical to `scrollWidth`.
   */
  test('the brand mark displaces no control in the top bar at 320px', async ({ page }) => {
    await signedIn(page)
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/')

    const header = page.locator('header').first()
    await expect(header.locator('[data-brand-mark]')).toBeVisible()

    // The three controls the top bar carries at this width, each still on screen and reachable.
    await expect(header.getByRole('button', { name: /conference|summit/i }).first()).toBeVisible()
    await expect(header.getByRole('link', { name: /your profile/i })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeVisible()

    const { overflow, widest } = await horizontalOverflow(page)
    expect(
      overflow,
      `The top bar overflows by ${overflow}px at 320px with the mark present. ` +
        `Widest: ${JSON.stringify(widest)}`,
    ).toBeLessThanOrEqual(0)
  })

  /**
   * T049 (010) — and the same for the five authentication screens, which gained a stacked mark
   * above a heading. None is behind a session, so each is reachable directly.
   */
  test('no authentication screen scrolls sideways with the mark above its heading', async ({
    page,
  }) => {
    // `/` renders the sign-in screen when there is no session — `RequireAuth` renders it *at*
    // the requested address rather than redirecting, which is why there is no `/sign-in`.
    for (const path of ['/', '/sign-up', '/reset-password-request', '/reset-password', '/verify']) {
      for (const width of SCROLL_WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await expect(page.locator('[data-brand-mark]').first()).toBeVisible()

        const { overflow, widest } = await horizontalOverflow(page)
        expect(
          overflow,
          `${path} overflows by ${overflow}px at ${width}px. Widest: ${JSON.stringify(widest)}`,
        ).toBeLessThanOrEqual(0)
      }
    }
  })

  /**
   * T007 (016) — **the send control stays inside the viewport at every composer height**
   * (FR-1003, SC-1001).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **THIS MEASURES POSITION, WHICH IS THE CLASS OF DEFECT THIS PROJECT KEEPS SHIPPING.**
   *
   * 008's scheduling dialog rendered in the top-left corner having passed 135 e2e tests, five
   * review agents and CodeRabbit, because every one of them checked *behaviour*. The composer is
   * the same shape of failure found the same way — by the owner using the product — and no
   * behavioural assertion can see it: the field accepts text, the button is enabled, the send
   * resolves, and the message cannot be sent because the control is below the fold.
   *
   * So this asserts the box, at all three bands, with the composer driven to its maximum.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * **A short viewport is used deliberately.** 844px is the phone the prototype was drawn at;
   * 420px stands in for that phone *with an on-screen keyboard raised*, which Playwright cannot
   * summon and which is the exact configuration that produced the original report. A bound
   * expressed as a proportion is what makes the second case pass, and a fixed height or a line
   * count is what would fail it — so this is also the test that would catch FR-1002 being
   * satisfied by the wrong kind of rule.
   */
  test('the send control stays within the viewport at every composer height', async ({ page }) => {
    await signedIn(page)

    // 500 characters, which is SC-1001's stated floor, with no spaces long enough to wrap
    // unnaturally — a realistic long message rather than one unbroken token.
    const longMessage = 'This is a long message that keeps going. '.repeat(13)
    expect(longMessage.length).toBeGreaterThanOrEqual(500)

    for (const { px, layout } of WIDTHS) {
      // The tall case is the ordinary one; the short case stands in for a raised keyboard.
      for (const height of [844, 420]) {
        await page.setViewportSize({ width: px, height })
        await page.goto('/discover')

        await page
          .getByRole('link', { name: new RegExp(GRACE.displayName) })
          .first()
          .click()
        await page
          .getByRole('dialog')
          .getByRole('link', { name: new RegExp(`message ${GRACE.displayName}`, 'i') })
          .click()

        const composer = page.getByRole('textbox', { name: /message/i })
        await expect(composer).toBeVisible()
        await composer.fill(longMessage)

        const send = page.getByRole('button', { name: /send message/i })
        await expect(send).toBeVisible()

        const box = await send.boundingBox()
        expect(box, `no box for the send control at ${px}×${height}`).not.toBeNull()

        const viewport = page.viewportSize()!
        const where = `${layout} ${px}×${height}`

        // Fully within, on every edge — not merely intersecting. A control half off the bottom
        // is a control an attendee cannot reliably hit with a thumb.
        expect(box!.y, `send control starts above the viewport at ${where}`).toBeGreaterThanOrEqual(
          0,
        )
        expect(
          box!.y + box!.height,
          `send control is cut off below the viewport at ${where} — this is the original defect: ` +
            `a long message cannot be sent at all`,
        ).toBeLessThanOrEqual(viewport.height)
        expect(
          box!.x,
          `send control starts left of the viewport at ${where}`,
        ).toBeGreaterThanOrEqual(0)
        expect(
          box!.x + box!.width,
          `send control extends past the right edge at ${where}`,
        ).toBeLessThanOrEqual(viewport.width)

        // It has to be usable, not merely present: a control behind the keyboard area would
        // satisfy a box check and still refuse the tap.
        await expect(send).toBeEnabled()

        // And the composer must not have introduced page-level sideways scrolling by growing.
        const { overflow, widest } = await horizontalOverflow(page)
        expect(
          overflow,
          `the grown composer overflows by ${overflow}px at ${where}. ` +
            `Widest: ${JSON.stringify(widest)}`,
        ).toBeLessThanOrEqual(0)
      }
    }
  })
})
