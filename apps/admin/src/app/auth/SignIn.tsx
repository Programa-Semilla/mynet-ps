import { useState, type FormEvent } from 'react'

import { ADMIN_PRODUCT_NAME } from '../branding.js'
import { classify, describe, detailOf } from '../errors.js'
import { useAdminSession } from '../session.js'
import { PasswordField } from '../ui/PasswordField.js'

/**
 * T067 (013) — administrative sign-in (FR-914, FR-915, FR-917, FR-922).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **ONE MESSAGE FOR EVERY FAILURE, AND THE INTERFACE MUST NOT TRY TO BE HELPFUL ABOUT IT.**
 *
 * The server answers all four causes identically (FR-915) — unknown address, wrong password, an
 * attendee who is not an organizer, a deactivated operator — from one factory, on one code path,
 * with the unknown-address branch paying for a real password verification so the elapsed time
 * matches. The temptation here is to add *"if you are an attendee, sign in at MyNet instead"*,
 * which would undo all of it: it would tell somebody probing addresses that theirs belongs to a
 * real attendee.
 *
 * So this renders whatever the server said and nothing more.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Loading, failure and disabled-submit states**, per the constitution's required-states
 * constraint: an invalid empty form is a **disabled** control, never a post-submit error.
 */
export const SignIn = () => {
  const { services, refresh } = useAdminSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Disabled rather than refused after the fact. Trimmed here because the server trims before
  // schema validation for the same reason — a password manager appending a space must not
  // produce "your request was malformed" (FR-025b's reasoning).
  const ready = email.trim().length > 0 && password.length > 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || submitting) return

    setSubmitting(true)
    setFailure(null)
    try {
      await services.session.signIn({ email: email.trim(), password })
      // The tier is not in the sign-in response — `refresh` reads `/admin/me` with the session
      // in hand. "Did these credentials work" and "what may I do" are different questions.
      await refresh()
    } catch (error) {
      // Classified on `error.code`, never on the class — 008's defect, and the reason
      // `error-classification.test.ts` requires all seven outcomes to differ.
      setFailure(describe(classify(error), detailOf(error)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          {/* Navy on cream here, coral on the navy rail — one mark, two colourways (decision 30). */}
          <img src="/brand/mark-navy.png" alt="" width={32} height={32} className="h-8 w-auto" />
          <h1 className="text-xl font-semibold text-text-primary">{ADMIN_PRODUCT_NAME}</h1>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="rounded-2xl border border-border-subtle bg-surface-card p-6 shadow-sm"
          noValidate
        >
          <label htmlFor="admin-email" className="block text-sm font-medium text-text-primary">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 mb-4 block min-h-11 w-full rounded-lg border border-border-strong px-3 text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
          />

          <label htmlFor="admin-password" className="block text-sm font-medium text-text-primary">
            Password
          </label>
          {/* T028 (016) — reveal only (FR-1049). Signing in sets no credential. */}
          <div className="mt-1 mb-4">
            <PasswordField
              id="admin-password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              className="block min-h-11 w-full rounded-lg border border-border-strong px-3 text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
            />
          </div>

          {failure ? (
            // `role="alert"` so the refusal is announced rather than only rendered. It is the
            // only feedback this form gives, and a screen-reader user pressing a button that
            // appears to do nothing has no other way to learn it was refused.
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/*
          Deliberately says nothing about who may sign in here, how to become an operator, or
          where an attendee should go instead. FR-917: an unauthenticated caller learns nothing
          about what exists — and "administrators are promoted by a platform operator" is a fact
          about the product's structure that this page has no reason to publish.
        */}
      </div>
    </main>
  )
}
