import { OfflineError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useState } from 'react'

/**
 * T066 (004) — the invitation to verify (FR-325a, FR-325b).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **UNOBTRUSIVE, AND IT MUST STAY THAT WAY.**
 *
 * FR-325b is explicit: the product **must not** present an unverified account as impaired,
 * blocked, or pending. There is no banner across the shell, no interstitial, no badge on the
 * attendee's name, and nothing here refuses or defers any action. An unverified attendee joins
 * conferences, authors this very profile, saves sessions and writes notes exactly as anybody
 * else does (FR-324).
 *
 * What it must do is **state plainly that verification is what makes them visible to others**,
 * so the gate is discoverable rather than mysterious. Somebody who cannot find themselves in a
 * conference directory should be able to learn why by looking at their own profile, rather than
 * concluding the product is broken.
 *
 * `role="status"` rather than `role="alert"`: this is information, not a problem. An alert
 * interrupts, and interrupting somebody to tell them about a state that prevents nothing is the
 * obtrusiveness FR-325b rules out.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const VerifyInvitation = ({ emailVerified }: { emailVerified: boolean }) => {
  const identity = useIdentityRepository()

  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [failure, setFailure] = useState<string | null>(null)

  // Nothing to say to somebody who has already verified. The absence is the point: a permanent
  // "you are verified" notice would be exactly the badge FR-325b rules out, from the other side.
  if (emailVerified) return null

  const resend = async () => {
    setState('sending')
    setFailure(null)

    try {
      await identity.resendVerification()
      setState('sent')
    } catch (error) {
      setState('failed')
      setFailure(
        error instanceof OfflineError
          ? 'Sending a new link needs a connection. Try again once you reconnect.'
          : 'Could not send a new link just now. Try again in a moment.',
      )
    }
  }

  return (
    <section
      aria-label="Email verification"
      className="mb-6 rounded-md border border-border-subtle bg-cream-200 px-4 py-3"
    >
      <p className="text-sm text-text-body">
        Your email address is not verified yet.{' '}
        <strong className="font-medium text-text-primary">
          Verifying is what makes you visible to other attendees at your conferences.
        </strong>{' '}
        Everything else works as normal.
      </p>

      {state === 'sent' ? (
        <p role="status" className="mt-2 text-sm text-text-body">
          {/*
            "If it does not arrive" rather than "sent" — the mail provider is unprovisioned
            (register entry 18), so a message that never arrives is the expected state and the
            wording must not promise otherwise (FR-318a).
          */}
          A new link is on its way. If it does not arrive, check the address on your account.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void resend()}
          disabled={state === 'sending'}
          className="mt-2 rounded-sm border border-border-subtle bg-surface-raised px-3 py-1 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Send me a new link'}
        </button>
      )}

      {state === 'failed' && failure && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {failure}
        </p>
      )}
    </section>
  )
}
