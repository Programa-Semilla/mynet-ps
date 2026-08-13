import type { AdminProgramme, AdminSession, AdminSessionInput } from '@mynet/data'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { CancelDialog } from './CancelDialog.js'
import { RoomSection, SpeakerSection, TrackSection } from './CatalogForms.js'
import { SessionForm } from './SessionForm.js'

/**
 * T036, T039 (014) — **the programme of one conference** (FR-1001, FR-1022, FR-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE LARGEST DESKTOP-FIRST SURFACE BUILT SINCE 013, AND REGISTER ENTRY 4 IS STILL OPEN.**
 *
 * plan.md tracks that as a risk rather than waiving it: the approved prototype is mobile-only, a
 * fixed 390×844 frame, so every desktop layout in this product is unreviewed design — and 008
 * turned that from a risk into an observed defect when the first dialog a human looked at was
 * rendering in the top-left corner, having passed every gate.
 *
 * Two consequences are visible in this file. It is a **single column that reflows** rather than a
 * time grid, because a grid is the thing most likely to need horizontal scrolling at 390px and
 * the constitution forbids that outright. And every dialog it opens goes through `AdminDialog`,
 * which fixes the centring, focus-restoration and nested-`cancel` mistakes once.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY WRITE RE-READS THE PROGRAMME, AND THAT IS DELIBERATE RATHER THAN LAZY.**
 *
 * Nothing here is optimistic. The engagement counts are a **decision input** — what an organizer
 * reads to choose between deleting and cancelling — so a locally-patched view would let somebody
 * act on a number that was true when the page loaded. The repository is undecorated for the same
 * reason, so a re-read is a real request every time.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const ProgrammeEditor = () => {
  const { eventId } = useParams<{ eventId: string }>()
  const { services } = useAdminSession()

  const [programme, setProgramme] = useState<AdminProgramme | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editing, setEditing] = useState<AdminSession | null | undefined>(undefined)
  const [formFailure, setFormFailure] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<readonly string[]>([])
  const [removing, setRemoving] = useState<AdminSession | null>(null)
  const [removalFailure, setRemovalFailure] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!eventId) return
    setFailure(null)
    try {
      setProgramme(await services.catalog.programme(eventId))
    } catch (error) {
      setFailure(describe(classify(error)))
    }
  }, [services, eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  /** Runs a write, re-reads, and surfaces the **server's** explanation on refusal. */
  const write = useCallback(
    async (act: () => Promise<unknown>, onFailure: (message: string) => void) => {
      setBusy(true)
      try {
        const result = await act()
        await load()
        return result
      } catch (error) {
        // Classified on `error.code`, never on the class — `errors.ts` is the single place that
        // decides, which is what stops 008's defect where `instanceof` caught 400, 404, 409 and
        // 429 alike and swallowed every message the routes wrote to be read.
        onFailure(describe(classify(error)))
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  if (!eventId) return null

  if (failure && !programme) {
    return (
      <div className="mx-auto max-w-3xl">
        <p role="alert" className="rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      </div>
    )
  }

  if (!programme) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-text-muted">Loading the programme…</p>
      </div>
    )
  }

  const submitSession = async (input: AdminSessionInput) => {
    setFormFailure(null)
    const result = await write(
      () =>
        editing
          ? services.catalog.updateSession(eventId, editing.id, input)
          : services.catalog.createSession(eventId, input),
      setFormFailure,
    )

    if (result === undefined) return

    const produced = (result as { warnings: readonly string[] }).warnings
    setWarnings(produced)
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // The form stays open when there is a warning, and closes when there is not.
    //
    // FR-1016 permits an overlap and requires the organizer be told, so closing the form on a
    // warning would show the advice beside a form that is no longer there — advice about
    // something they can no longer look at. A clean write needs no follow-up.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    if (produced.length === 0) setEditing(undefined)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-text-primary">{programme.conference.name}</h1>
      <p className="mt-1 text-sm text-text-muted">
        {programme.conference.location} · {programme.conference.startsOn} to{' '}
        {programme.conference.endsOn} · {programme.conference.timezone}
      </p>
      {/*
        FR-1009 — the join code, so an organizer can distribute it without a second screen. Not a
        credential: possessing one gets registration and nothing else (FR-317a).
      */}
      <p className="mt-1 text-sm text-text-muted">
        Join code:{' '}
        <span className="font-mono tracking-widest">{programme.conference.joinCode}</span>
      </p>

      {failure ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      <TrackSection
        tracks={programme.tracks}
        busy={busy}
        onFailure={(error) => setFailure(describe(classify(error)))}
        onCreate={async (input) => {
          await write(() => services.catalog.createTrack(eventId, input), setFailure)
        }}
        onDelete={async (id) => {
          await write(() => services.catalog.deleteTrack(eventId, id), setFailure)
        }}
      />

      <RoomSection
        rooms={programme.rooms}
        busy={busy}
        onFailure={(error) => setFailure(describe(classify(error)))}
        onCreate={async (input) => {
          await write(() => services.catalog.createRoom(eventId, input), setFailure)
        }}
        onDelete={async (id) => {
          await write(() => services.catalog.deleteRoom(eventId, id), setFailure)
        }}
      />

      <SpeakerSection
        speakers={programme.speakers}
        busy={busy}
        onFailure={(error) => setFailure(describe(classify(error)))}
        onCreate={async (input) => {
          await write(() => services.catalog.createSpeaker(eventId, input), setFailure)
        }}
        onDelete={async (id) => {
          await write(() => services.catalog.deleteSpeaker(eventId, id), setFailure)
        }}
      />

      <section aria-labelledby="programme-sessions" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="programme-sessions" className="font-semibold text-text-primary">
            Sessions
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(null)
              setFormFailure(null)
              setWarnings([])
            }}
            className="min-h-11 rounded-lg bg-coral-600 px-3 text-sm font-medium text-text-inverse hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500 disabled:opacity-50"
          >
            Add a session
          </button>
        </div>

        {programme.sessions.length === 0 ? (
          // The empty state the constitution requires, worded as an invitation rather than as an
          // absence: this is the screen an organizer sees on a conference they have just created.
          <p className="mt-3 rounded-lg bg-cream-200 px-3 py-3 text-sm">
            No sessions yet. Add the first one — attendees registered for this conference will see
            it immediately, because there is no draft state to publish from.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {programme.sessions.map((session) => (
              <li
                key={session.id}
                className="rounded-2xl border border-border-subtle bg-surface-card p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">
                      {session.title}
                      {/*
                        FR-1022 — cancellation said in **text**, here as on the attendee side. A
                        greyed row is invisible to a screen reader and in high contrast, and this
                        is the state that decides whether an organizer edits or reinstates.
                      */}
                      {session.cancelledAt ? (
                        <span className="ml-2 rounded-sm bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
                          Cancelled
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-text-muted">
                      {session.startsAt} → {session.endsAt}
                    </p>
                    {/*
                      FR-1025 — counts, nobody named. Rendered on the row as well as in the dialog
                      so the decision is visible before the organizer opens anything.
                    */}
                    <p className="text-xs text-text-muted">
                      {session.engagement.saved} saved · {session.engagement.notes} notes ·{' '}
                      {session.engagement.questions} questions · {session.engagement.votes} votes
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(session)
                        setFormFailure(null)
                        setWarnings([])
                      }}
                      className="min-h-11 rounded-lg px-2 text-xs font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                    >
                      Edit
                    </button>

                    {session.cancelledAt ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          void write(
                            () => services.catalog.reinstateSession(eventId, session.id),
                            setFailure,
                          )
                        }}
                        className="min-h-11 rounded-lg px-2 text-xs font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                      >
                        Reinstate
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRemoving(session)
                          setRemovalFailure(null)
                        }}
                        className="min-h-11 rounded-lg px-2 text-xs font-medium text-coral-600 hover:bg-coral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
                      >
                        Cancel or delete
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing !== undefined ? (
          <SessionForm
            programme={programme}
            session={editing}
            busy={busy}
            failure={formFailure}
            warnings={warnings}
            onSubmit={(input) => void submitSession(input)}
            onCancel={() => setEditing(undefined)}
          />
        ) : null}
      </section>

      <CancelDialog
        open={removing !== null}
        session={removing}
        busy={busy}
        failure={removalFailure}
        onCancelSession={() => {
          const target = removing
          if (!target) return
          void write(
            () => services.catalog.cancelSession(eventId, target.id),
            setRemovalFailure,
          ).then(() => setRemoving(null))
        }}
        onDeleteSession={() => {
          const target = removing
          if (!target) return
          void write(() => services.catalog.deleteSession(eventId, target.id), setRemovalFailure)
            // ─────────────────────────────────────────────────────────────────────────────────
            // **The dialog stays open when the delete is refused**, so the counts and the offer
            // to cancel instead are still on screen. Closing it would leave the organizer with a
            // message about a decision they can no longer act on — and FR-1019a means a refusal
            // is possible even when the counts read zero, because somebody may have saved the
            // session between this render and the request.
            // ─────────────────────────────────────────────────────────────────────────────────
            .then((result) => {
              if (result !== undefined) setRemoving(null)
            })
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
