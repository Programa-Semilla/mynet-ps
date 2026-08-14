import { useState, type FormEvent } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { PasswordField } from '../ui/PasswordField.js'

/** The floor the server enforces too. Stated here so the control is disabled rather than refused. */
const MINIMUM_LENGTH = 12

/**
 * T068 (013) — forced replacement of the bootstrapped credential (FR-992).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE OPERATOR CANNOT LEAVE THIS SCREEN, AND THAT IS ENFORCED ON THE SERVER RATHER THAN HERE.**
 *
 * `requireOperator` refuses every administrative address except this one while
 * `credential_is_initial` is true, with a **403 that explains itself** — one of only two refusals
 * in this feature that do, and it passes the test they must: the follow-up question is about the
 * reader, and they can fix it in one step.
 *
 * This screen exists so they never have to see that refusal: the session provider classifies the
 * `credential_not_replaced` 403 from its own first `/admin/me` and renders this instead of an
 * error. It cannot route here on a `credentialIsInitial` flag — that would need a successful
 * `/admin/me`, which is one of the addresses this state may not reach. The interface avoiding a
 * 403 is not the same as the 403 not existing, and conflating the two is how a client-side
 * redirect becomes somebody's idea of a security control.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Why it is forced at all**: the credential came from `pnpm admin:bootstrap`, which reads it
 * from an environment variable that stays in a `.env` on the host forever. Until the operator
 * replaces it, anybody who has read that file — or a backup of it — holds administrative access.
 */
export const ReplaceCredential = () => {
  const { services, refresh, signOut } = useAdminSession()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const longEnough = newPassword.length >= MINIMUM_LENGTH
  const matches = newPassword === confirmation
  // Disabled, never a post-submit error — the constitution's required-states constraint.
  const ready = currentPassword.length > 0 && longEnough && matches

  /**
   * T029 (016) — **the mismatch is DESCRIBED, not merely enforced** (FR-1018, FR-1050).
   *
   * This screen has disabled its submit on a mismatch since 013, which is half of the
   * requirement and the half that is easy to notice. The other half is that the reader is told
   * *why* the control is off: a disabled button beside two filled-in fields, with nothing
   * explaining it, is a dead end somebody can sit in front of indefinitely.
   *
   * Shown only once there is something to compare, so it is not an error message greeting
   * somebody who has typed one character of a password they are about to type correctly.
   */
  const mismatch = confirmation.length > 0 && !matches

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || submitting) return

    setSubmitting(true)
    setFailure(null)
    try {
      await services.session.replaceCredential({ currentPassword, newPassword })
      // The session is deliberately **not** revoked by the server — replacing a credential the
      // operator was handed is the first thing they do, and signing them straight out again
      // would make the product's opening interaction a dead end. Re-reading `/admin/me` is what
      // clears `credentialIsInitial` and lets the shell render.
      await refresh()
    } catch (error) {
      setFailure(describe(classify(error)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-xl font-semibold text-text-primary">Choose your password</h1>
        <p className="mb-6 text-sm text-text-body">
          The password you signed in with was set for you. Replace it before continuing — until you
          do, it is known to whoever configured this deployment.
        </p>

        <form
          onSubmit={(event) => void submit(event)}
          className="rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-sm"
          noValidate
        >
          <label htmlFor="current-password" className="block text-sm font-medium text-text-primary">
            Current password
          </label>
          <div className="mt-1 mb-4">
            <PasswordField
              id="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              className="block min-h-11 w-full rounded-lg border border-border-strong px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
            />
          </div>

          <label htmlFor="new-password" className="block text-sm font-medium text-text-primary">
            New password
          </label>
          <div className="mt-1">
            <PasswordField
              id="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              describedBy="new-password-hint"
              className="block min-h-11 w-full rounded-lg border border-border-strong px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
            />
          </div>
          {/* Stated before submission, and bound to the field, so the rule is never a surprise. */}
          <p id="new-password-hint" className="mt-1 mb-4 text-xs text-text-muted">
            At least {MINIMUM_LENGTH} characters.
          </p>

          <label htmlFor="confirm-password" className="block text-sm font-medium text-text-primary">
            Confirm new password
          </label>
          <div className="mt-1">
            <PasswordField
              id="confirm-password"
              autoComplete="new-password"
              value={confirmation}
              onChange={setConfirmation}
              {...(mismatch ? { describedBy: 'confirm-password-mismatch', invalid: true } : {})}
              className="block min-h-11 w-full rounded-lg border border-border-strong px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
            />
          </div>
          {/*
            Bound to the field by `aria-describedby`, not merely rendered near it — a message a
            sighted reader connects by proximity is unconnected to anything for a screen reader.
          */}
          <p
            id="confirm-password-mismatch"
            className={`mt-1 mb-4 text-xs ${mismatch ? 'text-danger-700' : 'sr-only'}`}
          >
            {mismatch ? 'Both passwords must be the same before you can continue.' : ''}
          </p>

          {failure ? (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700"
            >
              {failure}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!ready || submitting}
            className="min-h-11 w-full rounded-lg bg-coral-600 px-4 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50 hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
          >
            {submitting ? 'Saving…' : 'Save and continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 min-h-11 w-full rounded-lg text-sm text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Sign out instead
        </button>
      </div>
    </main>
  )
}
