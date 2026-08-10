import type { ConversationSummary } from '@mynet/data'
import { NavLink } from 'react-router'

import { AvatarFallback } from '../profile/AvatarFallback.js'

/**
 * T060 (007) — the conversation list (FR-508, FR-509, FR-573, FR-580).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A VERTICAL LIST, NEVER A HORIZONTALLY-SCROLLING STRIP OF AVATARS** (FR-580).
 *
 * The prototype's phone frame shows a horizontal row of faces above the thread, and reproducing
 * it is forbidden rather than merely discouraged: Principle IV's floor is that **no content or
 * primary action may require horizontal scrolling**, and choosing which conversation to read is
 * the primary action of this destination. A strip also hides every conversation past the fourth
 * behind a gesture that has no keyboard equivalent and no announced affordance.
 *
 * This is one of the two prototype defects 007 corrects outright, and the correction is a
 * settled requirement rather than a judgement (constitution Principle II).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A departed counterpart is rendered from `state`, never from a placeholder person**
 * (FR-573, T135).
 *
 * `counterpart` is `null` when the other participant has deleted their account — there is no
 * name, no face and no identifier, because nothing was retained. So the row says what the
 * conversation now *is* rather than inventing a "Deleted user" to stand where somebody was: a
 * tombstone is a retained fact about a person who asked to be forgotten.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const ConversationList = ({
  conversations,
}: {
  conversations: readonly ConversationSummary[]
}) => (
  <ul className="flex flex-col gap-1">
    {conversations.map((conversation) => (
      <li key={conversation.conversationId}>
        <NavLink
          to={`/messages/${conversation.conversationId}`}
          // The accessible name carries what a sighted reader gets from the whole row: who it is
          // with, and whether something is waiting. Without the unread word, a screen-reader user
          // hears an identical name for a thread with news and one without.
          aria-label={`${nameOf(conversation)}${conversation.unread ? ', unread' : ''}`}
          className={({ isActive }) =>
            `focus-ring flex min-h-11 items-center gap-3 rounded-md px-3 py-2 ${
              isActive ? 'bg-cream-200' : 'bg-surface-raised'
            }`
          }
        >
          {conversation.counterpart?.avatar ? (
            <img
              src={conversation.counterpart.avatar}
              alt=""
              className="size-10 shrink-0 rounded-full border border-border-subtle object-cover"
            />
          ) : (
            <AvatarFallback displayName={nameOf(conversation)} />
          )}

          {/* `min-w-0` is what lets the preview truncate rather than widening the column past the
              viewport — the difference between a tidy list and a horizontal scrollbar (FR-586). */}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {nameOf(conversation)}
              </span>
              {/*
                T096 — the unread marker. A dot rather than a count (FR-531): nothing in the
                product needs more, and a count is a more precise disclosure of reading behaviour
                than any requirement asks for. `aria-hidden` because the link's accessible name
                already says "unread" — announcing it twice is noise, and a bare dot has no name.
              */}
              {conversation.unread && (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full bg-accent-strong"
                />
              )}
            </span>

            {/*
              ─────────────────────────────────────────────────────────────────────────────
              **`text-body`, not `text-muted`, and the active row is why.**
              The muted ink is documented at 4.60:1 on `cream-100` — but the selected row's
              background is `cream-200`, where it falls below the 4.5:1 floor. `e2e/
              accessibility.spec.ts` reported it as a serious violation at tablet and desktop,
              which are the widths where the two-pane layout keeps a row selected.
              `tokens.css` already records `cream-200 / ink-body` at 6.04:1, so the body ink
              passes on both backgrounds. Hierarchy comes from size, which it already did.
              ─────────────────────────────────────────────────────────────────────────────
            */}
            <span className="block truncate text-xs text-text-body">{previewOf(conversation)}</span>
          </span>
        </NavLink>
      </li>
    ))}
  </ul>
)

/**
 * What to call the other side of a conversation.
 *
 * The fallback names the *state* rather than the person, for the reason the header records: there
 * is no person left to name.
 */
const nameOf = (conversation: ConversationSummary): string =>
  conversation.counterpart?.displayName ?? 'Closed conversation'

/**
 * FR-509's preview line.
 *
 * A one-sided conversation whose surviving messages are all gone has no preview at all — the
 * departed attendee wrote every one of them — so it says what happened instead of rendering an
 * empty line the reader has to interpret.
 */
const previewOf = (conversation: ConversationSummary): string => {
  if (!conversation.lastMessage) {
    return conversation.state === 'one_sided' ? 'This conversation is closed.' : 'No messages yet.'
  }
  return conversation.lastMessage.mine
    ? `You: ${conversation.lastMessage.body}`
    : conversation.lastMessage.body
}
