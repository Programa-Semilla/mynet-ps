import { RequestRefusedError, OfflineError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { useAuth } from '../../auth/useAuth.js'
import { BrandMark } from '../../shell/BrandMark.js'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../branding.js'

/**
 * T046 (004) — creating an account (FR-300, FR-301, FR-303, FR-304, FR-306).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PASSWORD REQUIREMENT IS VISIBLE BEFORE SUBMISSION, AND THE CONFIRMATION IS DISABLED
 * UNTIL IT IS MET** (FR-304).
 *
 * That is a requirement rather than a preference, and it is the same rule the constitution
 * states for an empty message and an empty meeting topic: *disabled confirmation, never a
 * post-submit error*. A person should not have to submit a form to be told what the form
 * wanted.
 *
 * The reason a disabled control is disabled is **announced**, not implied by it being grey.
 * `aria-describedby` binds the requirement to the field, so a screen-reader user hears it as
 * part of the field rather than having to go looking for adjacent prose (Accessibility
 * declaration).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Mirrors `PASSWORD_MIN_LENGTH` in `apps/api/src/routes/auth/sign-up.ts`.
 *
 * **Exported so `tests/unit/client-limits.test.ts` can hold it to the published contract.** A
 * comment saying "mirrors" is a hope; that test is what makes it true. FR-304 requires the
 * confirmation to be *disabled* with the reason stated — never a post-submit error — and this
 * value is what computes the disabled state, so drifting below the server's bound produces
 * exactly the 400 the requirement forbids, with nothing failing to warn anyone.
 */
export const PASSWORD_MIN_LENGTH = 12

export const SignUp = () => {
  const identity = useIdentityRepository()
  const { markSignedIn } = useAuth()
  const navigate = useNavigate()

  const emailId = useId()
  const nameId = useId()
  const passwordId = useId()
  const passwordHelpId = useId()
  const errorId = useId()

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const passwordLongEnough = password.length >= PASSWORD_MIN_LENGTH
  const hasName = displayName.trim().length > 0
  const hasEmail = email.trim().length > 0

  const canSubmit = hasEmail && hasName && passwordLongEnough && !submitting

  /**
   * Why the confirmation is disabled, in words.
   *
   * Ordered by what the person is most likely to be missing rather than by field order, so the
   * message is about the thing they are currently working on.
   */
  const blockedBecause = submitting
    ? null
    : !hasEmail
      ? 'Enter your email address to continue.'
      : !hasName
        ? 'Enter the name other attendees will see.'
        : !passwordLongEnough
          ? `Your password needs at least ${PASSWORD_MIN_LENGTH} characters. ${
              password.length > 0 ? `You have ${password.length}.` : ''
            }`.trim()
          : null

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFailure(null)

    try {
      await identity.signUp({ email, displayName, password })
      // FR-306 — already signed in by the same request. Re-asking the server who we are is what
      // moves the shell from signed-out to signed-in; there is no token here to hold.
      await markSignedIn()

      // ───────────────────────────────────────────────────────────────────────────────────────
      // **And then leave, explicitly.** This screen sits OUTSIDE `RequireAuth`, because a person
      // creating an account does not have a session — so unlike the sign-in screen, which the
      // guard swaps for the shell the moment identity resolves, nothing here changes when the
      // status flips. Without this navigation the attendee is signed in and still looking at the
      // form they just submitted, with no error and no way to tell it worked.
      //
      // Found by `e2e/identity-journey.spec.ts`, which is exactly the kind of defect only a real
      // browser walking the whole journey can see: every unit and component assertion passed.
      // ───────────────────────────────────────────────────────────────────────────────────────
      await navigate('/')
    } catch (error) {
      // Offline is distinguished from a server fault, and the typed text is left on screen —
      // nothing the person entered is lost, and nothing is queued (Offline declaration).
      if (error instanceof OfflineError) {
        setFailure(
          'Creating an account needs a connection. Nothing has been sent — your details are still here, and you can try again once you reconnect.',
        )
        return
      }

      // The server's wording is shown verbatim. FR-303's refusal is written to be
      // attendee-facing and offers both exits; rewording it here would risk losing one of them.
      setFailure(
        error instanceof RequestRefusedError
          ? error.message
          : `Could not reach ${PRODUCT_NAME}. Nothing was created — try again.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-card sm:p-8">
        <header className="mb-6">
          {/* T042 (010) — the stacked mark, navy on this light card. The heading is unchanged. */}
          <BrandMark colourway="navy" className="mb-3 h-10" />
          <h1 className="font-display text-2xl font-semibold text-text-primary">
            Create your {PRODUCT_NAME} account
          </h1>
          <p className="mt-1 text-sm text-text-muted">{PRODUCT_TAGLINE}</p>
        </header>

        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <div className="mb-4">
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
              aria-describedby={failure ? errorId : undefined}
              aria-invalid={failure ? true : undefined}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
          </div>

          <div className="mb-4">
            <label htmlFor={nameId} className="mb-1 block text-sm font-medium text-text-primary">
              Display name
            </label>
            <input
              id={nameId}
              name="displayName"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
            <p className="mt-1 text-xs text-text-muted">
              This is what other attendees see. You can change it later.
            </p>
          </div>

          <div className="mb-5">
            <label
              htmlFor={passwordId}
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="new-password"
              required
              // FR-304 — bound to the field, so the requirement is part of the field for a
              // screen reader rather than prose that happens to sit nearby.
              aria-describedby={passwordHelpId}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
            />
            <p id={passwordHelpId} className="mt-1 text-xs text-text-muted">
              At least {PASSWORD_MIN_LENGTH} characters. A short sentence you will remember beats a
              short password with symbols in it.
            </p>
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

          {/*
            The reason the button is disabled, announced politely as it changes. Without this the
            control is simply grey and the person is left guessing — which is the failure mode
            "disabled confirmation" would otherwise introduce in place of the post-submit error
            it replaces.
          */}
          {blockedBecause && (
            <p role="status" aria-live="polite" className="mb-3 text-sm text-text-muted">
              {blockedBecause}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-text-body">
          Already have an account?{' '}
          <Link to="/" className="font-medium text-accent-strong underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
