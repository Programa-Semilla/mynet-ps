import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useIdentityRepository } from '@mynet/platform'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useActiveEventContext } from '../active-event.js'

/**
 * T047 (004) — entering a join code (FR-310, FR-312, FR-313).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Three outcomes, and two of them are successes.** Registered, already registered, and not
 * recognised. FR-312 makes the middle one explicitly *not* an error — a person who taps twice
 * on a slow connection has done nothing wrong — so it gets its own wording rather than being
 * folded into either neighbour.
 *
 * The refusal wording is the server's, unchanged. FR-313 requires one wording for every cause,
 * and the server produces it from a single factory precisely so two call sites cannot drift;
 * rewriting it here would reintroduce the difference from the other end.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const JoinConference = () => {
  const identity = useIdentityRepository()
  const { reload: reloadActiveEvent } = useActiveEventContext()
  const navigate = useNavigate()

  const codeId = useId()
  const statusId = useId()

  const [joinCode, setJoinCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<
    { kind: 'already'; name: string } | { kind: 'failure'; message: string } | null
  >(null)

  const canSubmit = joinCode.trim().length > 0 && !submitting

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setOutcome(null)

    try {
      // T012 (006) — no cast. `IdentityRepository.joinConference` answers `JoinResult`, and the
      // registry now says so (FR-496). This site was not in the eleven files research D10
      // counted; SC-414 asks for zero, so it goes with them.
      const result = await identity.joinConference(joinCode)

      if (result.alreadyRegistered) {
        // Not an error (FR-312). Said plainly, and the person is left where they are rather
        // than being bounced somewhere as though something had changed.
        setOutcome({ kind: 'already', name: result.event.name })
        return
      }

      // The conference the attendee just joined becomes their active one by derivation
      // (FR-315), but the shell resolved the active conference before it existed — so it is
      // re-asked here rather than left showing the invitation they have just acted on.
      reloadActiveEvent()
      await navigate('/')
    } catch (error) {
      if (error instanceof OfflineError) {
        setOutcome({
          kind: 'failure',
          message:
            'Joining a conference needs a connection. Nothing has been sent — your code is still here, and you can try again once you reconnect.',
        })
        return
      }

      setOutcome({
        kind: 'failure',
        message:
          error instanceof RequestRefusedError
            ? error.message
            : 'Could not reach MyNet. You have not been registered — try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="join-heading" className="px-4 py-6 tablet:px-6">
      <div className="max-w-md">
        <h1 id="join-heading" className="font-display text-xl font-semibold text-text-primary">
          Join a conference
        </h1>
        <p className="mt-1 mb-6 text-sm text-text-body">
          Enter the join code from your invitation, your badge, or the conference&apos;s own
          materials.
        </p>

        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <label htmlFor={codeId} className="mb-1 block text-sm font-medium text-text-primary">
            Join code
          </label>
          <input
            id={codeId}
            name="joinCode"
            type="text"
            required
            maxLength={120}
            // Codes are printed in capitals and typed however people find them. The server
            // trims and lower-cases before comparing, so nothing here has to be strict.
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            aria-describedby={outcome ? statusId : undefined}
            aria-invalid={outcome?.kind === 'failure' ? true : undefined}
            className="w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-text-body"
          />

          {outcome?.kind === 'already' && (
            <p
              id={statusId}
              role="status"
              className="mt-3 rounded-sm border border-border-subtle bg-cream-200 px-3 py-2 text-sm text-text-body"
            >
              You are already registered for {outcome.name}. Nothing has changed.
            </p>
          )}

          {outcome?.kind === 'failure' && (
            <p
              id={statusId}
              role="alert"
              className="mt-3 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-sm text-danger-700"
            >
              {outcome.message}
            </p>
          )}

          {!canSubmit && !submitting && (
            <p role="status" aria-live="polite" className="mt-3 text-sm text-text-muted">
              Enter a join code to continue.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-4 w-full rounded-sm bg-accent-strong px-4 py-2 font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50 tablet:w-auto tablet:px-6"
          >
            {submitting ? 'Joining…' : 'Join conference'}
          </button>
        </form>
      </div>
    </section>
  )
}
