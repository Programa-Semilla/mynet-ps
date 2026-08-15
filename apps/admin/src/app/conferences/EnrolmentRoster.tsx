import type { AdminSession } from '@mynet/data'
import { useCallback, useEffect, useState } from 'react'

import { classify, describe, detailOf } from '../errors.js'
import { useAdminSession } from '../session.js'

/**
 * T146 (014 tranche 2) — **the enrolment roster** (FR-1073, FR-1073a, constitution v5.3.0 O1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE FOURTH RECORDED PRINCIPLE VIII EXCEPTION, AND THIS SCREEN RENDERS EXACTLY ITS BOUNDS.**
 *
 * An organizer told to close enrolment early because materials must be prepared cannot prepare
 * them for people they cannot name (REQ-086) — that sentence is the whole reason this surface
 * exists. What it shows is names, and nothing else: no identifier, no address, no avatar, no
 * control that reaches anything further about the person. The route's response schema declares
 * `displayName` alone, so anything more is stripped server-side before this component could
 * render it; the restraint here is presentation of a bound, not the bound.
 *
 * The other three bounds are the server's too (FR-1073a): only enrolment — an organizer still
 * cannot learn who SAVED, noted, questioned or voted on anything, at any tier; only an assigned
 * organizer, refused with the indistinguishable 404 otherwise; only this conference's sessions.
 * The attendee was told their name becomes visible before they took the place (FR-1074), which
 * is what makes this the one privacy exception its subject could decline by not acting.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The held/capacity figures come from the programme payload** (`placesHeld`, `capacity`)
 * rather than from counting this list — the programme is re-read on every write, and the two
 * can legitimately disagree for a moment while enrolment moves; the list is the roster, the
 * figures are the session's.
 */
export interface EnrolmentRosterProps {
  readonly eventId: string
  readonly session: AdminSession
}

type Roster =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'loaded'; readonly names: readonly string[] }

export const EnrolmentRoster = ({ eventId, session }: EnrolmentRosterProps) => {
  const { services } = useAdminSession()
  const [roster, setRoster] = useState<Roster>({ state: 'loading' })

  const load = useCallback(async () => {
    setRoster({ state: 'loading' })
    try {
      const attendees = await services.catalog.listEnrolments(eventId, session.id)
      setRoster({ state: 'loaded', names: attendees.map((one) => one.displayName) })
    } catch (error) {
      setRoster({ state: 'failed', message: describe(classify(error), detailOf(error)) })
    }
  }, [services, eventId, session.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <div className="mt-2 rounded-lg bg-cream-200 px-3 py-3">
      <h4 className="text-sm font-semibold text-text-primary">Who holds a place</h4>
      {/*
        FR-1070's organizer-side counterpart, from the programme payload: the held figure and
        what remains of the capacity, as text. `placesHeld` sits beside the engagement counts,
        never among them (research R15).
      */}
      <p className="mt-1 text-xs text-text-muted">
        {session.placesHeld} of {session.capacity ?? 0} places held ·{' '}
        {Math.max((session.capacity ?? 0) - session.placesHeld, 0)} left
      </p>

      {roster.state === 'loading' ? (
        <p className="mt-2 text-sm text-text-muted">Loading the roster…</p>
      ) : roster.state === 'failed' ? (
        <p role="alert" className="mt-2 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {roster.message}
        </p>
      ) : roster.names.length === 0 ? (
        // "Nobody yet" is a state, not a failure — an optional session opens empty, and an
        // empty roster reading as an error would send an organizer hunting for a defect.
        <p className="mt-2 text-sm text-text-muted">
          Nobody holds a place yet. Attendees who take one appear here by name.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-text-body">
          {roster.names.map((name, index) => (
            // Names are the WHOLE datum — there is deliberately no id to key on, so the index
            // is honest: the list is read-only and re-rendered whole.
            <li key={`${String(index)}-${name}`}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
