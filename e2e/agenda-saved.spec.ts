import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T029 (005) — a personal agenda, durable across sign-out and across devices
 * (FR-184–FR-188, SC-200, SC-201).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The device clause is the one that matters, and it is why this is an end-to-end test rather
 * than a component one.**
 *
 * A saved set held in component state passes a component test. A set held in `localStorage`
 * passes a reload. Only a fresh browser context — new storage, new cookies, nothing carried
 * over but the attendee's credentials — distinguishes durable server-side state from either.
 * That is the same reasoning 002 recorded for the conference choice, and it is the reason this
 * spec opens a second context rather than calling `page.reload()` twice.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The suite shares one seeded database, so every test here **unsaves what it saved**. Saved
 * sessions are durable by design, which is exactly what would otherwise leak into the next
 * spec — the Home card added by this same feature reads them.
 */

const goToAgenda = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Agenda' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
}

/** The first session row's title, so assertions name a real session rather than an index. */
const firstSessionTitle = async (page: Page): Promise<string> => {
  const heading = page.getByRole('heading', { level: 3 }).first()
  await expect(heading).toBeVisible()
  return (await heading.textContent())?.trim() ?? ''
}

const saveControl = (page: Page, title: string) =>
  page.getByRole('button', { name: `Save ${title} to your agenda` })

const removeControl = (page: Page, title: string) =>
  page.getByRole('button', { name: `Remove ${title} from your agenda` })

test.describe('saved sessions', () => {
  test('save, filter, sign out, and sign in on another device — still saved', async ({
    page,
    browser,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    // ── Save two sessions ────────────────────────────────────────────────────────────────
    const titles = await page.getByRole('heading', { level: 3 }).allTextContents()
    const [first, second] = titles.map((title) => title.trim())
    if (!first || !second) throw new Error('The seeded programme has fewer than two sessions.')

    await saveControl(page, first).click()
    // The label changes with the state, which is how the attendee knows it took (FR-189).
    await expect(removeControl(page, first)).toBeVisible()

    await saveControl(page, second).click()
    await expect(removeControl(page, second)).toBeVisible()

    // ── Filter to Saved — SC-200's second of two interactions ────────────────────────────
    await page.getByRole('radio', { name: 'Saved' }).check()
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(2)
    await expect(page.getByRole('heading', { level: 3, name: first })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: second })).toBeVisible()

    // ── Sign out ─────────────────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Password')).toBeVisible()

    // ── A different device: a fresh context carries nothing over ─────────────────────────
    const otherDevice = await browser.newContext()
    const otherPage = await otherDevice.newPage()
    await otherPage.goto('/')
    await signIn(otherPage, ADA)
    await goToAgenda(otherPage)

    await otherPage.getByRole('radio', { name: 'Saved' }).check()
    await expect(
      otherPage.getByRole('heading', { level: 3 }),
      'Saved sessions are durable server-side state, not something the browser was holding.',
    ).toHaveCount(2)
    await expect(otherPage.getByRole('heading', { level: 3, name: first })).toBeVisible()

    // ── Clean up, and prove unsaving is durable in the same breath ───────────────────────
    await otherPage.getByRole('radio', { name: 'All sessions' }).check()
    await removeControl(otherPage, first).click()
    await expect(saveControl(otherPage, first)).toBeVisible()
    await removeControl(otherPage, second).click()
    await expect(saveControl(otherPage, second)).toBeVisible()

    await otherPage.reload()
    await goToAgenda(otherPage)
    await otherPage.getByRole('radio', { name: 'Saved' }).check()
    await expect(otherPage.getByText(/nothing saved yet/i)).toBeVisible()

    await otherDevice.close()
  })

  test('saving twice does not create a second entry (FR-187)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const title = await firstSessionTitle(page)

    await saveControl(page, title).click()
    await expect(removeControl(page, title)).toBeVisible()

    // The same session again, through a reload so the second save is a genuinely separate
    // request rather than a double click the client might have coalesced.
    await page.reload()
    await goToAgenda(page)
    await expect(removeControl(page, title)).toBeVisible()

    await page.getByRole('radio', { name: 'Saved' }).check()
    await expect(
      page.getByRole('heading', { level: 3, name: title }),
      'Saving the same session twice must not produce two entries in the agenda.',
    ).toHaveCount(1)

    // Clean up — from within the Saved view, where removing the only saved session must leave
    // the empty state rather than a blank list. The row is gone from *this* view by design, so
    // the return to an unsaved state is confirmed back on All.
    await removeControl(page, title).click()
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()

    await page.getByRole('radio', { name: 'All sessions' }).check()
    await expect(saveControl(page, title)).toBeVisible()
  })

  test('the empty state invites exploring and offers the way back (FR-195)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    await page.getByRole('radio', { name: 'Saved' }).check()

    // Nothing is seeded, so this is what a reviewer sees first — deliberately.
    await expect(page.getByText(/nothing saved yet/i)).toBeVisible()
    await expect(page.getByRole('heading', { level: 3 })).toHaveCount(0)

    await page.getByRole('button', { name: 'Show all sessions' }).click()
    await expect(page.getByRole('radio', { name: 'All sessions' })).toBeChecked()
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
  })
})
