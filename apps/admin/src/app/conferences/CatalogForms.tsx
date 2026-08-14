import type { AdminRoom, AdminSpeaker, AdminTrack, TrackColorToken } from '@mynet/data'
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

/**
 * The four tokens, with the words a person reads.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **BOUND TO THE GENERATED CONTRACT, BECAUSE THIS WAS A THIRD HAND-MAINTAINED COPY.**
 *
 * The set existed three times — `TRACK_COLOR_TOKENS` on the server, the `enum` in the route
 * schema, and this list — with `AdminTrack.colorToken` typed as bare `string` between them, so
 * nothing connected any copy to any other. The first two agree because one generates the other.
 * This one agreed because somebody typed it correctly.
 *
 * `Record<TrackColorToken, string>` is what binds it, and it fails in **both** directions at the
 * typecheck: adding a fifth token server-side makes this object missing a key, and removing one
 * makes it carry an excess. The previous shape — an array of `{ token: string }` — could not
 * notice either, and the failures were both silent at runtime: an organizer offered four choices
 * when there were five, or offered a value every write refuses with a 404, because
 * `isTrackColorToken` narrows before the query layer is reached.
 *
 * **The labels stay hand-written**, and that is the only part that should be: the contract carries
 * the token names, and what a person should read for each is a product decision that no schema
 * can supply. `track-unknown` remains absent by design — it is the neutral an unrecognised token
 * degrades to, so offering it would make a real typo indistinguishable from a choice.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const TRACK_LABELS: Record<TrackColorToken, string> = {
  'track-design': 'Design',
  'track-product': 'Product',
  'track-tech': 'Tech',
  'track-keynote': 'Keynote',
}

const TRACK_TOKENS = Object.entries(TRACK_LABELS).map(([token, label]) => ({
  token: token as TrackColorToken,
  label,
}))

const field =
  'mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

const primary =
  'min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50'

const quiet =
  'min-h-11 rounded-lg px-2 text-xs font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **INLINE EDITING, BECAUSE FR-1001's UPDATE VERB HAD NO SURFACE AT ALL.**
 *
 * FR-1001 requires an organizer to *"create, read, **update** and delete tracks, rooms, speakers and
 * sessions"*. Sessions had a form; the other three had create and delete only. `updateTrack`,
 * `updateRoom` and `updateSpeaker` existed on the repository and in the API with no caller — the
 * admin test harness even marked them `unexpected(...)`, so calling one *failed a test*, which is
 * how sure the suite was that nothing did.
 *
 * The consequence was concrete rather than theoretical: **a mistyped room name was uncorrectable.**
 * Renaming was unreachable, and FR-1017 refuses deletion while any session references the room — so
 * the only remedy was to move every session to another room, delete, recreate, and move them back.
 *
 * Inline rather than a dialog: these are one to three short fields, and a modal for a rename is a
 * heavier interaction than the edit deserves. The row keeps its place in the list, so the organizer
 * does not lose their position in a forty-row programme.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
interface EditableField {
  readonly key: string
  readonly label: string
  readonly value: string
  /** Blank is permitted for a speaker's title and company, which are nullable. */
  readonly optional?: boolean
  /**
   * A closed set, rendered as a `<select>` rather than as a text input.
   *
   * **The colour token needs this and FR-1004 is why.** The add control has always been a token
   * picker — "there is deliberately no `<input type=\"color\">` anywhere in this product, and the
   * picker offers exactly the four tokens the theme defines", as this file's header says. The
   * rename path arrived later and rendered every field as free text, so the one control that
   * exists to make an invalid token unreachable was reachable around: an organizer could type
   * `track-unknown`, or a typo, and get a 404 from a narrowing the client should never have let
   * them meet.
   */
  readonly options?: readonly { readonly token: string; readonly label: string }[]
}

const InlineEdit = ({
  what,
  fields,
  busy,
  onSave,
  onCancel,
}: {
  /** Names the subject in every accessible label — a list of these otherwise reads as "Save, Save". */
  what: string
  fields: readonly EditableField[]
  busy: boolean
  onSave: (values: Record<string, string>) => void
  onCancel: () => void
}) => {
  const groupId = useId()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((one) => [one.key, one.value])),
  )

  const incomplete = fields.some((one) => !one.optional && values[one.key]?.trim() === '')

  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={`Edit ${what}`}>
      {fields.map((one) => (
        <div key={one.key} className="min-w-32 flex-1">
          <label htmlFor={`${groupId}-${one.key}`} className="text-xs text-text-muted">
            {one.label}
          </label>
          {one.options ? (
            <select
              id={`${groupId}-${one.key}`}
              className={field}
              value={values[one.key] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [one.key]: event.target.value }))
              }
            >
              {one.options.map((option) => (
                <option key={option.token} value={option.token}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${groupId}-${one.key}`}
              className={field}
              value={values[one.key] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [one.key]: event.target.value }))
              }
            />
          )}
        </div>
      ))}

      {/*
        Disabled while a required field is blank — the same treatment as every add control here,
        and `requirements.md`'s rule: a disabled confirmation, never a post-submit error.
      */}
      <button
        type="button"
        className={primary}
        disabled={busy || incomplete}
        onClick={() => {
          onSave(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])))
        }}
      >
        Save {what}
      </button>
      <button type="button" className={quiet} disabled={busy} onClick={onCancel}>
        Cancel editing {what}
      </button>
    </div>
  )
}

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
  onRename,
  onDelete,
}: SectionProps & {
  tracks: readonly AdminTrack[]
  onCreate: (input: { name: string; colorToken: TrackColorToken }) => Promise<boolean>
  onRename: (id: string, input: { name: string; colorToken: TrackColorToken }) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}) => {
  const nameId = useId()
  const colourId = useId()
  const [name, setName] = useState('')
  const [colorToken, setColorToken] = useState(TRACK_TOKENS[0]?.token ?? 'track-design')
  const [editing, setEditing] = useState<string | null>(null)

  const add = async () => {
    // See the note at the room and speaker forms: `onCreate` reports acceptance, and the field is
    // cleared only then. The `try/catch` stays as a backstop for a future `onCreate` that throws.
    try {
      if (await onCreate({ name: name.trim(), colorToken })) setName('')
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
            <li key={track.id} className="flex flex-wrap items-center gap-2 text-sm">
              {editing === track.id ? (
                <InlineEdit
                  what={track.name}
                  busy={busy}
                  fields={[
                    { key: 'name', label: 'Name', value: track.name },
                    {
                      key: 'colorToken',
                      label: 'Colour token',
                      value: track.colorToken,
                      // A picker, not free text — see `EditableField.options`. FR-1004's rule is
                      // that an invalid token must be unreachable, and this path was reachable
                      // around the one control enforcing it.
                      options: TRACK_TOKENS,
                    },
                  ]}
                  onCancel={() => setEditing(null)}
                  onSave={(values) => {
                    void onRename(track.id, {
                      name: values.name as string,
                      // The `<select>` above can only produce a member of the closed set, and the
                      // server narrows again before the query layer. Three layers, which is what
                      // this file's header says the colour token gets.
                      colorToken: values.colorToken as TrackColorToken,
                    })
                      // Closed on acceptance only. `write` catches every error and resolves, so
                      // `.then` fires on a refusal too — the editor would close over an edit the
                      // server rejected, with the explanation appearing elsewhere on the page and
                      // the organizer's typing gone. Same shape as the create forms above.
                      .then((accepted) => {
                        if (accepted) setEditing(null)
                      })
                      .catch(onFailure)
                  }}
                />
              ) : (
                <>
                  <span className="text-text-primary">{track.name}</span>
                  {/* The token NAME, not a swatch: colour is never the sole carrier of meaning. */}
                  <span className="text-xs text-text-muted">{track.colorToken}</span>
                  {/* FR-1001's update verb. The name states the subject, because a list of these
                      otherwise announces as "Edit, Edit, Edit" to a screen reader. */}
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => setEditing(track.id)}
                  >
                    Edit {track.name}
                  </button>
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
                </>
              )}
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
            // `event.target.value` is `string` on every `<select>`, and the options here are
            // exactly `TRACK_TOKENS` — so the assertion is over a set the same expression builds.
            // The server narrows again with `isTrackColorToken` before the query layer is reached,
            // which is the layer that would catch this being wrong.
            onChange={(event) => setColorToken(event.target.value as TrackColorToken)}
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
  onRename,
  onDelete,
}: SectionProps & {
  rooms: readonly AdminRoom[]
  onCreate: (input: { name: string }) => Promise<boolean>
  onRename: (id: string, input: { name: string }) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}) => {
  const nameId = useId()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

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
            <li key={room.id} className="flex flex-wrap items-center gap-2 text-sm">
              {editing === room.id ? (
                <InlineEdit
                  what={room.name}
                  busy={busy}
                  fields={[{ key: 'name', label: 'Name', value: room.name }]}
                  onCancel={() => setEditing(null)}
                  onSave={(values) => {
                    void onRename(room.id, { name: values.name as string })
                      // Closed on acceptance only. `write` catches every error and resolves, so
                      // `.then` fires on a refusal too — the editor would close over an edit the
                      // server rejected, with the explanation appearing elsewhere on the page and
                      // the organizer's typing gone. Same shape as the create forms above.
                      .then((accepted) => {
                        if (accepted) setEditing(null)
                      })
                      .catch(onFailure)
                  }}
                />
              ) : (
                <>
                  <span className="text-text-primary">{room.name}</span>
                  {/*
                    FR-1001's update verb, and for a room it is the one that mattered most: a
                    mistyped room name was uncorrectable, because FR-1017 refuses deletion while
                    any session references it.
                  */}
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => setEditing(room.id)}
                  >
                    Edit {room.name}
                  </button>
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
                </>
              )}
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
            // ═══════════════════════════════════════════════════════════════════════════════
            // **CLEARED ON SUCCESS, NOT ON RESOLUTION** — 009's defect, on the organizer side.
            //
            // `onCreate` delegates to `ProgrammeEditor`'s `write`, which catches every error and
            // **never rejects**. So `.then(clear)` ran after a refusal too: a duplicate name, a
            // 429, or an expired administrative session wiped what the organizer had typed while a
            // failure banner appeared elsewhere on the page. The `.catch` was dead code for the
            // same reason.
            //
            // `onCreate` now reports whether the server accepted, which is the same repair 009
            // made when a refused question destroyed the attendee's typed text.
            // ═══════════════════════════════════════════════════════════════════════════════
            void onCreate({ name: name.trim() })
              .then((accepted) => {
                if (accepted) setName('')
              })
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
 * register entry 30 records the open question this leaves: these rows are personal data about
 * somebody who never signed up, and 014 moves responsibility for them from a reviewed commit to a
 * promoted attendee typing into this form.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const SpeakerSection = ({
  speakers,
  busy,
  onFailure,
  onCreate,
  onRename,
  onDelete,
}: SectionProps & {
  speakers: readonly AdminSpeaker[]
  onCreate: (input: {
    name: string
    title: string | null
    company: string | null
  }) => Promise<boolean>
  onRename: (
    id: string,
    input: { name: string; title: string | null; company: string | null },
  ) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}) => {
  const nameId = useId()
  const [editing, setEditing] = useState<string | null>(null)
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
            <li key={speaker.id} className="flex flex-wrap items-center gap-2 text-sm">
              {editing === speaker.id ? (
                <InlineEdit
                  what={speaker.name}
                  busy={busy}
                  fields={[
                    { key: 'name', label: 'Name', value: speaker.name },
                    // Nullable on the record, so blank is a legitimate value rather than an
                    // incomplete form — `optional` is what stops the Save control disabling on it.
                    { key: 'title', label: 'Title', value: speaker.title ?? '', optional: true },
                    {
                      key: 'company',
                      label: 'Company',
                      value: speaker.company ?? '',
                      optional: true,
                    },
                  ]}
                  onCancel={() => setEditing(null)}
                  onSave={(values) => {
                    void onRename(speaker.id, {
                      name: values.name as string,
                      // Blank means absent, matching what the create form sends and what the
                      // column holds. An empty string would be a third state nothing reads.
                      title: values.title === '' ? null : (values.title as string),
                      company: values.company === '' ? null : (values.company as string),
                    })
                      // Closed on acceptance only. `write` catches every error and resolves, so
                      // `.then` fires on a refusal too — the editor would close over an edit the
                      // server rejected, with the explanation appearing elsewhere on the page and
                      // the organizer's typing gone. Same shape as the create forms above.
                      .then((accepted) => {
                        if (accepted) setEditing(null)
                      })
                      .catch(onFailure)
                  }}
                />
              ) : (
                <>
                  <span className="text-text-primary">{speaker.name}</span>
                  {speaker.company ? (
                    <span className="text-xs text-text-muted">{speaker.company}</span>
                  ) : null}
                  {/*
                    FR-1001's update verb — and still **not** a route to a profile (FR-1006). This
                    edits conference content describing a person; where the same human holds an
                    attendee account, nothing here touches it. `profile-uneditable.test.ts` asserts
                    that over the whole administrative surface.
                  */}
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => setEditing(speaker.id)}
                  >
                    Edit {speaker.name}
                  </button>
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
                </>
              )}
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
              .then((accepted) => {
                // Success only — see the note at the room form. Three fields here, so a refusal
                // that cleared them destroyed three pieces of typing rather than one.
                if (!accepted) return
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
