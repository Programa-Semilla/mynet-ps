import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useCardRepository } from '@mynet/platform'
import { IdCard } from 'lucide-react'
import { useState } from 'react'

/**
 * T061, T062 (008) — sharing your card, from another attendee's profile (FR-601, FR-603).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T062 — THE LABEL AND THE CONFIRMATION BOTH STATE *WHOSE CARD MOVES*, AND THIS IS THE MOST
 * MISREADABLE CONTROL IN THE FEATURE** (FR-603).
 *
 * "Share card" on somebody else's profile reads, to a great many people, as *take* their card —
 * which is the exact opposite of what happens. Sharing is one-directional: it gives **your**
 * details to **them** and gives you nothing back (FR-602, constitution v3.2.0 N2). Somebody who
 * misreads it has handed their contact details to a stranger while believing they collected one.
 *
 * That is not a recoverable mistake. **A card cannot be recalled** (FR-618) — there is no
 * revocation route and there will not be one — so the label is the only place this can be got
 * right. Hence:
 *
 *   - the visible label says **"Share your card"**, with the possessive doing the work;
 *   - the accessible name says it in full — *"Share your card with <name>"* — because a screen
 *     reader user navigating by control hears the name out of context, where "Share your card"
 *     alone gives no clue who receives it;
 *   - the confirmation names **both parties and the direction**, and says plainly that the
 *     reader has not received anything.
 *
 * `quickstart.md` scenario 1 step 2 asks a human to *read the label before activating it*, for
 * exactly this reason, and a component test asserts the accessible name names the sharer's card.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A confirmation state, not a transient toast** (FR-603, and the prototype's defect).
 *
 * The approved prototype flashes a confirmation and clears it. That loses the one piece of
 * information the reader needs afterwards — *did that work?* — for anybody who looked away, and
 * it is unreachable to a screen-reader user who has not focused it before it goes. The
 * confirmation here replaces the control and stays, which is also what stops a second share
 * being attempted for no reason.
 *
 * It is a `role="status"` live region so the change is announced without interrupting.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

type State =
  | { readonly status: 'idle' }
  | { readonly status: 'sharing' }
  | { readonly status: 'shared' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused' }
  /** A refusal that legitimately carries a reason, surfaced verbatim from the server. */
  | { readonly status: 'rejected'; readonly message: string | null }
  | { readonly status: 'failed' }

export const ShareCardAction = ({
  attendeeId,
  displayName,
}: {
  readonly attendeeId: string
  readonly displayName: string
}) => {
  const cards = useCardRepository()
  const [state, setState] = useState<State>({ status: 'idle' })

  const share = () => {
    setState({ status: 'sharing' })
    cards
      .share(attendeeId)
      .then(() => setState({ status: 'shared' }))
      .catch((error: unknown) => {
        // ═══════════════════════════════════════════════════════════════════════════════════
        // **BRANCH ON THE ERROR CODE, NEVER ON THE CLASS.**
        //
        // `ApiError extends RequestRefusedError`, and `HttpClient` throws `ApiError` for **every**
        // non-2xx response — so `instanceof RequestRefusedError` matches the 409 block, the 400
        // self-share, the 404, the 429 throttle and a 500 alike. Classifying that way rendered
        // the deliberately *reasonless* wording for all of them, including a fault on our side,
        // which FR-657 requires to be distinguishable.
        //
        // `offline` stays first: the write is **refused rather than queued** (FR-649), and this
        // repository is not decorated at all, so there is no queue for it to land in.
        // ═══════════════════════════════════════════════════════════════════════════════════
        if (error instanceof OfflineError) return setState({ status: 'offline' })

        const code = error instanceof RequestRefusedError ? error.code : undefined

        // The block, and the four-way-indistinguishable 404. Both say nothing about why: a
        // reason would confirm the block (FR-608), and telling the two apart would be the
        // enumeration oracle FR-607 closes.
        if (code === 'refused' || code === 'not_found') return setState({ status: 'refused' })

        // A fact about the caller's own request — sharing with yourself, or the throttle —
        // surfaced verbatim rather than reworded here.
        if (code === 'validation_failed' || code === 'too_many_attempts') {
          return setState({
            status: 'rejected',
            message: error instanceof Error ? error.message : null,
          })
        }

        return setState({ status: 'failed' })
      })
  }

  if (state.status === 'shared') {
    return (
      <p
        role="status"
        className="w-full rounded-sm border border-mint-500 bg-mint-100 px-4 py-3 text-sm text-mint-700"
      >
        {/*
          Names both parties and the direction, and says outright that nothing came back. The
          second sentence is the one that closes the misreading the label is fighting: a reader
          who believed they had collected a card learns immediately that they have not.
        */}
        Your card is now with {displayName}. They can see your profile in their Network. You will
        hold theirs when they share it with you.
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        disabled={state.status === 'sharing'}
        // The accessible name is the full sentence. The visible label is shorter because it sits
        // beside the person's own profile, where the context is on screen — a screen-reader user
        // navigating by control has no such context, which is the asymmetry this closes.
        aria-label={`Share your card with ${displayName}`}
        className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-sm border border-accent-strong px-4 py-2 text-sm font-medium text-accent-strong disabled:opacity-60"
      >
        <IdCard aria-hidden="true" className="size-4" />
        {state.status === 'sharing' ? 'Sharing your card…' : 'Share your card'}
      </button>

      {state.status === 'offline' && (
        <p role="status" className="w-full text-sm text-warning-700">
          Your card was not shared — there is no connection right now. Nothing has been saved to
          send later, so try again once you are back online.
        </p>
      )}

      {state.status === 'refused' && (
        <p role="alert" className="w-full text-sm text-danger-700">
          {/*
            Reasonless, deliberately (FR-608). It does not say "they have blocked you", it does
            not say "you have blocked them", and it does not distinguish the two — a sender who
            could tell a block from a fault would know they had been blocked.
          */}
          Your card could not be shared with {displayName}.
        </p>
      )}

      {state.status === 'rejected' && (
        <p role="alert" className="w-full text-sm text-danger-700">
          {state.message ?? 'Your card could not be shared.'}
        </p>
      )}

      {state.status === 'failed' && (
        <p role="alert" className="w-full text-sm text-danger-700">
          Your card could not be shared. This is a problem on our side, not with your account.
        </p>
      )}
    </>
  )
}
