import type { ConversationState, Message } from '@mynet/data'
import {
  useBlockRepository,
  useConversationRepository,
  useMessageRepository,
} from '@mynet/platform'
import { ArrowLeft, Ban, Flag } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { Loading } from '../AsyncState.js'
import { BlockConfirm } from './BlockConfirm.js'
import { Composer } from './Composer.js'
import { ClosedThread, StarterPrompt, ThreadFailed, ThreadOffline } from './MessagesEmptyStates.js'
// 009 (T072, research R4) — moved to `app/safety/`. It had exactly one importer, and it now has
// two: Q&A reports a question from the question itself (FR-781), so leaving the dialog here would
// make Agenda depend on Messages for no reason a reader could reconstruct — the kind of import
// that becomes a cycle later. `safety/` because reporting and blocking are one concern.
import { ReportDialog } from '../safety/ReportDialog.js'
import { useConversation, type Arrival } from './useConversation.js'

/**
 * T043 (007) — one conversation (FR-511, FR-515, FR-519, FR-519a, FR-585).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS COMPONENT SERVES TWO ADDRESSES, AND THE SECOND ONE WRITES NOTHING** (FR-503a).
 *
 *   - `/messages/<conversationId>` — a conversation that exists.
 *   - `/messages/new/<attendeeId>` — a composable thread with **somebody who has never been
 *     messaged**, which is what Discover's *message* action opens.
 *
 * The second is the whole of FR-503a. Choosing *Message* creates no conversation, no
 * participation and no record of the attempt: an attendee who opens a thread and leaves without
 * sending leaves no trace, and the other person cannot tell it happened. The first message is
 * what brings the conversation into being, and only then does the address become the first form —
 * replaced rather than pushed, so Back returns to the profile rather than to a thread that no
 * longer needs to exist.
 *
 * One component for both because they are one *screen*: the same prompt, the same composer, the
 * same keyboard path. Two components would be two places for the composer's rules to drift.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The empty thread has two different states and choosing between them is a requirement**
 * (FR-519, FR-519a).
 *
 * Empty **and open to sending** shows the conversation-starter prompt. Empty **and closed** — the
 * counterpart deleted their account and had written every message in it — shows the closed
 * explanation instead. Inviting the survivor to start a conversation they cannot start, with
 * somebody who no longer exists, is the specific failure FR-519a names.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const Thread = () => {
  const { conversationId, attendeeId } = useParams<{
    conversationId?: string
    attendeeId?: string
  }>()

  return attendeeId ? (
    <NewThread attendeeId={attendeeId} />
  ) : (
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`key` is what stops one conversation's messages appearing under another's heading.**
    //
    // React reuses a component when only its props change, so navigating between two threads
    // would keep the previous conversation's state — and its history would stay on screen for
    // however long the new read takes. `useAsync` and `useDirectory` close the same hazard by
    // clearing state during render; this closes it by remounting, which cannot forget a piece of
    // state the way a hand-written reset can. `useConversation` records the choice in full.
    // ─────────────────────────────────────────────────────────────────────────────────────
    <ExistingThread key={conversationId} conversationId={conversationId ?? ''} />
  )
}

/**
 * A thread with somebody this attendee has never messaged. **Reads nothing and writes nothing**
 * until the first message is sent.
 *
 * There is no repository call on mount at all — not even to check whether a conversation already
 * exists — because `openWith` answers that question as a side effect of doing the thing the
 * attendee asked for: the server appends to an existing conversation rather than creating a
 * second (FR-510), and returns its identifier either way. A probing read would be a request that
 * exists only to tell the client something it does not need to know.
 */
const NewThread = ({ attendeeId }: { attendeeId: string }) => {
  const conversations = useConversationRepository()
  const navigate = useNavigate()
  const headingId = useId()

  const send = useCallback(
    async (body: string) => {
      const opened = await conversations.openWith(attendeeId, body)
      // `replace`, so the browser's Back leaves the conversation for wherever the attendee came
      // from — a profile, usually — rather than returning them to an address for a thread that
      // has since become a real one.
      await navigate(`/messages/${opened.conversationId}`, { replace: true })
    },
    [conversations, attendeeId, navigate],
  )

  return (
    <ThreadFrame headingId={headingId} title="New message" composer={<Composer onSend={send} />}>
      <StarterPrompt />
    </ThreadFrame>
  )
}

/** A conversation that exists. */
const ExistingThread = ({ conversationId }: { conversationId: string }) => {
  const messages = useMessageRepository()
  const blocks = useBlockRepository()
  const headingId = useId()
  const conversation = useConversation(conversationId)

  /**
   * Which safety dialog is open, and the control that opened it.
   *
   * Held together because they are one fact: a dialog is open *because* a particular control was
   * pressed, and focus has to return to that control when it closes (FR-583). Two pieces of state
   * would be two things to keep in step, and the one that drifted would be the one deciding where
   * a keyboard reader ends up.
   */
  const [dialog, setDialog] = useState<'block' | 'report' | null>(null)
  const blockButton = useRef<HTMLButtonElement>(null)
  const reportButton = useRef<HTMLButtonElement>(null)

  const send = useCallback(
    async (body: string) => {
      await messages.send(conversationId, body)
      await conversation.refresh()
    },
    [messages, conversationId, conversation],
  )

  /**
   * Who this is with. Carried on the message page (contract), so the header, the composer's
   * availability and the two safety dialogs are all satisfied by one request rather than by a
   * read of the whole conversation list.
   *
   * `null` while loading, and `null` when they have deleted their account — told apart by
   * `status`, never by this field.
   */
  const counterpart = conversation.counterpart

  const refresh = conversation.refresh
  const unblock = useCallback(() => {
    // **Exactly this person**, never "everyone on the block list". Blocks are directional and
    // independent (FR-540), and releasing more than the attendee asked to release would undo
    // refusals they made about other people entirely.
    if (!counterpart) return
    void blocks
      .unblock(counterpart.attendeeId)
      .then(() => refresh())
      .catch(() => {})
  }, [blocks, refresh, counterpart])

  return (
    <ThreadFrame
      headingId={headingId}
      title={counterpart?.displayName ?? 'Conversation'}
      // The bottom of the thread. Changes only when a message actually arrives, which is the
      // one time the reader should be moved.
      scrollAnchor={conversation.messages.at(-1)?.messageId ?? ''}
      // FR-562 — when the thread has stopped keeping itself up to date, say so. A thread that has
      // silently not refreshed for ten minutes is indistinguishable from a current one, which is
      // the failure the backoff would otherwise hide rather than fix.
      stale={conversation.stale}
      actions={
        counterpart && (
          <>
            {/*
              T086 — block and report, from the thread header (FR-534, FR-543).
              Icon buttons with real accessible names, at touch size. They name the person, so a
              screen-reader user hears who they are about to block rather than "Block".
            */}
            <button
              ref={blockButton}
              type="button"
              onClick={() => setDialog('block')}
              aria-label={`Block ${counterpart.displayName}`}
              className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted"
            >
              <Ban aria-hidden="true" className="size-5" />
            </button>
            <button
              ref={reportButton}
              type="button"
              onClick={() => setDialog('report')}
              aria-label={`Report ${counterpart.displayName}`}
              className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted"
            >
              <Flag aria-hidden="true" className="size-5" />
            </button>
          </>
        )
      }
      composer={
        <Composer
          onSend={send}
          unavailable={unavailableFor(conversation.state, unblock, counterpart?.displayName)}
        />
      }
    >
      {conversation.status === 'loading' && <Loading label="Loading this conversation…" />}
      {conversation.status === 'offline' && <ThreadOffline onRetry={conversation.retry} />}
      {conversation.status === 'failed' && <ThreadFailed onRetry={conversation.retry} />}

      {conversation.status === 'ready' && (
        <>
          {conversation.hasMore && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                onClick={conversation.loadOlder}
                disabled={conversation.loadingOlder}
                className="focus-ring min-h-11 rounded-sm border border-border-subtle bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary disabled:opacity-60"
              >
                {conversation.loadingOlder ? 'Loading…' : 'Show earlier messages'}
              </button>
            </div>
          )}

          {conversation.messages.length === 0 ? (
            // FR-519 against FR-519a. `state` decides, never the emptiness alone.
            conversation.state === 'open' ? (
              <StarterPrompt />
            ) : (
              <ClosedThread state={conversation.state} />
            )
          ) : (
            <MessageList messages={conversation.messages} arrived={conversation.arrived} />
          )}
        </>
      )}

      {dialog === 'block' && counterpart && (
        <BlockConfirm
          attendeeId={counterpart.attendeeId}
          displayName={counterpart.displayName}
          returnFocusTo={blockButton}
          onBlocked={() => {
            setDialog(null)
            void conversation.refresh()
          }}
          onDismiss={() => setDialog(null)}
        />
      )}

      {dialog === 'report' && counterpart && (
        <ReportDialog
          attendeeId={counterpart.attendeeId}
          displayName={counterpart.displayName}
          // Every message on screen, so the operator can see what was being complained about
          // without the reporter having to select individually — which at the moment somebody
          // reports conduct is a task they should not be given.
          messageIds={conversation.messages.map((message) => message.messageId)}
          returnFocusTo={reportButton}
          onReported={() => {
            setDialog(null)
            void conversation.refresh()
          }}
          onDismiss={() => setDialog(null)}
        />
      )}
    </ThreadFrame>
  )
}

/**
 * The composer's replacement, when sending is not available.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Each state gets words and, where there is one, an action** (FR-539, FR-574). A greyed-out box
 * with no explanation is exactly what FR-539 forbids: the attendee cannot tell a product that is
 * broken from one that is doing what they asked.
 *
 * `blocked` here always means **this attendee blocks the counterpart** — the server never reports
 * the reverse, and FR-537 is why. So the state carries an unblock action, because the person
 * looking at it is the only person who can undo it, and a refusal they cannot lift is a dead end.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const unavailableFor = (
  state: ConversationState,
  onUnblock: () => void,
  displayName: string | undefined,
): ReactNode => {
  if (state === 'one_sided') {
    return (
      <p className="border-t border-border-subtle bg-surface-raised p-4 text-sm text-text-body">
        The other person has deleted their account, so nothing more can be sent here. Everything you
        wrote is still yours to read.
      </p>
    )
  }

  if (state === 'blocked') {
    return (
      <div className="border-t border-border-subtle bg-surface-raised p-4 text-sm text-text-body">
        <p className="mb-2">
          You blocked {displayName ?? 'this person'}. Nothing was deleted — unblocking restores
          sending exactly as it was.
        </p>
        <button
          type="button"
          onClick={onUnblock}
          className="focus-ring min-h-11 rounded-sm border border-border-subtle px-4 py-2 font-medium text-accent-strong"
        >
          Unblock {displayName ?? 'them'}
        </button>
      </div>
    )
  }

  return undefined
}

/**
 * The history, **oldest first** (FR-515).
 *
 * The server pages newest-first because a thread opens at its most recent message; the reversal
 * happens in `useConversation`, once, rather than here — a component that reversed for display
 * would make "which order is this array in" a question every consumer has to ask.
 */
const MessageList = ({
  messages,
  arrived,
}: {
  messages: readonly Message[]
  arrived: Arrival | null
}) => (
  <>
    <ol className="flex flex-col gap-3">
      {messages.map((message) => (
        <li
          key={message.messageId}
          className={message.mine ? 'flex justify-end' : 'flex justify-start'}
        >
          {/*
            `max-w-[85%]` and `break-words` together are what keep FR-586 true: a pasted URL with
            no spaces in it is the one piece of attendee content that can widen a column past the
            viewport, and horizontal scrolling for a primary surface is forbidden outright.
          */}
          <div
            className={`max-w-[85%] break-words rounded-md px-3 py-2 text-sm ${
              message.mine
                ? 'bg-accent-strong text-text-inverse'
                : 'bg-surface-raised text-text-body'
            }`}
          >
            <p className="whitespace-pre-wrap">{message.body}</p>
            {/*
              ─────────────────────────────────────────────────────────────────────────────
              **Full opacity on the accent, not `/80`.** The dimmed variant was the obvious way
              to make a timestamp recede, and it failed the axe scan at every width: cream at 80%
              on the accent is below the 4.5:1 floor, which `e2e/accessibility.spec.ts` reports
              as a serious violation.
              Distinction comes from size instead. Accessibility is not negotiable against an
              approved palette (Principle IV) — the same call `tokens.css` records for the
              prototype's muted text.
              ─────────────────────────────────────────────────────────────────────────────
            */}
            <p className={`mt-1 text-xs ${message.mine ? 'text-text-inverse' : 'text-text-muted'}`}>
              <time dateTime={message.sentAt}>{timeOf(message.sentAt)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>

    {/*
      ═══════════════════════════════════════════════════════════════════════════════════════
      **T065 — new messages are ANNOUNCED, and focus does not move** (FR-585).

      A sighted reader watches a thread grow. Without this, a screen-reader user sits in a
      conversation that silently becomes a different conversation — and moving focus to the new
      message instead would be worse, because it would interrupt them mid-sentence and take the
      caret out of the composer they were typing in.

      `aria-live="polite"` waits for a pause in speech, which is the right timing for something
      that arrived rather than something they did. The region is visually hidden because the
      message itself is already on screen above; this exists to say *that* it arrived.
      ═══════════════════════════════════════════════════════════════════════════════════════
    */}
    {/*
      `key` is what makes a *repeat* announcement work. Without it React updates the existing
      paragraph, and an `aria-live` region whose text is unchanged is not spoken again — so the
      second and every later arrival were silent. Keyed on the arrival count, each one replaces
      the region, which is a change assistive technology reports. The count is never rendered.
    */}
    <p key={arrived?.count ?? 0} aria-live="polite" className="sr-only">
      {arrived?.text ?? ''}
    </p>
  </>
)

/** Wall-clock time in the reader's own zone, which is what a thread's timestamps are for. */
const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/**
 * The frame both forms share: a labelled region, a back affordance, a scrolling body, and the
 * composer pinned beneath it.
 *
 * **The back link is present at every width**, not only on mobile. On the two-pane layout the
 * list is beside the thread and the link is redundant *visually* — but it is not redundant to a
 * screen-reader user working linearly, and hiding it below a breakpoint would remove the only
 * in-page way back for exactly the reader who most needs one.
 */
const ThreadFrame = ({
  headingId,
  title,
  children,
  composer,
  actions,
  scrollAnchor,
  stale = false,
}: {
  headingId: string
  title: string
  children: ReactNode
  composer: ReactNode
  /** Block and report, on an existing conversation. Absent on a thread that does not exist yet. */
  actions?: ReactNode
  /**
   * What the scroll effect below watches.
   *
   * The **newest message id**, not the array — a poll that finds nothing new now returns the same
   * array reference, but an identifier is stable regardless of how the merge is implemented and
   * says exactly what the effect cares about: did the bottom of the thread move?
   */
  scrollAnchor?: string
  /** Refreshes have been failing long enough to tell the reader. Never blanks the thread. */
  stale?: boolean
}) => {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A thread opens at its most recent message, and stays there as new ones arrive.
    //
    // `scrollTop = scrollHeight` rather than `scrollTo({ behavior: 'smooth' })`: smooth scrolling
    // on every arriving message would animate the reader away from what they were reading, and
    // `scrollTo` is not implemented in jsdom — so a component test could not observe this at all,
    // which is how the assignment form also happens to be the testable one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    //
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **THIS HAD NO DEPENDENCY ARRAY, SO IT RAN AFTER EVERY RENDER.**
    //
    // Combined with a three-second poll it yanked the viewport to the bottom every three seconds
    // — and it also fired when the block or report dialog opened, which is a state change with
    // nothing to do with arriving messages. A reader scrolled up to read history could not stay
    // there. `scrollAnchor` changes only when the message set does; the near-bottom test then
    // makes the behaviour what the comment above always claimed: *stays* at the bottom, rather
    // than *returns* to it.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const body = bodyRef.current
    if (!body) return

    // A generous threshold: somebody reading the newest few messages still counts as "here",
    // and being pinned is what they want. Anyone who has scrolled up deliberately is left alone.
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 120
    // `scrollTop === 0` covers the first paint, where nothing has laid out yet.
    if (nearBottom || body.scrollTop === 0) body.scrollTop = body.scrollHeight
  }, [scrollAnchor])

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-1 flex-col rounded-md border border-border-subtle bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Link
          to="/messages"
          aria-label="Back to conversations"
          className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <h2
          id={headingId}
          className="min-w-0 flex-1 truncate font-display text-lg font-medium text-text-primary"
        >
          {title}
        </h2>
        {actions}
      </header>

      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        **Above the thread, not over it** (FR-562).

        The conversation below is real and still readable — what has stopped is the refreshing.
        So this is a notice rather than the `failed` state: nothing is blanked, nothing is
        replaced, and the reader keeps everything they were looking at. `status` rather than
        `alert`, because it is a condition rather than something that just went wrong, and an
        assertive region would interrupt a screen reader mid-message.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      {stale && (
        <p
          role="status"
          className="border-b border-warning-500 bg-warning-100 px-4 py-2 text-sm text-warning-700"
        >
          This conversation has stopped updating. It will catch up on its own when the connection
          returns.
        </p>
      )}

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {children}
      </div>

      {composer}
    </section>
  )
}
