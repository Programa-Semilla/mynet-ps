import { useNotifications, usePushSubscriptionRepository, useSecureStorage } from '@mynet/platform'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * T120, T121 (007) — the permission explanation, and this device's registration (FR-551, FR-552,
 * FR-555, FR-556).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOTHING HERE MAY PROMPT THE BROWSER BEFORE THE ATTENDEE HAS BEEN TOLD WHAT FOR** (FR-551).
 *
 * That ordering cannot be enforced inside the capability — the prompt is the browser's, and by
 * the time `Notification.requestPermission()` is reachable the explanation has either happened or
 * it has not. So it is enforced by construction instead: **this component is the only caller of
 * `requestPermission` in the client**, and it can only reach it from a button the attendee pressed
 * after reading the paragraph above it. A browser prompt that appears unbidden on page load is the
 * single most common reason a person denies permanently, and a permanent denial cannot be
 * appealed from inside the product.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS NOT A NOTIFICATION BELL, AND FR-560 STILL FORBIDS ONE.**
 *
 * Constitution 3.1.0 reversed register entry 10 for *delivery only*. The prohibition on an
 * in-product notification surface is carried forward unchanged. So this renders **nothing at all**
 * in every state except the one where it has something to ask: no badge, no count, no inbox, no
 * persistent "notifications are on" chrome. Once the device is registered the surface disappears
 * and the only place a notification is ever seen is the operating system.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **IT LIVES IN MESSAGES BECAUSE MESSAGES ARE THE ONLY THING IT DELIVERS** (FR-561).
 *
 * Asking on Home, or in Account, would be asking about a feature the attendee is not currently
 * using — and the answer to "may we interrupt you?" is far more likely to be yes from somebody
 * who has just discovered that people can write to them here. It also keeps the reconciliation
 * below off the boot path: an attendee who never opens Messages never registers a device, which
 * is correct rather than a gap.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The endpoint this device last registered with the server.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS SO THE SURRENDER IN FR-556 IS POSSIBLE AT ALL.**
 *
 * When permission is revoked, the browser discards the push subscription — so by the time we can
 * observe the revocation, the endpoint that needs deleting server-side is *already gone from the
 * browser*. Without a record of what was registered there is nothing to name in the `unregister`
 * call, and the row would survive as a registration that can never be delivered to and can never
 * be cleaned up.
 *
 * `SecureStorage` rather than a bare browser API, because Principle V admits no exception for
 * "just a flag" — and `clear()` at sign-out (FR-056) then does exactly the right thing on a shared
 * browser: the next account sees no known endpoint, re-registers the same one, and the server
 * reassigns it to whoever is holding the device now.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
const ENDPOINT_KEY = 'mynet.push.endpoint'

/**
 * The attendee said no — to the browser, or to us.
 *
 * Kept because **re-asking is the whole failure this avoids**. The browser will not re-prompt
 * after a denial, so without this the explanation card would reappear on every visit to Messages
 * behind a button that can no longer do anything. FR-552 makes the denied path a *complete*
 * product, not a degraded one waiting to be fixed, and nagging is how a product says otherwise.
 */
const DECLINED_KEY = 'mynet.push.declined'

type State =
  /** Reconciling. Renders nothing — a card that flashes in and out on every visit is worse than late. */
  | 'checking'
  /** Nothing to say: unsupported, already registered, or already answered. Renders nothing (FR-560). */
  | 'absent'
  /** The explanation, and the only route to a browser prompt. */
  | 'offer'
  /** The browser's prompt is open, or the subscription is being registered. */
  | 'working'
  /** Permission was granted but registration failed. Retryable — see below. */
  | 'failed'
  /** Just turned on. A one-time confirmation, gone by the next visit. */
  | 'enabled'

export const NotificationPrompt = () => {
  const notifications = useNotifications()
  const repository = usePushSubscriptionRepository()
  const storage = useSecureStorage()

  /**
   * `isSupported()` is a synchronous predicate, so the unsupported case is settled **at the first
   * render** rather than by an effect that immediately calls `setState`. That is not only what
   * `react-hooks/set-state-in-effect` requires: a browser that can never deliver has nothing to
   * reconcile and nothing to ask, and routing it through an extra render would be describing a
   * decision as a state change.
   */
  const [state, setState] = useState<State>(() =>
    notifications.isSupported() ? 'checking' : 'absent',
  )

  /**
   * Guards the async work below against a component that has gone away — the attendee can open a
   * conversation, or leave Messages entirely, while a browser permission prompt is still open.
   */
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /**
   * T121 — reconcile what the browser holds with what the server has recorded.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The browser is authoritative, and the server is repaired to match it.** Both directions
   * matter and they are not symmetric:
   *
   *   - Browser has a subscription the server does not know about → **register**. This is the
   *     shared-laptop case as much as the first-run one: sign-out cleared our record of the
   *     endpoint but not the endpoint itself, so re-registering is what moves it to the account
   *     actually holding the device.
   *   - Browser has none but we recorded one → **surrender** (FR-556). This is a revoked
   *     permission observed after the fact, and it must not touch the attendee's other devices —
   *     which is why the call names one endpoint rather than the account.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    // Settled at construction — see the `useState` initialiser.
    if (!notifications.isSupported()) return

    void (async () => {
      try {
        // Inside the `try`, not before it. Reading storage is the least likely thing here to
        // fail, which is exactly why it would be the one left uncaught — and an uncaught
        // rejection inside a floating promise is a silent failure with no state change at all.
        const [current, known, declined] = await Promise.all([
          notifications.currentSubscription(),
          storage.get(ENDPOINT_KEY),
          storage.get(DECLINED_KEY),
        ])

        if (current) {
          if (current.endpoint !== known) {
            await repository.register(current)
            await storage.set(ENDPOINT_KEY, current.endpoint)
          }
          if (live.current) setState('absent')
          return
        }

        if (known) {
          await repository.unregister(known)
          await storage.remove(ENDPOINT_KEY)
        }

        if (live.current) setState(declined ? 'absent' : 'offer')
      } catch {
        // Offline, or the API is unreachable. Deliberately silent: nobody asked for this, it is a
        // repair rather than an action, and it will be attempted again on the next visit. Raising
        // it would put a failure in front of somebody who has not tried to do anything.
        if (live.current) setState('absent')
      }
    })()
  }, [notifications, repository, storage])

  const enable = useCallback(() => {
    setState('working')

    void (async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **THE `try` OPENS HERE, NOT AFTER THE PERMISSION CALL — AND THAT WAS A STUCK SCREEN.**
      //
      // `requestPermission()` and `storage.set()` used to sit outside it. Either can reject:
      // `Notification.requestPermission()` throws in an insecure context and in some embedded
      // webviews, and `SecureStorage.set` throws on a storage quota or in a private window with
      // storage disabled. A rejection escaped this floating promise unhandled, no `setState` ran,
      // and the component stayed in `'working'` — where **both buttons are disabled** and there
      // is no way out short of a reload, with nothing persisted to survive one.
      //
      // The reconcile effect above already puts everything inside its `try` for exactly this
      // reason. This is that rule, applied to the path an attendee actually presses.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      try {
        const permission = await notifications.requestPermission()

        if (permission !== 'granted') {
          // FR-552 — a complete outcome, not a failure. Recorded so it is not asked again, and
          // presented as nothing at all: the product the attendee now has is the whole product.
          await storage.set(DECLINED_KEY, 'true')
          if (live.current) setState('absent')
          return
        }

        const subscription = await notifications.subscribe()
        // `null` from a *granted* permission means the push service refused or the service worker
        // is not ready — genuinely retryable, unlike a denial, so the two do not share a state.
        if (!subscription) {
          if (live.current) setState('failed')
          return
        }

        await repository.register(subscription)
        await storage.set(ENDPOINT_KEY, subscription.endpoint)
        await storage.remove(DECLINED_KEY)
        if (live.current) setState('enabled')
      } catch {
        if (live.current) setState('failed')
      }
    })()
  }, [notifications, repository, storage])

  const decline = useCallback(() => {
    setState('absent')
    void storage.set(DECLINED_KEY, 'true')
  }, [storage])

  if (state === 'checking' || state === 'absent') return null

  if (state === 'enabled') {
    return (
      <p
        // `status` rather than `alert`: it is a confirmation of something the attendee just did,
        // and an assertive live region would interrupt a screen reader mid-sentence to say so.
        role="status"
        className="mb-4 rounded-sm border border-mint-300 bg-mint-100 px-4 py-3 text-sm text-text-primary"
      >
        Notifications are on for this device. You can turn them off in your browser&rsquo;s site
        settings at any time.
      </p>
    )
  }

  return (
    <div className="mb-4 rounded-sm border border-border-subtle bg-surface-raised px-4 py-4">
      <h2 className="font-display text-base font-semibold text-text-primary">
        Get told when someone writes to you
      </h2>
      {/*
        FR-551 — what it is for, what it will and will not do, before the browser is ever asked.
        The second sentence is doing real work: "only this" is the promise FR-561 makes structural
        on the server, and an attendee deciding whether to allow interruptions is owed it here.
      */}
      <p className="mt-1 text-sm text-text-muted">
        Your device can show a notification when another attendee sends you a message, even when
        MyNet is closed. That is the only thing MyNet will ever notify you about.
      </p>

      {/*
        ═══════════════════════════════════════════════════════════════════════════════════════
        **THIS MESSAGE NAMES THE USUAL CAUSE, BECAUSE THE MOST COMMON ONE IS PERMANENT.**

        It used to read "we couldn't finish setting up notifications — you can try again", which
        is true of a push service that refused and **false of a private window**. Chrome's
        incognito mode and Firefox's private browsing cannot hold a push subscription at all, so
        the permission prompt succeeds, the subscribe that follows it fails, and the attendee is
        invited to retry something that can never work.

        That is not a hypothetical: it is how this was first tested, and the reasonable conclusion
        was "the feature is broken" rather than "this window cannot do it".

        **The wording says what is known and names what is likely, rather than guessing.** The
        browser reports the same failure for a private window as for a push service having a bad
        minute — there is no reliable way to tell them apart from here, and inventing a detector
        would mean confidently telling some people the wrong thing. So the retry stays (the
        transient case is real), and the sentence that matters comes first.
        ═══════════════════════════════════════════════════════════════════════════════════════
      */}
      {state === 'failed' && (
        <p role="alert" className="mt-3 text-sm text-danger-700">
          We couldn&rsquo;t set up notifications on this device. If this is a{' '}
          <strong className="font-medium">private or incognito window</strong>, that is why — those
          cannot receive notifications, so try an ordinary window. Otherwise you can try again.
          Either way, your messages work normally.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={state === 'working'}
          className="focus-ring min-h-11 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'failed' ? 'Try again' : 'Turn on notifications'}
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={state === 'working'}
          className="focus-ring min-h-11 rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-text-body disabled:cursor-not-allowed disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
