import type { Session } from '@mynet/data'

import { CancelledChip, TrackChip } from '../SessionPresentation.js'
import { venueDayLabelOf, venueTimeOf } from '../sessions.js'

/**
 * T039 (005) — the panel's Overview section (FR-200).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Start and end in venue-local terms**, like everything else that reads a programme. The
 * session arrives as two absolute instants (FR-124) and the venue's clock is applied here, at
 * display time — so an attendee reading from another timezone sees the times the conference is
 * actually run to, and the day heading agrees with the one on the programme behind the panel.
 *
 * Both times stay machine-readable through `dateTime` as well, so the schedule is available to
 * assistive technology without the visible text having to be an ISO string.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Its own section**, so 009 can add audience questions as a third without editing this one
 * (FR-206). The panel composes sections; a section knows nothing about its siblings.
 */
export const PanelOverview = ({ session, timezone }: { session: Session; timezone: string }) => (
  <section aria-labelledby="session-panel-overview" className="mb-6">
    <h3 id="session-panel-overview" className="sr-only">
      Overview
    </h3>

    <div className="mb-3 flex flex-wrap items-center gap-2">
      <TrackChip track={session.track} />
      {/*
        T053 (014) — FR-1022. The panel is where an attendee reads what happened to a session
        they saved, so cancellation belongs at the top of it rather than only on the row that
        brought them here. In **text**, beside the track: colour is never the sole carrier, and
        this is the one piece of information that, missed, sends somebody to an empty room.
      */}
      {session.cancelled && <CancelledChip />}
      <span className="text-sm text-text-muted">{session.room.name}</span>
    </div>

    <p className="mb-3 text-sm text-text-body">
      <span className="font-medium text-text-primary">
        {venueDayLabelOf(session.startsAt, timezone)}
      </span>
      {', '}
      <time dateTime={session.startsAt} className="font-mono tabular-nums">
        {venueTimeOf(session.startsAt, timezone)}
      </time>
      {' – '}
      <time dateTime={session.endsAt} className="font-mono tabular-nums">
        {venueTimeOf(session.endsAt, timezone)}
      </time>
    </p>

    {/*
      A session without a summary renders nothing here rather than an empty region or a
      placeholder line — the same reasoning as `SpeakerLine`. "Summary: —" is exactly the
      placeholder an empty state requirement forbids.
    */}
    {session.summary && <p className="text-sm text-text-body">{session.summary}</p>}
  </section>
)
