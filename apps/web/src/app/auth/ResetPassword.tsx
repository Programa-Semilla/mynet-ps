import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useId, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { BrandMark } from '../../shell/BrandMark.js'
import { PasswordField } from '../../ui/PasswordField.js'
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
  const confirmId = useId()
  const confirmHelpId = useId()

  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [expired, setExpired] = useState(!token)

  const longEnough = password.length >= PASSWORD_MIN_LENGTH

  /**
   * T026 (016) — **the confirmation** (FR-1017, FR-1018).
   *
   * The stakes here are the same as at sign-up and arrive from the other direction: somebody
   * resetting a password has *already* been locked out once, and a typo would lock them out
   * again — with a link that has now been spent. It is never submitted (FR-1019).
   */
  const matches = password === confirmation
  const mismatch = confirmation.length > 0 && !matches

  const canSubmit = Boolean(token) && longEnough && matches && !submitting

  const blockedBecause =
    submitting || !token
      ? null
      : !longEnough
        ? `Your new password needs at least ${PASSWORD_MIN_LENGTH} characters. ${
            password.length > 0 ? `You have ${password.length}.` : ''
          }`.trim()
        : !matches
          ? 'Both passwords must be the same before you can continue.'
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
        {/*
          T045 (010) — the stacked lockup, centred as a unit (FR-826). Navy on this light card.
          The heading's text is unchanged; only its alignment moves.
        */}
        <header className="mb-4 text-center">
          <BrandMark colourway="navy" className="mx-auto mb-3 block h-10" />
          <h1 className="font-display text-2xl font-semibold text-text-primary">
            Set a new password
          </h1>
        </header>

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
            <PasswordField
              id={passwordId}
              name="password"
              autoComplete="new-password"
              required
              describedBy={helpId}
              value={password}
              onChange={setPassword}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
            <p id={helpId} className="mt-1 text-xs text-text-muted">
              At least {PASSWORD_MIN_LENGTH} characters. Setting it signs you out everywhere else.
            </p>

            <label
              htmlFor={confirmId}
              className="mt-5 mb-1 block text-sm font-medium text-text-primary"
            >
              Confirm new password
            </label>
            {/*
              **No `name`** (FR-1019, S2). It would put a second copy of the credential into the
              form's native serialization, and this form declares neither `action` nor `method` —
              so a native submission would navigate to the current URL with the password in the
              query string, and from there into history, `Referer` and the proxy's access log.
              Latent while `preventDefault()` is the first statement of `onSubmit`, and pointless
              regardless: the confirmation is never transmitted. Autofill keys on
              `autoComplete="new-password"`. `SignUp` carries the same reasoning at length.
            */}
            <PasswordField
              id={confirmId}
              autoComplete="new-password"
              required
              describedBy={confirmHelpId}
              invalid={mismatch}
              value={confirmation}
              onChange={setConfirmation}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
            {/* Bound to the field, not merely placed beneath it (FR-1018). */}
            <p
              id={confirmHelpId}
              className={`mt-1 text-xs ${mismatch ? 'text-danger-700' : 'text-text-muted'}`}
            >
              {mismatch
                ? 'Both passwords must be the same before you can continue.'
                : 'Type it again, so a typo does not lock you out a second time.'}
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
