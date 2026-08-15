import type { ConferenceFormat, ConferenceModality } from '@mynet/data'
import { useId, useState } from 'react'

import { classify, describe, detailOf } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'
import { FORMAT_LABELS, FORMATS, MODALITIES, MODALITY_LABELS } from './event-type-options.js'

/**
 * T086, T087 (014) — creating a conference (FR-1007, FR-1008, FR-1009, FR-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **RENDERED FOR BOTH TIERS, WHICH MAKES IT THE ONLY CONTROL IN THIS PRODUCT THAT IS.**
 *
 * Every other control on the conference list is platform-tier only, and `ConferenceList` hides
 * them from an organizer so they are never offered a door that answers "there is nothing here".
 * This one is different by constitution: v5.2.0's N3 makes creating a conference **the one
 * product-wide capability a conference organizer holds**, stated rather than inferred because
 * decision 32's *"authority reaches only the conferences they are assigned"* cannot describe the
 * act of creating one.
 *
 * Two bounds keep that clause true in substance, and neither is this component's to enforce:
 * authority over a conference they did **not** create still comes only from assignment, and
 * creating is **not a promotion path** — it grants no platform capability and no route to promote
 * anybody. Both are server-side (FR-1010).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE JOIN CODE IS SHOWN ON SUCCESS, AND SHOWING IT IS THE POINT** (FR-1009).
 *
 * A conference nobody can join is a conference nobody attends, and 015 owns code management —
 * rotating, revoking, viewing — so this is the **one moment** the code is presented. Closing
 * without reading it means finding it on the programme editor, which is why it is also there.
 *
 * It is not a credential (`schema/events.ts` says so at length): possessing one gets registration
 * and nothing else, and it is committed in the seed of a public repository.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const field =
  'mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500'

export interface CreateConferenceDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onCreated: () => void
}

export const CreateConferenceDialog = ({
  open,
  onClose,
  onCreated,
}: CreateConferenceDialogProps) => {
  const { services } = useAdminSession()
  const ids = {
    name: useId(),
    location: useId(),
    startsOn: useId(),
    endsOn: useId(),
    timezone: useId(),
    modality: useId(),
    format: useId(),
  }

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  // T191 (FR-1059b, FR-1048) — NO default, deliberately: the empty value is "nobody chose",
  // and the form will not submit until somebody does. Defaulting to in-person here would be
  // FR-1048's silent default reintroduced one layer up from the column that dropped it.
  const [modality, setModality] = useState<ConferenceModality | ''>('')
  const [format, setFormat] = useState<ConferenceFormat | ''>('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)

  const blocked =
    name.trim().length === 0 ||
    location.trim().length === 0 ||
    startsOn === '' ||
    endsOn === '' ||
    endsOn < startsOn ||
    timezone.trim().length === 0 ||
    modality === ''

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **ONE DISMISSAL, BECAUSE THREE CLOSE PATHS RESET THREE DIFFERENT THINGS.**
   *
   * `AdminDialog` renders its children whether or not it is open and **never unmounts**, so every
   * piece of state here survives a close and is still there on the next open. There were three
   * ways out and each cleared a different subset:
   *
   *   - the dialog's own `onClose` cleared `joinCode` and `failure`,
   *   - the "Done" button cleared `joinCode` alone, so a refusal that had since been recovered
   *     from still announced itself through `role="alert"` the next time the dialog opened,
   *   - "Cancel" cleared nothing at all.
   *
   * And **none of the three cleared the fields**, so after creating "Spring Summit" the dialog
   * reopened pre-filled with it — one more press away from a duplicate conference, on the one act
   * in this feature that mints a join code and an organizer assignment.
   *
   * A component that unmounted would need none of this. This one cannot, because `AdminDialog`
   * owns the `<dialog>` element whose `showModal()` is what gives the whole product its focus
   * trap — so the reset is explicit and there is exactly one of it.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  const dismiss = () => {
    setName('')
    setLocation('')
    setStartsOn('')
    setEndsOn('')
    setTimezone('UTC')
    setModality('')
    setFormat('')
    setFailure(null)
    setJoinCode(null)
    onClose()
  }

  const create = async () => {
    if (modality === '') return
    setBusy(true)
    setFailure(null)
    try {
      const created = await services.catalog.createConference({
        name: name.trim(),
        location: location.trim(),
        startsOn,
        endsOn,
        timezone: timezone.trim(),
        modality,
        format: format === '' ? null : format,
      })
      setJoinCode(created.joinCode)
      onCreated()
    } catch (error) {
      setFailure(describe(classify(error), detailOf(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminDialog
      open={open}
      title={joinCode ? 'Conference created' : 'Create a conference'}
      onClose={dismiss}
    >
      {joinCode ? (
        <>
          <p className="text-sm">
            Attendees join with this code. It is not a password — holding it gets somebody
            registered and nothing else.
          </p>
          <p className="mt-3 rounded-lg bg-cream-200 px-3 py-2 font-mono text-lg tracking-widest text-text-primary">
            {joinCode}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-5 min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
          >
            Done
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!blocked) void create()
          }}
        >
          {failure ? (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700"
            >
              {failure}
            </p>
          ) : null}

          <div>
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
              onChange={(event) => setTimezone(event.target.value)}
              className={field}
            />
            {/*
              FR-1015 — worth saying here rather than after the first refusal: the zone freezes as
              soon as the conference has a session, because every session time is stored as an
              absolute instant and changing the zone would move what everybody sees without moving
              anything.
            */}
            <p className="mt-1 text-xs text-text-muted">
              An IANA name, e.g. Europe/Madrid. It can only be changed while the conference has no
              sessions.
            </p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.modality} className="text-sm font-medium text-text-primary">
                Modality
              </label>
              {/*
                T191 (FR-1059b, FR-1046, FR-1048) — an explicit choice from the closed set,
                with NO preselected value: the placeholder is not submittable, so "nobody
                chose" cannot reach the server as a value. What it governs is what each
                session must carry — a room in person, a joining link virtually, either
                hybrid — which is why there is no safe default to offer.
              */}
              <select
                id={ids.modality}
                value={modality}
                onChange={(event) => setModality(event.target.value as ConferenceModality | '')}
                className={field}
              >
                <option value="" disabled>
                  Choose one…
                </option>
                {MODALITIES.map((value) => (
                  <option key={value} value={value}>
                    {MODALITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.format} className="text-sm font-medium text-text-primary">
                Format
              </label>
              {/* Optional and purely descriptive (FR-1047): nothing anywhere branches on it. */}
              <select
                id={ids.format}
                value={format}
                onChange={(event) => setFormat(event.target.value as ConferenceFormat | '')}
                className={field}
              >
                <option value="">No format</option>
                {FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {FORMAT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* A disabled control while the form is incomplete, never an error afterwards. */}
          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={busy || blocked}
              className="min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 rounded-lg px-3 text-sm font-medium text-text-body hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </AdminDialog>
  )
}
