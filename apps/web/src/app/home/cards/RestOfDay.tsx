import { OfflineError, type Session } from '@mynet/data'
import { useCatalogRepository } from '@mynet/platform'
import { useCallback } from 'react'

import { Failed, Loading, useAsync } from '../../AsyncState.js'
import { SessionRow } from '../../SessionPresentation.js'
import { nextSession, restOfVenueDay } from '../../sessions.js'
import type { EventCardProps, HomeCard } from '../contract.js'

/**
 * T047 (002) — the compact rest-of-day timeline (FR-137).
 *
 * Sits below "Up next" and answers the follow-up question: *and then what?* Deliberately
 * excludes the session Up next is already showing, so the two cards do not both lead with the
 * same thing — but it reaches that by computing it itself rather than by being told, because
 * **no card may depend on another card's presence or data** (FR-164). If Up next were removed
 * from the registry tomorrow, this card would be wrong in a small way rather than broken.
 */
const RestOfDayCard = ({ event }: EventCardProps) => {
  const catalog = useCatalogRepository()

  const load = useCallback(
    () => catalog.listSessions(event.id) as Promise<Session[]>,
    [catalog, event.id],
  )
  const sessions = useAsync<Session[]>(load, [load], { emptyWhen: () => false })

  return (
    <section
      aria-label="Rest of your day"
      className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card tablet:px-5"
    >
      <h2 className="mb-2 font-display text-base font-medium text-text-primary">
        Rest of your day
      </h2>

      {sessions.status === 'loading' && <Loading label="Loading the rest of the day…" />}

      {sessions.status === 'failed' && (
        <Failed
          message={
            sessions.error instanceof OfflineError
              ? 'The rest of the day needs a connection, and there is not one right now.'
              : 'The rest of the day could not be loaded. This is a problem on our side.'
          }
          onRetry={sessions.retry}
        />
      )}

      {sessions.status === 'ready' && <RestOfDayBody sessions={sessions.data} event={event} />}
    </section>
  )
}

const RestOfDayBody = ({
  sessions,
  event,
}: {
  sessions: Session[]
  event: EventCardProps['event']
}) => {
  const now = new Date()
  const upcoming = nextSession(sessions, now, event.timezone)
  const remaining = restOfVenueDay(sessions, now, event.timezone, upcoming?.id)

  // A visible empty state rather than a disappearing card (FR-161). The card keeps its place in
  // the layout and says what is true; vanishing would make Home silently rearrange itself.
  if (remaining.length === 0) {
    return (
      <p className="text-sm text-text-body">
        {upcoming
          ? 'Nothing else today after that one.'
          : 'Nothing else is scheduled for today at this conference.'}
      </p>
    )
  }

  return (
    <ul className="grid">
      {remaining.map((session) => (
        <SessionRow key={session.id} session={session} timezone={event.timezone} />
      ))}
    </ul>
  )
}

export const restOfDayCard: HomeCard = {
  id: 'rest-of-day',
  title: 'Rest of your day',
  slot: 'primary',
  order: 1,
  scope: 'event',
  Component: RestOfDayCard,
}
