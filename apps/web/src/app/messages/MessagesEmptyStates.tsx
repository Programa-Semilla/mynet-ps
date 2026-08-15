import type { ConversationState } from '@mynet/data'
import { Link } from 'react-router'

import { Failed } from '../AsyncState.js'

/**
 * T061 (007) — every state Messages declares that is not a list of messages
 * (FR-518, FR-519, FR-519a, FR-564, FR-574, Principle IX declaration).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **GATHERED IN ONE FILE SO THAT A MISSING STATE IS VISIBLE AS AN ABSENCE.**
 *
 * Every one of these is reachable in ordinary use — a new account has messaged nobody, a train
 * goes into a tunnel, somebody deletes their account — and each is what an attendee is looking at
 * when they form their opinion of the destination. States written inline, at the point of use,
 * are the ones that end up *nearly* covered: one surface gets a good empty state and the next
 * gets `null`.
 *
 * 006's `DirectoryEmptyStates.tsx` is the same file for the same reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * FR-518 — no conversations at all, which is what every account starts as.
 *
 * **An invitation into Discover, not an apology.** `requirements.md` names this among the required
 * empty states and specifies the treatment: an invitation to explore. An attendee who has messaged
 * nobody has not done anything wrong and has nothing to fix — what they need is the one action
 * that leads somewhere, which is finding somebody worth messaging.
 */
export const NoConversations = () => (
  <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6 text-center">
    <p className="mb-1 font-medium text-text-primary">No conversations yet</p>
    <p className="mx-auto mb-4 max-w-prose text-sm text-text-body">
      When you find somebody worth meeting, you can message them from their profile. Conversations
      stay with you across every conference you attend.
    </p>
    <Link
      to="/discover"
      className="focus-ring inline-flex min-h-11 items-center rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-accent-strong"
    >
      Find people to meet
    </Link>
  </div>
)

/**
 * FR-519 — a thread with no messages that is **open to sending**.
 *
 * The conversation-starter prompt `requirements.md` names. This is the ordinary state of the
 * thread Discover's *message* action opens, where **nothing has been written to the database at
 * all** (FR-503a) — which is why it says something forward-looking rather than "no messages".
 */
export const StarterPrompt = () => (
  <div className="py-6 text-center">
    <p className="mb-1 font-medium text-text-primary">Start the conversation</p>
    <p className="mx-auto max-w-prose text-sm text-text-body">
      Say what you enjoyed, what you are working on, or what you would like to talk about. Nothing
      is sent until you send it.
    </p>
  </div>
)

/**
 * FR-519a, FR-574 — a thread that is **closed to sending**.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **CHOSEN OVER THE STARTER PROMPT WHENEVER THE THREAD IS CLOSED, INCLUDING WHEN IT IS EMPTY.**
 *
 * The case FR-519a exists for is narrow and easy to miss: the departed attendee wrote *every*
 * message in the conversation, so M3's cascade leaves the survivor with an empty thread. Deciding
 * on emptiness alone would then invite them to start a conversation with somebody who no longer
 * exists — a prompt that cannot be acted on, about a person the product will not name.
 *
 * It says what happened without naming or describing them, because nothing was retained to name
 * (FR-573).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const ClosedThread = ({ state }: { state: ConversationState }) => (
  <div className="py-6 text-center">
    <p className="mb-1 font-medium text-text-primary">
      {state === 'blocked' ? 'You blocked this person' : 'This conversation is closed'}
    </p>
    <p className="mx-auto max-w-prose text-sm text-text-body">
      {state === 'blocked'
        ? 'They cannot reach you, and you cannot send to them. Nothing has been deleted — unblocking restores the conversation exactly as it was.'
        : 'The other person has deleted their account. Everything they wrote went with it, and no new messages can be sent.'}
    </p>
  </div>
)

/**
 * FR-564 — offline, for the whole destination.
 *
 * **Discloses no content, and says so** (SC-513). Nothing in Messages is cached, deliberately
 * (FR-563): message content is the most sensitive data in the product, and a day-old copy of
 * somebody else's words sitting on a device is a cost with no offline capability worth having in
 * exchange — every write here is refused rather than queued anyway.
 *
 * Worded distinguishably from a fault on our side, because the two ask different things of the
 * reader: one waits, the other retries.
 */
export const MessagesOffline = ({ onRetry }: { onRetry: () => void }) => (
  <div
    role="status"
    className="rounded-md border border-warning-500 bg-warning-100 px-4 py-3 text-sm text-warning-700"
  >
    <p className="mb-2">
      You are offline. Conversations are not stored on this device, so there is nothing to show
      until you are connected again.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="focus-ring min-h-11 rounded-sm border border-warning-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)

/** The same, for one thread. */
export const ThreadOffline = ({ onRetry }: { onRetry: () => void }) => (
  <div
    role="status"
    className="rounded-md border border-warning-500 bg-warning-100 px-4 py-3 text-sm text-warning-700"
  >
    <p className="mb-2">
      You are offline. This conversation is not stored on this device, so there is nothing to show
      until you are connected again.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="focus-ring min-h-11 rounded-sm border border-warning-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)

/**
 * T018 (016) — **the list has stopped keeping up** (FR-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A NOTICE, NOT A FAILURE STATE, AND NOT THE OFFLINE ONE EITHER.**
 *
 * Three states now share this pane and each asks something different of the reader:
 *
 *   - `MessagesOffline` — *you* are disconnected, and there is nothing to show because nothing
 *     is stored on this device. The reader waits, or retries when they are back.
 *   - `ConversationsFailed` — the list could not be loaded **at all**. The screen is empty and
 *     the reader has to retry.
 *   - this — the list **is on screen and is real**; it has simply stopped updating itself. The
 *     reader loses nothing by ignoring it and needs to do nothing at all.
 *
 * FR-1010 requires the third to be distinguishable from the first, which is why the wording says
 * what the reader can still rely on rather than what has gone wrong.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **No retry control**, deliberately. `usePoll` backs off and recovers on its own the moment the
 * service does, so a button would offer to do something already happening — and would make the
 * reader responsible for a repair they cannot perform. `role="status"` rather than `alert`
 * because it is a condition rather than something that just went wrong, and an assertive region
 * would interrupt a screen reader mid-conversation.
 */
export const ConversationsStale = () => (
  <div
    role="status"
    className="mb-4 rounded-md border border-warning-500 bg-warning-100 px-4 py-2 text-sm text-warning-700"
  >
    This list has stopped updating. Your conversations are still here, and it will catch up on its
    own when the connection returns.
  </div>
)

/** A fault on our side. Always offers a retry, because that is the honest next step (FR-059). */
export const ConversationsFailed = ({ onRetry }: { onRetry: () => void }) => (
  <Failed
    message="Your conversations could not be loaded. This is a problem on our side, not with your account."
    onRetry={onRetry}
  />
)

export const ThreadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <Failed
    message="This conversation could not be loaded. This is a problem on our side, not with your account."
    onRetry={onRetry}
  />
)
