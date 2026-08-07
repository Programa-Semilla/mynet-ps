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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **005 — this assertion is SUPERSEDED IN PART, and updated rather than deleted.**
   *
   * 002 cached no API response at all, on the reasoning that showing yesterday's agenda with
   * no indication that it is yesterday's is worse, at a conference, than showing nothing. That
   * reasoning was right, and 005 does not discard it — it satisfies it. The agenda is now
   * cached **with a retrieval stamp on every surface that serves it** and a 24-hour lifetime,
   * so the objection ("no indication that it is yesterday's") no longer applies, and 002's
   * Open Question 2 is closed by decision rather than by drift.
   *
   * What has **not** changed, and is still asserted below:
   *
   *   - The **conference list** is not cached. FR-215 names the *active* conference's content
   *     and nothing else, so Home still cannot show which conferences an attendee belongs to
   *     while offline.
   *   - **Cache Storage** — the service worker's precache — still holds no attendee data. 005
   *     stores its cache in IndexedDB, deliberately: the service worker caches the shell, and
   *     mixing attendee content into it would put personal data behind a lifetime nobody
   *     declared.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('the conference list is still not cached, and the precache still holds no attendee data', async ({
    page,
    context,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await expect(page.getByRole('heading', { name: ADA.events[0] })).toBeVisible()
    await awaitServiceWorker(page)

    await context.setOffline(true)
    await page.reload()

    // Unchanged from 002: a cross-event read is not cached, so this is absent offline.
    for (const event of ADA.events) {
      await expect(page.getByRole('heading', { name: event, level: 2 })).toHaveCount(0)
    }

    // And the service worker's caches hold no attendee data at all — 005's cache is IndexedDB.
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **005 — this assertion now has real work to do, and the scan was widened to match.**
   *
   * In 002 it was true structurally: the token is in an HttpOnly cookie and no API response
   * was cached anywhere, so "no residue" was a property of there being nothing to leave. 005
   * changes that — the programme, the saved set and the attendee's **notes** are now stored on
   * the device in IndexedDB — so this stops being a restatement of the design and becomes the
   * check that `signOut` actually purges it.
   *
   * The scan therefore covers IndexedDB as well. Without that it would still pass, on a
   * technicality, while personal content sat on a device somebody had just signed out of —
   * which is exactly the shape of green result this codebase warns about.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('signing out leaves no attendee data on the device, INCLUDING the offline cache', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await awaitServiceWorker(page)

    // Read the agenda first, so there is genuinely something cached to be purged. Without this
    // the assertion is satisfied by nothing having been written.
    await page.getByRole('link', { name: 'Agenda' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()

    const cachedBefore = await page.evaluate(async () => {
      const open = await new Promise<IDBDatabase | null>((resolve) => {
        const request = indexedDB.open('mynet-cache')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
      })
      if (!open || !open.objectStoreNames.contains('entries')) return 0
      return new Promise<number>((resolve) => {
        const count = open.transaction('entries', 'readonly').objectStore('entries').count()
        count.onsuccess = () => resolve(count.result)
        count.onerror = () => resolve(0)
      })
    })
    expect(
      cachedBefore,
      'the agenda must actually be cached, or this proves nothing',
    ).toBeGreaterThan(0)

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

        // 005 — the offline cache. Every entry is read and searched, so a purge that missed a
        // resource, or a key prefix that did not reach it, is caught by name.
        const db = await new Promise<IDBDatabase | null>((resolve) => {
          const request = indexedDB.open('mynet-cache')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        })

        if (db?.objectStoreNames.contains('entries')) {
          const entries = await new Promise<unknown[]>((resolve) => {
            const all = db.transaction('entries', 'readonly').objectStore('entries').getAll()
            all.onsuccess = () => resolve(all.result as unknown[])
            all.onerror = () => resolve([])
          })

          for (const entry of entries) {
            const body = JSON.stringify(entry)
            if (needles.some((needle) => body.includes(needle))) found.push('indexeddb:mynet-cache')
          }
        }

        return found
      },
      [ADA.email, ADA.displayName, ...ADA.events],
    )

    expect(residue).toEqual([])
  })
})
