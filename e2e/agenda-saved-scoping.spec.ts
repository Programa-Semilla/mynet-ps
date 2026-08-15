import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn, switchToAnotherConference } from './support/attendees.js'

/**
 * T030 (005) — **each conference keeps its own saved set** (FR-185, FR-220, US1 scenario 5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Saved sessions are **per-event** under standing decision 7, and this is what that means in
 * front of an attendee: switching conference swaps the whole personal layer, and switching
 * back restores it unchanged.
 *
 * The failure this guards against is not a missing filter — it is a saved set keyed by
 * attendee alone, which would show conference A's saves under conference B's name. That
 * renders plausibly, reads as a bug in the programme rather than in the scoping, and would
 * survive every test that only ever looked at one conference. The seeded programmes are
 * disjoint by name (SC-107), which is what makes "wrong conference" visible here at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const goToAgenda = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Agenda' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
}

const firstSessionTitle = async (page: Page): Promise<string> => {
  const heading = page.getByRole('heading', { level: 3 }).first()
  await expect(heading).toBeVisible()
  return (await heading.textContent())?.trim() ?? ''
}

test('a save made at one conference does not follow the attendee to another', async ({ page }) => {
  await page.goto('/')
  await signIn(page, ADA)
  await goToAgenda(page)

  // ── Save one session in the conference we start in ─────────────────────────────────────
  const here = await firstSessionTitle(page)
  await page.getByRole('button', { name: `Save ${here} to your agenda` }).click()
  await expect(page.getByRole('button', { name: `Remove ${here} from your agenda` })).toBeVisible()

  // ── Switch away ────────────────────────────────────────────────────────────────────────
  await switchToAnotherConference(page, ADA)
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()

  // The other conference's programme, with the other conference's saved set — which is empty.
  await page.getByRole('radio', { name: 'My agenda' }).check()
  await expect(
    page.getByText(/nothing on your agenda yet/i),
    'A save made at one conference is meaningless at another, so this set must be empty.',
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 3, name: here }),
    "The other conference must not show the first conference's session at all — the seeded " +
      'programmes are disjoint, so any appearance here is a scoping failure.',
  ).toHaveCount(0)

  // ── Save something in this conference too, so the two sets are genuinely distinct ──────
  await page.getByRole('radio', { name: 'All sessions' }).check()
  const there = await firstSessionTitle(page)
  await page.getByRole('button', { name: `Save ${there} to your agenda` }).click()
  await expect(page.getByRole('button', { name: `Remove ${there} from your agenda` })).toBeVisible()

  await page.getByRole('radio', { name: 'My agenda' }).check()
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 3, name: there })).toBeVisible()

  // ── Switch back: the first conference's save is restored unchanged ─────────────────────
  await switchToAnotherConference(page, ADA)
  await goToAgenda(page)
  await page.getByRole('radio', { name: 'My agenda' }).check()

  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1)
  await expect(
    page.getByRole('heading', { level: 3, name: here }),
    "Switching back must restore this conference's saves exactly as they were.",
  ).toBeVisible()

  // ── Clean up both conferences ──────────────────────────────────────────────────────────
  await page.getByRole('radio', { name: 'All sessions' }).check()
  await page.getByRole('button', { name: `Remove ${here} from your agenda` }).click()
  await expect(page.getByRole('button', { name: `Save ${here} to your agenda` })).toBeVisible()

  await switchToAnotherConference(page, ADA)
  await goToAgenda(page)
  await page.getByRole('button', { name: `Remove ${there} from your agenda` }).click()
  await expect(page.getByRole('button', { name: `Save ${there} to your agenda` })).toBeVisible()
})
