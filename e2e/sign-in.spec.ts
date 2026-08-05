import { expect, test } from '@playwright/test'

import { ADA, GRACE, SEED_PASSWORD, expectOwnWorkspace, signIn } from './support/attendees.js'

/**
 * T065 — the walking skeleton, end to end (FR-068, SC-001).
 *
 * Browser → API → PostgreSQL → back, scoped to one identity. Everything the integration suite
 * asserts about isolation it asserts through `fastify.inject()`; this asserts the same claim
 * through a real browser making real cross-origin requests with a real cookie, because that is
 * the path an attendee actually takes.
 */

test.describe('sign-in', () => {
  test('an unauthenticated visitor is asked to sign in and shown no attendee data', async ({
    page,
  }) => {
    await page.goto('/')

    // FR-025 — the sign-in screen, not a workspace, and not a blank page.
    await expect(page.getByRole('heading', { name: 'MyNet' })).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()

    await expect(page.getByText(ADA.displayName)).toHaveCount(0)
    for (const event of ADA.events) {
      await expect(page.getByText(event)).toHaveCount(0)
    }
  })

  test('submit is disabled until both fields are filled, rather than failing after submission', async ({
    page,
  }) => {
    await page.goto('/')
    const submit = page.getByRole('button', { name: 'Sign in' })

    // Constitution Principle IV — a disabled confirmation, never a post-submit error.
    await expect(submit).toBeDisabled()

    await page.getByLabel('Email address').fill(ADA.email)
    await expect(submit).toBeDisabled()

    await page.getByLabel('Password').fill(SEED_PASSWORD)
    await expect(submit).toBeEnabled()
  })

  test('the sign-in form is operable by keyboard alone', async ({ page }) => {
    await page.goto('/')

    // SC-004's obligation applied to the entry point: no pointer is used anywhere below.
    await page.getByLabel('Email address').focus()
    await page.keyboard.type(ADA.email)
    await page.keyboard.press('Tab')
    await page.keyboard.type(SEED_PASSWORD)
    await page.keyboard.press('Enter')

    await expectOwnWorkspace(page, ADA)
  })

  test('a wrong credential is refused with a message that does not disclose whether the account exists', async ({
    page,
  }) => {
    await page.goto('/')

    await page.getByLabel('Email address').fill(ADA.email)
    await page.getByLabel('Password').fill('not-the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    const wrongPassword = page.getByRole('alert')
    await expect(wrongPassword).toBeVisible()
    const wrongPasswordText = (await wrongPassword.textContent())?.trim()

    // FR-030 — an unknown identifier must be indistinguishable from a wrong credential. If
    // these two messages ever differ, the sign-in form becomes an account-enumeration oracle.
    await page.reload()
    await page.getByLabel('Email address').fill('nobody-here@example.com')
    await page.getByLabel('Password').fill('not-the-right-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    const unknownAccount = page.getByRole('alert')
    await expect(unknownAccount).toBeVisible()
    expect((await unknownAccount.textContent())?.trim()).toBe(wrongPasswordText)

    // And neither attempt let anybody in.
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('a signed-in attendee sees their own name and their own events, and nobody else’s', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)

    // SC-001 — her own identity in the shell (FR-032) and her own registrations (FR-035).
    await expectOwnWorkspace(page, ADA)
  })

  test('two attendees signing in from separate browsers each see only their own workspace', async ({
    browser,
  }) => {
    // Separate contexts, so neither can borrow the other's cookie. This is SC-001's "repeated
    // trials with multiple seeded attendees" reduced to its smallest honest form.
    const adaContext = await browser.newContext()
    const graceContext = await browser.newContext()

    try {
      const adaPage = await adaContext.newPage()
      const gracePage = await graceContext.newPage()

      await adaPage.goto('/')
      await gracePage.goto('/')

      await signIn(adaPage, ADA)
      await signIn(gracePage, GRACE)

      // They share one event and differ on the other. The shared one proves the boundary is the
      // registration rather than the event; the differing one proves the boundary holds.
      await expectOwnWorkspace(adaPage, ADA)
      await expectOwnWorkspace(gracePage, GRACE)
    } finally {
      await adaContext.close()
      await graceContext.close()
    }
  })

  test('the sign-in session survives a browser restart', async ({ browser }) => {
    const first = await browser.newContext()
    let state

    try {
      const page = await first.newPage()
      await page.goto('/')
      await signIn(page, ADA)
      // The cookie carries a Max-Age, so it is written to disk rather than discarded when the
      // browser closes. Capturing and replaying storage state is what "restart" means here.
      state = await first.storageState()
    } finally {
      await first.close()
    }

    const restarted = await browser.newContext({ storageState: state })
    try {
      const page = await restarted.newPage()
      await page.goto('/')

      // Straight into the workspace — no second sign-in (FR-026).
      await expectOwnWorkspace(page, ADA)
    } finally {
      await restarted.close()
    }
  })

  test('signing out revokes access server-side, not merely in this browser', async ({
    browser,
  }) => {
    const context = await browser.newContext()

    try {
      const page = await context.newPage()
      await page.goto('/')
      await signIn(page, ADA)

      // Capture the session *before* signing out, so we can replay it afterwards.
      const stateWhileSignedIn = await context.storageState()

      await page.getByRole('button', { name: 'Sign out' }).click()
      await expect(page.getByLabel('Password')).toBeVisible()

      // FR-027 — the token is revoked in the database, so replaying the cookie a browser
      // "forgot" gets nowhere. Merely clearing the cookie would leave a captured token working.
      const replay = await browser.newContext({ storageState: stateWhileSignedIn })
      try {
        const replayed = await replay.newPage()
        await replayed.goto('/')
        await expect(replayed.getByLabel('Password')).toBeVisible()
        await expect(
          replayed.getByRole('heading', { name: `Hello, ${ADA.displayName}` }),
        ).toHaveCount(0)
      } finally {
        await replay.close()
      }
    } finally {
      await context.close()
    }
  })
})
