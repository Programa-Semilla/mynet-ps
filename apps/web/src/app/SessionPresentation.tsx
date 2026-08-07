import type { Session } from '@mynet/data'

import { venueTimeOf } from './sessions.js'
import { trackClassesFor } from './track-colors.js'

/**
 * Shared session presentation — the track chip, speakers, and a programme row.
 *
 * Used by the Up next card, the rest-of-day card and Agenda. One implementation, so a session
 * cannot come to look like three different things depending on which surface it is on.
 */

/**
 * A track, coded **and named**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The name is not decoration next to the colour — it is the signal, and the colour is the
 * reinforcement. Constitution Principle IV: colour is never the sole carrier of meaning, which
 * is what makes the track legible to a colour-blind reader, in high contrast mode, and in the
 * neutral fallback an unrecognised token degrades to (research D7).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const TrackChip = ({ track }: { track: Session['track'] }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-xs font-medium ${trackClassesFor(track.colorToken)}`}
  >
    {track.name}
  </span>
)

/**
 * The people speaking, or **nothing at all**.
 *
 * FR-138: a session with no speaker renders completely, with no empty region and no placeholder
 * name. Returning null rather than an empty element is what makes that true — "Speakers: —" is
 * exactly the placeholder the requirement forbids.
 */
export const SpeakerLine = ({ speakers }: { speakers: Session['speakers'] }) => {
  if (speakers.length === 0) return null

  return (
    <p className="text-sm text-text-body">
      {speakers
        .map((speaker) => (speaker.company ? `${speaker.name} · ${speaker.company}` : speaker.name))
        .join(', ')}
    </p>
  )
}

/**
 * One line of a programme: time, title, room, track, speakers.
 *
 * `time` is machine-readable through `dateTime` as well as human-readable, so the schedule is
 * available to assistive technology without the visible text having to be an ISO string.
 */
export const SessionRow = ({ session, timezone }: { session: Session; timezone: string }) => (
  <li className="flex gap-3 border-b border-border-subtle py-3 last:border-b-0">
    <time
      dateTime={session.startsAt}
      className="w-14 shrink-0 font-mono text-sm text-text-muted tabular-nums"
    >
      {venueTimeOf(session.startsAt, timezone)}
    </time>

    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-medium text-text-primary">{session.title}</h3>
        <TrackChip track={session.track} />
      </div>
      <p className="text-sm text-text-muted">{session.room.name}</p>
      <SpeakerLine speakers={session.speakers} />
    </div>
  </li>
)
