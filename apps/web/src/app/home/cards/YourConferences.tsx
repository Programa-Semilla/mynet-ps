import { OfflineError, type Event } from '@mynet/data'
import { useEventsRepository } from '@mynet/platform'
import { useCallback } from 'react'

import { Failed, Loading, useAsync } from '../../AsyncState.js'
import type { HomeCard } from '../contract.js'

/**
 * T075 (002) — the attendee's conferences (FR-173).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`scope: 'attendee'`, and this card is why that half of the contract is trustworthy.**
 *
 * FR-160 says an attendee-scoped card must keep rendering when the active conference cannot be
 * resolved. A contract with only event-scoped consumers would have that half proven by shape
 * rather than by use — which is precisely the `substitutability-proven-without-the-application`
 * finding the 001 review recorded, and which brainstorm #02 flagged as this feature's likeliest
 * weak point. So the attendee-scoped half has a real card, on the real dashboard, that a real
 * attendee reads.
 *
 * Its component **cannot accept** an `event` prop — the compiler refuses one — so it cannot
 * quietly grow a dependency on the active conference and then fail exactly when it is needed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * This is also the registered-events view Home carried before 002. It was not deleted when Home
 * became a shell; it moved here, which is what the composition contract is for.
 */
const YourConferencesCard = () => {
  const eventsRepository = useEventsRepository()

  const load = useCallback(
    () => eventsRepository.listRegistered() as Promise<Event[]>,
    [eventsRepository],
  )
  const events = useAsync<Event[]>(load, [load])

  return (
    <section
      aria-label="Your conferences"
      className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card"
    >
      <h2 className="mb-2 font-display text-base font-medium text-text-primary">
        Your conferences
      </h2>

      {events.status === 'loading' && <Loading label="Loading your conferences…" />}

      {/*
        FR-058 — a failure is reported as a failure. It must never fall through to the empty
        state below, which would tell the attendee they have no conferences when in fact we do
        not know what conferences they have.
      */}
      {events.status === 'failed' && (
        <Failed
          message={
            events.error instanceof OfflineError
              ? 'Your conferences need a connection, and there is not one right now. Nothing has been lost — they will load when you reconnect.'
              : 'Your conferences could not be loaded. This is a problem on our side, not with your account.'
          }
          onRetry={events.retry}
        />
      )}

      {/* A visible empty state, keeping its place in the layout rather than vanishing (FR-161). */}
      {events.status === 'empty' && (
        <p className="text-sm text-text-body">
          When you are registered for a conference, it will appear here with its dates and location.
        </p>
      )}

      {events.status === 'ready' && (
        <ul className="grid gap-2">
          {events.data.map((event) => (
            <li key={event.id} className="border-b border-border-subtle pb-2 last:border-b-0">
              {/*
                A heading, not a styled paragraph. Each conference is a named thing in a list,
                which is how 001 rendered it and how assistive technology navigates it — moving
                this content into a card changed where it lives, and must not change what it is.
                `h3` under the card's own `h2`, so the document outline stays coherent.
              */}
              <h3 className="font-medium text-text-primary">{event.name}</h3>
              <p className="text-sm text-text-body">{event.location}</p>
              <p className="text-sm text-text-muted">
                <time dateTime={event.startsOn}>{formatDate(event.startsOn)}</time>
                {' – '}
                <time dateTime={event.endsOn}>{formatDate(event.endsOn)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export const yourConferencesCard: HomeCard = {
  id: 'your-conferences',
  title: 'Your conferences',
  slot: 'aside',
  order: 0,
  scope: 'attendee',
  Component: YourConferencesCard,
}
