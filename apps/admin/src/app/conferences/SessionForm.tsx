import type { AdminProgramme, AdminSession, AdminSessionInput } from '@mynet/data'
import { useId, useState } from 'react'

import { instantOf, wallTimeOf } from './venue-time.js'

/**
 * T037 (014), T141/T192 (014 tranche 2) — the session form (FR-1001, FR-1005, FR-1012,
 * FR-1013, FR-1016, FR-1050a, FR-1053, FR-1055, FR-1060–FR-1062a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE CLIENT MIRRORS THE SERVER'S VALIDATION AND IS NEVER THE ENFORCEMENT OF IT.**
 *
 * Every rule checked here is checked again server-side — end after start, inside the
 * conference's days in the **venue's** timezone, a track and room belonging to this conference,
 * the kind/bounds pairing (FR-1062a), the `https:`-only access link (FR-1053), and the
 * modality's room-or-link rule (FR-1050a). Presenting a rule is not enforcing it (Principle
 * VIII); the reason for mirroring at all is that a refusal arriving after the organizer has
 * typed a title, a summary and two times is a worse experience than a control that will not
 * submit.
 *
 * **Where the two disagree, the server wins and its explanation is what is shown.**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHICH FIELDS EXIST IS DECIDED BY THE CONFERENCE'S MODALITY AND THE SESSION'S KIND, NEVER
 * PRESENTED AND IGNORED** (FR-1050a, FR-1062a).
 *
 * A field that is meaningless on the thing being edited is a field somebody will fill in. So:
 * capacity and the closing offset render **only** while the kind is optional; the room renders
 * only where the modality permits one (in-person and hybrid); the access link renders only
 * where the modality permits one (virtual and hybrid). An in-person conference's form has no
 * link field at all — the absence is the presentation of FR-1050a's forbidding half.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE TIMES ARE ENTERED IN THE VENUE'S TIMEZONE AND SENT AS ABSOLUTE INSTANTS** (FR-124).
 *
 * An organizer in another city scheduling a 09:00 keynote means 09:00 **at the venue**, and a
 * `datetime-local` input reads the *browser's* zone. So the wall time typed here is interpreted
 * against `conference.timezone` before it is sent, and the field is labelled with the zone so
 * nobody has to guess which clock they are looking at.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The remount key**: every field initialises with `useState(session?.… ?? default)`, which
 * runs only on mount, so `ProgrammeEditor` keys this component on what is being edited. The
 * tranche-2 fields inherit that contract — a new field initialised any other way would survive
 * a change of subject and write one session's bounds onto another.
 */

const field =
  'mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

/*
 * `instantOf` and `wallTimeOf` were private to this file, and that is what let the programme list
 * one component over grow its own answer — it rendered the raw UTC instants. They live in
 * `venue-time.ts` now, beside the display formatter the list needed.
 */

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

/** A whole number parsed from a text field, or null for anything else. */
const wholeNumberOf = (value: string): number | null => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && value.trim() !== '' ? parsed : null
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
    kind: useId(),
    capacity: useId(),
    offset: useId(),
    link: useId(),
  }

  const timezone = programme.conference.timezone
  const modality = programme.conference.modality

  // FR-1050a — which of the two attendance fields this conference's sessions may carry.
  const offersRoom = modality !== 'virtual'
  const offersLink = modality !== 'in-person'

  const [title, setTitle] = useState(session?.title ?? '')
  const [summary, setSummary] = useState(session?.summary ?? '')
  const [startsAt, setStartsAt] = useState(
    session ? wallTimeOf(session.startsAt, timezone) : `${programme.conference.startsOn}T09:00`,
  )
  const [endsAt, setEndsAt] = useState(
    session ? wallTimeOf(session.endsAt, timezone) : `${programme.conference.startsOn}T10:00`,
  )
  const [trackId, setTrackId] = useState(session?.trackId ?? programme.tracks[0]?.id ?? '')
  const [roomId, setRoomId] = useState(
    session ? (session.roomId ?? '') : offersRoom ? (programme.rooms[0]?.id ?? '') : '',
  )
  const [speakerIds, setSpeakerIds] = useState<readonly string[]>(session?.speakerIds ?? [])
  // T141 — the kind and, while optional, its two bounds (FR-1060–FR-1062). Text state, parsed
  // at validation, so a half-typed number is "not yet valid" rather than a NaN in flight.
  const [kind, setKind] = useState<'mandatory' | 'optional'>(session?.kind ?? 'mandatory')
  const [capacity, setCapacity] = useState(
    session?.capacity === null ? '' : String(session?.capacity ?? ''),
  )
  const [offset, setOffset] = useState(
    session?.enrolmentClosingOffsetHours === null
      ? ''
      : String(session?.enrolmentClosingOffsetHours ?? ''),
  )
  const [accessLink, setAccessLink] = useState(session?.accessLink ?? '')

  const trimmedLink = accessLink.trim()
  const linkValue = offersLink && trimmedLink !== '' ? trimmedLink : null
  const roomValue = offersRoom && roomId !== '' ? roomId : null

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
    if (!trackId) return 'Choose a track.'
    // FR-1050a, mirrored: which of room and link this session must carry follows the
    // conference's modality, and the reason renders beside the disabled control.
    if (modality === 'in-person') {
      if (programme.rooms.length === 0) return 'Add a room first — a session must be somewhere.'
      if (roomValue === null) return 'Choose a room — this conference is in person.'
    }
    if (modality === 'virtual' && linkValue === null) {
      return 'Give it a joining link — this conference is virtual.'
    }
    if (modality === 'hybrid' && roomValue === null && linkValue === null) {
      return 'Give it a room, a joining link, or both — with neither, nobody can attend.'
    }
    // FR-1053, mirrored: https: alone, well-formedness and scheme only. Never fetched.
    if (linkValue !== null && !isHttpsUrl(linkValue)) {
      return 'The joining link must be a complete https:// address.'
    }
    if (kind === 'optional') {
      const places = wholeNumberOf(capacity)
      if (places === null || places < 1) {
        return 'An optional session needs a maximum number of places — a whole number of at least one.'
      }
      const hours = wholeNumberOf(offset)
      if (hours === null || hours < 0) {
        return 'An optional session needs a closing offset — whole hours before it starts; zero keeps enrolment open until it begins.'
      }
    }
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
          roomId: roomValue,
          accessLink: linkValue,
          speakerIds,
          kind,
          // FR-1062a — a mandatory session carries neither bound, whatever the fields held
          // before the organizer switched the kind back.
          capacity: kind === 'optional' ? wholeNumberOf(capacity) : null,
          enrolmentClosingOffsetHours: kind === 'optional' ? wholeNumberOf(offset) : null,
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
        {/*
          FR-1050a — the room renders only where the modality permits one. On a hybrid
          conference it gains an explicit "No room" choice, because a link-only session is a
          legitimate hybrid session; on an in-person conference the empty choice is absent, as
          the rule it would violate is.
        */}
        {offersRoom ? (
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
              {modality === 'hybrid' ? <option value="">No room (link only)</option> : null}
              {programme.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/*
        T192 (FR-1055) — where the link is typed, the organizer is told what writing it does.
        Helper text rather than a dialog: the disclosure has to be read BEFORE the act, and a
        confirmation after typing would interrupt the ordinary case to say something that is
        true of every save. Stated because a joining link reads like something private and is
        not — there is no draft state (N4), so there is no moment between writing and
        publishing.
      */}
      {offersLink ? (
        <div className="mt-3">
          <label htmlFor={ids.link} className="text-sm font-medium text-text-primary">
            Joining link{modality === 'hybrid' ? ' (optional)' : ''}
          </label>
          <input
            id={ids.link}
            type="url"
            value={accessLink}
            placeholder="https://…"
            onChange={(event) => setAccessLink(event.target.value)}
            className={field}
            aria-describedby={`${ids.link}-disclosure`}
          />
          <p id={`${ids.link}-disclosure`} className="mt-1 text-xs text-text-muted">
            Published immediately to everyone holding this conference’s join code — there is no
            draft state and no reveal time. Only https:// addresses are accepted.
          </p>
        </div>
      ) : null}

      <div className="mt-3">
        <label htmlFor={ids.kind} className="text-sm font-medium text-text-primary">
          Kind
        </label>
        <select
          id={ids.kind}
          value={kind}
          onChange={(event) => setKind(event.target.value as 'mandatory' | 'optional')}
          className={field}
        >
          <option value="mandatory">Mandatory — attendees save it</option>
          <option value="optional">
            Optional — attendees take one of a limited number of places
          </option>
        </select>
      </div>

      {/*
        T141 (FR-1062a) — present ONLY while the kind is optional. A capacity field on a
        mandatory session is a field somebody will fill in, and the server refuses exactly that
        with `mandatory_carries_no_places`.
      */}
      {kind === 'optional' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.capacity} className="text-sm font-medium text-text-primary">
              Maximum places
            </label>
            <input
              id={ids.capacity}
              type="number"
              min={1}
              step={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor={ids.offset} className="text-sm font-medium text-text-primary">
              Enrolment closes (hours before start)
            </label>
            <input
              id={ids.offset}
              type="number"
              min={0}
              step={1}
              value={offset}
              onChange={(event) => setOffset(event.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-text-muted">
              Zero keeps enrolment open until the session begins.
            </p>
          </div>
        </div>
      ) : null}

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

/**
 * FR-1053's mirror: well-formedness and scheme, nothing else, and the link is never followed.
 * The server's check is the enforcement; this exists so the reason renders beside the disabled
 * control instead of arriving as a refusal.
 */
const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
