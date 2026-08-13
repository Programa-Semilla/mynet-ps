import { useId, useState } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T086, T087 (014) — creating a conference (FR-1007, FR-1008, FR-1009, FR-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **RENDERED FOR BOTH TIERS, WHICH MAKES IT THE ONLY CONTROL IN THIS PRODUCT THAT IS.**
 *
 * Every other control on the conference list is platform-tier only, and `ConferenceList` hides
 * them from an organizer so they are never offered a door that answers "there is nothing here".
 * This one is different by constitution: v4.2.0's N3 makes creating a conference **the one
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
  }

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null)

  const blocked =
    name.trim().length === 0 ||
    location.trim().length === 0 ||
    startsOn === '' ||
    endsOn === '' ||
    endsOn < startsOn ||
    timezone.trim().length === 0

  const create = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const created = await services.catalog.createConference({
        name: name.trim(),
        location: location.trim(),
        startsOn,
        endsOn,
        timezone: timezone.trim(),
      })
      setJoinCode(created.joinCode)
      onCreated()
    } catch (error) {
      setFailure(describe(classify(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminDialog
      open={open}
      title={joinCode ? 'Conference created' : 'Create a conference'}
      onClose={() => {
        setJoinCode(null)
        setFailure(null)
        onClose()
      }}
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
            onClick={() => {
              setJoinCode(null)
              onClose()
            }}
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
              onClick={onClose}
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
