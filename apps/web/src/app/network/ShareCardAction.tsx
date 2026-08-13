import { OfflineError, RequestRefusedError } from '@mynet/data'
import { useCardRepository } from '@mynet/platform'
import { IdCard } from 'lucide-react'
import { useState } from 'react'

/**
 * T061, T062 (008), T042 (016) — exchanging cards, from another attendee's profile
 * (FR-601, FR-603, FR-1021, FR-1022, FR-1052).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS SURFACE ASSERTED THE OPPOSITE UNTIL 016, AND IT IS RECORDED RATHER THAN QUIETLY
 * CORRECTED** (constitution **v5.0.0 (C1)**, FR-1021, FR-1022).
 *
 * Until C1, sharing was one-directional: it gave your details away and gave you nothing, and
 * both this header and the confirmation below stated that as present fact, citing FR-602 and
 * v3.2.0 (N2). C1 **retracts** both. `shareCard` now writes **both rows in one transaction**
 * (FR-1022), so the sentence this component used to end on — *"you will hold theirs when they
 * share it with you"* — was false at the instant it was displayed, and it was displayed on the
 * one surface whose stated purpose is to stop card direction being misread.
 *
 * It is worth naming the failure, because it is not a typo. The server half of C1 shipped while
 * this file was not in the diff at all, and **two green tests required the retracted wording**.
 * Where the comment is the record, the record has to be re-read when the model moves — and
 * `apps/web/tests/unit/card-model-record.test.ts` is the guard that now fails a build over it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T062 — THE LABEL KEEPS ITS POSSESSIVE, AND THE REASON SURVIVED THE REVERSAL** (FR-603).
 *
 * "Share card" on somebody else's profile reads, to a great many people, as *take* their card.
 * Under mutual exchange that reading is now **half** right, which is worse than being wrong: the
 * half it hides is that **your own details go out in the same act**, and that is the half which
 * cannot be undone. **A card cannot be recalled** (FR-618, FR-1026) — there is no revocation
 * route and there will not be one — and the other party is never asked (FR-1023), so nobody
 * downstream can repair a misreading either. Hence:
 *
 *   - the visible label says **"Share your card"**, with the possessive doing the work;
 *   - the accessible name says it in full — *"Share your card with <name>"* — because a screen
 *     reader user navigating by control hears the name out of context, where "Share your card"
 *     alone gives no clue who receives it;
 *   - the confirmation names **both parties** and states the exchange **in both directions**, so
 *     a reader who expected only to collect learns immediately that they also gave.
 *
 * `quickstart.md` scenario 1 step 2 asks a human to *read the label before activating it*, for
 * exactly this reason, and a component test asserts the accessible name names the sharer's card.
 * ─────────────────────────────────────────────────────────────────────────────────────────
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
          Names both parties and states the exchange **in both directions** (FR-1021, FR-1022).

          The second sentence used to say the reader had received nothing and would hold the other
          card only once it was shared back. Constitution v5.0.0 (C1) retracts that, and by the
          time this renders the reciprocal row is already committed — so the old wording told the
          reader the exchange had not happened while their new contact was on the next screen.
          It now closes the misreading from the other side: whoever expected only to collect is
          told, in the same breath, that they gave.
        */}
        You and {displayName} have exchanged cards. You can each see the other&apos;s profile in
        Network.
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
