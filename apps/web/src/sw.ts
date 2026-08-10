/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  createHandlerBoundToURL,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

/**
 * T118, T119 (007) — the source service worker (research R2, FR-554).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE EXISTS BECAUSE A `push` HANDLER IS CODE, AND A GENERATED SERVICE WORKER IS NOT
 * OURS TO EDIT.**
 *
 * VitePWA ran `generateSW` until 007: workbox produced the whole worker from configuration, and
 * configuration cannot express an event handler. `injectManifest` inverts that — this file is the
 * worker, and the build only substitutes the precache manifest into it.
 *
 * **Registering a second worker was rejected outright.** One scope means one worker; two would race
 * for control of the same clients, and which one won would decide whether the offline shell or the
 * notifications worked on any given load.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EVERYTHING THE GENERATED WORKER DID IS CARRIED ACROSS DELIBERATELY, AND THE API EXCLUSION IS
 * THE ONE THAT MATTERS MOST.**
 *
 * This is the highest-risk mechanical step in the feature. The old configuration is not lost — it
 * is reproduced below, line for line, with the reason each line existed:
 *
 *   - `precacheAndRoute` ← `globPatterns`. The injected manifest is content-hashed, so a new
 *     deployment's entries differ and the old ones are evicted (FR-055).
 *   - `cleanupOutdatedCaches` ← the option of the same name.
 *   - `NavigationRoute` ← `navigateFallback: 'index.html'`, so a deep link opens offline (FR-051).
 *   - **The denylist** ← `navigateFallbackDenylist: [/^\\/api\\//]`. **Dropping this would serve the
 *     HTML shell in answer to API requests**, and a failed request would look like a successful
 *     page load — the client would parse HTML as JSON and report nonsense rather than an outage.
 *   - `clientsClaim()` without `skipWaiting` ← the pair chosen in 001 and unchanged: claim, so the
 *     offline shell works from a first-time visitor's *first* visit; no skip-waiting, so a new
 *     deployment does not swap assets under a live page.
 *
 * **No `runtimeCaching` equivalent is added, and none may be**: nothing here caches an API
 * response. 007 caches nothing at all (FR-563), and a future feature wanting offline data needs a
 * recorded decision about staleness first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

declare const self: ServiceWorkerGlobalScope & {
  /**
   * The precache manifest, substituted by `injectManifest` at build time.
   *
   * Declared here rather than pulled from a `vite-plugin-pwa` type module: the reference must
   * exist for the build to succeed at all — `injectManifest` fails when it is absent — so
   * spelling out what it is keeps the contract with the build visible in the file that depends
   * on it.
   */
  readonly __WB_MANIFEST: (string | { url: string; revision: string | null })[]
}

/**
 * The precache manifest, substituted at build time. `injectManifest` fails the build if this
 * reference is absent, which is what stops the shell silently ceasing to be precached.
 */
precacheAndRoute(self.__WB_MANIFEST)

cleanupOutdatedCaches()

/**
 * FR-051 — any in-scope navigation falls back to the shell, so a deep link to `/messages/<id>`
 * opens offline and lands on the real destination rather than a browser error page.
 *
 * `denylist` carries `navigateFallbackDenylist` across. See the header: without it the shell is
 * served in answer to API requests.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)

clientsClaim()

/**
 * T119 — a notification arrives (FR-550, FR-553, M7).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`userVisibleOnly` was promised at subscribe time, so this MUST show something.** A browser
 * that receives a push and displays nothing will, after a few occurrences, show its own generic
 * "this site has been updated in the background" notification — which is worse than either
 * outcome we intended. So a payload that cannot be parsed still produces a notification, with
 * wording that says only what is certainly true.
 *
 * `data.conversationId` is what `notificationclick` below opens. It is carried in `data` rather
 * than encoded into the tag or the title, because those are for the reader.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
self.addEventListener('push', (event: PushEvent) => {
  const shown = (async () => {
    let title = 'New message'
    let body = 'You have a new message.'
    let conversationId: string | undefined

    try {
      const payload = event.data?.json() as
        { title?: string; body?: string; conversationId?: string } | undefined
      if (payload?.title) title = payload.title
      if (payload?.body) body = payload.body
      if (payload?.conversationId) conversationId = payload.conversationId
    } catch {
      // Malformed or absent payload. The defaults above stand — see the header for why showing
      // nothing is not an option.
    }

    await self.registration.showNotification(title, {
      body,
      // One notification per conversation, replaced rather than stacked: five messages from the
      // same person while a phone is in a pocket should be one notification saying the latest
      // thing, not five to dismiss.
      tag: conversationId ? `conversation-${conversationId}` : 'message',
      data: { conversationId },
    })
  })()

  // `waitUntil` keeps the worker alive until the notification is actually shown. Without it the
  // browser may terminate the worker mid-await and show nothing.
  event.waitUntil(shown)
})

/**
 * T119 — activating a notification opens the application **on that conversation** (FR-554).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN EXISTING WINDOW IS FOCUSED AND NAVIGATED RATHER THAN A SECOND ONE OPENED.**
 *
 * Somebody tapping a notification with the application already open in a tab does not want a
 * second copy of it — and on a desktop that is exactly what `openWindow` alone produces. So the
 * handler looks for a client first, focuses it, and tells it where to go.
 *
 * The address is built here, from the conversation identifier the payload carried. That is why
 * the server-side `PushPayload` carries an identifier rather than a URL: the client owns its own
 * addressing scheme, and a server that emitted `/messages/<id>` would be a second place that
 * scheme is decided.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const conversationId = (event.notification.data as { conversationId?: string } | undefined)
    ?.conversationId
  const target = conversationId ? `/messages/${conversationId}` : '/messages'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        // Included, because a client that has not yet been claimed is still a window the attendee
        // is looking at — and opening a second one beside it is the failure this avoids.
        includeUncontrolled: true,
      })

      for (const client of clients) {
        if (!('focus' in client)) continue

        try {
          await client.focus()
          // `navigate` rather than posting a message: it works whether or not the page has
          // finished booting, and needs no listener on the other side that could be missing.
          if ('navigate' in client) await client.navigate(target)
          return
        } catch {
          // `navigate()` rejects on a client this worker does not control — which
          // `includeUncontrolled` above deliberately lets through — and `focus()` rejects without a
          // user gesture in some browsers. Both are recoverable, and falling through to
          // `openWindow` is the recovery: **an unhandled rejection here would leave the attendee
          // tapping a notification that does nothing at all**, which is worse than a second window.
        }
      }

      await self.clients.openWindow(target)
    })(),
  )
})
