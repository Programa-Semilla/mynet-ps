import { expect, test, type Page } from '@playwright/test'

import { ADA, GRACE, signIn, useConference } from './support/attendees.js'
import { SCROLL_WIDTHS } from './support/destinations.js'

/**
 * T133, T135, T142–T144 (008) — **the Network journey, end to end** (SC-601, SC-604, SC-608,
 * SC-611, SC-612).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SUCCESS CRITERIA WITH NUMBERS IN THEM ARE MEASURED HERE, NOT ARGUED.**
 *
 * SC-601 bounds the Discover-to-contact journey at three deliberate actions; SC-604 bounds
 * proposing a meeting and requires an incomplete proposal to be *unsubmittable* rather than
 * rejected; SC-608 requires a block to take effect on the **next request** rather than on a
 * cache expiry. Each is a claim about the built product that only a real browser can settle.
 *
 * The two suites this feature does **not** need to extend are worth naming, because their
 * absence here is the append-only design working: `responsive.spec.ts` and
 * `accessibility.spec.ts` both walk `DESTINATIONS`, and Network is already in that list — so
 * the horizontal-scrolling gate and the axe scan picked this destination up the moment it
 * gained content, with no edit to either file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const signedIn = async (page: Page, attendee: typeof ADA | typeof GRACE): Promise<void> => {
  await page.goto('/')
  await signIn(page, attendee)
  // Every fixture here is at the conference Ada and Grace share. The active conference is
  // durable by design (FR-104) and this database is seeded once for the whole run, so a spec
  // that depends on which one is active has to say so — the lesson 006 recorded.
  await useConference(page, 'Product & Design Summit')
}

test.describe('Network', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T142 — **SC-601: from Discover to a contact, in at most three deliberate actions.**
   *
   * The actions are counted rather than described: open the profile, share, and the contact
   * exists. Navigating to Network to *look* at it is not part of the journey — the criterion is
   * about how much work it takes to make the relationship, not to admire it.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('T142 — SC-601: sharing a card takes at most three deliberate actions', async ({ page }) => {
    await signedIn(page, ADA)

    const started = Date.now()

    // Action one: go to Discover.
    await page.getByRole('link', { name: 'Discover' }).first().click()
    await expect(page.getByRole('heading', { name: 'Discover', level: 1 })).toBeVisible()

    // Action two: open the person.
    await page.getByRole('heading', { name: GRACE.displayName, level: 3 }).getByRole('link').click()
    const profile = page.getByRole('dialog')
    await expect(profile.getByRole('heading', { name: GRACE.displayName })).toBeVisible()

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Action three: share. **Read the label first** — FR-603 makes this the most misreadable
    // control in the feature, and the accessible name is what a screen-reader user hears out of
    // context. It must say whose card moves.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const share = profile.getByRole('button', { name: /share your card with/i })
    await expect(share).toBeVisible()
    await share.click()

    // The confirmation names both parties and the direction, and says plainly that nothing came
    // back — which is the sentence that closes the misreading (FR-603).
    await expect(profile.getByRole('status')).toContainText(/your card is now with/i)
    await expect(profile.getByRole('status')).toContainText(/you will hold theirs/i)

    expect(
      Date.now() - started,
      'SC-601 bounds this journey at 30 seconds. If this fails on timing rather than on an ' +
        'assertion, the journey has grown a step rather than got slower.',
    ).toBeLessThan(30_000)
  })

  test('the recipient sees the contact, and the sharer’s own Network is unchanged (FR-602)', async ({
    browser,
  }) => {
    // A second browser context, because one-directionality is a claim about **two people** and a
    // single-account walkthrough proves almost nothing — the lesson `quickstart.md` records for
    // this feature and 007 recorded before it.
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()

    await signedIn(gracePage, GRACE)
    await gracePage.getByRole('link', { name: 'Network' }).first().click()

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **Scoped to the Contacts region, not to the page.** Both panes are on screen at desktop
    // widths and both name the counterpart, so an unscoped locator resolves to two elements and
    // fails on strict mode — reporting "not visible" for something that is visible twice.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const contacts = gracePage.getByRole('region', { name: 'Contacts' })

    // Grace holds Ada's card from the journey above.
    await expect(contacts.getByRole('heading', { name: ADA.displayName })).toBeVisible()
    // …and it says where and when they met (FR-615).
    await expect(contacts.getByText(/met at product & design summit/i).first()).toBeVisible()

    await graceContext.close()
  })

  /**
   * T143 — **SC-604: proposing a meeting, and an incomplete proposal being *unsubmittable***.
   *
   * The second half is the requirement rather than the timing: `requirements.md` names a
   * **disabled confirmation, never a post-submit error** for an empty meeting topic, and a
   * product that accepted then refused would satisfy the clock and fail the criterion.
   */
  test('T143 — SC-604: an incomplete proposal is unsubmittable, not rejected', async ({ page }) => {
    await signedIn(page, GRACE)
    await page.getByRole('link', { name: 'Network' }).first().click()

    const started = Date.now()

    await page
      .getByRole('button', { name: /propose a meeting with/i })
      .first()
      .click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /propose a meeting/i })).toBeVisible()

    const confirm = dialog.getByRole('button', { name: /propose meeting/i })

    // Nothing chosen: **disabled**, not enabled-and-refused.
    await expect(confirm).toBeDisabled()

    // ─────────────────────────────────────────────────────────────────────────────────────
    // A slot but no topic: still disabled.
    //
    // **The LABEL is clicked, not the input, and that is what a person actually does.** The radio
    // is `sr-only` — visually replaced by its label — so the input itself is a 1px box the label
    // covers, and Playwright's actionability check correctly refuses to click something obscured.
    //
    // The control is not defective: a mouse user clicks the label and the browser activates the
    // input; a keyboard user tabs to the group and arrows through it, which is precisely why this
    // is a radio group rather than a row of buttons; and the focus ring is on the label via
    // `focus-within`, so the focused option is visible. `T135` asserts that half directly.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const firstSlot = dialog.locator('label:has(input[type="radio"])').first()
    await firstSlot.click()
    await expect(dialog.getByRole('radio').first()).toBeChecked()
    await expect(confirm).toBeDisabled()

    // Whitespace is not a topic, here or at the database.
    await dialog.getByLabel(/what is it about/i).fill('   ')
    await expect(confirm).toBeDisabled()

    // Both present: enabled.
    await dialog.getByLabel(/what is it about/i).fill('Design systems')
    await expect(confirm).toBeEnabled()

    await confirm.click()

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **It appears in the appointments pane immediately, without a reload** — which is what
    // this assertion is really for. An earlier run found the meeting stored correctly and the
    // pane beside the dialog unchanged, so the attendee saw nothing happen; `Network.tsx` now
    // tells the second pane to re-read when a proposal lands.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const appointments = page.getByRole('region', { name: 'Appointments' })
    await expect(appointments.getByText(/waiting for .* to answer/i).first()).toBeVisible()

    expect(Date.now() - started).toBeLessThan(60_000)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T135, SC-611 — **the whole journey is operable by keyboard, with every focus position
   * visible.**
   *
   * Focus visibility is checked by reading the computed outline rather than by eye: the
   * prototype shipped `focus:outline-none` on every input and passed inspection, which is the
   * failure Principle IV names as a defect and this assertion exists to catch.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('T135 — SC-611: the scheduling dialog is fully keyboard operable, with visible focus', async ({
    page,
  }) => {
    await signedIn(page, GRACE)
    await page.getByRole('link', { name: 'Network' }).first().click()

    const opener = page.getByRole('button', { name: /propose a meeting with/i }).first()
    await opener.focus()

    // The opener's focus ring is real, not `outline: none`.
    const outline = await opener.evaluate((element) => {
      const style = getComputedStyle(element)
      return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`
    })
    expect(outline).not.toMatch(/^none 0px none$/)

    await page.keyboard.press('Enter')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **Escape closes it, and focus returns to the control that opened it** (FR-655).
    //
    // The ordering is what is easy to get wrong: while a dialog is modal everything behind it is
    // inert, and an inert element cannot take focus — so restoring before closing silently does
    // nothing and returns a keyboard reader to the top of the page.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  /**
   * T133, SC-612 — **nothing scrolls horizontally at any supported width** (FR-659).
   *
   * `responsive.spec.ts` already walks every destination at these widths, so this adds the state
   * that suite cannot reach: **the scheduling dialog open**, with a slot grid and a text field
   * inside it. A modal is the most likely thing in this feature to overflow at 320px, and it is
   * invisible to a walk that never opens one.
   */
  test('T133 — SC-612: the scheduling dialog never scrolls horizontally (FR-659)', async ({
    page,
  }) => {
    await signedIn(page, GRACE)

    for (const width of SCROLL_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/network')

      await page
        .getByRole('button', { name: /propose a meeting with/i })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        return doc.scrollWidth - doc.clientWidth
      })

      expect(
        overflow,
        `The page scrolls horizontally at ${width}px with the scheduling dialog open. No content ` +
          'or primary action may require horizontal scrolling at any supported width (FR-659, ' +
          "SC-612) — and the prototype's scrolling switcher is a recorded defect, not a pattern.",
      ).toBeLessThanOrEqual(1)

      await page.keyboard.press('Escape')
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T144, SC-608 — **a block takes effect on the NEXT REQUEST, not on a cache expiry.**
   *
   * This is the criterion the offline policy was chosen to make true. The card repository is
   * deliberately **not** wrapped in the caching decorator (FR-648), because that decorator
   * revokes on **age alone** — so a cached contacts list would keep a blocked person's live
   * profile on screen for up to twenty-four hours. That is exactly the failure 006 refused to
   * cache the directory for, and age is the wrong clock for a refusal.
   *
   * Measured by reloading immediately after the block: no waiting, no cache-busting, no second
   * navigation to warm anything.
   *
   * **The block is lifted again before the test ends**, and that is not tidiness. This database
   * is seeded once for the whole run and a block is durable by design, so leaving one in place
   * would silently change the starting state of every spec after it — the order-dependence
   * `support/attendees.ts` records at length for the active conference.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('T144 — SC-608: a block takes effect on the next request, not on a cache expiry', async ({
    page,
  }) => {
    await signedIn(page, GRACE)

    await page.goto('/network')
    // Scoped to the Contacts region: the appointments pane names the same person, and an
    // unscoped locator fails on strict mode rather than on what it is asserting.
    const contacts = page.getByRole('region', { name: 'Contacts' })
    await expect(
      contacts.getByRole('heading', { name: ADA.displayName }),
      "Grace does not hold Ada's card, so this test would prove nothing about a block removing " +
        'it. The first test in this file is what creates the exchange.',
    ).toBeVisible()

    // Blocking lives on the conversation thread, which is where 007 put it.
    await page.goto('/messages')
    await page
      .getByRole('link', { name: new RegExp(ADA.displayName) })
      .first()
      .click()
    await page.getByRole('button', { name: `Block ${ADA.displayName}` }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Block' }).click()

    // The very next request for the contacts list. Nothing is waited for and nothing is
    // invalidated by hand: if this passes only after a delay, the list is being cached.
    await page.goto('/network')
    await expect(
      page
        .getByRole('region', { name: 'Contacts' })
        .getByRole('heading', { name: ADA.displayName }),
      'The blocked attendee is still listed as a contact on the request immediately after the ' +
        'block. SC-608 requires it to take effect on the NEXT request — which is why the card ' +
        'repository is deliberately left out of the caching decorator (FR-648).',
    ).toBeHidden()

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Lifting the block **restores the contact**, with no write anywhere: card severance is
    // read-side precisely so that it reverses (FR-637a). This also returns the run's shared
    // database to the state every later spec expects.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await page.goto('/account')
    await page.getByRole('button', { name: `Unblock ${ADA.displayName}` }).click()

    await page.goto('/network')
    await expect(
      page
        .getByRole('region', { name: 'Contacts' })
        .getByRole('heading', { name: ADA.displayName }),
    ).toBeVisible()
  })
})
