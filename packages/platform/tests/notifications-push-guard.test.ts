import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebNotificationService } from '../src/web/notifications.js'

/**
 * T016 (012) — **the push service is never consulted without granted permission** (FR-1145).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PROPERTY UNDER TEST IS AN ABSENCE OF A CALL, WHICH IS WHY IT LIVES AT THE UNIT LAYER.**
 *
 * On WebKit builds with no push service behind them — Playwright's is the measured case —
 * `pushManager.getSubscription()` wedges the page's main thread, and because
 * `NotificationPrompt`'s reconcile ran it on every visit to Messages, Safari users could not
 * open the destination at all (research R5: `GET /conversations` issued and never answered —
 * the request was fine, the page it would have answered was dead). The fix is the invariant the
 * service's own comments already stated: a push subscription cannot exist without granted
 * notification permission, so when permission is not `'granted'` the answer is `null` **without
 * asking**.
 *
 * `e2e/messages-terminal.spec.ts` proves the symptom is gone in a real WebKit. This file pins
 * the mechanism — no fetch of `getSubscription` when permission forbids a result — because the
 * e2e cannot tell "guard held" from "WebKit fixed their deadlock", and the day the second
 * becomes true is the day the guard could be dropped without anything failing.
 *
 * **The `'granted'` case is asserted too, and it is not symmetry for its own sake**: a guard
 * that overreached would stop the reconcile repairing real registrations — the shared-laptop
 * re-register and the revoked-permission surrender both depend on the read actually happening
 * when it can mean something.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A registration whose push manager records whether anybody asked it anything. */
const fakeRegistration = () => {
  const getSubscription = vi.fn(async () => null)
  const registration = { pushManager: { getSubscription } }
  return { registration, getSubscription }
}

/** Installs `Notification` and `navigator.serviceWorker` the way a browser would present them. */
const stubBrowser = (permission: NotificationPermission, registration: unknown): void => {
  vi.stubGlobal('Notification', { permission })
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration) } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('currentSubscription', () => {
  it.each(['default', 'denied'] as const)(
    'answers null with permission %j without touching the push service',
    async (permission) => {
      const { registration, getSubscription } = fakeRegistration()
      stubBrowser(permission, registration)

      const service = new WebNotificationService('a-vapid-key')

      await expect(service.currentSubscription()).resolves.toBeNull()
      expect(
        getSubscription,
        'Without granted permission no subscription can exist, so this call carries no ' +
          'information — and making it is what deadlocked WebKit (FR-1145).',
      ).not.toHaveBeenCalled()
    },
  )

  it('does consult the push service once permission is granted', async () => {
    const { registration, getSubscription } = fakeRegistration()
    stubBrowser('granted', registration)

    const service = new WebNotificationService('a-vapid-key')

    await expect(service.currentSubscription()).resolves.toBeNull()
    expect(getSubscription).toHaveBeenCalledTimes(1)
  })
})

describe('unsubscribe', () => {
  it('returns without touching the push service when permission is not granted', async () => {
    const { registration, getSubscription } = fakeRegistration()
    stubBrowser('denied', registration)

    const service = new WebNotificationService('a-vapid-key')

    await expect(service.unsubscribe()).resolves.toBeUndefined()
    expect(getSubscription).not.toHaveBeenCalled()
  })
})
