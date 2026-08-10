import { OfflineError, type ConversationSummary } from '@mynet/data'
import { useConversationRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useState } from 'react'
import { Outlet, useMatch } from 'react-router'

import { Loading } from '../AsyncState.js'
import { ConversationList } from './ConversationList.js'
import { ConversationsFailed, MessagesOffline, NoConversations } from './MessagesEmptyStates.js'
import { NotificationPrompt } from './NotificationPrompt.js'

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

export const Messages = () => {
  const headingId = useId()
  const repository = useConversationRepository()

  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([])
  const [status, setStatus] = useState<ListStatus>('loading')
  const [attempt, setAttempt] = useState(0)

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

  useEffect(() => {
    let cancelled = false

    repository
      .list()
      .then((rows) => {
        if (cancelled) return
        setConversations(rows)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // FR-564 — offline is worded distinguishably from a fault on our side, and the two are
        // separated here rather than at the presentation layer so both surfaces cannot disagree.
        setStatus(error instanceof OfflineError ? 'offline' : 'failed')
      })

    return () => {
      cancelled = true
    }
  }, [repository, attempt])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

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

  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col px-4 py-6 tablet:px-6">
      <h1 id={headingId} className="mb-1 font-display text-2xl font-semibold text-text-primary">
        Messages
      </h1>
      <p className="mb-6 text-sm text-text-muted">
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
        <div className={threadOpen ? 'hidden min-w-0 tablet:block' : 'min-w-0'}>{list}</div>

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
