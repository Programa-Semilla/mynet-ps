import type { Session, SessionNote } from '@mynet/data'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router'

import { Loading } from '../AsyncState.js'
import { PanelNotes } from './PanelNotes.js'
import { PanelOverview } from './PanelOverview.js'
import { PanelSpeakers } from './PanelSpeakers.js'

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
  /** Returns focus to the control that opened the panel (FR-202). */
  readonly restoreFocusTo: (sessionId: string) => void
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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="session-panel-title"
      onCancel={(event) => {
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
      <PanelSpeakers speakers={session.speakers} />
      {/*
        The third section. `key` on the session id so switching sessions gives the editor a
        fresh controller rather than carrying one session's draft into another's — the panel
        and its address belong to a single session throughout (Edge Cases).
      */}
      <PanelNotes
        key={session.id}
        eventId={context.eventId}
        sessionId={session.id}
        note={context.notes.get(session.id) ?? null}
      />
    </>
  )
}
