import type { AdminProgramme, AdminSession, AdminSessionInput } from '@mynet/data'
import { useId, useState } from 'react'

/**
 * T037 (014) — the session form (FR-1001, FR-1005, FR-1012, FR-1013, FR-1016).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE CLIENT MIRRORS THE SERVER'S VALIDATION AND IS NEVER THE ENFORCEMENT OF IT.**
 *
 * Three rules are checked here, and every one is checked again server-side — end after start
 * (which is also a database check constraint, since 002), inside the conference's days in the
 * **venue's** timezone, and a track and room belonging to this conference. Presenting a rule is
 * not enforcing it (Principle VIII), and the reason for mirroring at all is that a refusal arriving
 * after the organizer has typed a title, a summary and two times is a worse experience than a
 * control that will not submit.
 *
 * **Where the two disagree, the server wins and its explanation is what is shown.** The failure
 * path renders the server's message rather than a generic one — which is FR-1019's shape applied
 * to validation, and the opposite of what 008 did when it classified refusals by exception class
 * and swallowed every message its routes wrote to be read.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE TIMES ARE ENTERED IN THE VENUE'S TIMEZONE AND SENT AS ABSOLUTE INSTANTS** (FR-124).
 *
 * An organizer in another city scheduling a 09:00 keynote means 09:00 **at the venue**, and a
 * `datetime-local` input reads the *browser's* zone. So the wall time typed here is interpreted
 * against `conference.timezone` before it is sent, and the field is labelled with the zone so
 * nobody has to guess which clock they are looking at.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const field =
  'mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

/**
 * The offset a timezone is at on a given instant, in minutes.
 *
 * `Intl` is the only way to ask without a timezone library, and this is the standard shape: format
 * the instant in the target zone, read it back as if it were UTC, and take the difference. It
 * handles daylight saving correctly because the answer is computed **at the instant in question**
 * rather than from a fixed offset — which is exactly the mistake a stored offset would make for a
 * conference spanning a transition.
 */
const offsetMinutesAt = (instant: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour'),
    at('minute'),
    at('second'),
  )

  return (asUtc - instant.getTime()) / 60_000
}

/**
 * A venue-local wall time (`2027-03-01T09:00`) as an absolute instant.
 *
 * Two passes, and the second is not redundant: the first guess uses the offset at the *UTC*
 * reading of the wall time, which is wrong for an instant that falls the other side of a daylight
 * transition. Re-computing the offset at the corrected instant converges for every real zone.
 */
const instantOf = (wallTime: string, timezone: string): string => {
  const naive = new Date(`${wallTime}:00Z`)
  const firstGuess = new Date(naive.getTime() - offsetMinutesAt(naive, timezone) * 60_000)
  const corrected = new Date(naive.getTime() - offsetMinutesAt(firstGuess, timezone) * 60_000)
  return corrected.toISOString()
}

/** The inverse, for populating the form when editing. */
const wallTimeOf = (iso: string, timezone: string): string => {
  const instant = new Date(iso)
  const local = new Date(instant.getTime() + offsetMinutesAt(instant, timezone) * 60_000)
  return local.toISOString().slice(0, 16)
}

export interface SessionFormProps {
  readonly programme: AdminProgramme
  /** The session being edited, or null to add a new one. */
  readonly session: AdminSession | null
  readonly busy: boolean
  readonly failure: string | null
  readonly warnings: readonly string[]
  readonly onSubmit: (input: AdminSessionInput) => void
  readonly onCancel: () => void
}

export const SessionForm = ({
  programme,
  session,
  busy,
  failure,
  warnings,
  onSubmit,
  onCancel,
}: SessionFormProps) => {
  const ids = {
    title: useId(),
    summary: useId(),
    starts: useId(),
    ends: useId(),
    track: useId(),
    room: useId(),
    speakers: useId(),
  }

  const timezone = programme.conference.timezone

  const [title, setTitle] = useState(session?.title ?? '')
  const [summary, setSummary] = useState(session?.summary ?? '')
  const [startsAt, setStartsAt] = useState(
    session ? wallTimeOf(session.startsAt, timezone) : `${programme.conference.startsOn}T09:00`,
  )
  const [endsAt, setEndsAt] = useState(
    session ? wallTimeOf(session.endsAt, timezone) : `${programme.conference.startsOn}T10:00`,
  )
  const [trackId, setTrackId] = useState(session?.trackId ?? programme.tracks[0]?.id ?? '')
  const [roomId, setRoomId] = useState(session?.roomId ?? programme.rooms[0]?.id ?? '')
  const [speakerIds, setSpeakerIds] = useState<readonly string[]>(session?.speakerIds ?? [])

  /**
   * Why the form cannot be submitted, or null.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **A DISABLED CONTROL, NEVER A POST-SUBMIT ERROR** — `requirements.md`'s treatment for the
   * empty meeting topic and the empty message, and the same shape here. The reason is stated
   * beside the control rather than after an attempt, so the organizer can see what is missing.
   *
   * The day-range rule is deliberately **not** among these. It needs the venue's timezone applied
   * to a date range, which is exactly what the server does — and a second implementation of it
   * here is a second place to be wrong. The server's refusal names the rule, and that is what is
   * shown.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const blocked = ((): string | null => {
    if (title.trim().length === 0) return 'A session needs a title.'
    if (programme.tracks.length === 0) return 'Add a track first — a session must belong to one.'
    if (programme.rooms.length === 0) return 'Add a room first — a session must be somewhere.'
    if (!trackId || !roomId) return 'Choose a track and a room.'
    if (!(new Date(`${endsAt}:00Z`).getTime() > new Date(`${startsAt}:00Z`).getTime())) {
      return 'The end must be after the start.'
    }
    return null
  })()

  return (
    <form
      className="mt-4 rounded-2xl border border-border-subtle bg-surface-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked) return
        onSubmit({
          title: title.trim(),
          summary: summary.trim() === '' ? null : summary.trim(),
          startsAt: instantOf(startsAt, timezone),
          endsAt: instantOf(endsAt, timezone),
          trackId,
          roomId,
          speakerIds,
        })
      }}
    >
      <h3 className="font-semibold text-text-primary">
        {session ? 'Edit session' : 'Add a session'}
      </h3>

      {failure ? (
        // The **server's** explanation, not a generic one. See the header.
        <p role="alert" className="mt-3 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      {warnings.includes('room_overlap') ? (
        /*
          FR-1016 — permitted, and warned about. Conferences genuinely overlap sessions during
          changeover, so a refusal would be a rule the product invented. `status` rather than
          `alert`: it is advice about something that already succeeded.
        */
        <p
          role="status"
          className="mt-3 rounded-lg bg-warning-100 px-3 py-2 text-sm text-warning-700"
        >
          Another session is already in that room at an overlapping time. That is allowed — check it
          is what you meant.
        </p>
      ) : null}

      <div className="mt-3">
        <label htmlFor={ids.title} className="text-sm font-medium text-text-primary">
          Title
        </label>
        <input
          id={ids.title}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={field}
        />
      </div>

      <div className="mt-3">
        <label htmlFor={ids.summary} className="text-sm font-medium text-text-primary">
          Summary
        </label>
        <textarea
          id={ids.summary}
          value={summary}
          rows={2}
          onChange={(event) => setSummary(event.target.value)}
          className={field}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.starts} className="text-sm font-medium text-text-primary">
            Starts ({timezone})
          </label>
          <input
            id={ids.starts}
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={ids.ends} className="text-sm font-medium text-text-primary">
            Ends ({timezone})
          </label>
          <input
            id={ids.ends}
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.track} className="text-sm font-medium text-text-primary">
            Track
          </label>
          <select
            id={ids.track}
            value={trackId}
            onChange={(event) => setTrackId(event.target.value)}
            className={field}
          >
            {programme.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.room} className="text-sm font-medium text-text-primary">
            Room
          </label>
          <select
            id={ids.room}
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className={field}
          >
            {programme.rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/*
        Speakers are optional (FR-138), so this is a set of checkboxes rather than a required
        select. A session with none renders completely on the attendee side — there is no empty
        region and no placeholder name.
      */}
      <fieldset className="mt-3">
        <legend id={ids.speakers} className="text-sm font-medium text-text-primary">
          Speakers
        </legend>
        {programme.speakers.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">No speakers yet. A session may have none.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-3">
            {programme.speakers.map((speaker) => (
              <label key={speaker.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={speakerIds.includes(speaker.id)}
                  onChange={(event) =>
                    setSpeakerIds((current) =>
                      event.target.checked
                        ? [...current, speaker.id]
                        : current.filter((id) => id !== speaker.id),
                    )
                  }
                />
                {speaker.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {blocked ? <p className="mt-3 text-sm text-text-muted">{blocked}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy || blocked !== null}
          className="min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50"
        >
          {session ? 'Save changes' : 'Add session'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg px-3 text-sm font-medium text-text-body hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
