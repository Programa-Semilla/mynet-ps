import { OfflineError, type DirectoryEntry } from '@mynet/data'
import { useDirectoryRepository, useProfileRepository } from '@mynet/platform'
import { useCallback } from 'react'
import { Link } from 'react-router'

import { Failed, Loading, useAsync } from '../../AsyncState.js'
import { AvatarFallback } from '../../profile/AvatarFallback.js'
import type { EventCardProps, HomeCard } from '../contract.js'

/**
 * T094, T096 (006) — **this feature's own Home card**: who is worth meeting (FR-446–FR-449).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS CARD READS THE REPOSITORIES ITSELF AND TOUCHES NOTHING ELSE ON HOME** (standing
 * decision 9, FR-446).
 *
 * One appended line in `registry.ts` is the entire contact surface. Nothing above it is edited,
 * reordered, or read from — which is what allows this card to fail alone rather than blanking a
 * dashboard whose other five cards are perfectly healthy (FR-448).
 *
 * It also means the card cannot ask another card what it already knows. That is deliberate: the
 * alternative is a shared store on Home, and a shared store is what turns "a card failed" into
 * "Home failed" the first time somebody reads from it without checking.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The same ranking as the directory, obtained by asking the same question** (FR-447).
 *
 * It calls `list` with a limit of five rather than re-deriving an order client-side, so the card
 * and Discover cannot come to disagree about who is worth meeting. That matters because FR-447a
 * requires the card's action to open Discover *in the order the card was drawn from* — a promise
 * that is only keepable if there is one ordering.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** FR-447 — at most five. A first-viewport card beside four others, not a second directory. */
const SUGGESTIONS = 5

const PeopleToMeetCard = ({ event }: EventCardProps) => {
  const directory = useDirectoryRepository()
  const profile = useProfileRepository()

  const load = useCallback(async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Both reads are this card's own, and the reader's own profile is read for exactly one
    // reason: FR-449 needs "you have set no interests" told apart from "nobody to suggest", and
    // the listing alone cannot distinguish them. An empty directory and a reader with no
    // interests both produce a page of zero-overlap strangers.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const [page, own] = await Promise.all([
      directory.list(event.id, { limit: SUGGESTIONS }),
      profile.getOwn(),
    ])

    return { attendees: page.attendees, hasInterests: own.interests.length > 0 }
  }, [directory, profile, event.id])

  const suggestions = useAsync<{
    attendees: readonly DirectoryEntry[]
    hasInterests: boolean
  }>(load, [load], {
    // "Nobody to suggest" and "you have set no interests" are states this card renders itself,
    // with its own wording, because they are different facts (FR-449).
    emptyWhen: () => false,
  })

  return (
    <section
      aria-label="People to meet"
      className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card tablet:px-5"
    >
      <h2 className="mb-3 font-display text-base font-medium text-text-primary">People to meet</h2>

      {suggestions.status === 'loading' && <Loading label="Finding people to meet…" />}

      {/*
        FR-448 — the failure is **inside** this card. `Failed` renders a bordered region with a
        retry; nothing about it reaches the shell, and every sibling card renders normally
        beside it.
      */}
      {suggestions.status === 'failed' && (
        <Failed
          message={
            suggestions.error instanceof OfflineError
              ? // Nothing here is cached (FR-466), so the offline wording says a connection is
                // needed rather than offering something stale.
                'People to meet needs a connection, and there is not one right now.'
              : 'People to meet could not be loaded. This is a problem on our side.'
          }
          onRetry={suggestions.retry}
        />
      )}

      {suggestions.status === 'ready' && (
        <PeopleToMeetBody
          attendees={suggestions.data.attendees}
          hasInterests={suggestions.data.hasInterests}
        />
      )}
    </section>
  )
}

const PeopleToMeetBody = ({
  attendees,
  hasInterests,
}: {
  attendees: readonly DirectoryEntry[]
  hasInterests: boolean
}) => {
  /**
   * FR-449 — **a reader with no interests gets their own state, and it is actionable.**
   *
   * The ranking signal is shared interests, so a reader who has set none is not being ranked at
   * all: everybody scores zero and the "suggestions" are five arbitrary strangers presented as
   * though somebody chose them. Saying so — and pointing at the one thing that fixes it — is
   * more honest than the list, and it is the only state on this card the reader can act on.
   */
  if (!hasInterests) {
    return (
      <p className="text-sm text-text-body">
        Add a few interests to your profile and we can suggest people worth meeting here.{' '}
        <Link to="/profile/edit" className="font-medium text-accent-strong underline">
          Edit your profile
        </Link>
        .
      </p>
    )
  }

  if (attendees.length === 0) {
    return (
      <p className="text-sm text-text-body">
        Nobody to suggest just yet. As more people arrive at this conference, they will appear here.{' '}
        <Link to="/discover" className="font-medium text-accent-strong underline">
          Browse everyone
        </Link>
        .
      </p>
    )
  }

  return (
    <div>
      <ul className="grid gap-3">
        {attendees.map((attendee) => (
          <li key={attendee.attendeeId} className="flex items-center gap-3">
            {attendee.avatar ? (
              <img
                src={attendee.avatar}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full border border-border-subtle object-cover"
              />
            ) : (
              <AvatarFallback displayName={attendee.displayName} size="small" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-text-primary">
                <Link to={`/discover/${attendee.attendeeId}`} className="hover:underline">
                  {attendee.displayName}
                </Link>
              </p>
              {(attendee.role || attendee.company) && (
                <p className="truncate text-xs text-text-muted">
                  {[attendee.role, attendee.company].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>

            {/*
              FR-447 — each shows its count. Zero is not displayed, matching the directory card:
              the label is a reason to make contact, and "0 interests in common" is not one.
            */}
            {attendee.sharedInterestCount > 0 && (
              <span className="shrink-0 text-xs font-medium text-accent-strong">
                {attendee.sharedInterestCount === 1
                  ? '1 in common'
                  : `${attendee.sharedInterestCount} in common`}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        T096 — **the action opens Discover in the same order this card was drawn from**
        (FR-447a).

        A plain link to `/discover`, with no query and no sort parameter — which is exactly what
        makes the promise keepable rather than a coincidence: the directory's *default* order is
        the ranking, so "the same order" is the order Discover already opens in. A link carrying
        a sort would be a second place the ordering was decided, and the two would drift.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      <Link
        to="/discover"
        className="mt-3 inline-flex text-sm font-medium text-accent-strong underline"
      >
        See everyone at this conference
      </Link>
    </div>
  )
}

export const peopleToMeetCard: HomeCard = {
  id: 'people-to-meet',
  title: 'People to meet',
  slot: 'aside',
  /**
   * **Not `lead`**, and appended rather than inserted. FR-157 allows at most one lead card and
   * reordering existing entries is forbidden outright — `order` is what lets this land without
   * disturbing anything, because the shell sorts by it rather than by array position.
   *
   * `aside`, because it is supporting material: "what is happening next" is the question Home
   * answers first (Principle III), and this answers the second one.
   */
  order: 1,
  scope: 'event',
  Component: PeopleToMeetCard,
}
