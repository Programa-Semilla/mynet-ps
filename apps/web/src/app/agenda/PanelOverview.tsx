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
      {/*
        T193 (014 tranche 2) — no room line at all when the session has none (SC-1022): a
        virtual session's whereabouts is its access link below, and an empty room line would be
        the placeholder the summary's own comment forbids. In person, virtual or both is
        DERIVED from what the session carries — never a stored delivery attribute (FR-1051).
      */}
      {session.room && <span className="text-sm text-text-muted">{session.room.name}</span>}
    </div>

    {/*
      T193 (014 tranche 2) — the access link, where a virtual or hybrid session is attended
      (FR-1052, SC-1022). A plain anchor and nothing more: the URL comes validated `https:`-only
      from the server, the product never fetches it, and this dedicated field is the ONLY route
      by which a link reaches an attendee — the summary stays a plain paragraph (FR-1054).
      `rel` and `target` because it leaves the product for an organizer-chosen destination.
      Absent entirely for an in-person session: no link line, not an empty one.
    */}
    {session.accessLink && (
      <p className="mb-3 text-sm">
        <a
          href={session.accessLink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-strong underline"
        >
          Join session
        </a>{' '}
        <span className="break-all text-text-muted">({session.accessLink})</span>
      </p>
    )}

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
