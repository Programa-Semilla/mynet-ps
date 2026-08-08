import { expect, test } from '@playwright/test'

import { ADA, GRACE, signIn, useConference } from './support/attendees.js'

/**
 * T058c, T085, T097, T099 (006) — Discover, in a real browser (SC-401, SC-403a, SC-407).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THESE ARE THE ASSERTIONS NO OTHER LAYER CAN MAKE.**
 *
 * Everything here needs something the component and integration suites do not have: a real
 * network to count requests on, a real layout engine to measure overflow with, a real top layer
 * to trap focus in, and a real address bar to reload.
 *
 * The integration suite proves the *payload* carries every face (`directory-performance`); only
 * a browser can prove the client does not then go and fetch twenty-four more.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The seeded fixture is what makes this work at all: Ada and Grace share `Product & Design
 * Summit`, both are verified and discoverable, and Alan is registered but unverified — so the
 * directory has exactly one visible co-attendee and one deliberate absence.
 */

/** Ada and Grace share exactly this one, and it is what every assertion below depends on. */
const SHARED_CONFERENCE = 'Product & Design Summit'

test.describe('Discover', () => {
  /**
   * T058c — **one request carries a page of cards AND all their faces** (SC-407, FR-456).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The N-round-trip problem this exists to prevent is the ordinary way a directory is built:
   * a listing of identifiers, then one image request per card. At twenty-four cards that is
   * twenty-five requests, and the visible symptom is a grid of placeholder circles resolving
   * one at a time — on a conference wifi, over several seconds.
   *
   * Counting requests is the only honest way to assert it. A test that checked the payload had
   * an `avatar` field would pass just as happily against a client that ignored it and fetched
   * the images anyway.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('renders the directory and its faces in ONE request (SC-407, FR-456)', async ({ page }) => {
    const directoryReads: string[] = []
    const avatarReads: string[] = []

    page.on('request', (request) => {
      const url = new URL(request.url())
      if (/\/events\/[^/]+\/attendees\/[^/]+\/avatar$/.test(url.pathname))
        avatarReads.push(url.pathname)
      else if (/\/events\/[^/]+\/attendees$/.test(url.pathname)) directoryReads.push(url.pathname)
    })

    await page.goto('/')
    await signIn(page, ADA)
    // Pinned, not assumed. The active conference is durable and an earlier spec may have moved
    // it — see `useConference` for the run this was learned from.
    await useConference(page, SHARED_CONFERENCE)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Counted from HERE, not from sign-in. Home renders the People to meet card, which reads
    // the same directory with `limit=5` — a legitimate second reader, and one that would make
    // "one request" read as two if the count began earlier. Discover's own read is what SC-407
    // is about.
    // ───────────────────────────────────────────────────────────────────────────────────────
    directoryReads.length = 0
    avatarReads.length = 0

    await page.goto('/discover')

    await expect(page.getByRole('heading', { name: GRACE.displayName, level: 3 })).toBeVisible()

    expect(directoryReads.length, 'the listing should be read once for one page').toBe(1)
    expect(
      avatarReads,
      'The directory must not issue a per-card avatar request. FR-456 embeds the card rendition ' +
        'in the listing precisely so a page of 24 faces is one request rather than 25.',
    ).toEqual([])
  })

  test('shows nobody who fails one of the three conditions (FR-402)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned, not assumed. The active conference is durable and an earlier spec may have moved
    // it — see `useConference` for the run this was learned from.
    await useConference(page, SHARED_CONFERENCE)
    await page.goto('/discover')

    await expect(page.getByRole('heading', { name: GRACE.displayName, level: 3 })).toBeVisible()

    // Alan is registered for this conference and discoverable by default. His address is
    // unverified, and that alone keeps him out — the condition carrying SC-304a's threat model.
    await expect(page.getByText('Alan Turing')).toHaveCount(0)
    // And the reader is not in their own directory.
    await expect(page.getByRole('heading', { name: ADA.displayName, level: 3 })).toHaveCount(0)
  })

  /**
   * T085 — the profile view is addressable, survives a reload, and is shareable (FR-431).
   *
   * Navigating to it directly is the assertion that matters. A dialog opened only by clicking a
   * card would pass a click-based test and 404 on a pasted link — and "an address they can
   * return to or share" is what the user story asks for.
   */
  test('the profile address is reachable directly and survives a reload (FR-431)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned, not assumed. The active conference is durable and an earlier spec may have moved
    // it — see `useConference` for the run this was learned from.
    await useConference(page, SHARED_CONFERENCE)
    await page.goto('/discover')

    const card = page.getByRole('heading', { name: GRACE.displayName, level: 3 })
    await expect(card).toBeVisible()
    await card.getByRole('link').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: GRACE.displayName, level: 2 })).toBeVisible()

    // The address names the attendee, so it can be copied out of the bar.
    const address = page.url()
    expect(address).toMatch(/\/discover\/[0-9a-f-]{36}$/)

    // …and pasting it back in — a fresh document, no client state — opens the same profile.
    await page.reload()
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: GRACE.displayName, level: 2 }),
      'a reload on the profile address must reopen it, not drop back to the directory',
    ).toBeVisible()
  })

  /**
   * FR-433's three clauses, in the only environment where they are real: `showModal()` puts the
   * dialog in the top layer and makes everything behind it inert, and **jsdom implements none
   * of that** — `apps/web/tests/component/attendee-profile.test.tsx` says so in its own header
   * and asserts only the wiring.
   */
  test('the profile dialog traps focus, dismisses on Escape, and restores focus (FR-433)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned, not assumed. The active conference is durable and an earlier spec may have moved
    // it — see `useConference` for the run this was learned from.
    await useConference(page, SHARED_CONFERENCE)
    await page.goto('/discover')

    const opener = page
      .getByRole('heading', { name: GRACE.displayName, level: 3 })
      .getByRole('link')
    await expect(opener).toBeVisible()
    await opener.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The dialog is genuinely modal — `:modal` is the platform's own answer, and it is what the
    // focus trap and the background inertness follow from. Asserted directly, because a
    // non-modal `show()` produces a dialog that looks identical and traps nothing.
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Focus never reaches anything BEHIND the dialog** — asserted that way rather than as
    // "focus is always inside the dialog", which is subtly false and would send a later reader
    // to fix an implementation that is correct.
    //
    // With exactly one tabbable element inside it, Chrome's modal focus cycle alternates
    // between that element and `document.body`. Focus is still confined: the directory's search
    // field, its filters and its cards are all inert and unreachable, which is the guarantee
    // FR-433 is about. The dialog will gain more focusable controls when 007 and 008 attach
    // theirs, and this assertion holds either way.
    // ───────────────────────────────────────────────────────────────────────────────────────
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('Tab')
      const escaped = await page.evaluate(() => {
        const active = document.activeElement
        const modal = document.querySelector('dialog[open]')
        if (!active || !modal) return 'no dialog'
        if (modal.contains(active)) return null
        // Body is part of Chrome's cycle for a single-control modal. Anything else means the
        // background was not inert.
        return active === document.body
          ? null
          : `${active.tagName}:${active.textContent?.slice(0, 40)}`
      })
      expect(escaped, `focus reached content behind the dialog after ${i + 1} tabs`).toBeNull()
    }

    // …and the background really is inert: the directory's own controls cannot be reached.
    await expect(page.getByRole('searchbox', { name: /search attendees/i })).not.toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Restored to the exact card that opened it. The platform does not do this reliably, so it
    // is this feature's code under test — and the ORDER is what makes it work: close first, so
    // the directory stops being inert, then focus.
    await expect(opener).toBeFocused()
  })

  /**
   * T097 — **SC-401: the core journey, inside 30 seconds, without prior instruction.**
   *
   * The budget is asserted rather than described. It is generous on purpose: what it catches is
   * not a slow query — the integration suite measures those at 1,000 attendees — but a journey
   * with a step nobody can find, which shows up here as a timeout on the very first locator.
   */
  test('sign in → Discover → search → open a profile → return, under 30 seconds (SC-401)', async ({
    page,
  }) => {
    for (const width of [{ px: 375 }, { px: 1440 }]) {
      await page.setViewportSize({ width: width.px, height: 900 })

      await page.goto('/')
      await signIn(page, ADA)
      await useConference(page, SHARED_CONFERENCE)

      // Timed from HERE. Pinning the conference is fixture setup for a suite whose database is
      // seeded once and mutated by earlier specs; an attendee opening the product is already in
      // their conference, and charging them for a switch they never make would measure the
      // harness rather than the journey.
      const started = Date.now()

      await page.getByRole('link', { name: 'Discover' }).first().click()
      await expect(page.getByRole('heading', { name: 'Discover', level: 1 })).toBeVisible()

      await page.getByRole('searchbox', { name: /search attendees/i }).fill('Hopper')
      const card = page.getByRole('heading', { name: GRACE.displayName, level: 3 })
      await expect(card).toBeVisible()

      await card.getByRole('link').click()
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: GRACE.displayName, level: 2 }),
      ).toBeVisible()

      await page.getByRole('button', { name: /close profile/i }).click()
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Discover', level: 1 })).toBeVisible()

      const elapsed = Date.now() - started
      // eslint-disable-next-line no-console
      console.log(`  [SC-401] journey at ${width.px}px: ${(elapsed / 1000).toFixed(1)}s`)
      expect(elapsed, `the journey took ${elapsed}ms at ${width.px}px`).toBeLessThan(30_000)

      // Reset for the next width, so the second pass starts from the same place as the first.
      await page.context().clearCookies()
    }
  })

  /**
   * T099 — **no horizontal scrolling at 320px** (Principle IV, SC-211).
   *
   * Measured, not inspected. jsdom computes no layout at all, so this is the only place the
   * obligation can be checked — and 320px is the stated floor rather than a representative
   * narrow width.
   */
  test('never scrolls horizontally at 320px, on Discover, the profile view or Home', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned, not assumed. The active conference is durable and an earlier spec may have moved
    // it — see `useConference` for the run this was learned from.
    await useConference(page, SHARED_CONFERENCE)

    const overflows = () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

    for (const path of ['/', '/discover']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const { scrollWidth, clientWidth } = await overflows()
      expect(
        scrollWidth,
        `${path} scrolls horizontally at 320px (${scrollWidth}px content in ${clientWidth}px)`,
      ).toBeLessThanOrEqual(clientWidth)
    }

    // The profile dialog, which is the surface most likely to overflow: a `<dialog>` carries a
    // user-agent `max-width` that `w-full` alone cannot beat, and the fix is `max-w-full`.
    await page.goto('/discover')
    await page.getByRole('heading', { name: GRACE.displayName, level: 3 }).getByRole('link').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const withDialog = await overflows()
    expect(
      withDialog.scrollWidth,
      `the profile dialog scrolls horizontally at 320px (${withDialog.scrollWidth}px in ${withDialog.clientWidth}px)`,
    ).toBeLessThanOrEqual(withDialog.clientWidth)

    // …and it genuinely spans the viewport rather than sitting in gutters.
    const dialogWidth = await page
      .getByRole('dialog')
      .evaluate((node) => node.getBoundingClientRect().width)
    expect(
      dialogWidth,
      'the mobile layout declares a FULL-WIDTH overlay. A dialog capped by the user-agent ' +
        'stylesheet at calc(100% - 6px - 2em) is 282px here — a card with gutters.',
    ).toBeGreaterThan(300)
  })

  /**
   * FR-401a's browser-visible half. The directory is conference content and swaps entirely on a
   * switch — and the integration suite cannot see a switch, because it has no switcher.
   */
  test('swaps entirely when the conference changes (FR-401a)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned, not assumed. The active conference is durable and an earlier spec may have moved
    // it — see `useConference` for the run this was learned from.
    await useConference(page, SHARED_CONFERENCE)
    await page.goto('/discover')

    await expect(page.getByRole('heading', { name: GRACE.displayName, level: 3 })).toBeVisible()

    const trigger = page.getByRole('button', { name: /change conference/i })
    await trigger.click()
    await page.getByRole('menuitemradio', { name: /Frontend Horizons/ }).click()
    await expect(trigger).toHaveAccessibleName(/Frontend Horizons/)

    // Grace is not registered for Frontend Horizons. She must be gone — not hidden, not stale.
    await expect(
      page.getByRole('heading', { name: GRACE.displayName, level: 3 }),
      'a co-attendee from the previous conference must not survive the switch (FR-401a)',
    ).toHaveCount(0)
    await expect(page.getByText(/nobody to show yet/i)).toBeVisible()
  })
})
