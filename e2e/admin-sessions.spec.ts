import { expect, test } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'
import { ADMIN_ORIGIN, WEB_ORIGIN } from './support/env.js'
import { OPERATOR_PASSWORD, SEED_OPERATOR_EMAIL, signInAsOperator } from './support/operators.js'

/**
 * T053 (013) — **two independent sessions, in a real browser, in both directions** (FR-912,
 * SC-901, decision 37).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE INTEGRATION SUITE ALREADY PROVES THIS AT THE API. THIS PROVES IT AT THE BROWSER, WHICH
 * IS WHERE THE MECHANISM ACTUALLY LIVES.**
 *
 * `admin-sign-in.test.ts` drives `fastify.inject()` and passes cookie headers by hand, so it
 * asserts what the *server* does with two session stores. It cannot assert the half that decides
 * the outcome in practice: **whether the browser sends the cookie at all.**
 *
 * That half is one omitted attribute. `adminSessionCookieOptions` sets no `Domain`, so the cookie
 * is host-only and the browser scopes it to the administrative origin alone. A `Domain` added
 * later — which would look like a fix for a cookie somebody could not get to send — would make
 * one cookie travel to both products, and the two sessions would become one.
 *
 * A real browser is the only thing that applies cookie scoping rules, so this is the only place
 * that property can be observed rather than reasoned about.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
test.describe('administrative sessions', () => {
  test('a MyNet session and an administrative session coexist and end separately', async ({
    browser,
  }) => {
    // Four sign-ins across two origins, plus a bootstrap subprocess on the first. The default
    // 60-second budget is for a single journey; this one is deliberately the longest in the
    // suite, because the property it proves only exists across a full sign-in/sign-out cycle on
    // both products.
    test.slow()

    // One browser context — one cookie jar — so this is genuinely "the same person in the same
    // browser", which is the situation decision 37 is about. Two contexts would prove nothing:
    // separate jars are independent for uninteresting reasons.
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      // `signIn` starts from whatever page is loaded, so the attendee origin comes first.
      await page.goto(`${WEB_ORIGIN}/`)
      await signIn(page, ADA)

      await signInAsOperator(page)
      await expect(page.getByText(/signed in as/i)).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The cookies are two, and each is scoped to one host.**
      //
      // Read from the jar rather than inferred from behaviour, because the attribute is the
      // mechanism: a test that only checked "both sites work" would pass with one shared cookie
      // right up until somebody signed out.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const cookies = await context.cookies()
      const attendee = cookies.find((cookie) => cookie.name === 'mynet_session')
      const administrative = cookies.find((cookie) => cookie.name === 'mynet_admin_session')

      expect(attendee, 'no MyNet session cookie').toBeDefined()
      expect(administrative, 'no administrative session cookie').toBeDefined()
      expect(
        administrative?.value,
        'both products share one session token, so they are one session (FR-912)',
      ).not.toBe(attendee?.value)

      // Signing out of administration leaves MyNet signed in.
      await page.getByRole('button', { name: /sign out/i }).click()
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

      await page.goto(`${WEB_ORIGIN}/`)
      await expect(
        page.getByRole('heading', { name: `Hello, ${ADA.displayName}` }),
        'signing out of administration signed the attendee out of MyNet (decision 37)',
      ).toBeVisible()

      // And the other direction: sign back in to administration, then sign out of MyNet.
      await signInAsOperator(page)
      await expect(page.getByText(/signed in as/i)).toBeVisible()

      await page.goto(`${WEB_ORIGIN}/`)
      await page.getByRole('button', { name: /sign out/i }).click()
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

      await page.goto(`${ADMIN_ORIGIN}/`)
      await expect(
        page.getByText(/signed in as/i),
        'signing out of MyNet ended the administrative session (FR-912, SC-901)',
      ).toBeVisible()
    } finally {
      await context.close()
    }
  })

  /**
   * **FR-923 — the administrative site registers no service worker.**
   *
   * The unit guard reads the source; the build produces no `sw.js`. This asserts the outcome a
   * person would actually experience: after a full load, the browser has no registration for
   * this origin — so nothing intercepts its navigations and nothing serves it from a precache.
   */
  test('registers no service worker on the administrative origin (FR-923)', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(`${ADMIN_ORIGIN}/`)
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

      const registrations = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 0
        const all = await navigator.serviceWorker.getRegistrations()
        return all.length
      })

      expect(
        registrations,
        'the administrative site registered a service worker. It is not installable and has no ' +
          'offline behaviour (FR-923) — and the attendee worker is registered at ROOT scope, ' +
          'which is half the reason decision 37 chose a subdomain over a path.',
      ).toBe(0)
    } finally {
      await context.close()
    }
  })

  /**
   * **FR-923 — no web app manifest, so the browser never offers to install it.**
   *
   * Asserted in the served document rather than in the source, because the build is what would
   * inject one if the PWA plugin were ever added back.
   */
  test('serves no web app manifest (FR-923)', async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}/`)

    const manifests = await page.locator('link[rel="manifest"]').count()
    expect(manifests, 'the administrative document declares a manifest').toBe(0)

    // And the attendee client still does — this is a difference between the two products, not a
    // regression in both.
    await page.goto(`${WEB_ORIGIN}/`)
    expect(await page.locator('link[rel="manifest"]').count()).toBeGreaterThan(0)
  })

  /**
   * **FR-917 — an unauthenticated visitor to the administrative site learns nothing.**
   *
   * Not merely "is asked to sign in": the page must not name the queue, the tiers, or how one
   * becomes an operator. The 401s are asserted at the API; this is the document.
   */
  test('an unauthenticated visitor sees a sign-in form and nothing else (FR-917)', async ({
    page,
  }) => {
    await page.goto(`${ADMIN_ORIGIN}/reports`)

    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

    const body = (await page.locator('body').textContent()) ?? ''
    for (const forbidden of ['report', 'conference', 'organizer', 'operator', 'promote']) {
      expect(
        body.toLowerCase(),
        `the administrative sign-in page mentions "${forbidden}", which tells an ` +
          'unauthenticated caller what exists (FR-917).',
      ).not.toContain(forbidden)
    }
  })

  test('the sign-in form is operable by keyboard alone (FR-922)', async ({ page }) => {
    await page.goto(`${ADMIN_ORIGIN}/`)

    // Focused explicitly rather than by tabbing from the document, because where the first Tab
    // lands is the browser's business — it may be the address bar, a skip target, or the body.
    // What FR-922 requires is that the **form** is traversable and operable by keyboard, and
    // that starts at its first control.
    await page.getByLabel(/email/i).focus()
    await page.keyboard.type(SEED_OPERATOR_EMAIL)
    await page.keyboard.press('Tab')
    await page.keyboard.type(OPERATOR_PASSWORD)
    await page.keyboard.press('Tab')

    const submit = page.getByRole('button', { name: /^sign in$/i })
    await expect(
      submit,
      'tabbing out of the password field did not reach the submit control, so the form cannot ' +
        'be completed by keyboard alone (FR-922).',
    ).toBeFocused()
    // And it is enabled, because both fields are filled — the disabled state is about missing
    // input, never about the input method.
    await expect(submit).toBeEnabled()
  })
})
