import { expect, test, type Page } from '@playwright/test'

import { ADA, GRACE, signIn, useConference } from './support/attendees.js'

const SHARED_CONFERENCE = 'Product & Design Summit'

/**
 * The open thread, as a region.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Selected structurally — the region nested inside the Messages region — rather than by its
 * accessible name.**
 *
 * The thread's name is the counterpart's display name once it has loaded, and "New message"
 * before a conversation exists. A name-matching selector therefore has to know who the fixture
 * is talking to, and it silently stops matching the day the header changes — which is exactly
 * what happened when the header stopped reading "Conversation".
 *
 * Scoping is needed at all because a message's text legitimately appears twice on the two-pane
 * layout: once as its row's preview (FR-509) and once as the message.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const threadOf = (page: Page) => page.getByRole('region', { name: 'Messages' }).getByRole('region')

/** Home's indicator. Absent entirely when there is nothing unread, which is FR-531. */
const indicatorOf = (page: Page) => page.getByRole('region', { name: 'Unread messages' })

test.describe('the unread indicator', () => {
  test('appears on Home when a message arrives, and clears when the thread is opened', async ({
    browser,
  }) => {
    // Ada, who will receive.
    const adaContext = await browser.newContext()
    const adaPage = await adaContext.newPage()
    await adaPage.goto('/')
    await signIn(adaPage, ADA)
    await useConference(adaPage, SHARED_CONFERENCE)

    // Whatever has accumulated from earlier specs, Ada reads it all first, so this test starts
    // from a known state rather than from whatever the shared seeded database happens to hold.
    await adaPage.goto('/messages')
    const rows = adaPage.locator('a[href^="/messages/"]')
    const existing = await rows.count()
    for (let index = 0; index < existing; index += 1) {
      await rows.nth(index).click()
      await expect(threadOf(adaPage)).toBeVisible()
      await adaPage.goto('/messages')
    }

    await adaPage.goto('/')
    await expect(
      indicatorOf(adaPage),
      'the fixture must start with nothing unread, or the assertion below proves nothing',
    ).toHaveCount(0)

    // Grace sends something.
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await useConference(gracePage, SHARED_CONFERENCE)

    await gracePage.goto('/discover')
    await gracePage
      .getByRole('link', { name: new RegExp(ADA.displayName) })
      .first()
      .click()
    await gracePage
      .getByRole('dialog')
      .getByRole('link', { name: new RegExp(`message ${ADA.displayName}`, 'i') })
      .click()

    const arriving = `Something waiting, ${Date.now()}`
    await gracePage.getByRole('textbox', { name: /message/i }).fill(arriving)
    await gracePage.getByRole('button', { name: /send message/i }).click()
    await expect(threadOf(gracePage)).toContainText(arriving)

    // Ada revisits Home. The indicator is there.
    await adaPage.goto('/')
    await expect(
      indicatorOf(adaPage),
      'A message arrived and Home says so (FR-531). The card renders nothing at zero, so its ' +
        'presence IS the assertion.',
    ).toBeVisible()

    // Following it reaches Messages, and opening the conversation clears the indicator.
    await indicatorOf(adaPage).getByRole('link').click()
    await expect(adaPage).toHaveURL(/\/messages$/)

    await adaPage
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()
    await expect(threadOf(adaPage)).toContainText(arriving)

    await adaPage.goto('/')
    await expect(
      indicatorOf(adaPage),
      'Opening the thread advanced the read position through what was displayed (FR-528), the ' +
        'write reached the server, and Home re-read on navigation rather than serving a value it ' +
        'held in memory.',
    ).toHaveCount(0)

    await adaContext.close()
    await graceContext.close()
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T014 (016) — **the list updates itself while somebody sits on it** (SC-1002, SC-1003).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE READER NAVIGATES NOWHERE, AND THAT IS THE ENTIRE TEST.**
   *
   * Every other assertion about the conversation list in this suite reaches it with `goto` or a
   * click, and a destination that reads once on mount passes all of them — which is how the
   * defect survived to be found by the owner using the product. Ada opens Messages, and then
   * **nothing touches her page again**: no reload, no navigation, no interaction. Whatever
   * appears, appears because the list asked.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   *
   * **The timeout is SC-1002's fifteen seconds, and it is larger than the ten-second interval on
   * purpose.** A poll of interval N has a worst case of N plus jitter plus the request, because
   * a message can land immediately after a tick. A fifteen-second bound over a ten-second
   * interval is arithmetic rather than slack — asserting the interval as the bound would fail
   * intermittently, and the failures would look like flakiness rather than like a criterion that
   * was never satisfiable.
   */
  test('T014 — a message reaches the conversation list without the reader navigating', async ({
    browser,
  }) => {
    const adaContext = await browser.newContext()
    const adaPage = await adaContext.newPage()
    await adaPage.goto('/')
    await signIn(adaPage, ADA)
    await useConference(adaPage, SHARED_CONFERENCE)

    // Ada arrives at Messages and stays there. This is the last thing done to her page.
    await adaPage.goto('/messages')
    await expect(adaPage.getByRole('region', { name: 'Messages' })).toBeVisible()

    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await useConference(gracePage, SHARED_CONFERENCE)

    await gracePage.goto('/discover')
    await gracePage
      .getByRole('link', { name: new RegExp(ADA.displayName) })
      .first()
      .click()
    await gracePage
      .getByRole('dialog')
      .getByRole('link', { name: new RegExp(`message ${ADA.displayName}`, 'i') })
      .click()

    const arriving = `Arriving while she watches, ${Date.now()}`
    await gracePage.getByRole('textbox', { name: /message/i }).fill(arriving)
    await gracePage.getByRole('button', { name: /send message/i }).click()
    await expect(threadOf(gracePage)).toContainText(arriving)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Ada's list, unprompted. The preview is what the row shows (FR-509), so finding the text
    // proves the row was re-read rather than merely that a row exists.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await expect(
      adaPage.getByText(arriving).first(),
      'The message never reached the list. Ada did not navigate, so a destination that reads ' +
        'once on mount shows her whatever was true when she arrived — which is the defect: a ' +
        'live thread beside a frozen list of threads.',
    ).toBeVisible({ timeout: 15_000 })

    await adaContext.close()
    await graceContext.close()
  })
})
