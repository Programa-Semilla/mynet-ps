import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useId, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { PRODUCT_NAME } from '../branding.js'

/**
 * T064 (004) — setting a new password from a reset link (FR-328, FR-330, FR-332).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The same password policy sign-up states, stated the same way** (FR-304). A person
 * recovering an account is under more pressure than one creating it, and learning the
 * requirement from a rejection at that moment is worse, not better.
 *
 * **Every other session ends when this succeeds** (FR-330), and the confirmation says so. A
 * reset is what somebody does when they think their account is compromised; being told that the
 * other device has been signed out is the reassurance they came for, and it is also fair
 * warning to somebody who was simply forgetful.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Mirrors `PASSWORD_MIN_LENGTH` in `apps/api/src/routes/auth/sign-up.ts`. */
export const PASSWORD_MIN_LENGTH = 12

export const ResetPassword = () => {
  const identity = useIdentityRepository()
  const [params] = useSearchParams()
  const token = params.get('token')

  const passwordId = useId()
  const helpId = useId()

  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [expired, setExpired] = useState(!token)

  const longEnough = password.length >= PASSWORD_MIN_LENGTH
  const canSubmit = Boolean(token) && longEnough && !submitting

  const blockedBecause =
    submitting || !token
      ? null
      : !longEnough
        ? `Your new password needs at least ${PASSWORD_MIN_LENGTH} characters. ${
            password.length > 0 ? `You have ${password.length}.` : ''
          }`.trim()
        : null

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !token) return

    setSubmitting(true)
    setFailure(null)

    try {
      await identity.resetPassword(token, password)
      setDone(true)
    } catch (error) {
      if (error instanceof OfflineError) {
        setFailure(
          'Setting a new password needs a connection. Your password has not changed, and your link has not been used — try again once you reconnect.',
        )
        return
      }

      if (error instanceof RequestRefusedError && error.code === 'link_expired') {
        setExpired(true)
        return
      }

      setFailure(
        error instanceof RequestRefusedError
          ? error.message
          : `Could not reach ${PRODUCT_NAME}. Your password has not changed — try again.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-card sm:p-8">
        <h1 className="mb-4 font-display text-2xl font-semibold text-text-primary">
          Set a new password
        </h1>

        {done ? (
          <>
            <p role="status" className="mb-4 text-sm text-text-body">
              Your password is set. Every other device has been signed out — sign in again with your
              new password.
            </p>
            <Link
              to="/"
              className="inline-flex items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
            >
              Sign in
            </Link>
          </>
        ) : expired ? (
          <>
            <p role="status" className="mb-4 text-sm text-text-body">
              That link is no longer valid. Reset links can be used once, and they expire within the
              hour. Ask for a new one — your password has not changed.
            </p>
            <Link
              to="/reset-password-request"
              className="inline-flex items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} noValidate>
            <label
              htmlFor={passwordId}
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              New password
            </label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              aria-describedby={helpId}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
            <p id={helpId} className="mt-1 text-xs text-text-muted">
              At least {PASSWORD_MIN_LENGTH} characters. Setting it signs you out everywhere else.
            </p>

            {failure && (
              <p
                role="alert"
                className="mt-3 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
              >
                {failure}
              </p>
            )}

            {blockedBecause && (
              <p role="status" aria-live="polite" className="mt-3 text-sm text-text-muted">
                {blockedBecause}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-4 w-full rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Setting your password…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
