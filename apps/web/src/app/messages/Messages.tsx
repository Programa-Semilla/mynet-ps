import { OfflineError, type ConversationSummary } from '@mynet/data'
import { useConversationRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Outlet, useMatch } from 'react-router'

import { Loading } from '../AsyncState.js'
import { ConversationList } from './ConversationList.js'
import {
  ConversationsFailed,
  ConversationsStale,
  MessagesOffline,
  NoConversations,
} from './MessagesEmptyStates.js'
import { NotificationPrompt } from './NotificationPrompt.js'
import { useDisplayed } from './useDisplayed.js'
import { POLL_SUPERSEDED, usePoll } from './usePoll.js'

/**
 * T032, T062 (007) — the Messages destination (FR-566, FR-569, FR-580, FR-586).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DESTINATION OWNS ITS ADDRESS AND ITS NESTED ONES.** `navigation.ts` declares this
 * element and both `:conversationId` and `new/:attendeeId`; `routes.tsx` names none of them.
 * That is 005's FR-233 inherited rather than re-litigated — the router stopped comparing
 * addresses to literals, and 006 and 007 each extend the declaration rather than putting a branch
 * back.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **ONE COMPONENT, TWO LAYOUTS, AND THE DIFFERENCE IS NOT A BREAKPOINT ON A GRID.**
 *
 * *Desktop and tablet* are a **two-pane workspace**: the list in a fixed column with the open
 * thread beside it. Both are on screen at once, so choosing a conversation is a navigation
 * rather than a replacement and the reader never loses their place.
 *
 * *Mobile* is **two separate full-width views** with an explicit back affordance — the list, or
 * the thread, never both. Squeezing two panes into 320px is what produces the horizontal
 * scrolling FR-580 and FR-586 forbid, and a 140px-wide list column is not a usable control.
 *
 * The switch is done by **not rendering** the hidden pane rather than by hiding it with CSS. A
 * `hidden` list on mobile is still in the accessibility tree in some combinations, still
 * focusable by a screen reader's virtual cursor, and would let somebody reading linearly walk
 * into a list they were told was not there.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE THREAD IS RE-EXPORTED HERE SO IT SHARES THIS DESTINATION'S CHUNK.**
 *
 * `navigation.ts` loads both through `lazy(() => import('./messages/Messages.js'))`, so there is
 * one dynamic entry and one chunk. Pointing the second `lazy` at `./Thread.js` directly is the
 * obvious shape and it is the wrong one here — which is the opposite of the call 006 made for
 * Discover, so the difference is worth stating rather than leaving as an inconsistency.
 *
 * Discover's profile view is an **overlay reached once, deliberately, by somebody who has decided
 * to look at one person**; paying for it on every visit to the directory is exactly the cost
 * splitting avoids. The thread is not that. It is this destination's **primary content** —
 * rendered *beside* the list on the two-pane layout — so splitting it separately would put a
 * spinner inside that pane on very nearly every visit, to defer code almost every visitor
 * immediately needs.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export { Thread } from './Thread.js'

type ListStatus = 'loading' | 'ready' | 'offline' | 'failed'

/**
 * T016 (016) — **how often the conversation list asks for anything new** (FR-1007).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TEN SECONDS, AGAINST THE THREAD'S THREE, AND THE GAP IS THE DECISION.**
 *
 * This destination used to load **once on mount and never again**, so it was stale for *every*
 * conversation while Messages was open — unread indicators and last-message previews included,
 * not only newly created conversations. The product showed a live thread beside a frozen list of
 * threads, which is the defect the owner reported and it was wider than reported.
 *
 * A list is lower-stakes than the conversation somebody is reading, and the same request load
 * falls on a two-vCPU host where every authenticated request also writes a session row. So it
 * runs at roughly a third of the thread's rate.
 *
 * **SC-1002's bound is 15 seconds, not 10, and that is arithmetic rather than slack.** A poll of
 * interval N has a worst case of N plus jitter plus the request itself, because a message can
 * land immediately after a tick. A 10-second bound over a 10-second interval would fail
 * intermittently and the failures would look like flakiness rather than like a criterion that
 * was never satisfiable.
 *
 * **That arithmetic was a claim before it was a fact** (review finding P-m1). `usePoll` schedules
 * from `.finally`, so the gap used to start when the request *resolved* and the true worst case
 * carried the round trip **twice** — 10×1.2 + 2 + 2 is 16 seconds against a bound of 15, and it
 * would have failed looking exactly like the flakiness this paragraph warns about. The scheduler
 * now subtracts the tick's own elapsed time, which makes the sentence above true rather than
 * aspirational; `usePoll`'s `schedule` records the mechanism.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const LIST_POLL_INTERVAL_MS = 10_000

/**
 * T017 (012) — how long `Loading…` may stand before it is declared a failure (FR-1145).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FIRST LOAD HAS NO EFFECT OF ITS OWN, SO A READ THAT NEVER SETTLES USED TO HAVE NO
 * ERROR PATH AT ALL.**
 *
 * The initial read *is* `usePoll`'s first tick, deliberately (see `usePoll`'s header) — but every
 * path out of `loading` runs from that tick's settlement. A tick that never settles, or one that
 * is never scheduled, left this destination at `Loading…` forever with no retry control on
 * screen. That is not hypothetical: WebKit's push-API deadlock (research R5) held the
 * `/conversations` response undeliverable, and the first person on Safari met an indefinite
 * spinner with the shell rendered around it.
 *
 * **Honestly bounded**: that WebKit wedge froze the page's timers with everything else, so this
 * deadline could not have fired there either — the wedge itself is fixed at its root, in
 * `WebNotificationService`. What this closes is the rest of the class: a request that stalls
 * while the page lives — a service-worker routing fault, a transport whose abort never fires, a
 * poll that was never scheduled — none of which previously had any path out of `loading`.
 *
 * The transport already bounds the ordinary stall — `HttpClient` aborts at 20 seconds and the
 * rejection lands here as `offline`. **This deadline is the backstop for the request that never
 * rejects**, so it sits deliberately *past* that bound: whenever the transport's own timeout
 * works, it wins and this timer is cleaned up unfired. A shorter deadline would race the
 * transport and report a slow-but-working first load as failed while its response was still
 * coming.
 *
 * It fires into `failed`, not `offline`, because nothing is known about connectivity — the one
 * fact in hand is that the product did not answer, and `ConversationsFailed` owns that sentence
 * and carries the retry control (FR-059's honest next step).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const FIRST_LOAD_DEADLINE_MS = 25_000

export const Messages = () => {
  const headingId = useId()
  const repository = useConversationRepository()

  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([])
  const [status, setStatus] = useState<ListStatus>('loading')

  /**
   * Whether a thread is open, read from the address rather than from state.
   *
   * The address is the source of truth for what is on screen (FR-569): a conversation is
   * individually addressable and shareable, so a reload, a pasted link and a click must all
   * produce the same view. Mirroring it into state would create a second answer that can
   * disagree with the first, and the one that disagreed would be the one deciding whether the
   * mobile layout shows a list or a thread.
   */
  const threadOpen = useMatch('/messages/*')?.params['*'] !== ''

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T017 (016) — **FR-1054, expressed as a condition on THE LIST rather than on a width.**
   *
   * The layout band is merely how the answer is currently determined: at phone widths an open
   * thread replaces the list, and from tablet up both panes are on screen at once. Writing the
   * condition as `threadOpen && isMobile` would encode that coincidence, and **a future layout
   * change would silently re-enable a poll against a list nobody can see** — which is the exact
   * failure FR-1054 is worded to prevent.
   *
   * So the pane is asked directly. `display: none` is how the mobile band hides it, and it is
   * how any future arrangement would hide it too, so a rearranged layout keeps this correct
   * without anybody remembering to come back here.
   *
   * `useDisplayed` is where the measuring lives, and its header records why it observes the
   * element's attributes rather than re-measuring on navigation — the address is not what
   * determines whether something is displayed, and a hook that assumed it was would be the
   * width-coupling this avoids, one step removed.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const listPane = useRef<HTMLDivElement>(null)
  const listOnScreen = useDisplayed(listPane)

  /**
   * One refresh of the list.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **It REJECTS on failure rather than swallowing, because that is the poll's only signal.**
   *
   * `usePoll` drives its backoff and its staleness notice from a rejected promise. A version
   * that caught here and returned normally would poll at a fixed rate forever and never report a
   * fault — the shape 007 found in the thread and fixed.
   *
   * **A response that arrives after the reader has navigated must not alter what is displayed**
   * (FR-1012). `settled` distinguishes the first read, which owns the screen and must report its
   * own failure, from a refresh, which must leave a working list exactly where it is: a tunnel
   * must not blank a list somebody is reading. That is the same distinction `useConversation`
   * draws, and it had a defect there when written as a `status` check — `status` is captured by
   * the closure and is stale by exactly the window that matters, so this is a ref.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const settled = useRef(false)

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A SUPERSEDED READ APPLIES NOTHING** (FR-1012).
   *
   * Advanced at issue, so a response that resolves after a newer one cannot write over it —
   * 006's `newest`, which `useConversation` carries for the same reason.
   *
   * **Two reads genuinely can be in flight here**, which is why this is not defensive
   * scaffolding. `usePoll` chains its ticks through `.finally`, so ticks never overlap — but
   * `retry` calls `read` **directly**, from a handler, while a tick may already be waiting on
   * the network. Without this guard the slower of the two wins: press retry on a failing list,
   * the retry succeeds, and the earlier tick's stale rows land afterwards and replace them.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **AND IT SAYS SO TO THE SCHEDULER, RATHER THAN RETURNING QUIETLY** (review finding P-m2).
   *
   * Both branches below used to `return`, which `usePoll` could only read as a **success**: the
   * failure count reset and the staleness notice cleared. So pressing *Try again* during an
   * incident superseded the tick in flight and thereby dropped the backoff from as much as sixty
   * seconds straight back to ten and un-said the notice — **while the retry itself was still
   * failing.** Load amplification at the worst moment, and a notice that flickers, which is what
   * FR-1010's three-failure threshold exists to avoid.
   *
   * `POLL_SUPERSEDED` is that third outcome and means *change nothing*. **The screen guarantee
   * is untouched**: FR-1012 is about what a superseded read *applies*, and it still applies
   * nothing — the throw stands exactly where the `return` stood, after the same guard, with no
   * write between them.
   * ───────────────────────────────────────────────────────────────────────────────────────
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const issued = useRef(0)
  const newest = useRef(0)

  const read = useCallback(async (): Promise<void> => {
    const sequence = ++issued.current
    newest.current = sequence

    try {
      const rows = await repository.list()
      // Nothing is applied: a newer read owns the screen and will report its own outcome. The
      // sentinel tells the scheduler this tick was neither a success nor a failure.
      if (sequence !== newest.current) throw POLL_SUPERSEDED

      setConversations(rows)
      setStatus('ready')
      settled.current = true
    } catch (error: unknown) {
      // Re-thrown unchanged, and it reaches here from the line above as well as from a rejected
      // read: a superseded *failure* is no more a failure of this poll than a superseded success
      // is a success of it.
      if (error === POLL_SUPERSEDED || sequence !== newest.current) throw POLL_SUPERSEDED

      // FR-564 — offline is worded distinguishably from a fault on our side, and the two are
      // separated here rather than at the presentation layer so both surfaces cannot disagree.
      if (!settled.current) setStatus(error instanceof OfflineError ? 'offline' : 'failed')
      // Rethrown either way: the scheduler needs to know even when the screen keeps its content.
      throw error
    }
  }, [repository])

  /** T016 — the refresh itself (FR-1007, FR-1008, FR-1009, FR-1010, FR-1054). */
  const { stale } = usePoll({
    intervalMs: LIST_POLL_INTERVAL_MS,
    enabled: listOnScreen,
    onTick: read,
  })

  /**
   * T017 (012) — `loading` is not allowed to be terminal (FR-1145; see FIRST_LOAD_DEADLINE_MS).
   *
   * Armed whenever the screen shows `Loading…` — the first load and every retry alike — and
   * cleaned up the moment any outcome arrives, because every outcome leaves `loading`. The
   * `settled` re-check inside the timer is not decorative: a success that lands in the same
   * breath as the deadline must win, and `status` in this closure is stale by exactly that
   * window — the same trap `read`'s own header records for `useConversation`.
   *
   * A response arriving *after* the deadline still applies normally: `read` reports its own
   * outcome and `failed` yields to `ready`, which is strictly better than holding the failure
   * out of pride.
   */
  useEffect(() => {
    if (status !== 'loading') return

    const deadline = setTimeout(() => {
      if (!settled.current) setStatus('failed')
    }, FIRST_LOAD_DEADLINE_MS)

    return () => clearTimeout(deadline)
  }, [status])

  /**
   * Reads **now**, rather than bumping a counter an effect watches.
   *
   * The counter-and-effect shape is what this destination had, and it is the shape
   * `react-hooks/set-state-in-effect` refuses — correctly, since it turns one deliberate press
   * into a render whose only purpose is to cause another. Calling `read` from the handler is
   * both simpler and honest about when the request happens; the poll continues on its own
   * schedule either way, and a success clears the staleness notice through `usePoll`.
   */
  const retry = useCallback(() => {
    setStatus('loading')
    // Cleared, so a retry that fails again reports the failure rather than being swallowed as a
    // refresh of something already on screen.
    settled.current = false
    void read().catch(() => {})
  }, [read])

  const list = (
    <div className="min-w-0">
      {/*
        T120 (007) — the permission explanation, rendered **inside the list pane** rather than
        above the grid. It is about this destination, so it follows this destination's layout: on
        mobile, opening a conversation replaces the list and the prompt goes with it, instead of
        sitting above a thread somebody is trying to read.

        It is independent of `status`: it neither waits for conversations to load nor disappears
        when they fail. It renders nothing at all unless it has something to ask — see its header.
      */}
      <NotificationPrompt />
      {/*
        T018 — **above the list, not over it** (FR-1010). The conversations below are real and
        still readable; what has stopped is the refreshing. So this is a notice rather than the
        `failed` state, and it is worded distinguishably from being offline — the two have
        different causes and different things the reader might do about them.
      */}
      {stale && status === 'ready' && <ConversationsStale />}
      {status === 'loading' && <Loading label="Loading your conversations…" />}
      {status === 'offline' && <MessagesOffline onRetry={retry} />}
      {status === 'failed' && <ConversationsFailed onRetry={retry} />}
      {status === 'ready' &&
        (conversations.length === 0 ? (
          <NoConversations />
        ) : (
          <ConversationList conversations={conversations} />
        ))}
    </div>
  )

  /*
   * `h-full` is what makes this destination fill the bounded shell rather than scroll inside it,
   * and it is the reason `Thread.tsx`'s internal scroll finally resolves: `AppShell` now has a
   * definite height (see its header), so 100% here is a real number and the `flex-1 min-h-0`
   * chain below can shrink against it. Without this the section would size to its content and
   * `main` would scroll — correct for the other four destinations, and the composer defect for
   * this one, because the send control must stay on screen while the history moves behind it.
   */
  return (
    <section
      aria-labelledby={headingId}
      className={`flex h-full min-h-0 flex-col px-4 tablet:px-6 tablet:py-6 ${
        threadOpen ? 'py-3' : 'py-6'
      }`}
    >
      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        **THE DESTINATION HEADING STANDS DOWN ON THE MOBILE THREAD VIEW, AND IT HAS TO.**

        This file's header describes the mobile band as *two separate full-width views* — the
        list, or the thread, never both — so a "Messages" title and a sentence explaining what
        Messages are sit above a conversation the reader is already inside. They are ~88px of a
        420px viewport, which is the height of a phone with its keyboard raised.

        That is not a tidiness argument. With the shell bounded, everything on this screen has to
        fit rather than push the page taller, and at 375×420 the thread's own header plus the
        composer need about 50px more than what was left. Reclaiming the heading here is what
        makes FR-1003 hold at the narrowest supported width instead of nearly holding.

        **`sr-only` rather than `hidden`**, because the section is `aria-labelledby` this element:
        removing it would leave the region unnamed for a screen reader, which trades a layout fix
        for an accessibility regression. From tablet up both panes are on screen at once and the
        heading names the whole workspace, so it returns.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      <h1
        id={headingId}
        className={`font-display text-2xl font-semibold text-text-primary tablet:not-sr-only tablet:mb-1 ${
          threadOpen ? 'sr-only' : 'mb-1'
        }`}
      >
        Messages
      </h1>
      {/*
        The orientation sentence goes at **every** band once a thread is open, not only on mobile.
        It is what tipped the tablet band over: at 900px it wraps to two lines and at 1440px it
        does not, which is the entire 10px difference between those two measuring +8.7px inside
        the viewport and −1.3px outside it. A guarantee decided by where a sentence happens to
        wrap is the same fragility as one decided by which font is installed.

        The heading itself stays from tablet up, where both panes are on screen and it names the
        workspace rather than repeating the conversation you are already reading.
      */}
      <p className={`text-sm text-text-muted ${threadOpen ? 'hidden' : 'mb-6'}`}>
        Your conversations with other attendees. They stay with you across every conference.
      </p>

      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        Two panes from `tablet` up; one at phone widths. `min-w-0` on both columns is what stops
        a long preview or an unbroken URL widening the grid past the viewport — the single most
        common cause of the horizontal scrolling FR-586 forbids, and one that only shows up with
        real content in it.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      <div className="grid min-h-0 flex-1 gap-4 tablet:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {/* Mobile: the list is not rendered at all while a thread is open — see the header for
            why this is not a CSS `hidden`. From tablet up both panes are always present. */}
        {/* `listPane` is what FR-1054's pause condition measures — see T017 above. `min-h-0` and
            the scroll are what stop a long list stretching the row it shares with the thread, now
            that the row has a definite height to be stretched past. The `hidden`/visible split is
            unchanged, because that is what `useDisplayed` reads. */}
        <div
          ref={listPane}
          className={
            threadOpen
              ? 'hidden min-h-0 min-w-0 overflow-y-auto tablet:block'
              : 'min-h-0 min-w-0 overflow-y-auto'
          }
        >
          {list}
        </div>

        {/* The thread, rendered by the nested route. On mobile it is the whole view; from tablet
            up it sits beside the list, which stays mounted so opening a conversation is a
            navigation rather than a remount. */}
        <div
          className={
            threadOpen
              ? 'flex min-h-0 min-w-0 flex-col'
              : 'hidden tablet:flex tablet:min-h-0 tablet:flex-col'
          }
        >
          {threadOpen ? (
            <Outlet />
          ) : (
            <p className="hidden rounded-md border border-border-subtle bg-surface-raised px-4 py-6 text-sm text-text-muted tablet:block">
              Choose a conversation to read it.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
