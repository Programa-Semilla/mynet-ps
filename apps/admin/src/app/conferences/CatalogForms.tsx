import type { AdminRoom, AdminSpeaker, AdminTrack } from '@mynet/data'
import { useId, useState } from 'react'

/**
 * T038 (014) — tracks, rooms and speakers (FR-1001, FR-1004).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE TRACK COLOUR IS A TOKEN PICKER AND NEVER A FREE COLOUR INPUT** (FR-1004).
 *
 * 002 stores a token **name** rather than a colour value, on the reasoning that a colour would put
 * the palette in two places and let a data change alter the design system without touching the
 * design system. That held trivially while the only writer was a reviewed seed; it stops holding
 * the moment an organizer types into a form.
 *
 * There is deliberately no `<input type="color">` anywhere in this product, and the picker offers
 * exactly the four tokens the theme defines. `track-unknown` is **not** among them: it is the
 * defined neutral an unrecognised token degrades to, so offering it would let somebody choose the
 * fallback on purpose and make a real typo indistinguishable from a decision.
 *
 * The server refuses anything else with a 400 naming the permitted set, and the query layer
 * narrows the type a third time — three layers, because 009 found two that were assumed to agree
 * and did not.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The four tokens, with the words a person reads. Mirrors `TRACK_COLOR_TOKENS` on the server. */
const TRACK_TOKENS: readonly { token: string; label: string }[] = [
  { token: 'track-design', label: 'Design' },
  { token: 'track-product', label: 'Product' },
  { token: 'track-tech', label: 'Tech' },
  { token: 'track-keynote', label: 'Keynote' },
]

const field =
  'mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

const primary =
  'min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50'

const quiet =
  'min-h-11 rounded-lg px-2 text-xs font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

interface SectionProps {
  readonly busy: boolean
  readonly onFailure: (error: unknown) => void
}

/**
 * The tracks section.
 *
 * **The add control is disabled while the name is empty**, never an error afterwards — the
 * treatment `requirements.md` names for the empty meeting topic and the empty message, applied to
 * every field in this product. The server refuses a blank name too; presenting the rule is not
 * enforcing it.
 */
export const TrackSection = ({
  tracks,
  busy,
  onFailure,
  onCreate,
  onDelete,
}: SectionProps & {
  tracks: readonly AdminTrack[]
  onCreate: (input: { name: string; colorToken: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) => {
  const nameId = useId()
  const colourId = useId()
  const [name, setName] = useState('')
  const [colorToken, setColorToken] = useState(TRACK_TOKENS[0]?.token ?? 'track-design')

  const add = async () => {
    try {
      await onCreate({ name: name.trim(), colorToken })
      setName('')
    } catch (error) {
      onFailure(error)
    }
  }

  return (
    <section aria-labelledby={`${nameId}-heading`} className="mt-6">
      <h3 id={`${nameId}-heading`} className="font-semibold text-text-primary">
        Tracks
      </h3>

      {tracks.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">
          No tracks yet. A session needs one, so add the first before scheduling anything.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {tracks.map((track) => (
            <li key={track.id} className="flex items-center gap-2 text-sm">
              <span className="text-text-primary">{track.name}</span>
              {/* The token NAME, not a swatch: colour is never the sole carrier of meaning. */}
              <span className="text-xs text-text-muted">{track.colorToken}</span>
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => {
                  void onDelete(track.id).catch(onFailure)
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor={nameId} className="text-sm font-medium text-text-primary">
            Track name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={colourId} className="text-sm font-medium text-text-primary">
            Colour
          </label>
          <select
            id={colourId}
            value={colorToken}
            onChange={(event) => setColorToken(event.target.value)}
            className={field}
          >
            {TRACK_TOKENS.map((option) => (
              <option key={option.token} value={option.token}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={primary}
          disabled={busy || name.trim().length === 0}
          onClick={() => void add()}
        >
          Add track
        </button>
      </div>
    </section>
  )
}

export const RoomSection = ({
  rooms,
  busy,
  onFailure,
  onCreate,
  onDelete,
}: SectionProps & {
  rooms: readonly AdminRoom[]
  onCreate: (input: { name: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) => {
  const nameId = useId()
  const [name, setName] = useState('')

  return (
    <section aria-labelledby={`${nameId}-heading`} className="mt-6">
      <h3 id={`${nameId}-heading`} className="font-semibold text-text-primary">
        Rooms
      </h3>

      {rooms.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">
          No rooms yet. A session needs one, so add the first before scheduling anything.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rooms.map((room) => (
            <li key={room.id} className="flex items-center gap-2 text-sm">
              <span className="text-text-primary">{room.name}</span>
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => {
                  void onDelete(room.id).catch(onFailure)
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor={nameId} className="text-sm font-medium text-text-primary">
            Room name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={field}
          />
        </div>
        <button
          type="button"
          className={primary}
          disabled={busy || name.trim().length === 0}
          onClick={() => {
            void onCreate({ name: name.trim() })
              .then(() => setName(''))
              .catch(onFailure)
          }}
        >
          Add room
        </button>
      </div>
    </section>
  )
}

/**
 * The speakers section.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **NOTHING HERE LEADS TO A PROFILE, AND THAT ABSENCE IS FR-1006.**
 *
 * A speaker is conference content describing a real person who may or may not also hold an
 * attendee account. Where the same human holds both, editing this changes the programme and
 * changes nothing about them — *conference content is authorable, a person is not* (decision 33).
 * There is no link, no lookup and no "find this attendee" control, and
 * `profile-uneditable.test.ts` asserts that over the whole administrative surface.
 *
 * Register entry 28 records the open question this leaves: these rows are personal data about
 * somebody who never signed up, and 014 moves responsibility for them from a reviewed commit to a
 * promoted attendee typing into this form.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const SpeakerSection = ({
  speakers,
  busy,
  onFailure,
  onCreate,
  onDelete,
}: SectionProps & {
  speakers: readonly AdminSpeaker[]
  onCreate: (input: { name: string; title: string | null; company: string | null }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) => {
  const nameId = useId()
  const titleId = useId()
  const companyId = useId()
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')

  return (
    <section aria-labelledby={`${nameId}-heading`} className="mt-6">
      <h3 id={`${nameId}-heading`} className="font-semibold text-text-primary">
        Speakers
      </h3>

      {speakers.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">
          No speakers yet. A session may have none, so this is optional.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {speakers.map((speaker) => (
            <li key={speaker.id} className="flex items-center gap-2 text-sm">
              <span className="text-text-primary">{speaker.name}</span>
              {speaker.company ? (
                <span className="text-xs text-text-muted">{speaker.company}</span>
              ) : null}
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => {
                  void onDelete(speaker.id).catch(onFailure)
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor={nameId} className="text-sm font-medium text-text-primary">
            Speaker name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={field}
          />
        </div>
        <div className="min-w-32 flex-1">
          <label htmlFor={titleId} className="text-sm font-medium text-text-primary">
            Title
          </label>
          <input
            id={titleId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={field}
          />
        </div>
        <div className="min-w-32 flex-1">
          <label htmlFor={companyId} className="text-sm font-medium text-text-primary">
            Company
          </label>
          <input
            id={companyId}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className={field}
          />
        </div>
        <button
          type="button"
          className={primary}
          disabled={busy || name.trim().length === 0}
          onClick={() => {
            void onCreate({
              name: name.trim(),
              title: title.trim() === '' ? null : title.trim(),
              company: company.trim() === '' ? null : company.trim(),
            })
              .then(() => {
                setName('')
                setTitle('')
                setCompany('')
              })
              .catch(onFailure)
          }}
        >
          Add speaker
        </button>
      </div>
    </section>
  )
}
