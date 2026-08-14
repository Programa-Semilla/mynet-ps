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
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T073 (014) — A SECOND PAYLOAD SHAPE, AND THE DEFAULTS BECOME SHAPE-DEPENDENT.**
 *
 * v4.2.0 admits a second trigger: a material change to a session the attendee **saved**. Its
 * payload carries `kind: 'session-change'` and either a `sessionId` (one session changed) or a
 * `count` (several did, in one organizer act — FR-1034).
 *
 * The fallback wording has to move with it. "You have a new message" is the honest default for a
 * message and a **false statement** about a cancelled session, and this handler's whole reason
 * for existing is that a payload it cannot parse must still produce something true. So the
 * defaults are chosen from `kind` before the rest of the payload is trusted.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
self.addEventListener('push', (event: PushEvent) => {
  const shown = (async () => {
    let title = 'New message'
    let body = 'You have a new message.'
    let conversationId: string | undefined
    let sessionId: string | undefined
    let eventId: string | undefined
    let dispatchId: string | undefined
    let kind: 'message' | 'session-change' = 'message'

    try {
      const payload = event.data?.json() as
        | {
            kind?: string
            title?: string
            body?: string
            conversationId?: string
            sessionId?: string
            eventId?: string
            dispatchId?: string
            count?: number
          }
        | undefined

      if (payload?.kind === 'session-change') {
        kind = 'session-change'
        // A different default for a different shape. The server always sends both fields; these
        // stand only when the payload arrived truncated or unparseable in part.
        title = 'Your agenda changed'
        body = 'A session you saved has changed.'
      }

      if (payload?.title) title = payload.title
      if (payload?.body) body = payload.body
      if (payload?.conversationId) conversationId = payload.conversationId
      if (payload?.sessionId) sessionId = payload.sessionId
      if (payload?.eventId) eventId = payload.eventId
      if (payload?.dispatchId) dispatchId = payload.dispatchId
    } catch {
      // Malformed or absent payload. The defaults above stand — see the header for why showing
      // nothing is not an option.
    }

    await self.registration.showNotification(title, {
      // ───────────────────────────────────────────────────────────────────────────────────────
      // One notification per conversation, replaced rather than stacked: five messages from the
      // same person while a phone is in a pocket should be one notification saying the latest
      // thing, not five to dismiss.
      //
      // 014 — the same reasoning, keyed on the session. Two material changes to one saved session
      // replace each other, because the second is the current truth about it: a cancellation
      // superseding an earlier room move is what anybody would want.
      //
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **A COALESCED PAYLOAD IS TAGGED WITH THE ACT, NOT THE CONFERENCE, AND THE DIFFERENCE
      // IS FR-1028b.**
      //
      // This used to read `agenda-${eventId}`, so **two coalesced acts at one conference
      // replaced each other on screen.** The delivery layer was correct — two notifications were
      // sent, and `dispatch-coalescing.test.ts` asserts it — and the collapse happened here,
      // one layer below where anything was looking.
      //
      // FR-1028b names this failure as its own reason for existing: *"a time-window rule would
      // suppress a cancellation because a room moved earlier, which is the failure this whole
      // trigger exists to prevent."* A shared tag is a time-window rule whose window is forever.
      // Act one cancels two of somebody's saved sessions; act two moves a room on two others;
      // the attendee sees a single notification saying two sessions changed and never learns
      // about the cancellation.
      //
      // The act id is what the server already coalesces on (`last_change_act_id`), so the
      // identifier that groups one act is the one that separates two, and nothing new is stored
      // to obtain it. Still not a running total: within one act the tag replaces.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ───────────────────────────────────────────────────────────────────────────────────────
      body,
      tag:
        kind === 'session-change'
          ? sessionId
            ? `session-${sessionId}`
            : `agenda-${dispatchId ?? eventId ?? 'changed'}`
          : conversationId
            ? `conversation-${conversationId}`
            : 'message',
      data: { kind, conversationId, sessionId, eventId },
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

  const data = event.notification.data as
    { kind?: string; conversationId?: string; sessionId?: string; eventId?: string } | undefined

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T073 (014) — A COALESCED NOTIFICATION OPENS AGENDA, NEVER A LIST OF CHANGES** (FR-1034b).
   *
   * The obvious destination for "4 of your saved sessions changed" is a screen listing the four.
   * **That screen is the surface FR-1031 forbids** — an in-app aggregate over things that
   * happened, which is the notification centre v3.1.0's exclusion exists to prevent. So the
   * count lives in the notification body, which is a single interruption, and activating it
   * lands on Agenda where the changed rows carry their **individual** markers.
   *
   * One session changed → that session's panel, which is where the attendee can see *what*
   * changed (FR-1029). Several → Agenda. Neither address is a list.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  /*
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **THE CONFERENCE TRAVELS IN THE ADDRESS, AND WITHOUT IT THE ADDRESS DOES NOT RESOLVE.**
   *
   * Every attendee address resolves against the **active** conference, which is server-side state
   * changed only through the event switcher — so this used to discard `eventId` and send a
   * notification about conference A to A's session id interpreted inside B's programme, where the
   * panel renders "That session is not available to you". Multi-conference membership is ordinary,
   * not an edge case.
   *
   * The worker cannot switch the conference itself: that is a server write behind a repository.
   * So it names the conference and `app/NotificationTarget.tsx` acts on it, then removes the
   * parameter so a reload cannot replay it.
   *
   * A message needs none of this — a conversation is cross-event by 007's design (FR-507), which
   * is why the pattern does not simply transfer.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const conference = data?.eventId ? `?event=${encodeURIComponent(data.eventId)}` : ''

  const target =
    data?.kind === 'session-change'
      ? data.sessionId
        ? `/agenda/${data.sessionId}${conference}`
        : `/agenda${conference}`
      : data?.conversationId
        ? `/messages/${data.conversationId}`
        : '/messages'

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
