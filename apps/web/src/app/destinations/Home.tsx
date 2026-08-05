import type { Event } from '@mynet/data'
import { useEventsRepository } from '@mynet/platform'
import { useCallback } from 'react'

import { Failed, Loading, useAsync } from '../AsyncState.js'
import { useAuth } from '../../auth/useAuth.js'

/**
 * T062 — the attendee's registered events, with an explicit empty state (FR-040).
 *
 * This is the whole of the walking skeleton's payload: browser → API → PostgreSQL, scoped to
 * one identity, and back. It carries no session content, no recommendations, and no
 * appointments — those belong to the slices that own them (FR-039).
 */
export const Home = () => {
  const eventsRepository = useEventsRepository()
  const { attendee } = useAuth()

  const load = useCallback(
    () => eventsRepository.listRegistered() as Promise<Event[]>,
    [eventsRepository],
  )
  const events = useAsync<Event[]>(load, [load])

  return (
    <section aria-labelledby="home-heading" className="px-4 py-6 tablet:px-6">
      <h1 id="home-heading" className="mb-1 font-display text-2xl font-semibold text-text-primary">
        {attendee ? `Hello, ${attendee.displayName}` : 'Home'}
      </h1>
      <p className="mb-6 text-sm text-text-muted">Your events</p>

      {events.status === 'loading' && <Loading label="Loading your events…" />}

      {/*
        FR-058 — a failure is reported as a failure. It must never fall through to the empty
        state below, which would tell the attendee they have no events when in fact we do not
        know what events they have.
      */}
      {events.status === 'failed' && (
        <Failed
          message="Your events could not be loaded. This is a problem on our side, not with your account."
          onRetry={events.retry}
        />
      )}

      {/*
        FR-040 — an attendee registered for no events is a valid state, not an error and not a
        blank region. It says what is true and what to do about it.
      */}
      {events.status === 'empty' && (
        <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
          <p className="mb-1 font-medium text-text-primary">
            You are not registered for any events yet
          </p>
          <p className="text-sm text-text-body">
            When you are registered for a conference, it will appear here with its dates and
            location.
          </p>
        </div>
      )}

      {events.status === 'ready' && (
        <ul className="grid gap-3">
          {events.data.map((event) => (
            <li
              key={event.id}
              className="rounded-md border border-border-subtle bg-surface-raised px-4 py-3 shadow-card"
            >
              <h2 className="font-display text-lg font-medium text-text-primary">{event.name}</h2>
              <p className="text-sm text-text-body">{event.location}</p>
              <p className="text-sm text-text-muted">
                {/*
                  Dates rendered from the stored range. "Day N of M" is derived, never stored
                  — the prototype's static day counter would go stale the moment the clock
                  moved (data-model.md).
                */}
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
