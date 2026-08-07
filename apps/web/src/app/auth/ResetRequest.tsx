import { OfflineError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { PRODUCT_NAME } from '../branding.js'

/**
 * T064 (004) — asking for a password reset (FR-326, FR-327).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE CONFIRMATION, WHATEVER HAPPENED** (FR-327).
 *
 * The server answers `202` whether or not an account exists, and this screen must not undo that
 * from the other end. There is deliberately **no** "we could not find that address" state, no
 * spinner that resolves differently, and no wording that hedges — the confirmation below is the
 * only outcome a person ever sees, and it is phrased so that it is true either way.
 *
 * This is the one non-disclosure guarantee that survives 004. Sign-up discloses (FR-303)
 * because it cannot avoid it; this path genuinely can, so it does.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const ResetRequest = () => {
  const identity = useIdentityRepository()
  const emailId = useId()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const canSubmit = email.trim().length > 0 && !submitting

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFailure(null)

    try {
      await identity.requestPasswordReset(email)
      setSubmitted(true)
    } catch (error) {
      // ───────────────────────────────────────────────────────────────────────────────────────
      // Only a *transport* failure can be reported here, and it is reported as one. The server
      // has no refusal for this route: an unknown address, a throttled request and a successful
      // send are one response. If a `RequestRefusedError` ever reached this branch it would mean
      // the route had grown a refusal, which is the thing FR-327 forbids.
      // ───────────────────────────────────────────────────────────────────────────────────────
      setFailure(
        error instanceof OfflineError
          ? 'Requesting a reset needs a connection. Nothing has been sent — try again once you reconnect.'
          : `Could not reach ${PRODUCT_NAME}. Nothing has been sent — try again.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-card sm:p-8">
        <h1 className="mb-2 font-display text-2xl font-semibold text-text-primary">
          Reset your password
        </h1>

        {submitted ? (
          <>
            {/*
              Deliberately says "if" rather than "we have sent". Both are true of the same
              response, and "if" is the one that stays true for an address with no account —
              which is the wording that makes the two cases indistinguishable to the person
              reading it, not merely to a program parsing the status code.
            */}
            <p role="status" className="mb-4 text-sm text-text-body">
              If there is an account for that address, a reset link is on its way. The link works
              once and expires within the hour.
            </p>
            <Link to="/" className="text-sm font-medium text-accent-strong underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-text-muted">
              Enter your email address and we will send you a link to set a new one.
            </p>

            <form onSubmit={(event) => void onSubmit(event)} noValidate>
              <label htmlFor={emailId} className="mb-1 block text-sm font-medium text-text-primary">
                Email address
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
              />

              {failure && (
                <p
                  role="alert"
                  className="mt-3 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
                >
                  {failure}
                </p>
              )}

              {!canSubmit && !submitting && (
                <p role="status" aria-live="polite" className="mt-3 text-sm text-text-muted">
                  Enter your email address to continue.
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-4 w-full rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-6 text-sm text-text-body">
              <Link to="/" className="font-medium text-accent-strong underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
