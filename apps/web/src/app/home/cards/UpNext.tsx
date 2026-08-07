import { OfflineError, type Session } from '@mynet/data'
import { useCatalogRepository } from '@mynet/platform'
import { useCallback } from 'react'

import { Failed, Loading, useAsync } from '../../AsyncState.js'
import { SpeakerLine, TrackChip } from '../../SessionPresentation.js'
import { nextSession, venueTimeOf } from '../../sessions.js'
import type { EventCardProps, HomeCard } from '../contract.js'

/**
 * T046 (002) — "Up next": the single most prominent thing on Home (FR-137, FR-140).
 *
 * This is the first of the attendee's three questions — *what is happening next?* — which
 * Principle III places above the other two, so it takes the `primary` slot's first position.
 *
 * `scope: 'event'`, so the shell resolves the conference and this card never handles its
 * absence. It owns its own loading, empty and failure states, which is the whole bargain the
 * card contract makes.
 */
const UpNextCard = ({ event }: EventCardProps) => {
  const catalog = useCatalogRepository()

  const load = useCallback(
    () => catalog.listSessions(event.id) as Promise<Session[]>,
    [catalog, event.id],
  )
  const sessions = useAsync<Session[]>(load, [load], { emptyWhen: () => false })

  return (
    <section
      aria-label="Up next"
      className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card tablet:px-5"
    >
      <h2 className="mb-3 font-display text-base font-medium text-text-primary">Up next</h2>

      {sessions.status === 'loading' && <Loading label="Loading what is next…" />}

      {sessions.status === 'failed' && (
        <Failed
          message={
            sessions.error instanceof OfflineError
              ? 'What is next needs a connection, and there is not one right now. Nothing is cached.'
              : 'What is next could not be loaded. This is a problem on our side.'
          }
          onRetry={sessions.retry}
        />
      )}

      {sessions.status === 'ready' && <UpNextBody sessions={sessions.data} event={event} />}
    </section>
  )
}

const UpNextBody = ({
  sessions,
  event,
}: {
  sessions: Session[]
  event: EventCardProps['event']
}) => {
  const upcoming = nextSession(sessions, new Date())

  // ───────────────────────────────────────────────────────────────────────────────────────
  // FR-140 — when nothing remains, **say so**. Never fall back to a session that has already
  // happened: an attendee cannot tell a stale "up next" from a real one, and this card is the
  // most prominent thing on the screen. An empty programme (FR-139) lands here too, and the
  // two are worded differently because they are different facts.
  // ───────────────────────────────────────────────────────────────────────────────────────
  if (!upcoming) {
    return (
      <p className="text-sm text-text-body">
        {sessions.length === 0
          ? 'This conference has no published programme yet.'
          : 'Nothing further is scheduled. Enjoy the rest of your day.'}
      </p>
    )
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <time
          dateTime={upcoming.startsAt}
          className="font-mono text-lg font-medium text-accent-strong tabular-nums"
        >
          {venueTimeOf(upcoming.startsAt, event.timezone)}
        </time>
        <TrackChip track={upcoming.track} />
      </div>

      <h3 className="font-display text-lg font-medium text-text-primary">{upcoming.title}</h3>
      <p className="text-sm text-text-muted">{upcoming.room.name}</p>
      <SpeakerLine speakers={upcoming.speakers} />

      {upcoming.summary && <p className="mt-2 text-sm text-text-body">{upcoming.summary}</p>}
    </div>
  )
}

export const upNextCard: HomeCard = {
  id: 'up-next',
  title: 'Up next',
  slot: 'primary',
  order: 0,
  scope: 'event',
  Component: UpNextCard,
}
