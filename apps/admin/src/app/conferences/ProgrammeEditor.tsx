import type { AdminProgramme, AdminSession, AdminSessionInput } from '@mynet/data'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'

import { classify, describe, detailOf } from '../errors.js'
import { useAdminSession } from '../session.js'
import { CancelDialog } from './CancelDialog.js'
import { RoomSection, SpeakerSection, TrackSection } from './CatalogForms.js'
import { SessionForm } from './SessionForm.js'
import { venueSpanOf } from './venue-time.js'

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
/**
 * What a write did, as a value that cannot be confused with what it returned.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`undefined` WAS THE FAILURE SENTINEL, AND EVERY VOID-RETURNING ACT RESOLVES TO `undefined` ON
 * SUCCESS.**
 *
 * `cancelSession`, `deleteSession`, `deleteTrack`, `deleteRoom` and `deleteSpeaker` all return
 * `Promise<void>`, so success and failure were the same value. Three behaviours fell out of it,
 * all of them visible to an organizer:
 *
 *   - A **successful** delete never closed the confirmation. `result !== undefined` is never true,
 *     so the organizer was left on "Remove …?" with stale engagement counts, over a session the
 *     re-read had already removed — and pressing the button again got a 404.
 *   - A **refused** cancel closed it. The handler closed unconditionally, so the message `write`
 *     had just set rendered for zero frames. Reachable through the ordinary 429 and through the
 *     404 an already-cancelled session returns.
 *   - Every `.catch(onFailure)` downstream was dead code, and the field-clearing `.then()` ran on
 *     a **refused** create — destroying what the organizer had typed. That is 009's defect on the
 *     organizer side, arriving because a promise that never rejects makes "await then clear"
 *     indistinguishable from "clear unconditionally".
 *
 * A discriminated result is the fix, mirroring the server's own `WriteResult`. A sentinel that
 * collides with an ordinary success value cannot carry a two-outcome decision.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
type WriteOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false }

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
      setFailure(describe(classify(error), detailOf(error)))
    }
  }, [services, eventId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  /** Runs a write, re-reads, and surfaces the **server's** explanation on refusal. */
  const write = useCallback(
    async (
      act: () => Promise<unknown>,
      onFailure: (message: string) => void,
    ): Promise<WriteOutcome> => {
      setBusy(true)
      try {
        const value = await act()
        await load()
        return { ok: true, value }
      } catch (error) {
        // Classified on `error.code`, never on the class — `errors.ts` is the single place that
        // decides, which is what stops 008's defect where `instanceof` caught 400, 404, 409 and
        // 429 alike and swallowed every message the routes wrote to be read.
        onFailure(describe(classify(error), detailOf(error)))
        return { ok: false }
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

    if (!result.ok) return

    const produced = (result.value as { warnings: readonly string[] }).warnings
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
        onFailure={(error) => setFailure(describe(classify(error), detailOf(error)))}
        onCreate={async (input) =>
          (await write(() => services.catalog.createTrack(eventId, input), setFailure)).ok
        }
        onRename={async (id, input) =>
          (await write(() => services.catalog.updateTrack(eventId, id, input), setFailure)).ok
        }
        onDelete={async (id) => {
          await write(() => services.catalog.deleteTrack(eventId, id), setFailure)
        }}
      />

      <RoomSection
        rooms={programme.rooms}
        busy={busy}
        onFailure={(error) => setFailure(describe(classify(error), detailOf(error)))}
        onCreate={async (input) =>
          (await write(() => services.catalog.createRoom(eventId, input), setFailure)).ok
        }
        onRename={async (id, input) =>
          (await write(() => services.catalog.updateRoom(eventId, id, input), setFailure)).ok
        }
        onDelete={async (id) => {
          await write(() => services.catalog.deleteRoom(eventId, id), setFailure)
        }}
      />

      <SpeakerSection
        speakers={programme.speakers}
        busy={busy}
        onFailure={(error) => setFailure(describe(classify(error), detailOf(error)))}
        onCreate={async (input) =>
          (await write(() => services.catalog.createSpeaker(eventId, input), setFailure)).ok
        }
        onRename={async (id, input) =>
          (await write(() => services.catalog.updateSpeaker(eventId, id, input), setFailure)).ok
        }
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
                    {/*
                      ═══════════════════════════════════════════════════════════════════════
                      **THE VENUE'S CLOCK, BECAUSE THAT IS THE CLOCK EVERY REFUSAL IS JUDGED
                      AGAINST.**

                      This rendered `{session.startsAt} → {session.endsAt}` — the absolute
                      instants exactly as they arrived — while `SessionForm` showed the same two
                      values in the conference's timezone with the zone named beside the field.
                      FR-1012 and FR-1014 are both evaluated in venue-local time, so an organizer
                      told a session "falls outside the conference's dates" was reading a UTC
                      timestamp that could not show them why; and in any westward zone a
                      late-evening session displayed on the following day.
                      ═══════════════════════════════════════════════════════════════════════
                    */}
                    <p className="text-sm text-text-muted">
                      {venueSpanOf(session.startsAt, session.endsAt, programme.conference.timezone)}
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
            /*
             * ═══════════════════════════════════════════════════════════════════════════════
             * **KEYED ON WHAT IS BEING EDITED, AND WITHOUT THIS THE FORM WRITES THE WRONG
             * SESSION.**
             *
             * `SessionForm` initialises all seven fields with `useState(session?.… ?? default)`,
             * which run **only on mount**. The session list stays rendered above this form, so
             * both triggers are live while it is open: `setEditing(session)` on a row and
             * `setEditing(null)` for "Add a session". `editing` never returns to `undefined`
             * between them, so without a key React reuses the instance — the fields keep the
             * previous session's title, times and room while `editing.id` is already the new
             * one, and `submitSession` posts the first session's values to the second session.
             *
             * That is silent data loss plus a false notification: the start time and room have
             * "changed", so `materialChangeOf` returns `'time'` and every attendee who saved the
             * overwritten session is told it has moved. Nothing on screen contradicts it —
             * the heading reads "Edit session" either way.
             *
             * 009 met the same class of defect and fixed it the same way, keying `PanelNotes`
             * and `PanelQuestions` on the session id so a change of subject remounts.
             * ═══════════════════════════════════════════════════════════════════════════════
             */
            key={editing ? `edit-${editing.id}` : 'new'}
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
          // ───────────────────────────────────────────────────────────────────────────────────
          // Closes on success only. It used to close unconditionally, which meant the refusal
          // message `write` had just set rendered for zero frames — reachable through the ordinary
          // 429 and through the 404 an already-cancelled session returns, so a cancel that did
          // nothing looked exactly like one that worked.
          // ───────────────────────────────────────────────────────────────────────────────────
          void write(
            () => services.catalog.cancelSession(eventId, target.id),
            setRemovalFailure,
          ).then((result) => {
            if (result.ok) setRemoving(null)
          })
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
            //
            // The condition was `result !== undefined`, which is **never true**: `deleteSession`
            // resolves to `undefined` on success. So the intent above was inverted in practice —
            // a successful delete left the organizer staring at a confirmation for a session that
            // no longer existed, and pressing the button again got a 404.
            // ─────────────────────────────────────────────────────────────────────────────────
            .then((result) => {
              if (result.ok) setRemoving(null)
            })
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}
