import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T068 (005) — the agenda with no signal (FR-215–FR-221, SC-203, SC-204).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONLY PLACE THE INDEXEDDB IMPLEMENTATION IS ACTUALLY EXERCISED.**
 *
 * The caching decorator's rules — the 24-hour lifetime, per-attendee keys, invalidation on
 * refusal — are unit-tested against an in-memory store, because that is where the rules live.
 * The *storage* is a browser capability with no Node equivalent, and standing up a fake
 * IndexedDB in the unit layer would test the fake. So the round trip is proved here, in a real
 * browser, going genuinely offline.
 *
 * The claim under test is not "MyNet works offline". It is 002's claim, extended: MyNet
 * **tells the truth** offline. What is readable is readable and stamped with when it was
 * retrieved; what is not is said to be unavailable; and every write is refused rather than
 * queued or faked.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const goToAgenda = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Agenda' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
}

/** Waits for the service worker, which is what makes the shell available offline at all. */
const awaitServiceWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
    timeout: 20_000,
  })
}

test.describe('Agenda offline', () => {
  test('the programme and saved set stay READABLE, with a retrieval stamp', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    // Read once while connected — the cache is seeded by ordinary reads, never by pre-fetching,
    // which is what keeps it honest about what it can serve.
    const titles = await page.getByRole('heading', { level: 3 }).allTextContents()
    expect(titles.length).toBeGreaterThan(0)

    await context.setOffline(true)
    await page.reload()

    try {
      // FR-215 — the programme is readable with no connection.
      await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
      for (const title of titles) {
        await expect(page.getByRole('heading', { level: 3, name: title.trim() })).toBeVisible()
      }

      // FR-216, SC-204 — and it says when it was retrieved, as a time rather than a badge.
      await expect(page.getByText(/last updated/i)).toBeVisible()
      await expect(page.getByText(/saved on this device/i)).toBeVisible()

      // The saved filter works offline too: the saved set is cached alongside the programme.
      await page.getByRole('radio', { name: 'Saved' }).check()
      await expect(page.getByText(/nothing saved yet/i)).toBeVisible()
    } finally {
      await context.setOffline(false)
    }
  })

  test('an offline SAVE is refused, changes nothing, and queues nothing (SC-203)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    const link = page.getByRole('heading', { level: 3 }).first().getByRole('link')
    const title = ((await link.textContent()) ?? '').trim()

    await context.setOffline(true)

    try {
      await page.getByRole('button', { name: `Save ${title} to your agenda` }).click()

      // Refused with an explanation, not silently ignored and not shown as succeeded.
      const refusal = page.getByRole('alert')
      await expect(refusal).toBeVisible()
      await expect(refusal).toContainText(/needs a connection/i)
      await expect(refusal).toContainText(/nothing has been queued/i)

      // The displayed state did not change: the control still offers to save.
      await expect(page.getByRole('button', { name: `Save ${title} to your agenda` })).toBeVisible()
    } finally {
      await context.setOffline(false)
    }

    // ── Back online: the same action now succeeds, WITHOUT A RELOAD (US4 scenario 6) ───────
    await page.getByRole('button', { name: `Save ${title} to your agenda` }).click()
    await expect(
      page.getByRole('button', { name: `Remove ${title} from your agenda` }),
    ).toBeVisible()

    // And nothing replayed itself while offline — exactly one save happened, the one just made.
    await page.getByRole('radio', { name: 'Saved' }).check()
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1)

    // Clean up.
    await page.getByRole('button', { name: `Remove ${title} from your agenda` }).click()
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()
  })

  test('an offline NOTE says there is no connection, and keeps the text (FR-218)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)
    await awaitServiceWorker(page)

    await page.getByRole('heading', { level: 3 }).first().getByRole('link').click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await context.setOffline(true)

    try {
      const editor = page.getByRole('textbox', { name: /private notes/i })
      await editor.fill('Written in a basement with no signal.')

      const alert = page.getByRole('alert')
      await expect(alert).toBeVisible({ timeout: 15_000 })
      await expect(alert).toContainText(/no connection/i)
      // Distinct from a server fault — the attendee must not be sent to fix the wrong thing.
      await expect(alert).not.toContainText(/our side/i)

      // **The text stays on screen.** It was never sent anywhere, so clearing the field would
      // destroy the only copy.
      await expect(editor).toHaveValue('Written in a basement with no signal.')
    } finally {
      await context.setOffline(false)
    }

    // Retry succeeds, and the note is stored.
    await page.getByRole('button', { name: /try again/i }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })

    // Clean up.
    await page.getByRole('textbox', { name: /private notes/i }).fill('')
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('a NEVER-READ conference says so rather than showing an empty programme (FR-219)', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The cache is emptied, because "never visited Agenda" is not the same as "nothing
    // cached" — and discovering that is what this test is worth.**
    //
    // Home's own cards read the very same programme, through the very same repository, so by
    // the time an attendee reaches Agenda for the first time the programme is already cached.
    // That is the feature working exactly as designed: one cached entry per conference serves
    // every surface, which is the mechanism behind SC-210.
    //
    // It does mean a test that simply avoided Agenda would be asserting the *wrong* state.
    // Clearing the store is what actually produces a conference whose content has never been
    // retrieved on this device.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.evaluate(
      async () =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase('mynet-cache')
          request.onsuccess = () => resolve()
          request.onerror = () => resolve()
          request.onblocked = () => resolve()
        }),
    )

    await context.setOffline(true)

    try {
      await page.goto('/agenda')

      // ─────────────────────────────────────────────────────────────────────────────────────
      // With nothing cached at all, the *first* thing that cannot resolve is which conference
      // the attendee is in — so the message comes from that layer rather than the programme's.
      // Which layer says it is a presentation detail; that the attendee is told both halves is
      // the requirement, and that is what is asserted.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const failure = page.getByRole('alert').first()
      await expect(failure).toBeVisible()
      await expect(failure).toContainText(/needs a connection/i)
      await expect(failure).toContainText(/nothing is cached/i)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Not an empty programme.** That state is a fact about the conference; this is a fact
      // about the device. Rendering the second as the first tells an attendee standing in a
      // venue that there is no programme, when there is one and they cannot see it.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await expect(page.getByText(/no published programme/i)).toHaveCount(0)
    } finally {
      await context.setOffline(false)
    }
  })
})
