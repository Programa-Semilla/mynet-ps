import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { BrandMark } from '../../shell/BrandMark.js'
import { PRODUCT_NAME } from '../branding.js'

/**
 * T063 (004) — completing verification from a link (FR-319, FR-320, FR-321).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **Four states, and the fourth is the one that is easy to forget.**
 *
 * `pending` · `verified` · `expired` · `failed`. The specification's Empty/loading/failure
 * declaration names all four, and separates *link expired* from *could not reach the server* on
 * purpose: one is final and needs a new link, the other is temporary and needs a retry. Showing
 * one for the other sends the attendee to solve the wrong problem.
 *
 * **Unauthenticated by necessity.** The link is followed out of a mail client, which carries no
 * session — often in a different browser from the one that signed up. This screen therefore
 * sits outside `RequireAuth` and offers a way to sign in rather than assuming one exists.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

type State = 'pending' | 'verified' | 'expired' | 'failed'

export const Verify = () => {
  const identity = useIdentityRepository()
  const [params] = useSearchParams()
  const token = params.get('token')

  const [state, setState] = useState<State>(token ? 'pending' : 'expired')
  const [failure, setFailure] = useState<string | null>(null)

  /**
   * Guards against a second attempt from the same page.
   *
   * The link is single-use, so a re-run — React's development double-invoke, or a re-render that
   * changed the repository identity — would consume the token and then report the *second*
   * attempt's refusal. The attendee would see "this link is no longer valid" having just used
   * it successfully, which is the worst possible reading of a correct outcome.
   */
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    const run = async () => {
      try {
        await identity.verifyEmail(token)
        setState('verified')
      } catch (error) {
        if (error instanceof OfflineError) {
          setState('failed')
          setFailure(
            `Verifying needs a connection. Your link has not been used — open it again once you reconnect.`,
          )
          return
        }

        if (error instanceof RequestRefusedError && error.code === 'link_expired') {
          setState('expired')
          return
        }

        setState('failed')
        setFailure(
          error instanceof RequestRefusedError
            ? error.message
            : `Could not reach ${PRODUCT_NAME}. Your link has not been used — try again.`,
        )
      }
    }

    // Every state change happens after an await, so this is not the synchronous cascade the
    // `set-state-in-effect` rule targets — which is why, unlike `useAuth`'s effects, this one
    // needs no disable comment: the calls are far enough behind the await for the rule to see it.
    void run()
  }, [identity, token])

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-surface-raised p-6 shadow-card sm:p-8">
        {/*
          T043 (010) — the stacked mark, navy on this light card. The heading text is exactly as
          it was: this screen tells somebody what to do, and a brand mark does not change that.
        */}
        <BrandMark colourway="navy" className="mb-3 h-10" />
        <h1 className="mb-4 font-display text-2xl font-semibold text-text-primary">
          Verify your email address
        </h1>

        {state === 'pending' && (
          <p role="status" aria-live="polite" className="text-sm text-text-body">
            Verifying…
          </p>
        )}

        {state === 'verified' && (
          <>
            <p role="status" className="mb-4 text-sm text-text-body">
              Your email address is verified. Other attendees at your conferences can now find you —
              unless you have turned discoverability off.
            </p>
            <Link
              to="/"
              className="inline-flex items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
            >
              Continue to {PRODUCT_NAME}
            </Link>
          </>
        )}

        {state === 'expired' && (
          <>
            {/*
              Final, and it says what to do next. FR-321 requires an explanation and a way to
              request a new link — and the way to request one is to sign in, because the resend
              route sends to the address on the account rather than to an address in a request.
            */}
            <p role="status" className="mb-4 text-sm text-text-body">
              That link is no longer valid. Verification links can be used once, and they expire.
              Sign in and ask for a new one — nothing else about your account has changed.
            </p>
            <Link
              to="/"
              className="inline-flex items-center rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse"
            >
              Sign in
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <p
              role="alert"
              className="mb-4 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
            >
              {failure}
            </p>
            <Link to="/" className="text-sm font-medium text-accent-strong underline">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
