import type { AdminConference } from '@mynet/data'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { CreateConferenceDialog } from './CreateConferenceDialog.js'
import { PromoteDialog } from './PromoteDialog.js'

/**
 * T128, T130 (013) — conferences, their organizers, and the unassigned state (FR-926, FR-936).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`unassigned` IS RENDERED PROMINENTLY, AND DECISION 39 IS WHY.**
 *
 * A conference left with no organizer enters an explicit state **platform operators can see**.
 * Reverting ownership silently to the platform tier was considered and rejected — *"a tidier
 * invariant that hides the event nobody is prompted to act on."* So this is a visible state
 * asking for a decision, not a quiet default.
 *
 * It is **derived** server-side from the absence of a live assignment (FR-936), never stored.
 * 008's `lapsed` reasoning: a stored flag would need four write paths to keep it true — promotion,
 * demotion, account deletion, withdrawal — three of which belong to other features, and the one
 * that drifted would be the one displayed.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **A conference organizer sees only their own conferences, and no promotion control at all**
 * (FR-925, FR-926). The server decides the population in the query, and refuses the promotion
 * routes with a 404 — this hides the control so they are not offered a door that answers
 * "there is nothing here", which would tell them the capability exists.
 */
export const ConferenceList = () => {
  const { services, state } = useAdminSession()
  const isPlatform = state.status === 'signed-in' && state.identity.tier === 'platform'

  const [conferences, setConferences] = useState<readonly AdminConference[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [promoting, setPromoting] = useState<AdminConference | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setFailure(null)
    try {
      setConferences(await services.conferences.list())
    } catch (error) {
      setFailure(describe(classify(error)))
    }
  }, [services])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const demote = async (eventId: string, attendeeId: string) => {
    try {
      await services.conferences.demote({ eventId, attendeeId })
      await load()
    } catch (error) {
      setFailure(describe(classify(error)))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-text-primary">Conferences</h1>
        {/*
          014 — **rendered for BOTH tiers, which makes it the only control here that is.**
          Everything else on this screen is platform-only and hidden from an organizer so they are
          never offered a door that answers "there is nothing here". Creating a conference is
          different by constitution: v4.2.0's N3 makes it the one product-wide capability a
          conference organizer holds, stated rather than inferred because decision 32's "authority
          reaches only the conferences they are assigned" cannot describe the act of creating one.
        */}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Create a conference
        </button>
      </div>

      {failure ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      {conferences === null && failure === null ? (
        <p className="mt-4 text-sm text-text-muted">Loading conferences…</p>
      ) : null}

      {conferences?.length === 0 ? (
        // A deliberate state for each tier, and they mean different things: a platform operator
        // with no conferences is looking at an empty product; an organizer with none has had
        // every assignment revoked.
        <p className="mt-4 rounded-lg bg-cream-200 px-3 py-3 text-sm">
          {isPlatform
            ? 'No conferences exist yet.'
            : 'You do not organize any conferences. If you expected to, a platform operator has ended those assignments — your MyNet account is unaffected.'}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {conferences?.map((conference) => (
          <li
            key={conference.id}
            className="rounded-2xl border border-border-subtle bg-surface-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-text-primary">
                  {/*
                    014 — the way into the programme editor, and the only one. The address names
                    the conference because the server's guard reads it from the path (FR-1035).
                  */}
                  <Link
                    to={`/conferences/${conference.id}/programme`}
                    className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                  >
                    {conference.name}
                  </Link>
                </h2>
                {conference.unassigned ? (
                  <p className="mt-1 inline-block rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
                    Unassigned — nobody organizes this
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {conference.organizers.map((organizer) => (
                      <li key={organizer.attendeeId} className="flex items-center gap-2 text-sm">
                        <span>{organizer.displayName}</span>
                        {isPlatform ? (
                          <button
                            type="button"
                            onClick={() => void demote(conference.id, organizer.attendeeId)}
                            className="min-h-11 rounded-lg px-2 text-xs font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                          >
                            End their authority
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/*
                Rendered for the platform tier only (FR-925). The server refuses an organizer with
                a 404 whatever this does; not rendering it is so they are never offered a control
                that cannot work — which `tier-controls.test.tsx` asserts separately from the
                server refusal in `admin-tier-boundary.test.ts`.
              */}
              {isPlatform ? (
                <button
                  type="button"
                  onClick={() => setPromoting(conference)}
                  className="min-h-11 shrink-0 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                >
                  Add an organizer
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <CreateConferenceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => void load()}
      />

      <PromoteDialog
        open={promoting !== null}
        conference={promoting}
        onClose={() => setPromoting(null)}
        onPromoted={() => {
          setPromoting(null)
          void load()
        }}
      />
    </div>
  )
}
