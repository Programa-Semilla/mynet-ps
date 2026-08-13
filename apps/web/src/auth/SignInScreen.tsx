import { RequestRefusedError } from '@mynet/data'
import { useAuthGateway } from '@mynet/platform'
import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'

import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../app/branding.js'
import { BrandMark } from '../shell/BrandMark.js'
import { PasswordField } from '../ui/PasswordField.js'
import { InstallGuidance } from './InstallGuidance.js'
import { useAuth } from './useAuth.js'

/**
 * T059 — the sign-in screen.
 *
 * Accessibility obligations discharged here (FR-021, constitution Principle IV):
 *
 * - Every control has a real `<label>` bound by id. Placeholder text is not a label — it
 *   disappears on focus, which is exactly when a screen-reader user needs it.
 * - Focus is visible. The global `:focus-visible` rule in tokens.css supplies it; nothing
 *   here removes an outline.
 * - **Submit is disabled while the form is invalid, rather than accepting the submission and
 *   showing an error afterwards.** That is an explicit requirement, not a preference
 *   (constitution Principle IV, "invalid empty message or meeting topic — disabled
 *   confirmation, never a post-submit error"). The same rule is applied here.
 * - The failure message is announced: `role="alert"` so it reaches assistive technology
 *   without the attendee having to go looking for it.
 */
export const SignInScreen = () => {
  const { markSignedIn, expiredThroughInactivity } = useAuth()
  const auth = useAuthGateway()
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Both fields non-empty. Deliberately not an email-format check: rejecting what looks like
  // a malformed address in the browser would tell an attacker nothing, but would block an
  // attendee whose address is unusual and valid. The server validates properly.
  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFailure(null)

    try {
      await auth.signIn({ email, password })
      await markSignedIn()
    } catch (error) {
      // The server's message is shown verbatim. It is written to be attendee-facing (FR-059)
      // and is deliberately identical for every sign-in failure cause (FR-030) — rewording it
      // here would risk reintroducing the distinction the server works to erase.
      //
      // `RequestRefusedError` rather than the transport's `ApiError`: presentation code must be
      // able to recognise a refusal without importing anything that knows HTTP exists (FR-045).
      setFailure(
        error instanceof RequestRefusedError
          ? error.message
          : 'Could not reach MyNet. Check your connection and try again.',
      )
    } finally {
      // Unconditionally. Resetting only in the catch left the button stuck on "Signing in…"
      // with submission permanently disabled whenever sign-in succeeded but the follow-up
      // identity check did not — a dead end with no way back, which is what FR-061 forbids.
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-card sm:p-8">
        {/*
          T041 (010) — the stacked lockup: mark centred above the heading, in the **navy**
          colourway for this light card (FR-826).

          **The header block is centred as a unit, and that is the arrangement rather than a
          preference.** The board draws the stacked lockup with the mark centred over the
          wordmark; centring only the image would leave it floating above a left-aligned name,
          which reads as a misalignment rather than a lockup. Owner decision, 2026-08-10.

          Only the *alignment* moves. Every heading's text is exactly what it was (SC-808), and
          what this heading must not become is the board's raster lockup dropped in whole: on
          **this** screen the product name is the `<h1>` — the only one of the five where that is
          so. An image cannot be a heading, so the mark sits above it and stays decorative.
        */}
        <header className="mb-6 text-center">
          <BrandMark colourway="navy" className="mx-auto mb-3 block h-10" />
          <h1 className="font-display text-2xl font-semibold text-text-primary">{PRODUCT_NAME}</h1>
          <p className="mt-1 text-sm text-text-muted">{PRODUCT_TAGLINE}</p>
        </header>

        {/*
          FR-028c — explain the inactivity sign-out. Without this the attendee is simply back
          at a sign-in screen with no idea why, which reads as the product losing their work.
        */}
        {expiredThroughInactivity && (
          <p
            role="status"
            className="mb-4 rounded-sm border border-border-subtle bg-cream-200 px-3 py-2 text-sm text-text-body"
          >
            You were signed out after a period of inactivity. Sign in again to pick up where you
            left off.
          </p>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor={emailId} className="mb-1 block text-sm font-medium text-text-primary">
              Email address
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={failure ? errorId : undefined}
              aria-invalid={failure ? true : undefined}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
          </div>

          <div className="mb-5">
            <label
              htmlFor={passwordId}
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            {/*
              T027 (016) — reveal only. Signing in **sets** no credential, so there is nothing to
              confirm: a confirmation field here would ask the reader to type their existing
              password twice to prove they remember it, which is what the field they are already
              filling in does.
            */}
            <PasswordField
              id={passwordId}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
              {...(failure ? { describedBy: errorId, invalid: true } : {})}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
          </div>

          {failure && (
            <p
              id={errorId}
              role="alert"
              className="mb-4 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
            >
              {failure}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/*
          ─────────────────────────────────────────────────────────────────────────────────
          T050 (004) — the two exits this screen could not offer until now.

          Until 004 there was no way to create an account and no way to recover one: accounts
          were provisioned by a seed script, and the note that stood here said so. Self sign-up
          (FR-300) and password recovery (FR-326) are what replace it, and they arrived together
          on purpose — an account nobody can recover is one forgotten password from being
          permanently lost, and there is no organizer to appeal to.
          ─────────────────────────────────────────────────────────────────────────────────
        */}
        <p className="mt-6 text-sm text-text-body">
          New here?{' '}
          <Link to="/sign-up" className="font-medium text-accent-strong underline">
            Create an account
          </Link>
        </p>
        <p className="mt-2 text-sm text-text-body">
          <Link to="/reset-password-request" className="font-medium text-accent-strong underline">
            Forgot your password?
          </Link>
        </p>

        {/*
          T054 (016) — **below everything, and last in the reading order** (FR-1037).

          The guidance must not block, obscure or delay signing in, and placement is how that is
          guaranteed rather than promised: it is after the form, after both links, in normal flow
          — not a modal, not an interstitial, and nothing to get past. Somebody who came here to
          sign in reaches every control before they reach this.

          It renders nothing at all on desktop, on an installed instance, or once dismissed
          (FR-1031, FR-1035), so this costs the other cases an empty element rather than a gap.
        */}
        <InstallGuidance />
      </div>
    </main>
  )
}
