import { expect, test } from '@playwright/test'

import { ADA, GRACE, signIn, useConference } from './support/attendees.js'

/**
 * T141 (007) — **Messages offline: a stated refusal, not a degraded read** (FR-563, FR-564,
 * FR-565, SC-513, SC-514).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE WHOLE DESTINATION IS UNCACHED, AND THAT IS A DECISION RATHER THAN AN OMISSION.**
 *
 * 005 built a caching decorator and 006 declined to use it for the directory. 007 declines for
 * its entire surface, and the reasoning is not one reason repeated: message content is the most
 * sensitive data in the product, the decorator revokes on **age** alone, and a day-old
 * conversation on a device is a copy of somebody else's personal data with no offline capability
 * bought in exchange — because every write here is refused rather than queued (FR-565), and a
 * thread you cannot reply to is not a product.
 *
 * So this file asserts three things a component test cannot:
 *
 *   - **Nothing is disclosed** offline (SC-513). Not a preview, not a name, not a message —
 *     asserted against the rendered page after a real thread has been read while online.
 *   - **The state is the standard one** (FR-564), worded as connectivity rather than as a fault.
 *   - **A composed message is never sent later** (FR-565, SC-514). It is refused, it stays in the
 *     composer, and coming back online does not deliver it — which is the half a refusal test
 *     usually forgets, and the half that would surprise an attendee most.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const SHARED_CONFERENCE = 'Product & Design Summit'

test.describe('Messages offline', () => {
  test('discloses nothing, explains itself, and never queues a composed message', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await useConference(page, SHARED_CONFERENCE)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Read a real conversation **while online first**. That is what makes the offline
    // assertions meaningful: the content has demonstrably passed through this browser, so its
    // absence afterwards is a property of the caching decision rather than of never having had
    // it (SC-513).
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.goto('/messages')
    const rows = page.locator('a[href^="/messages/"]')
    await expect(rows.first()).toBeVisible()

    const conversationPreview = (await rows.first().textContent()) ?? ''
    expect(conversationPreview.trim().length, 'the fixture must have real content').toBeGreaterThan(
      0,
    )

    await rows.first().click()
    const thread = page.getByRole('region', { name: /conversation|hopper|lovelace/i })
    await expect(thread).toBeVisible()

    const readMessage = (await thread.locator('li').first().textContent()) ?? ''
    expect(readMessage.trim().length, 'a message was genuinely read online').toBeGreaterThan(0)

    const conversationUrl = page.url()

    await context.setOffline(true)

    // ── The destination, offline ────────────────────────────────────────────────────────────
    await page.goto('/messages')
    await expect(
      page.getByRole('heading', { name: 'Messages', level: 1 }),
      'the shell still renders — the destination is reachable, the content is not',
    ).toBeVisible()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Scoped to the destination's own region**, because an offline Home or an offline anything
    // also shows the *shell's* banner — and both are correct. What FR-564 asks for is that
    // Messages says its own piece: that there is nothing on this device to show, which the shell
    // banner does not and should not know.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const offlineState = page
      .getByRole('region', { name: 'Messages' })
      .getByRole('status')
      .filter({ hasText: /offline/i })
    await expect(offlineState, 'the standard offline state (FR-564)').toBeVisible()
    await expect(offlineState).toContainText(/not stored on this device/i)
    await expect(
      offlineState,
      'connectivity, not a fault on our side — telling the attendee otherwise sends them ' +
        'hunting for a problem that does not exist',
    ).not.toContainText(/problem on our side/i)

    // ── Nothing is disclosed (SC-513) ───────────────────────────────────────────────────────
    await expect(
      page.locator('a[href^="/messages/"]'),
      'no conversation is listed from a cache, because there is none',
    ).toHaveCount(0)

    const offlineBody = (await page.locator('body').textContent()) ?? ''
    expect(
      offlineBody.includes(readMessage.trim().slice(0, 40)),
      'A message read moments ago must not be readable offline. FR-563 makes that a refusal ' +
        'rather than a degraded read.',
    ).toBe(false)
    expect(offlineBody).not.toContain(GRACE.displayName)

    // ── The thread's own address, offline ────────────────────────────────────────────────────
    await page.goto(conversationUrl)
    await expect(
      page
        .getByRole('region', { name: 'Messages' })
        .getByRole('status')
        .filter({ hasText: /offline/i })
        .first(),
      'the addressable thread says the same thing rather than showing a browser error',
    ).toBeVisible()

    // ── A composed message is refused, kept, and never sent later (FR-565, SC-514) ───────────
    const composer = page.getByRole('textbox', { name: /message/i })
    await expect(composer).toBeVisible()

    const composedOffline = `Written while offline, ${Date.now()}`
    await composer.fill(composedOffline)
    await page.getByRole('button', { name: /send message/i }).click()

    await expect(
      page.getByRole('alert'),
      'refused with an explanation the attendee can act on',
    ).toContainText(/offline/i)
    await expect(
      composer,
      'and the message is still in the composer — not stored, not queued, not lost',
    ).toHaveValue(composedOffline)

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **The half a refusal test usually forgets.** Coming back online must not deliver it.
    // A message the attendee believes was refused, arriving minutes later in a conversation that
    // may since have been blocked or closed, is worse than the refusal they already acted on.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    await context.setOffline(false)
    await page.reload()

    const restored = page.getByRole('region', { name: /conversation|hopper|lovelace/i })
    await expect(restored).toBeVisible()
    await expect(
      restored,
      'Nothing was queued. There is no write queue anywhere in this product, and Messages did ' +
        'not invent one (FR-565, SC-514).',
    ).not.toContainText(composedOffline)
  })
})
