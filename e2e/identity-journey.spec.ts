import { expect, test } from '@playwright/test'

import { waitForLink } from './support/mail.js'

/**
 * T123 (004) — **arriving with no account and reaching Home, in under three minutes** (SC-300).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CAPABILITY WHOSE ABSENCE BLOCKED THIS PHASE FOR TWO FEATURES.**
 *
 * Every attendee who existed before 004 was put there by a seed script. This walks the whole
 * journey a real person takes instead — sign up, join, verify, describe yourself, add a
 * photograph, take a copy of it all, and leave — in one browser, against a production build and
 * a real database.
 *
 * SC-300 is a **timed** criterion: *under three minutes from arriving to seeing their
 * conference's Home, without help from anyone.* The timing is asserted rather than described,
 * and it is measured over the sign-up-to-Home leg specifically, because that is the leg the
 * criterion names.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Unique per run, so a re-run does not collide with the account the last one created. */
const person = () => {
  const id = Math.random().toString(36).slice(2, 10)
  return {
    email: `journey-${id}@example.com`,
    displayName: `Journey ${id}`,
    password: 'correct-horse-battery-staple',
  }
}

test.describe('a person becomes an attendee', () => {
  test('signs up, joins, verifies, describes themselves, exports and leaves', async ({ page }) => {
    const attendee = person()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // SC-300 — the clock starts at arrival, not at the first successful request.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const arrived = Date.now()

    await page.goto('/')
    await page.getByRole('link', { name: /create an account/i }).click()

    await expect(page.getByRole('heading', { name: /create your mynet account/i })).toBeVisible()

    // FR-304 — the requirement is visible before submission, and the confirmation stays
    // disabled until it is met.
    await expect(page.getByText(/at least 12 characters/i)).toBeVisible()
    const confirm = page.getByRole('button', { name: /create account/i })
    await expect(confirm).toBeDisabled()

    await page.getByLabel(/email address/i).fill(attendee.email)
    await page.getByLabel(/display name/i).fill(attendee.displayName)
    await page.getByLabel(/^password$/i).fill('short')
    await expect(confirm, 'a password below the policy must not be submittable').toBeDisabled()

    await page.getByLabel(/^password$/i).fill(attendee.password)
    // 016 — sign-up carries a confirmation field, and submission is disabled until the two agree
    // (FR-1017, FR-1018). A mistyped password here creates an account nobody can reach.
    await page.getByLabel(/confirm password/i).fill(attendee.password)
    await expect(confirm).toBeEnabled()
    await confirm.click()

    // FR-306, FR-308 — signed in, registered for nothing, and invited to join rather than shown
    // an empty conference.
    await expect(page.getByText(/not registered for any conferences yet/i)).toBeVisible()

    await page.getByRole('link', { name: /join a conference/i }).click()
    await page.getByLabel(/join code/i).fill('PDS-2026')
    await page.getByRole('button', { name: /join conference/i }).click()

    // Home, for the conference they just joined.
    await expect(
      page.getByRole('heading', { name: `Hello, ${attendee.displayName}` }),
    ).toBeVisible()

    const elapsedSeconds = (Date.now() - arrived) / 1000
    expect(
      elapsedSeconds,
      'SC-300: from arriving to seeing their conference’s Home, unaided, in under three minutes.',
    ).toBeLessThan(180)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Verification. The link comes out of the development mail sink, because its plaintext
    // exists nowhere else (FR-323).
    // ───────────────────────────────────────────────────────────────────────────────────────
    const link = await waitForLink('verification', attendee.email)
    await page.goto(link)
    await expect(page.getByText(/your email address is verified/i)).toBeVisible()

    // The link is single-use (FR-320).
    await page.goto(link)
    await expect(page.getByText(/no longer valid/i)).toBeVisible()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The profile: empty and inviting, then authored (FR-341, FR-334).
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.goto('/profile')
    await expect(page.getByText(/you have not described yourself yet/i)).toBeVisible()

    await page.getByRole('link', { name: /complete your profile/i }).click()
    await page.getByLabel(/^headline$/i).fill('Here to meet people who ship things.')
    await page.getByLabel(/^company$/i).fill('Journey & Co')
    await page.getByLabel(/^interests$/i).fill('Design systems, Accessibility')
    await page.getByRole('button', { name: /save profile/i }).click()

    await expect(page.getByText('Here to meet people who ship things.')).toBeVisible()
    await expect(page.getByText('Journey & Co')).toBeVisible()

    // A 1×1 PNG is enough: what is being proven is that the upload path works end to end, and
    // the metadata guarantee is asserted against stored bytes by the integration suite.
    await page.getByLabel(/add a photograph/i).setInputFiles({
      name: 'portrait.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
    await expect(page.getByRole('button', { name: /remove/i })).toBeVisible()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The account surface: a copy of everything, then leaving.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.goto('/account')
    await page.getByRole('button', { name: /prepare a copy/i }).click()

    const download = page.getByRole('link', { name: /download your data/i })
    await expect(download).toBeVisible()
    await expect(download).toHaveAttribute('download', 'mynet-personal-data.json')

    await page.getByRole('button', { name: /delete my account/i }).click()

    // FR-367 — both sentences, before anything is destroyed.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/cannot be undone/i)
    await expect(dialog).toContainText(/no copy is kept/i)

    // Escape dismisses, and nothing is deleted (Accessibility declaration).
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: /delete my account/i })).toBeVisible()

    await page.getByRole('button', { name: /delete my account/i }).click()
    await page.getByRole('button', { name: /delete everything/i }).click()

    // Signed out, and the account is gone: signing in again fails.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    await page.getByLabel('Email address').fill(attendee.email)
    await page.getByLabel('Password', { exact: true }).fill(attendee.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toContainText(/did not match/i)
  })
})
