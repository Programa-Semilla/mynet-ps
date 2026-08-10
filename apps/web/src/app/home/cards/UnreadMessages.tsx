import { OfflineError } from '@mynet/data'
import { useConversationRepository } from '@mynet/platform'
import { MessageSquare } from 'lucide-react'
import { useCallback } from 'react'
import { Link } from 'react-router'

import { Failed, useAsync } from '../../AsyncState.js'
import type { HomeCard } from '../contract.js'

/**
 * T098 (007) — **the unread-message indicator** (FR-531, FR-532, FR-533, SC-517).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **IT RENDERS NOTHING AT ZERO, AND THAT IS THE REQUIREMENT** (FR-531).
 *
 * An indicator is a thing that appears when there is something to indicate. A permanent card
 * saying "no unread messages" is noise on the first viewport for the overwhelming majority of
 * loads, and Home's first viewport is a success criterion (Principle III) rather than a place to
 * put whatever a feature has.
 *
 * So the card occupies no space when the answer is no. **The loading state is silent for the same
 * reason**: a skeleton that resolves to nothing would be a flicker in the first viewport on every
 * single load, which is worse than the wait it reports.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **ATTENDEE-SCOPED, NOT EVENT-SCOPED, AND THE COMPILER ENFORCES IT** (FR-507).
 *
 * Conversations are cross-event: a contact made at one conference does not vanish at the next.
 * Declaring `scope: 'attendee'` makes the component *unable to accept* an event — so this card
 * cannot quietly grow a dependency on the active conference and then show the wrong answer, or
 * no answer, to somebody who has joined none. It is the first card in the product for which that
 * half of the discriminated union is load-bearing rather than incidental.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A BOOLEAN, FROM ITS OWN ADDRESS** (FR-531, FR-533, standing decision 9).
 *
 * `hasUnread()` reads `GET /conversations/unread`, not the conversation list. Two reasons, and
 * the second is the requirement:
 *
 *   - The card must not transfer every counterpart's name and face to render a dot.
 *   - **It must own its loading and failure states independently of Messages.** A failing
 *     conversation list has to leave the indicator working and vice versa, which is only true if
 *     they do not share a read (SC-517).
 *
 * A count is deliberately not offered. Nothing in the product needs one, and a count is a more
 * precise disclosure of reading behaviour than any requirement asks for.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const UnreadMessagesCard = () => {
  const conversations = useConversationRepository()

  const load = useCallback(async () => conversations.hasUnread(), [conversations])

  const unread = useAsync<boolean>(load, [load], {
    // `false` is not "empty" — it is a definite answer, and this card renders nothing for it.
    // Left to the default, an `emptyWhen` over a boolean would be a category error.
    emptyWhen: () => false,
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **NOTHING AT ALL while loading, and nothing at all at zero.**
   *
   * Returning `null` rather than an empty section: the shell lays cards out in a grid, and an
   * empty `<section>` would still occupy a cell — so "renders nothing" has to mean nothing, or
   * FR-531 is satisfied in the source and not on the screen.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  if (unread.status === 'loading') return null

  if (unread.status === 'failed') {
    /**
     * FR-533, SC-517 — **the failure is inside this card and reaches nothing else.**
     *
     * Rendered rather than swallowed, because a dot that silently stops appearing is worse than
     * one that says it could not check: an attendee would conclude nobody had messaged them.
     */
    return (
      <section aria-label="Unread messages" className="h-full">
        <Failed
          message={
            unread.error instanceof OfflineError
              ? // Nothing here is cached (FR-563), so the wording asks for a connection rather
                // than offering something stale.
                'Whether you have unread messages needs a connection.'
              : 'Could not check for unread messages. This is a problem on our side.'
          }
          onRetry={unread.retry}
        />
      </section>
    )
  }

  if (unread.status !== 'ready' || !unread.data) return null

  return (
    <section
      aria-label="Unread messages"
      className="h-full rounded-md border border-accent-strong bg-surface-raised px-4 py-4 shadow-card tablet:px-5"
    >
      <Link
        to="/messages"
        className="focus-ring flex min-h-11 items-center gap-3 rounded-md text-text-primary"
      >
        <MessageSquare aria-hidden="true" className="size-5 shrink-0 text-accent-strong" />
        <span>
          <span className="block font-medium">You have unread messages</span>
          <span className="block text-sm text-text-muted">Open Messages to read them</span>
        </span>
      </Link>
    </section>
  )
}

export const unreadMessagesCard: HomeCard = {
  id: 'unread-messages',
  title: 'Unread messages',
  slot: 'aside',
  /**
   * **Appended, not inserted**, and not `lead`: FR-157 allows at most one lead card, and
   * reordering existing entries is forbidden outright. `order` is what lets this land without
   * disturbing anything, because the shell sorts by it rather than by array position.
   *
   * `2`, after People to meet. Home answers "what is happening next" first (Principle III); a
   * waiting message is the third question, not the first — and it is also the card most likely
   * to be absent, so putting it high would leave a gap at the top on most loads.
   */
  order: 2,
  /** Cross-event (FR-507). See the header: the compiler is what keeps this true. */
  scope: 'attendee',
  Component: UnreadMessagesCard,
}
