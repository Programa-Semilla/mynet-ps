import type { AdminProgramme, ConferenceFormat, ConferenceModality } from '@mynet/data'
import { useId, useState } from 'react'

import { FORMAT_LABELS, FORMATS, MODALITIES, MODALITY_LABELS } from './event-type-options.js'

/**
 * T190 (014 tranche 2) — **the conference editor** (FR-1059, FR-1059a, SC-1023).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE UPDATE PATH EXISTED END TO END AND HAD NO CALLER, SO EVERY VALUE CHOSEN AT CREATION WAS
 * PERMANENTLY UNCORRECTABLE.**
 *
 * Research R20 verified it: route, query, interface, HTTP repository and even the client-side
 * refusal copy for all four of `patchConference`'s refusals shipped in tranche 1 — and
 * `grep` found no caller in `apps/admin/src`, with the test harness marking the method
 * `unexpected(...)` so calling it failed a test. `timezoneEditable`, computed by the server
 * specifically so a control could be disabled, was read by nothing in either client. This
 * component is the caller; the same defect class this feature corrected once already, where a
 * mistyped room name could not be renamed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **MODALITY AND FORMAT ARE OFFERED AS THE CLOSED SETS THE CONTRACT DECLARES** (FR-1046,
 * FR-1047) — `TrackColorToken`'s discipline: the option lists live once, in
 * `event-type-options.ts`, typed against `ConferenceModality` and `ConferenceFormat`, which
 * derive from the generated contract, which the server's constants generate. The create
 * dialog consumes the same module, so the one hand-typed copy that existed to drift is gone.
 *
 * A modality change the programme cannot satisfy is refused SERVER-side, naming the sessions
 * (FR-1059a, `modality_conflicts_sessions`); this form deliberately does not pre-compute that
 * refusal, because the session list on screen may be stale and the server's list is the one
 * that refused. Hybrid being the transitional value is taught by the refusal copy at the
 * moment an organizer meets the rule. A format change is always permitted — nothing branches
 * on it (FR-1047), so there is nothing to check.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The timezone control is disabled exactly when the server would refuse it** (FR-1015), read
 * from `timezoneEditable` — surfaced by the server so the control matches what the server will
 * do, rather than the client re-deriving the freeze from the session list.
 */

const field =
  'mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

// The closed sets and their labels come from `event-type-options.ts`, shared with
// `CreateConferenceDialog` so one drift cannot open between the two surfaces that offer them.
// The arrays catch a value removed server-side; the `Record`s catch one added — the property
// `_ModalityIsClosed` pins from the other side.

export interface ConferencePatchInput {
  readonly name: string
  readonly location: string
  readonly startsOn: string
  readonly endsOn: string
  readonly timezone: string
  readonly modality: ConferenceModality
  readonly format: ConferenceFormat | null
}

export interface ConferenceEditorProps {
  readonly conference: AdminProgramme['conference']
  readonly busy: boolean
  /** The server's explanation, classified on `error.code` by the caller — never generic. */
  readonly failure: string | null
  readonly onSubmit: (input: ConferencePatchInput) => void
  readonly onCancel: () => void
}

export const ConferenceEditor = ({
  conference,
  busy,
  failure,
  onSubmit,
  onCancel,
}: ConferenceEditorProps) => {
  const ids = {
    name: useId(),
    location: useId(),
    startsOn: useId(),
    endsOn: useId(),
    timezone: useId(),
    modality: useId(),
    format: useId(),
  }

  const [name, setName] = useState(conference.name)
  const [location, setLocation] = useState(conference.location)
  const [startsOn, setStartsOn] = useState(conference.startsOn)
  const [endsOn, setEndsOn] = useState(conference.endsOn)
  const [timezone, setTimezone] = useState(conference.timezone)
  const [modality, setModality] = useState<ConferenceModality>(conference.modality)
  const [format, setFormat] = useState<ConferenceFormat | ''>(conference.format ?? '')

  // A disabled control while the form is incomplete, never a post-submit error. The rules that
  // need the venue's timezone or the session list — the day-range orphan check, the modality's
  // programme check — stay server-side, and the server's refusal is what renders above.
  const blocked = ((): string | null => {
    if (name.trim().length === 0) return 'A conference needs a name.'
    if (location.trim().length === 0) return 'A conference needs a location.'
    if (startsOn === '' || endsOn === '') return 'Give it a first and a last day.'
    if (endsOn < startsOn) return 'The last day cannot be before the first.'
    if (timezone.trim().length === 0) return 'A conference needs a venue timezone.'
    return null
  })()

  return (
    <form
      className="mt-4 rounded-2xl border border-border-subtle bg-surface-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked) return
        onSubmit({
          name: name.trim(),
          location: location.trim(),
          startsOn,
          endsOn,
          timezone: timezone.trim(),
          modality,
          format: format === '' ? null : format,
        })
      }}
    >
      <h3 className="font-semibold text-text-primary">Edit conference</h3>

      {failure ? (
        // The server's explanation — a refused modality change NAMES the sessions in the way
        // (FR-1059a) and says hybrid is the route, which no generic sentence could.
        <p role="alert" className="mt-3 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      <div className="mt-3">
        <label htmlFor={ids.name} className="text-sm font-medium text-text-primary">
          Name
        </label>
        <input
          id={ids.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={field}
        />
      </div>

      <div className="mt-3">
        <label htmlFor={ids.location} className="text-sm font-medium text-text-primary">
          Location
        </label>
        <input
          id={ids.location}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className={field}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.startsOn} className="text-sm font-medium text-text-primary">
            First day
          </label>
          <input
            id={ids.startsOn}
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={ids.endsOn} className="text-sm font-medium text-text-primary">
            Last day
          </label>
          <input
            id={ids.endsOn}
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            className={field}
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={ids.timezone} className="text-sm font-medium text-text-primary">
          Venue timezone
        </label>
        <input
          id={ids.timezone}
          value={timezone}
          disabled={!conference.timezoneEditable}
          onChange={(event) => setTimezone(event.target.value)}
          className={`${field} disabled:opacity-50`}
          aria-describedby={`${ids.timezone}-note`}
        />
        {/*
          FR-1015 — the control is disabled for the same reason the server would refuse: every
          session time is stored as an absolute instant, so changing the zone now would move
          what everybody sees without moving anything. Said beside the control, so the state is
          explained rather than mute.
        */}
        <p id={`${ids.timezone}-note`} className="mt-1 text-xs text-text-muted">
          {conference.timezoneEditable
            ? 'An IANA name, e.g. Europe/Madrid. It freezes once the conference has a session.'
            : 'Frozen — the conference has sessions, and their times are stored as absolute instants.'}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.modality} className="text-sm font-medium text-text-primary">
            Modality
          </label>
          <select
            id={ids.modality}
            value={modality}
            onChange={(event) => setModality(event.target.value as ConferenceModality)}
            className={field}
            aria-describedby={`${ids.modality}-note`}
          >
            {MODALITIES.map((value) => (
              <option key={value} value={value}>
                {MODALITY_LABELS[value]}
              </option>
            ))}
          </select>
          {/*
            FR-1059a — hybrid as the transitional value, said where the choice is made: it is
            the only modality satisfied by both room-only and link-only sessions, so every move
            between in-person and virtual routes through it.
          */}
          <p id={`${ids.modality}-note`} className="mt-1 text-xs text-text-muted">
            A change is refused while any session carries the wrong thing for it. Moving between in
            person and virtual goes through hybrid, which permits both.
          </p>
        </div>
        <div>
          <label htmlFor={ids.format} className="text-sm font-medium text-text-primary">
            Format
          </label>
          <select
            id={ids.format}
            value={format}
            onChange={(event) => setFormat(event.target.value as ConferenceFormat | '')}
            className={field}
          >
            {/* Optional (FR-1047), so the empty choice is first-class rather than absent. */}
            <option value="">No format</option>
            {FORMATS.map((value) => (
              <option key={value} value={value}>
                {FORMAT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {blocked ? <p className="mt-3 text-sm text-text-muted">{blocked}</p> : null}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy || blocked !== null}
          className="min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50"
        >
          Save changes
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
