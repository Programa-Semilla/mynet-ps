import { expect, test, type Page } from '@playwright/test'

import {
  ADA,
  GRACE,
  signIn,
  switchToAnotherConference,
  useConference,
} from './support/attendees.js'

/**
 * T055 (007) — **switching conference leaves Messages untouched** (FR-507, M2, standing
 * decision 7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ASSERTION THAT SEPARATES THE TWO HALVES OF THE PRODUCT.**
 *
 * Standing decision 7 splits everything MyNet stores in two: conference content swaps on switch,
 * relationships persist across it. Every per-attendee surface before 007 is in the first half,
 * and `e2e/discover.spec.ts` and the agenda specs assert exactly that — *the previous
 * conference's content must be gone*. This file asserts the opposite for the first time, and the
 * two sit side by side deliberately: a reader comparing them sees the boundary rather than an
 * inconsistency.
 *
 * The integration suite proves the payload does not change (`conversation-cross-event`). Only a
 * browser can prove the **rendered destination** does not — that no component quietly re-keys on
 * the active conference, and that the switch does not blank a thread mid-read.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

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

test.describe('Messages across a conference switch', () => {
  test('the list, the thread and its contents are unchanged by switching (FR-507, SC-511)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, SHARED_CONFERENCE)

    // A conversation with Grace, opened at the shared conference.
    await page.goto('/discover')
    await page
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()
    await page
      .getByRole('dialog')
      .getByRole('link', { name: new RegExp(`message ${GRACE.displayName}`, 'i') })
      .click()

    const line = `Written at the summit, ${Date.now()}`
    await page.getByRole('textbox', { name: /message/i }).fill(line)
    await page.getByRole('button', { name: /send message/i }).click()
    // Asserted rather than assumed: sending from the new-thread address REPLACES it with the
    // conversation's own (FR-503a → FR-569), and capturing `page.url()` without waiting for that
    // would record the composing address instead.
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/)
    await expect(threadOf(page)).toContainText(line)

    const conversationUrl = page.url()

    // Back to the destination, and record what it shows.
    await page.goto('/messages')
    const rows = page.locator('a[href^="/messages/"]')
    await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible()
    // Awaited before counting: the heading renders immediately and the list arrives with its
    // read, so counting straight away counts zero and would make the comparison below vacuous.
    await expect(rows.first()).toBeVisible()
    const before = await rows.count()
    expect(before, 'the fixture must actually show a conversation').toBeGreaterThan(0)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The switch goes through the real conference switcher, not through a URL. That is the
    // journey an attendee takes, and it is what triggers whatever re-reads the shell performs.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const target = await switchToAnotherConference(page, ADA)
    expect(target).not.toBe(SHARED_CONFERENCE)

    await expect(page.getByRole('heading', { name: 'Messages', level: 1 })).toBeVisible()
    await expect(
      rows,
      'Switching conference must not change which conversations are listed. Grace is not ' +
        'registered for this one at all — a per-event filter here would empty the destination, ' +
        'which is exactly the failure FR-507 exists to prevent.',
    ).toHaveCount(before)

    // …and the thread itself is still readable, at the same address, with the same content.
    await page.goto(conversationUrl)
    await expect(threadOf(page)).toContainText(line)
  })

  test('a thread open during a switch is not blanked or replaced', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, SHARED_CONFERENCE)

    await page.goto('/messages')
    await page
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()

    const thread = threadOf(page)
    await expect(thread).toBeVisible()
    const conversationUrl = page.url()

    // Switch while the thread is on screen. The conference switcher lives in the shell, so this
    // is a thing an attendee can genuinely do mid-conversation.
    await switchToAnotherConference(page, ADA)

    await expect(page, 'the address does not move').toHaveURL(conversationUrl)
    await expect(
      thread,
      'A thread that emptied itself on a conference switch would be the precise failure the ' +
        'cross-event rule exists to prevent, and the one a component test cannot see.',
    ).toBeVisible()
    await expect(thread.getByRole('textbox', { name: /message/i })).toBeVisible()
  })
})
