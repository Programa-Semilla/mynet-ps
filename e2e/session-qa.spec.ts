import { expect, test, type Page } from '@playwright/test'

import { ADA, GRACE, signIn, useConference } from './support/attendees.js'

/**
 * T078, T081, T082 (009) — the Q&A properties that **cannot be verified anywhere but a browser**
 * (FR-752, FR-774–FR-780, research R2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THREE ASSERTIONS, AND EACH ONE EXISTS BECAUSE SOMETHING LIKE IT SHIPPED BROKEN.**
 *
 *   1. **Both dialogs this feature opens are centred.** 004's `ConfirmDialog` and 008's
 *      `ScheduleDialog` each rendered in the **top-left corner** of the viewport, having passed
 *      135 e2e tests, five review agents and CodeRabbit — every one of which checked behaviour,
 *      and none of which looked at position. This feature opens two more dialogs, and one of
 *      them *is* `ConfirmDialog`.
 *   2. **Escape dismisses only the topmost dialog.** These open **inside** an already-modal
 *      panel, and the panel's own `onCancel` navigates. If the event ever reached it, the
 *      address would change when the attendee meant to dismiss a confirmation. jsdom has no top
 *      layer at all, so this is unverifiable anywhere else (research R2).
 *   3. **Focus stays on the upvote control as its row moves up the list** (FR-780). Focus is
 *      lost when a node is *unmounted*, not when it is moved — so this passes only while the
 *      rows are keyed on the question id, and a switch to index keys would break it silently.
 *      Tasks.md calls it "the assertion most likely to fail".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Opens the first session's panel on Agenda, signed in as the given attendee. */
const openFirstSession = async (page: Page): Promise<void> => {
  await page.goto('/agenda')
  await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/**
 * Asks a question and waits until it is on the list.
 *
 * **Waits for the composer to settle first.** A previous ask's response clears the field when it
 * arrives, so filling while one is still in flight raced the clear — which is how the composer
 * defect this helper's first version exposed was found. The product no longer wipes the text,
 * but the helper still waits, because a test that fills a field mid-clear is asserting about
 * timing rather than about asking a question.
 */
const askQuestion = async (page: Page, body: string): Promise<void> => {
  const field = page.getByRole('textbox', { name: /ask a question/i })
  const post = page.getByRole('button', { name: /post question/i })

  await expect(field).toHaveValue('')
  await field.fill(body)
  await expect(post).toBeEnabled()
  await post.click()

  await expect(page.getByText(body, { exact: true })).toBeVisible()
}

test.describe('audience questions in a real browser', () => {
  test('asks a question that a second attendee then sees and upvotes', async ({
    page,
    browser,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')

    await openFirstSession(page)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The empty state is deliberately NOT asserted here**, though it is what a reviewer meets
    // at first run because nothing in this feature is seeded (FR-762).
    //
    // Every spec in this suite shares one seeded database, and `accessibility.spec.ts` asks a
    // question on this same session before this file runs — so an emptiness assertion here
    // passes or fails on **which specs ran first**, which is a property of the suite rather
    // than of the product. It was written that way, and it failed exactly once the accessibility
    // scan was added.
    //
    // The empty state is covered where it can be stated honestly: `panel-questions-ask.test.tsx`
    // renders it from a repository that returns nothing, and `questions-deletion.test.ts` proves
    // a session whose only asker has left renders it too.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const QUESTION = `What did the migration cost? ${Date.now()}`
    await askQuestion(page, QUESTION)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The crossing.** A second attendee, a second browser context, the same session — this is
    // the property the whole feature exists for, and the one no single-context test can see.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await useConference(gracePage, 'Product & Design Summit')
    // The same address Ada is on, not "the first session" resolved a second time — see the
    // focus test below for why re-deriving it is one assumption too many.
    await gracePage.goto(new URL(page.url()).pathname)
    await expect(gracePage.getByRole('dialog')).toBeVisible()

    const asGrace = gracePage.getByRole('dialog')
    await expect(asGrace.getByText(QUESTION, { exact: true })).toBeVisible()
    // Attributed, under a real name and with no opt-out — v3.3.0's recorded exception.
    await expect(asGrace.getByText(ADA.displayName).first()).toBeVisible()

    await asGrace
      .getByRole('button', { name: /upvote/i })
      .first()
      .click()

    // The count updates from the write's own response, with no second request and no interval
    // in which it is wrong (FR-730).
    await expect(
      asGrace.getByRole('button', { name: /remove your upvote/i }).first(),
    ).toHaveAttribute('aria-pressed', 'true')

    await graceContext.close()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T082 — **focus stays on the upvote control as its row rises past its neighbours** (FR-780).
   *
   * The list is ordered `votes DESC, asked_at ASC`, so upvoting the *last* question moves it to
   * the top. React reorders the existing DOM nodes because rows are keyed on the question id;
   * with index keys it would unmount and remount everything past the moved row, and the control
   * the reader just pressed would lose focus at the exact moment they used it.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('keeps focus on the upvote control as the question moves up the list', async ({
    page,
    browser,
  }) => {
    const stamp = Date.now()
    const FIRST = `Asked first, and it starts at the top. ${stamp}`
    const SECOND = `Asked second, and it will overtake. ${stamp}`

    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')
    await openFirstSession(page)

    await askQuestion(page, FIRST)
    await askQuestion(page, SECOND)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Grace goes to the SAME ADDRESS rather than re-deriving the session by clicking.**
    //
    // Opening "the first session on Agenda" twice, in two contexts, is only the same session
    // while both attendees resolve the same active conference and the same programme ordering.
    // That is one assumption too many for a test about focus: when it broke, the symptom was
    // "the question is not in the list", which reads as a visibility bug rather than as two
    // browsers looking at different sessions.
    //
    // The panel's address names the session (005's addressable detail panel), so the address is
    // the unambiguous way to say "the same one".
    // ───────────────────────────────────────────────────────────────────────────────────────
    const sessionAddress = new URL(page.url()).pathname

    // Grace does the voting: an attendee cannot upvote their own question (FR-722).
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await useConference(gracePage, 'Product & Design Summit')
    await gracePage.goto(sessionAddress)
    await expect(gracePage.getByRole('dialog')).toBeVisible()

    const panel = gracePage.getByRole('dialog')
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Scoped to the questions list by name.** The panel also renders a Speakers list, so an
    // unscoped `getByRole('listitem')` put a speaker at index 0 and made every position off by
    // one — which is why the questions list carries an accessible name in the first place.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const rows = panel
      .getByRole('list', { name: /questions, most upvoted first/i })
      .getByRole('listitem')

    /**
     * Where a question sits in the list, or `-1` while it cannot be found.
     *
     * **Returns rather than throws**, because `expect.poll` propagates an exception instead of
     * retrying on it. Throwing here failed the test on a transient miss during the re-render
     * that the poll exists to wait for — the list was mid-update, the row was momentarily
     * absent, and the failure named a visibility problem that was not happening.
     */
    const indexOf = async (text: string): Promise<number> => {
      const listed = await rows.allTextContents()
      return listed.findIndex((row) => row.includes(text))
    }

    /** The same lookup, but insisting the row is there — for the fixture assertions. */
    const requireIndexOf = async (text: string): Promise<number> => {
      const at = await indexOf(text)
      if (at >= 0) return at
      throw new Error(
        `"${text}" is not in the list. What Grace sees:\n${(await rows.allTextContents()).join('\n---\n')}`,
      )
    }

    // The list is fetched when the panel opens, so it is briefly empty. Waiting for the row
    // itself rather than for "some rows" — the questions were asked in another context, and a
    // partially-rendered list is exactly what made the first read find nothing.
    await expect(panel.getByText(SECOND, { exact: true })).toBeVisible()

    const before = await requireIndexOf(SECOND)
    expect(before, 'the fixture needs the second question below the first').toBeGreaterThan(
      await requireIndexOf(FIRST),
    )

    // Focus the control **by keyboard**, then activate it — so the assertion is about a
    // keyboard reader's experience rather than about where a mouse click left focus.
    const upvote = rows.nth(before).getByRole('button', { name: /upvote/i })

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Captured before pressing, so the assertion afterwards is about identity rather than
    // shape.** `aria-labelledby` points at this question's own body element, so it is unique to
    // the row. Asserting only that *a* button still has focus is much weaker than it looks:
    // with index keys React reuses the node at that position and rewrites its props, so a
    // button is still focused — just the wrong one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const labelBefore = await upvote.getAttribute('aria-labelledby')
    expect(labelBefore, 'the upvote control must be labelled by its own question').toBeTruthy()

    await upvote.focus()
    await gracePage.keyboard.press('Enter')

    // The row moves.
    // A momentary absence maps to a value the poll will never accept, so a mid-re-render read
    // keeps waiting instead of either passing (a `-1` is "less than before") or failing.
    await expect
      .poll(
        async () => {
          const at = await indexOf(SECOND)
          return at >= 0 ? at : Number.MAX_SAFE_INTEGER
        },
        { message: 'the upvoted question did not move up' },
      )
      .toBeLessThan(before)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // …and focus is still on the control, which is now in a different place on screen. Asserted
    // by reading the focused element's accessible name from the document, because the element
    // handle may point at a node the reorder replaced — and that replacement is exactly what
    // must not have happened.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const focused = await gracePage.evaluate(() => {
      const active = document.activeElement
      return {
        tag: active?.tagName ?? null,
        label: active?.getAttribute('aria-labelledby') ?? active?.getAttribute('aria-label') ?? '',
        pressed: active?.getAttribute('aria-pressed') ?? null,
      }
    })

    expect(focused.tag, 'focus left the upvote control entirely when its row moved').toBe('BUTTON')

    expect(
      focused.label,
      "focus is on a DIFFERENT question's upvote control than the one that was pressed. Rows " +
        'must be keyed on the question id so React reorders the existing nodes instead of ' +
        'reusing the node at each position and rewriting its props (FR-780, research R5).',
    ).toBe(labelBefore)

    expect(focused.pressed, 'the focused control is not the one that was just pressed').toBe('true')

    await graceContext.close()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T081 — **Escape dismisses the inner dialog only, leaving the panel open and the address
   * unchanged** (FR-752, research R2).
   *
   * The top layer is a stack: a second `showModal()` pushes onto it and the browser sends
   * `cancel` to the topmost dialog alone. That is a platform guarantee rather than something
   * this feature implements — and it is asserted rather than assumed, because the panel's own
   * `onCancel` calls `navigate('..')`. If the event ever reached it, the panel would close and
   * the address would change when the attendee meant to dismiss a confirmation.
   *
   * **jsdom has no top layer at all**, so nothing below this line is verifiable in a component
   * test. It is the same class of gap that hid 005's `max-w-full` defect and 008's
   * mispositioned dialog.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('Escape closes only the inner dialog, then the panel', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')
    await openFirstSession(page)

    const address = page.url()
    await askQuestion(page, `A question to take back. ${Date.now()}`)

    // Open the withdrawal confirmation **inside** the panel.
    await page
      .getByRole('button', { name: /^withdraw$/i })
      .first()
      .click()
    const confirmation = page.getByRole('dialog', { name: /withdraw this question/i })
    await expect(confirmation).toBeVisible()

    // Two dialogs are open at once, which is the situation being tested.
    await expect(page.getByRole('dialog')).toHaveCount(2)

    await page.keyboard.press('Escape')

    // ── The inner one closes… ──────────────────────────────────────────────────────────────
    await expect(confirmation).toBeHidden()

    // ── …the panel stays open, and the address has not changed ─────────────────────────────
    await expect(page.getByRole('dialog')).toHaveCount(1)
    expect(
      page.url(),
      "dismissing the confirmation navigated. The panel's onCancel fired for the inner dialog's " +
        'Escape, which the top-layer stack is supposed to prevent (research R2).',
    ).toBe(address)

    // ── A second Escape closes the panel, as it always did ─────────────────────────────────
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(page.url()).not.toBe(address)
  })

  /**
   * T078 — **both dialogs this feature opens are centred, at every width.**
   *
   * The existing centring test in `responsive.spec.ts` covers the three dialogs that existed
   * before this feature. These two are new, they are **nested inside an already-modal panel**,
   * and one of them is `ConfirmDialog` — the component that shipped in the corner. A nested
   * dialog is also the case where `getByRole('dialog')` matches more than one element, so the
   * assertion has to name the topmost explicitly rather than trusting a single match.
   */
  test('centres both nested dialogs at every width', async ({ page, browser }) => {
    const expectCentred = async (name: RegExp, at: number) => {
      const dialog = page.getByRole('dialog', { name })
      const box = await dialog.boundingBox()
      expect(box, `${name} at ${at}px must be laid out`).not.toBeNull()

      const viewport = page.viewportSize()
      const left = box!.x
      const right = viewport!.width - (box!.x + box!.width)

      expect(
        Math.abs(left - right),
        `${name} at ${at}px is not centred — ${Math.round(left)}px left, ${Math.round(right)}px ` +
          "right. A modal <dialog> centres itself with the user-agent's `margin: auto`, and " +
          "Tailwind's Preflight zeroes it. See the `dialog` rule in theme/tokens.css.",
      ).toBeLessThanOrEqual(2)

      expect(box!.y, `${name} at ${at}px is flush against the top edge`).toBeGreaterThan(0)
    }

    // Signed in **once**, outside the loop. Signing in per width worked only on the first pass:
    // the session persists, so the second `goto('/')` lands on the workspace and there is no
    // email field to fill — the test then timed out on a form that was never going to appear.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, 'Product & Design Summit')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A question by **somebody else**, so the report control exists at all. The control is
    // omitted on the reader's own question (reporting yourself is refused by the route), and
    // without this the report half of this test silently measured nothing.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await openFirstSession(page)
    const sessionAddress = new URL(page.url()).pathname
    await page.keyboard.press('Escape')

    const graceContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await useConference(gracePage, 'Product & Design Summit')
    await gracePage.goto(sessionAddress)
    await expect(gracePage.getByRole('dialog')).toBeVisible()
    await askQuestion(gracePage, `A question Ada can report. ${Date.now()}`)
    await graceContext.close()

    for (const width of [390, 900, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await openFirstSession(page)

      await askQuestion(page, `A question to look at. ${width}-${Date.now()}`)

      // ── The withdrawal confirmation ────────────────────────────────────────────────────
      await page
        .getByRole('button', { name: /^withdraw$/i })
        .first()
        .click()
      await expectCentred(/withdraw this question/i, width)
      await page.keyboard.press('Escape')

      // ── The report dialog, on somebody else's question ─────────────────────────────────
      // Reported from the question itself, which is what FR-781 adds — so this dialog is
      // reachable here without a conversation existing at all.
      //
      // **Asserted unconditionally.** This was guarded by `if (await report.count() > 0)`, and
      // the condition was never true: the control renders only on a question the reader did not
      // write, and only Ada asks anywhere in this suite. A test named "both dialogs" was
      // measuring one — for the dialog that is *newly* opened over an already-modal panel, which
      // is the arrangement most likely to be mispositioned and the reason this test exists.
      // Grace's question below is what makes the control exist.
      const report = page.getByRole('button', { name: /report this question/i }).first()
      await expect(report).toBeVisible()
      await report.click()
      await expectCentred(/^report /i, width)
      await page.keyboard.press('Escape')

      await page.keyboard.press('Escape')
    }
  })
})
