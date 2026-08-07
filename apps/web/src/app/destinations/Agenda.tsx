import { OfflineError, type Session } from '@mynet/data'
import { useCatalogRepository } from '@mynet/platform'
import { useCallback } from 'react'

import { ActiveEventFailure, NoConferencesNotice, useActiveEvent } from '../active-event.js'
import { Failed, Loading, useAsync } from '../AsyncState.js'
import { SessionRow } from '../SessionPresentation.js'
import { groupByVenueDay } from '../sessions.js'

/**
 * T049 (002) — Agenda: the conference programme, chronological and **read-only** (FR-137).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS DELIBERATELY NO SAVE, ADD OR REMOVE CONTROL HERE, AND NO DISABLED PROMISE OF ONE.**
 *
 * Saved sessions, personal notes and audience Q&A arrive in feature 005, which will add them to
 * this surface. Rendering a greyed-out star now would be an affordance for a capability that
 * does not exist — a promise the product cannot keep — which is the same reason the top bar
 * carries no notification bell. US2 scenario 6 asserts the absence.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Grouped into **venue-local days**, so a programme reads the way the conference is actually
 * run rather than the way the reader's timezone happens to slice it.
 */
export const Agenda = () => {
  const activeEvent = useActiveEvent()

  return (
    <section aria-labelledby="agenda-heading" className="px-4 py-6 tablet:px-6">
      <h1
        id="agenda-heading"
        className="mb-1 font-display text-2xl font-semibold text-text-primary"
      >
        Agenda
      </h1>

      {activeEvent.status === 'loading' && <Loading label="Loading your conference…" />}

      {activeEvent.status === 'none' && <NoConferencesNotice />}

      {activeEvent.status === 'failed' && (
        <ActiveEventFailure message={activeEvent.message} onRetry={activeEvent.retry} />
      )}

      {activeEvent.status === 'ready' && (
        <>
          <p className="mb-6 text-sm text-text-muted">
            {activeEvent.event.name} · {activeEvent.event.location}
          </p>
          <Programme event={activeEvent.event} />
        </>
      )}
    </section>
  )
}

const Programme = ({ event }: { event: { id: string; timezone: string } }) => {
  const catalog = useCatalogRepository()

  const load = useCallback(
    () => catalog.listSessions(event.id) as Promise<Session[]>,
    [catalog, event.id],
  )
  // `emptyWhen` claims the no-programme case (FR-139) so it cannot be rendered as a bare
  // `ready` with an empty list — which would look identical to a failure that returned nothing.
  const sessions = useAsync<Session[]>(load, [load], {
    emptyWhen: (data) => Array.isArray(data) && data.length === 0,
  })

  if (sessions.status === 'loading') return <Loading label="Loading the programme…" />

  if (sessions.status === 'failed') {
    return (
      <Failed
        message={
          sessions.error instanceof OfflineError
            ? 'The programme needs a connection, and there is not one right now. Nothing is cached for offline use.'
            : 'The programme could not be loaded. This is a problem on our side, not with your account.'
        }
        onRetry={sessions.retry}
      />
    )
  }

  // FR-139 — a conference with no published programme is a valid answer, not a failure.
  if (sessions.status === 'empty') {
    return (
      <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
        <p className="mb-1 font-medium text-text-primary">
          This conference has no published programme yet
        </p>
        <p className="text-sm text-text-body">
          When the organisers publish sessions, they will appear here in chronological order.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      {groupByVenueDay(sessions.data, event.timezone).map((day) => (
        <section key={day.date} aria-label={day.label}>
          <h2 className="mb-1 font-display text-lg font-medium text-text-primary">{day.label}</h2>
          <ul className="grid rounded-md border border-border-subtle bg-surface-raised px-4">
            {day.sessions.map((session) => (
              <SessionRow key={session.id} session={session} timezone={event.timezone} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
