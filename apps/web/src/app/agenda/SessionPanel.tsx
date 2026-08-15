import type { Session, SessionNote } from '@mynet/data'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router'

import { Loading } from '../AsyncState.js'
import { PanelCommitment } from './PanelCommitment.js'
import { PanelNotes } from './PanelNotes.js'
import { PanelOverview } from './PanelOverview.js'
import { PanelQuestions } from './PanelQuestions.js'
import { PanelSpeakers } from './PanelSpeakers.js'
import type { Commitments } from './useCommitments.js'

/**
 * T036–T038, T041, T042 (005) — the session detail panel
 * (FR-198–FR-206, SC-207).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A NATIVE `<dialog>` OPENED WITH `showModal()`** (research D3).
 *
 * The platform gives three things this feature would otherwise have to hand-write: a real
 * focus trap, inertness of everything behind the panel, and Escape dismissal. The register
 * lists Escape handling and visible focus as *settled requirements the prototype failed to
 * meet* — so taking them from the platform is the least likely route to failing them again. It
 * also removes the z-index and scroll-lock problems a `div` overlay creates, because the top
 * layer is not part of the page's stacking context at all.
 *
 * **Two things `<dialog>` does NOT give, which this file therefore adds:**
 *
 *   1. **Focus does not reliably return to the opener** across engines, so T038 restores it
 *      explicitly. The opener is reached through a ref the programme holds — not by looking an
 *      element up in the document, which feature code may not do (Principle V).
 *   2. **Escape fires `cancel`, not the close button's handler.** T037 routes it to the same
 *      close path, so the address updates identically however the panel was dismissed. Without
 *      that, Escape would leave the dialog closed and the address still naming a session — and
 *      the next render would re-open it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * What the programme hands down to its nested child route.
 *
 * The panel **selects from the programme rather than fetching a session of its own** (research
 * D4, FR-203). That keeps one source of truth for session data, and it is what makes a cold
 * load work without a second request: the programme's own loading state runs, and the panel
 * opens once it resolves.
 */
export interface AgendaOutletContext {
  readonly status: 'loading' | 'ready' | 'failed'
  /**
   * Whether the failure was an absence of connection rather than a fault on our side (FR-218).
   *
   * Carried explicitly rather than re-derived here, because the panel does not perform the read
   * — the programme does — and a second guess about the cause would be exactly the kind of
   * invented information FR-204 forbids elsewhere in this same file.
   */
  readonly offline: boolean
  readonly sessions: readonly Session[]
  readonly timezone: string
  readonly eventId: string
  /**
   * Every note the attendee has written in this conference, read once as a set.
   *
   * The whole set rather than one per session, so opening the panel needs no request of its
   * own — which is what lets the panel appear immediately on a cold load, and what makes the
   * notes cache a single entry per conference (data-model.md, `resource: notes`).
   */
  readonly notes: ReadonlyMap<string, SessionNote>
  /**
   * The notes read's own state, consulted BEFORE the map above — because the map alone cannot
   * distinguish "no note" from "not read yet", and the editor initialises once from what it is
   * handed and deliberately never adopts a server value afterwards (FR-214). Mounted against
   * an empty map while the read was still in flight, it stayed empty after the note arrived —
   * and the attendee's first keystroke into that convincing blank would REPLACE the note the
   * server still holds. The hook's own header names exactly that hazard; this field is what
   * lets the panel honour it.
   */
  readonly notesStatus: 'loading' | 'ready' | 'failed'
  /** Retries the notes read after a failure, without re-reading anything else. */
  readonly retryNotes: () => void
  /** Returns focus to the control that opened the panel (FR-202). */
  readonly restoreFocusTo: (sessionId: string) => void
  /**
   * T075 (014) — records that the attendee has looked at this session, clearing its change
   * marker (FR-1030).
   *
   * Handed down rather than reached for through a repository here, because the marker's state
   * lives with the saved set in `useSavedSessions` — two readers of the same fact are two
   * things that can disagree about it.
   */
  readonly markViewed: (sessionId: string) => void
  /**
   * T208 (014 tranche 2) — the attendee's commitment set, handed down whole rather than
   * re-read here, for `markViewed`'s own reason: the set lives in `useCommitments` at the
   * programme, and a second instance in the panel would be a second reader that can disagree
   * with the rows behind the dialog about whether a session is committed.
   */
  readonly commitments: Commitments
}

export const SessionPanel = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const context = useOutletContext<AgendaOutletContext>()
  const navigate = useNavigate()

  const dialogRef = useRef<HTMLDialogElement>(null)
  /** Set once closing has begun, so the effect below cannot re-open the dialog mid-teardown. */
  const closingRef = useRef(false)

  const session = sessionId
    ? context.sessions.find((candidate) => candidate.id === sessionId)
    : undefined

  /**
   * The single close path (T037, T038).
   *
   * Closing is a **navigation**, not a state change: the address returns to the programme, so
   * the browser's Back control closes the panel by its own mechanism with no history
   * manipulation of ours (FR-205). Both the close button and Escape arrive here, which is what
   * makes the two indistinguishable in what they leave behind.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **THE ORDER OF THESE THREE STEPS IS LOAD-BEARING, AND A BROWSER TAUGHT IT TO US.**
   *
   * Restoring focus *before* closing the dialog silently does nothing: while a dialog is modal
   * everything behind it is **inert**, and an inert element cannot take focus. The call
   * succeeded, focus stayed on the body, and a keyboard reader was returned to the top of the
   * document — the exact failure FR-202 exists to prevent, produced by code that looked
   * correct and passed every test jsdom could run.
   *
   * So: leave the top layer first, then restore focus to an element that is once again
   * focusable, then navigate.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const close = useCallback(() => {
    closingRef.current = true

    // Step 1 — leave the top layer, so the programme behind stops being inert.
    dialogRef.current?.close()

    // Step 2 — return focus to the control that opened this (FR-202). `<dialog>` does not do
    // this reliably across engines, which is why the feature does it explicitly.
    if (sessionId) context.restoreFocusTo(sessionId)

    // Step 3 — the address returns to the programme, which is what unmounts this.
    void navigate('..', { relative: 'path' })
  }, [navigate, context, sessionId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open || closingRef.current) return

    // `showModal`, never `show`: only the modal form gives the focus trap and the inert
    // background. `show` would render an overlay that a Tab could walk straight out of.
    dialog.showModal()
  })

  /**
   * T075 (014) — **opening this panel is what "the attendee has viewed the session" means**
   * (FR-1030).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * Not the row appearing in a list, and not the destination being open. The panel is where an
   * attendee finds out **what** changed — the time, the room, the cancellation — so it is the
   * only surface on which "they have seen it" is true.
   *
   * Keyed on `sessionId` so opening a second session marks that one and not the first, and
   * `markViewed` is stable across renders, so this fires once per session opened rather than on
   * every re-render of an open panel.
   *
   * A session the attendee has not saved has no row to stamp; the write is a no-op and is
   * deliberately not conditional here — the panel does not know the saved set, and asking would
   * be a second reader of a fact `useSavedSessions` already owns.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  const { markViewed } = context
  useEffect(() => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **ONLY WHEN THE PANEL ACTUALLY SHOWED THE SESSION.**
    //
    // This fired on every `sessionId` change regardless of what was on screen: while the
    // programme was still loading, while it had **failed**, and when the address named a session
    // that is not in this conference at all. In each of those the attendee is looking at
    // "This session could not be loaded" or "not available to you" — and the write succeeded
    // anyway, because it touches only `saved_sessions`.
    //
    // So the marker for a change they demonstrably had not seen was cleared, both on the server
    // and locally. FR-1030 says the marker clears once the attendee has **viewed** it, and this
    // file's own header asserts the panel is "the only surface on which 'they have seen it' is
    // true" — which is false whenever the panel is showing a failure instead.
    //
    // Keyed on the resolved session rather than the address, so the effect cannot run before the
    // thing it is acknowledging exists.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (context.status !== 'ready') return
    if (!session) return
    markViewed(session.id)
  }, [markViewed, context.status, session])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="session-panel-title"
      onCancel={(event) => {
        // ═══════════════════════════════════════════════════════════════════════════════════
        // **009 — ONLY THIS PANEL'S OWN CANCEL. React delivers a nested dialog's `cancel` here
        // too, and research R2 predicted the opposite.**
        //
        // R2 reasoned that the platform sends `cancel` to the **topmost** dialog alone, so a
        // confirmation opened inside this panel could never reach this handler — and said the
        // point was worth asserting rather than assuming, because this handler *navigates*.
        // The assertion (`e2e/session-qa.spec.ts`) found the reasoning wrong.
        //
        // The DOM event genuinely does not bubble. React's synthetic event system delivers it
        // to ancestor handlers anyway, so one Escape on the withdrawal confirmation closed the
        // confirmation **and** ran `close()` here — dismissing the panel and changing the
        // address when the attendee meant to dismiss a confirmation.
        //
        // Comparing the target against this dialog is the whole fix. It is invisible to every
        // component test, because jsdom has no top layer and nothing can nest inside anything.
        // ═══════════════════════════════════════════════════════════════════════════════════
        if (event.target !== dialogRef.current) return

        // T037 — Escape reaches the same close path as the button. Prevented so the platform
        // does not close the dialog underneath us while the address still names the session.
        event.preventDefault()
        close()
      }}
      /*
        FR-199 — an overlay at every width, full-width at mobile.

        ───────────────────────────────────────────────────────────────────────────────────
        **`max-w-full` is not redundant with `w-full`, and leaving it out is a real defect.**

        The user-agent stylesheet gives `dialog` `max-width: calc(100% - 6px - 2em)`, which at
        320px caps the panel at 282px — a card floating on a phone with a visible gutter down
        both sides, not the full-width overlay the mobile layout declares. `w-full` cannot beat
        it, because a max-width always wins over a width. This was measured in a browser; no
        component test could see it, because jsdom applies no user-agent stylesheet.
        ───────────────────────────────────────────────────────────────────────────────────

        `max-h` plus `overflow-y-auto` keeps a long summary scrollable vertically without the
        page ever scrolling horizontally (SC-211).
      */
      className="m-auto max-h-[90dvh] w-full max-w-full overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-0 tablet:max-w-xl backdrop:bg-surface-inverse/50"
    >
      <div className="px-4 py-4 tablet:px-6 tablet:py-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="session-panel-title"
            className="font-display text-xl font-semibold text-text-primary"
          >
            {session ? session.title : 'Session'}
          </h2>

          {/* FR-202 — a visible, labelled close control, at touch size. */}
          <button
            type="button"
            onClick={close}
            aria-label="Close session details"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <PanelBody session={session} context={context} />
      </div>
    </dialog>
  )
}

/**
 * The four states this panel can be in, each said explicitly (SC-209).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The refusal and the failure are different facts and are worded differently** (FR-204).
 *
 * A session that is not in the reader's active conference is refused in wording that discloses
 * nothing about whether it exists — matching the server's own refusal, which is deliberately
 * identical for "not registered", "no such conference" and "not part of this one". A client
 * that said "that session belongs to another conference" would be inventing information it
 * does not have, and would leak exactly what the server refused to.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const PanelBody = ({
  session,
  context,
}: {
  session: Session | undefined
  context: AgendaOutletContext
}): ReactNode => {
  // FR-203 — a cold load runs the programme's own loading state, and the panel opens once it
  // resolves. No second request for the session, so no second thing that can fail.
  if (context.status === 'loading') return <Loading label="Loading this session…" />

  if (context.status === 'failed') {
    return (
      <p role="alert" className="text-sm text-text-body">
        {context.offline
          ? 'This session needs a connection, and there is not one right now. Nothing is cached for it on this device.'
          : 'This session could not be loaded. This is a problem on our side, not with your account.'}
      </p>
    )
  }

  // FR-204 — the address names a session that is not in this conference. Same wording as the
  // server's, disclosing nothing.
  if (!session) {
    return (
      <p role="alert" className="text-sm text-text-body">
        That session is not available to you.
      </p>
    )
  }

  return (
    <>
      <PanelOverview session={session} timezone={context.timezone} />
      {/*
        T208, T209 (014 tranche 2) — the fifth section, announced by T120's rewritten comment
        below: the ONE commitment control (FR-1063), and on an optional session the live
        remaining-places figure beside it (FR-1070). Keyed on the session id like its siblings,
        so switching sessions cannot carry one session's places figure into another's.
      */}
      <PanelCommitment
        key={`commitment-${session.id}`}
        session={session}
        eventId={context.eventId}
        commitments={context.commitments}
      />
      <PanelSpeakers speakers={session.speakers} />
      {/*
        The third section. `key` on the session id so switching sessions gives the editor a
        fresh controller rather than carrying one session's draft into another's — the panel
        and its address belong to a single session throughout (Edge Cases).
      */}
      {/*
        The editor mounts only once the notes read has SETTLED, and the two other states are
        each a sentence rather than a blank field. An empty editor over a pending read is not a
        neutral placeholder here: the controller initialises from what it is handed and never
        adopts a late-arriving value (FR-214), so a note that resolved after the mount stayed
        invisible — and typing into that blank would replace it on the server. Found as an
        intermittent end-to-end failure on a loaded machine, which is exactly the timing a slow
        connection gives a real attendee.
      */}
      {context.notesStatus === 'ready' ? (
        <PanelNotes
          key={session.id}
          eventId={context.eventId}
          sessionId={session.id}
          note={context.notes.get(session.id) ?? null}
        />
      ) : (
        <section aria-labelledby="session-panel-notes">
          <h3
            id="session-panel-notes"
            className="mb-2 font-display text-sm font-medium text-text-primary"
          >
            Your notes
          </h3>
          {context.notesStatus === 'loading' ? (
            <p className="text-sm text-text-muted">Loading your note…</p>
          ) : (
            <p className="text-sm text-text-body">
              Your notes could not be read, so the editor is not offered — a blank field over a note
              that exists would invite retyping it over the top.{' '}
              <button
                type="button"
                onClick={context.retryNotes}
                className="font-medium text-coral-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
              >
                Try again
              </button>
            </p>
          )}
        </section>
      )}
      {/*
        T035 (009) — the fourth section, which is the whole of this feature's edit to 005's file.

        `key` on the session id for exactly the reason `PanelNotes` above has one: switching
        sessions must give the section a **fresh controller** rather than carrying one session's
        draft question, its list, and its refusal into another's (FR-751). Without it, React
        reuses this component across a session change and the reader sees the previous session's
        questions under the new session's title.

        The panel is deliberately **not** converted to a registry to accommodate this (research
        R3): that would be a larger edit to this file than the line itself.

        T120 (014 tranche 2) — the sentence above used to end "…for a fifth section the roadmap
        says will never arrive". The fifth section arrived: the commitment control (save on a
        mandatory session, a place on an optional one — FR-1063) renders in this panel, and the
        rewritten sentence is the record that the registry decision was re-weighed rather than
        silently outgrown. Still not a registry: five known siblings in one file remain cheaper
        than an abstraction with five callers.
      */}
      <PanelQuestions
        // Prefixed, because `PanelNotes` above is keyed on the bare session id and the two are
        // siblings in one fragment — React shares a key namespace across them and warns about
        // the duplicate. The prefix keeps both remounts session-scoped while staying distinct.
        key={`questions-${session.id}`}
        eventId={context.eventId}
        sessionId={session.id}
        cancelled={session.cancelled}
      />
    </>
  )
}
