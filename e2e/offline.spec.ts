import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'
import { DESTINATIONS } from './support/destinations.js'

/**
 * T094, T102 — offline behaviour, bounded and honest
 * (FR-051, FR-052, FR-053, FR-054, FR-056, SC-012).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The claim under test is not "MyNet works offline". It is that MyNet **tells the truth**
 * offline: the shell renders, the state is visible, server-dependent actions are refused rather
 * than queued or faked, and no stale attendee data is served from a cache — because API
 * responses are never cached at all (research.md D14).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Waits for the service worker to control the page, which is what makes the shell available. */
const awaitServiceWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
    timeout: 20_000,
  })
}

test.describe('offline', () => {
  test('the shell renders offline, with the offline state shown', async ({ page, context }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    await context.setOffline(true)
    await page.reload()

    // FR-051 — the shell is precached, so this is a working page rather than a browser error.
    await expect(page.getByRole('navigation')).toBeVisible()

    // FR-052 — the state is named, and it says what is unavailable rather than implying that
    // everything still works.
    const banner = page.getByRole('status').filter({ hasText: 'You are offline' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('cannot be loaded or changed')
    await expect(banner).toContainText('nothing you have done has been lost')

    await context.setOffline(false)
  })

  test('every destination address opens offline rather than showing a browser error', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    await context.setOffline(true)

    for (const destination of DESTINATIONS) {
      // FR-051's navigation fallback. A deep link followed offline lands on the real
      // destination, not on a dinosaur.
      await page.goto(destination.path)
      await expect(page.getByRole('navigation'), destination.label).toBeVisible()
    }

    await context.setOffline(false)
  })

  test('a server-dependent action is refused with an explanation, not queued or faked', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    await context.setOffline(true)
    await page.goto('/')

    // FR-053 — refused, explained, and explicitly not lost. The message must not blame the
    // server: this is connectivity, and telling the attendee it is "a problem on our side"
    // would send them hunting for a fault that does not exist.
    const failure = page.getByRole('alert')
    await expect(failure).toBeVisible()
    await expect(failure).toContainText('need a connection')
    await expect(failure).toContainText('Nothing has been lost')

    await context.setOffline(false)
  })

  test('no stale attendee data is served from a cache while offline', async ({ page, context }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await expect(page.getByRole('heading', { name: ADA.events[0] })).toBeVisible()
    await awaitServiceWorker(page)

    await context.setOffline(true)
    await page.reload()

    // **API responses are never precached** (research.md D14). Showing yesterday's agenda with
    // no indication that it is yesterday's is worse, at a conference, than showing nothing.
    for (const event of ADA.events) {
      await expect(page.getByRole('heading', { name: event, level: 2 })).toHaveCount(0)
    }

    // And what caches do exist hold no attendee data at all.
    const cachedAttendeeData = await page.evaluate(
      async (needles) => {
        const names = await caches.keys()
        for (const name of names) {
          const cache = await caches.open(name)
          for (const request of await cache.keys()) {
            const response = await cache.match(request)
            const body = (await response?.text()) ?? ''
            if (needles.some((needle) => body.includes(needle))) return request.url
          }
        }
        return null
      },
      [ADA.email, ADA.displayName, ...ADA.events],
    )

    expect(cachedAttendeeData).toBeNull()

    await context.setOffline(false)
  })

  test('the workspace recovers on reconnect without a manual reload', async ({ page, context }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible()

    await context.setOffline(false)

    // FR-054 — connectivity state updates without a manual reload. The debounce in
    // WebConnectivityService means this is not instant, which is deliberate: an indicator that
    // oscillates on every transient drop is one the attendee stops believing.
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toHaveCount(0, {
      timeout: 15_000,
    })
  })

  test('signing out leaves no attendee data on the device', async ({ page }) => {
    // T102, FR-056. Structurally this is already true — the token is in an HttpOnly cookie and
    // no API response is ever cached — but "structurally true" is a claim, and this is the
    // assertion.
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Password')).toBeVisible()

    const residue = await page.evaluate(
      async (needles) => {
        const found: string[] = []

        const scanStorage = (store: Storage, label: string) => {
          for (const key of Object.keys(store)) {
            const value = `${key}=${store.getItem(key) ?? ''}`
            if (needles.some((needle) => value.includes(needle))) found.push(`${label}:${key}`)
          }
        }
        scanStorage(localStorage, 'localStorage')
        scanStorage(sessionStorage, 'sessionStorage')

        if (needles.some((needle) => document.cookie.includes(needle))) found.push('cookie')

        for (const name of await caches.keys()) {
          const cache = await caches.open(name)
          for (const request of await cache.keys()) {
            const body = (await (await cache.match(request))?.text()) ?? ''
            if (needles.some((needle) => body.includes(needle))) found.push(`cache:${request.url}`)
          }
        }

        return found
      },
      [ADA.email, ADA.displayName, ...ADA.events],
    )

    expect(residue).toEqual([])
  })
})
