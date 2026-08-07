import { expect, test } from '@playwright/test'

import { waitForLink } from './support/mail.js'

/**
 * T124 (004) — **a verified attendee who has forgotten their password regains access unaided**
 * (SC-301).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"UNAIDED" IS THE WHOLE CRITERION.** Principle III leaves no organizer, no support actor and
 * no administrative interface — so an account that cannot be recovered by its owner alone
 * cannot be recovered at all. Self sign-up is what made this obligatory: before 004 a lost
 * password meant a lost account, and the population it affected could not grow.
 *
 * **Scoped to a VERIFIED attendee, deliberately.** FR-324 permits an account to remain
 * unverified indefinitely, and such an account is unrecoverable by construction — which is the
 * stated cost of not verifying, not a failure of this criterion.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const person = () => {
  const id = Math.random().toString(36).slice(2, 10)
  return {
    email: `recovery-${id}@example.com`,
    displayName: `Recovery ${id}`,
    password: 'correct-horse-battery-staple',
    newPassword: 'an-entirely-different-passphrase',
  }
}

test.describe('password recovery', () => {
  test('a verified attendee regains access with no help from anyone (SC-301)', async ({ page }) => {
    const attendee = person()

    // An account that exists and is verified — the state SC-301 scopes itself to.
    await page.goto('/sign-up')
    await page.getByLabel(/email address/i).fill(attendee.email)
    await page.getByLabel(/display name/i).fill(attendee.displayName)
    await page.getByLabel(/^password$/i).fill(attendee.password)
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/not registered for any conferences yet/i)).toBeVisible()

    await page.goto(await waitForLink('verification', attendee.email))
    await expect(page.getByText(/your email address is verified/i)).toBeVisible()

    // …and now they have forgotten it. Signing out is the closest a test can get to that.
    await page.goto('/')
    await page.getByRole('button', { name: /sign out/i }).click()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The recovery path, from the sign-in screen, with no other surface involved.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.getByRole('link', { name: /forgot your password/i }).click()
    // Waited for before filling: the sign-in screen has an "Email address" field too, so a fill
    // issued before the navigation settles lands on the screen being left rather than the one
    // being arrived at.
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible()
    await page.getByLabel(/email address/i).fill(attendee.email)
    await page.getByRole('button', { name: /send reset link/i }).click()

    // FR-327 — the confirmation says "if there is an account", which is true whether or not
    // there is. That wording is the non-disclosure guarantee as a person reads it.
    await expect(page.getByText(/if there is an account/i)).toBeVisible()

    await page.goto(await waitForLink('password-reset', attendee.email))

    await expect(page.getByRole('heading', { name: /set a new password/i })).toBeVisible()

    // The same policy sign-up states, stated the same way (FR-304).
    const confirm = page.getByRole('button', { name: /set password/i })
    await page.getByLabel(/new password/i).fill('short')
    await expect(confirm).toBeDisabled()

    await page.getByLabel(/new password/i).fill(attendee.newPassword)
    await expect(confirm).toBeEnabled()
    await confirm.click()

    // FR-330 — and the confirmation says so, which is the reassurance somebody who suspects a
    // compromise came for.
    await expect(page.getByText(/every other device has been signed out/i)).toBeVisible()

    // Access regained, unaided.
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.getByLabel('Email address').fill(attendee.email)
    await page.getByLabel('Password').fill(attendee.newPassword)
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Registered for no conference, so Home shows the invitation rather than the greeting —
    // the greeting card is conference-scoped, and this attendee never joined one. Asserting on
    // the greeting would be asserting a card's precondition rather than that access was regained.
    await expect(page.getByText(/not registered for any conferences yet/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  test('the old password stops working, and the link cannot be reused', async ({ page }) => {
    const attendee = person()

    await page.goto('/sign-up')
    await page.getByLabel(/email address/i).fill(attendee.email)
    await page.getByLabel(/display name/i).fill(attendee.displayName)
    await page.getByLabel(/^password$/i).fill(attendee.password)
    await page.getByRole('button', { name: /create account/i }).click()
    await expect(page.getByText(/not registered for any conferences yet/i)).toBeVisible()

    await page.goto('/reset-password-request')
    await page.getByLabel(/email address/i).fill(attendee.email)
    await page.getByRole('button', { name: /send reset link/i }).click()
    await expect(page.getByText(/if there is an account/i)).toBeVisible()

    const link = await waitForLink('password-reset', attendee.email)
    await page.goto(link)
    await page.getByLabel(/new password/i).fill(attendee.newPassword)
    await page.getByRole('button', { name: /set password/i }).click()
    await expect(page.getByText(/your password is set/i)).toBeVisible()

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Single use (FR-328) — a link somebody forwarded, or a browser prefetched, cannot be spent
    // twice.
    //
    // **The second attempt has to be SUBMITTED, not merely opened**, and that is the correct
    // behaviour rather than a limitation of the test. The client has no way to know a token is
    // dead without spending it, and a probe on page load would need a route whose whole purpose
    // was to answer "does this link still work" — an oracle for anybody holding a forwarded
    // link. Verification differs because following the link IS the action; setting a password
    // is not.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.goto(link)
    await page.getByLabel(/new password/i).fill('another-different-passphrase')
    await page.getByRole('button', { name: /set password/i }).click()
    await expect(page.getByText(/no longer valid/i)).toBeVisible()

    // A reset REPLACES the credential rather than adding one.
    await page.goto('/')
    await page.getByLabel('Email address').fill(attendee.email)
    await page.getByLabel('Password').fill(attendee.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText(/did not match/i)
  })

  test('asking about an address with no account looks exactly the same (FR-327)', async ({
    page,
  }) => {
    // The non-disclosure guarantee from the outside: nothing on screen distinguishes an address
    // that has an account from one that does not.
    await page.goto('/reset-password-request')
    await page.getByLabel(/email address/i).fill('nobody-at-all@example.com')
    await page.getByRole('button', { name: /send reset link/i }).click()

    await expect(page.getByText(/if there is an account/i)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
