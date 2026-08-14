import { expect, test } from '@playwright/test'

import { redeployApi } from './support/api-process.js'
import { ADA, expectOwnWorkspace, signIn, switchToAnotherConference } from './support/attendees.js'

/**
 * T065a — attendee data is durable (FR-033, SC-003).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * This is the test that says MyNet is a product rather than the prototype.
 *
 * CLAUDE.md records the prototype's behaviour as "browser reloads reset state, which is
 * acceptable", and the owner's decision withdrew exactly that. The three clauses of FR-033 —
 * reload, sign-out, and redeployment — are each a different way state could turn out to live
 * somewhere it must not: in the component tree, in the browser, or in the server's memory.
 *
 * **The redeployment case is the one most likely to regress silently.** Reload and sign-out
 * break loudly when someone reaches for local state. A server-side cache holding attendee data
 * would pass both of them and fail only here.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

test.describe('durability', () => {
  test('attendee data survives a browser reload', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)

    await page.reload()

    await expectOwnWorkspace(page, ADA)
  })

  test('attendee data survives signing out and signing back in', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

    await signIn(page, ADA)

    // The same identity and the same registrations. Sign-out ends a session; it does not
    // discard anything the attendee owns.
    await expectOwnWorkspace(page, ADA)
  })

  test('attendee data survives redeployment of the API', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)

    // The process serving the API is replaced by a new one against the same database. Anything
    // an attendee sees that was living in the old process's memory does not come back.
    await redeployApi()

    await page.reload()

    await expectOwnWorkspace(page, ADA)
  })

  test('the sign-in session itself survives redeployment', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)

    await redeployApi()
    await page.reload()

    // Sessions are rows, not process memory (FR-026). A restart that signed everybody out would
    // mean every deployment logged the whole conference out mid-event.
    await expect(page.getByRole('heading', { name: `Hello, ${ADA.displayName}` })).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  })

  /**
   * T054 (002) — **the conference choice survives a change of device** (FR-100, SC-103).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * This is the point of the whole active-event design, and the one property that would be
   * satisfied by a `localStorage` write right up until the attendee picked up their phone.
   *
   * A fresh browser context is the test: new storage, new cookies, nothing carried over except
   * the credentials. If the choice comes back, it came from the database.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  test('an explicit conference choice survives signing in from a clean browser', async ({
    browser,
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)

    // Switch away from whatever is currently active, to something explicitly selected.
    const chosen = await switchToAnotherConference(page, ADA)

    // A genuinely separate context — not a reload, and not a new tab sharing storage.
    const clean = await browser.newContext()
    const cleanPage = await clean.newPage()
    await cleanPage.goto('/')
    await signIn(cleanPage, ADA)

    await expect(
      cleanPage.getByRole('button', { name: /change conference/i }),
      'The chosen conference must come back on a different device. If it does not, the choice ' +
        'is living in the browser rather than in the database (SC-103).',
    ).toHaveAccessibleName(new RegExp(chosen))

    await clean.close()
  })

  test('no attendee data is left behind in the browser after signing out', async ({ page }) => {
    // FR-056 — signing out leaves nothing from that session available on the device. The
    // structural guarantee is that the token lives in an HttpOnly cookie and API responses are
    // never precached; this asserts the observable consequence.
    await page.goto('/')
    await signIn(page, ADA)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()

    const residue = await page.evaluate(() => {
      const readAll = (store: Storage): string =>
        Object.keys(store)
          .map((key) => `${key}=${store.getItem(key) ?? ''}`)
          .join('\n')
      return `${readAll(localStorage)}\n${readAll(sessionStorage)}\n${document.cookie}`
    })

    expect(residue).not.toContain(ADA.email)
    expect(residue).not.toContain(ADA.displayName)
    for (const event of ADA.events) {
      expect(residue).not.toContain(event)
    }
  })
})
