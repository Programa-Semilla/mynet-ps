import { useInstallState, useSecureStorage } from '@mynet/platform'
import { Share, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

/**
 * T053 (016) — **why installing matters, on a phone that has not** (FR-1031–FR-1037).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **IT EXPLAINS A CAPABILITY. IT DOES NOT ASK TO BE INSTALLED FOR ITS OWN SAKE** (FR-1032).
 *
 * The reason this exists is specific and is not "installable apps are nice": **notification
 * delivery on iOS is available only to an installed application.** An attendee on an uninstalled
 * iPhone can be shown the permission prompt, grant it, and receive nothing at all — the product
 * looks like it is working and silently is not.
 *
 * So the copy leads with the consequence rather than the action. "Add MyNet to your home screen"
 * is a request; "installing is what lets messages reach you" is a reason, and a reader who does
 * not care about messages is right to dismiss it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWO PLATFORM HALVES ARE ASYMMETRIC, AND NEITHER IS A DEGRADED VERSION OF THE OTHER**
 * (FR-1033, FR-1034).
 *
 * Where the platform hands the page an install mechanism — Chromium — this offers a control that
 * invokes the **real** system prompt. Where it does not — iOS Safari, which fires nothing and
 * exposes no install API — this gives the steps the reader performs themselves and **renders no
 * control at all**.
 *
 * A dead button is worse than written steps: it is the shape that teaches somebody the product is
 * broken. `InstallState.promptToInstall` is `null` in that case, so the absence is enforced by
 * the type rather than remembered here.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **IT NEVER REQUESTS NOTIFICATION PERMISSION** (FR-1036).
 *
 * It is *about* notifications and asks for nothing. `NotificationPrompt.tsx` remains the only
 * caller of `requestPermission` in this client — 007's guarantee, asserted by a unit test — and a
 * second place that asked would be exactly the erosion that test exists to catch. Permission is
 * also meaningless here: nobody has signed in yet.
 *
 * **And it never blocks, obscures or delays signing in** (FR-1037). It is a dismissible notice
 * below the form, not a modal, not an interstitial, and not something to get past.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Where the dismissal is remembered — **per device, not per account** (FR-1035).
 *
 * Two reasons, and the second is the load-bearing one: whether this device has the application
 * installed is a fact about the device, and **this renders before anybody has signed in**, so
 * there is no account to key it by. It stores a boolean and nothing about a person.
 */
const DISMISSED_KEY = 'install-guidance-dismissed'

export const InstallGuidance = () => {
  const install = useInstallState()
  const storage = useSecureStorage()

  /**
   * `null` while the stored answer is being read.
   *
   * Distinct from `false`: rendering during the read would flash the guidance at somebody who
   * dismissed it last week, which is a small thing that reads as the product forgetting.
   */
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    storage
      .get(DISMISSED_KEY)
      .then((value) => {
        if (!cancelled) setDismissed(value === 'true')
      })
      .catch(() => {
        // A storage failure must not hide the guidance *or* crash the sign-in screen. Showing it
        // is the safe direction, for the reason the spec gives: a redundant hint is a smaller
        // harm than an attendee who never learns notifications require installing.
        if (!cancelled) setDismissed(false)
      })

    return () => {
      cancelled = true
    }
  }, [storage])

  const dismiss = useCallback(() => {
    setDismissed(true)
    // Not awaited: the guidance goes now. A dismissal that failed to persist reappears next time,
    // which is a mild annoyance; a dismissal that waited on storage before hiding is a control
    // that feels broken.
    void storage.set(DISMISSED_KEY, 'true').catch(() => {})
  }, [storage])

  const [prompting, setPrompting] = useState(false)

  const offer = useCallback(async () => {
    if (!install.promptToInstall || prompting) return

    setPrompting(true)
    try {
      const accepted = await install.promptToInstall()
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **A declined install is not an error** (spec edge case). The reader was asked and said
      // no, which is the mechanism working — so nothing is announced and nothing is retried. The
      // guidance simply stays, because the reason for it has not changed.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (accepted) dismiss()
    } catch {
      // Same reasoning: a prompt that could not be shown leaves the written steps, which is the
      // state every iOS reader is in anyway.
    } finally {
      setPrompting(false)
    }
  }, [install, prompting, dismiss])

  // FR-1031's "when, and only when". Desktop, an installed instance, and a dismissal each render
  // nothing at all — not a collapsed box, not an empty region.
  if (!install.mobile || install.installed || dismissed !== false) return null

  return (
    <section
      aria-labelledby="install-guidance-heading"
      className="mt-6 rounded-md border border-border-subtle bg-surface-raised px-4 py-3 text-left"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="install-guidance-heading" className="mb-1 text-sm font-medium text-text-primary">
            Add MyNet to your home screen
          </h2>
          {/* FR-1032 — the reason, not the request. */}
          <p className="text-sm text-text-body">
            Installing MyNet is what lets messages reach you when the app is closed. Without it,
            notifications cannot be delivered on this device.
          </p>

          {install.promptToInstall ? (
            <button
              type="button"
              onClick={() => void offer()}
              disabled={prompting}
              className="focus-ring mt-3 min-h-11 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-60"
            >
              {prompting ? 'Opening…' : 'Install MyNet'}
            </button>
          ) : (
            /*
              FR-1034 — steps, and **no control**, because this platform offers the page no
              install mechanism. Written as the reader's own actions, in the order they perform
              them, naming the icon they are looking for rather than describing it abstractly.
            */
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-text-body">
              <li>
                Tap the share icon{' '}
                <Share aria-hidden="true" className="inline size-4 align-text-bottom" />
                <span className="sr-only">(Share)</span> in your browser’s toolbar.
              </li>
              <li>Choose “Add to Home Screen”.</li>
              <li>Open MyNet from your home screen from now on.</li>
            </ol>
          )}
        </div>

        {/*
          FR-1035 — dismissible, and reachable by keyboard like any other control. An icon-only
          button, so it carries its own accessible name rather than relying on the glyph.
        */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install guidance"
          className="focus-ring -mr-1 flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </section>
  )
}
