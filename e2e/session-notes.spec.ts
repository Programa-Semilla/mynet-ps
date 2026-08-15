import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T055 (005) — personal notes end to end: type → pause → saved → reload → read back → clear →
 * gone (FR-207–FR-213, SC-202).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SC-202 has two halves and both are asserted here.**
 *
 * "A note is recoverable after an unexpected reload **with no explicit save action ever having
 * been taken**" — so this spec never clicks a save control for the note, because there is not
 * one to click; the reload is what proves the pause was enough.
 *
 * "**And no note is ever reported saved that the server did not confirm**" — which is why the
 * status is read *before* the reload as well as after. A client that reported `Saved.` and
 * then lost the note would satisfy the first half and fail the product.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const goToAgenda = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Agenda' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
}

/** Opens the first session's panel and returns its title and address. */
const openFirstSession = async (page: Page): Promise<{ title: string; href: string }> => {
  const link = page.getByRole('heading', { level: 3 }).first().getByRole('link')
  await expect(link).toBeVisible()
  const title = ((await link.textContent()) ?? '').trim()
  const href = (await link.getAttribute('href')) ?? ''

  await link.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  return { title, href }
}

const editor = (page: Page) => page.getByRole('textbox', { name: /private notes/i })

test.describe('personal notes', () => {
  test('type, pause, saved, reload, read back, clear, gone', async ({ page }) => {
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **Unique per ATTEMPT, or a CI retry can never pass.** A first attempt that saved the
    // note and then failed later leaves the note in the database; the retry reopens the same
    // session, the editor loads that note, and `fill()` with the identical text changes
    // nothing — a controlled input with an unchanged value schedules no autosave, so
    // "Saved." never appears and the retry times out on the very step the first attempt
    // passed. Salting the text with the retry number makes every attempt a real edit.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const note = `Ask the speaker about the migration path. (attempt ${test.info().retry})`

    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { href } = await openFirstSession(page)

    // ── Type, and stop. There is no save control, and there must not be one ───────────────
    await editor(page).fill(note)
    await expect(
      page.getByRole('dialog').getByRole('button', { name: /^save$/i }),
      'The note must persist without any explicit save action (FR-209).',
    ).toHaveCount(0)

    // The status resolves to saved only once the server has confirmed the write.
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })

    // ── Reload — the unexpected loss of the page ──────────────────────────────────────────
    await page.reload()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(editor(page)).toHaveValue(note)

    // ── And on a different device, since the note is server-side state ────────────────────
    await page.goto('/agenda')
    await page.goto(href)
    await expect(editor(page)).toHaveValue(note)

    // ── Clear it entirely: the note is removed, not stored blank (FR-212) ─────────────────
    await editor(page).fill('')
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })

    await page.reload()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(
      editor(page),
      'Reopening must show an empty note rather than the old text (US3 scenario 5).',
    ).toHaveValue('')
  })

  test('a note can be written on a session that is NOT saved (FR-207)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title } = await openFirstSession(page)

    // The session is unsaved — the control behind the panel still offers to save it.
    await page.getByRole('button', { name: /close session details/i }).click()
    await expect(page.getByRole('button', { name: `Save ${title} to your agenda` })).toBeVisible()

    await page.getByRole('link', { name: title }).click()
    await editor(page).fill('Noting without saving.')
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })

    // Clean up.
    await editor(page).fill('')
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('an in-flight write is NOT cancelled when the panel closes (US3 scenario 6)', async ({
    page,
  }) => {
    // Unique per attempt, for the first test's reason: a retry re-filling identical text is
    // no change, schedules no write, and the `waitForResponse` below then never resolves.
    const dismissed = `Typed and dismissed straight away. (attempt ${test.info().retry})`

    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { href } = await openFirstSession(page)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Typed and then dismissed immediately — well inside the debounce, so the write has not
    // even been dispatched when the panel goes away. The controller flushes the pending write
    // on unmount and lets an already-dispatched one finish, so nothing the attendee wrote is
    // lost because they closed the panel a moment too early.
    //
    // **The write is observed on the wire rather than inferred from a later read**, and that
    // is not merely a stronger assertion — it is the only correct one. Reloading the page
    // straight after Escape would abort the very request under test, because a document
    // navigation cancels in-flight fetches. The test would then fail for a reason that has
    // nothing to do with the requirement: an attendee who closes a panel stays on the page.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const written = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/agenda/notes/') &&
        response.ok(),
      { timeout: 15_000 },
    )

    await editor(page).fill(dismissed)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The request outlived the component that started it (US3 scenario 6).
    await written

    // And it really did store the note: reopen by address and read it back.
    await page.goto(href)
    await expect(editor(page)).toHaveValue(dismissed, {
      timeout: 15_000,
    })

    // Clean up.
    await editor(page).fill('')
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
      timeout: 15_000,
    })
  })
})
