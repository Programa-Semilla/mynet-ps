import type { Session } from '@mynet/data'
import { Bookmark, BookmarkCheck, Ticket, TicketCheck } from 'lucide-react'
import { useCallback, useId, useRef } from 'react'
import { Link } from 'react-router'

import { venueTimeOf } from './sessions.js'
import { trackClassesFor } from './track-colors.js'

/**
 * Shared session presentation — the track chip, speakers, and a programme row.
 *
 * Used by the Up next card, the rest-of-day card and Agenda. One implementation, so a session
 * cannot come to look like three different things depending on which surface it is on.
 */

/**
 * A track, coded **and named**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The name is not decoration next to the colour — it is the signal, and the colour is the
 * reinforcement. Constitution Principle IV: colour is never the sole carrier of meaning, which
 * is what makes the track legible to a colour-blind reader, in high contrast mode, and in the
 * neutral fallback an unrecognised token degrades to (research D7).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const TrackChip = ({ track }: { track: Session['track'] }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-xs font-medium ${trackClassesFor(track.colorToken)}`}
  >
    {track.name}
  </span>
)

/**
 * The people speaking, or **nothing at all**.
 *
 * FR-138: a session with no speaker renders completely, with no empty region and no placeholder
 * name. Returning null rather than an empty element is what makes that true — "Speakers: —" is
 * exactly the placeholder the requirement forbids.
 */
export const SpeakerLine = ({ speakers }: { speakers: Session['speakers'] }) => {
  if (speakers.length === 0) return null

  return (
    <p className="text-sm text-text-body">
      {speakers
        .map((speaker) => (speaker.company ? `${speaker.name} · ${speaker.company}` : speaker.name))
        .join(', ')}
    </p>
  )
}

/**
 * T053 (014) — a cancelled session, said in **text** (FR-1022, Principle IV).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **NEVER BY COLOUR OR BY STRIKETHROUGH ALONE.**
 *
 * The obvious rendering is to grey the row and strike the title through. Both are invisible to a
 * screen reader and the first is invisible in high contrast — and this is the one piece of
 * information that, missed, sends somebody across a venue to an empty room. So it is a word,
 * beside the track chip, where the row already carries text.
 *
 * The same reasoning `TrackChip` records for naming the track as well as colouring it: colour is
 * the reinforcement, never the signal.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const CancelledChip = () => (
  <span className="inline-flex shrink-0 items-center rounded-sm bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">
    Cancelled
  </span>
)

/**
 * T076 (014) — this saved session has changed since the attendee last looked (FR-1030).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **PER-ROW, IN TEXT, AND NEVER A COUNT** (FR-1031, constitution v5.2.0 N2).
 *
 * The marker's whole subject is *this one session*. There is no badge summing them, no list of
 * changed rows, and no surface anywhere in either product whose subject is "things that
 * happened" — the moment one exists, N2 is broken regardless of what the notification payload
 * carries. `apps/web/tests/unit/authoring-absences.test.tsx` asserts that as an absence.
 *
 * Text rather than a dot, for the reason above it: a coloured dot is exactly the marker a screen
 * reader cannot report, and "changed" is one word.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const ChangedChip = () => (
  <span className="inline-flex shrink-0 items-center rounded-sm bg-coral-100 px-2 py-0.5 text-xs font-medium text-coral-700">
    Changed
  </span>
)

/**
 * T024 (005), T208 (014 tranche 2) — whether this row carries the commitment control, and what
 * activating it would mean.
 *
 * Optional on `SessionRow`, and that optionality is deliberate rather than convenience: this
 * row is also what the Home rest-of-day card renders. A mandatory commitment control would
 * have changed a card belonging to another feature, which standing decision 9 and FR-226 both
 * forbid. Absent, the row is byte-for-byte the row 002 shipped.
 *
 * **`committed` is membership in the union commitment set** — a save on a mandatory session, a
 * held place in an optional one. Which write `onToggle` runs is the hook's business, decided
 * by the session's own kind (FR-1063); the affordance carries no kind because the session
 * beside it already does.
 */
export interface CommitmentAffordance {
  readonly committed: boolean
  readonly onToggle: () => void
}

/**
 * T208 (014 tranche 2) — the ONE commitment control, whose identity is the session's kind
 * (FR-184, FR-186, FR-189, FR-196, FR-1063, SC-1013).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EXACTLY ONE CONTROL PER SESSION, AND THE SESSION'S KIND DECIDES WHICH** (FR-1063). A
 * mandatory session offers save/unsave, exactly as 005 shipped it. An optional session offers
 * take-a-place/release — enrolment REPLACES saving there, so there is no second control, no
 * bookmark beside the reservation, and no state in which the two could disagree (FR-1064).
 * The cost is stated rather than mitigated: there is no way to keep an optional session in
 * view without committing to a place (FR-1064a).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The accessible name states what activating it will do, and changes with the state and the
 * kind** (FR-189). The icon carries the same information for a sighted reader and the name
 * carries it for everyone else; neither is the sole carrier. The session title is in the name
 * because a programme contains dozens of these.
 *
 * **Never `disabled` while the write is in flight.** A disabled element is not focusable, so
 * the browser would move focus to the body and a keyboard reader would lose their place
 * mid-list. Re-entry is safe without it: saving and releasing are idempotent, and a repeated
 * enrol is answered `already_enrolled` with its own sentence rather than an error state.
 *
 * **Touch sizing at 44px** (`size-11`), met by the control's own box (SC-211, FR-199).
 *
 * No focus styling here: `:focus-visible` is applied once, globally, in `theme/tokens.css`.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const CommitmentControl = ({
  session,
  commitment,
}: {
  session: Session
  commitment: CommitmentAffordance
}) =>
  session.kind === 'optional' ? (
    <PlaceControl session={session} commitment={commitment} />
  ) : (
    <button
      type="button"
      onClick={commitment.onToggle}
      aria-label={
        commitment.committed
          ? `Remove ${session.title} from your agenda`
          : `Save ${session.title} to your agenda`
      }
      className={`flex size-11 shrink-0 items-center justify-center rounded-md ${
        commitment.committed ? 'text-accent-strong' : 'text-text-muted'
      }`}
    >
      {commitment.committed ? (
        <BookmarkCheck aria-hidden="true" className="size-5" />
      ) : (
        <Bookmark aria-hidden="true" className="size-5" />
      )}
    </button>
  )

/**
 * T147, T208 (014 tranche 2) — the optional session's half of the commitment control: take a
 * place, or release the one held (FR-1063, FR-1067) — with the pre-enrolment notice in front
 * of taking one (FR-1074).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE NOTICE COMES BEFORE EVERY ENROLMENT, AND THAT IS A DECISION RATHER THAN A DEFAULT**
 * (FR-1074). Holding a place makes the attendee's name visible to that conference's organizers
 * — the fourth recorded Principle VIII exception, and the only one its subject can decline by
 * not acting, which is only true if they know **before** they act. No recorded pattern for a
 * remembered, once-per-attendee notice exists in this product, and inventing one would be
 * durable per-attendee state nobody specified — so the notice is confirmed on every enrolment.
 * The cost is one extra activation for a repeat enroller; the alternative's cost is a privacy
 * disclosure somebody was told about once, months ago, on another device.
 *
 * A native `<dialog>` opened with `showModal()`, centred by the BASE rule in
 * `theme/tokens.css` — never a local `m-auto`, which is the repeated defect that rule exists
 * to end. Escape dismisses it (the platform's `cancel`), and focus returns to the control that
 * opened it, explicitly, because `<dialog>` does not restore focus reliably across engines.
 * Nested inside `SessionPanel`'s dialog this control's `cancel` reaches the panel's React
 * handler too (009's finding); the panel guards on `event.target`, so one Escape closes only
 * the notice.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const PlaceControl = ({
  session,
  commitment,
}: {
  session: Session
  commitment: CommitmentAffordance
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  // Close first, then restore focus: while the dialog is modal everything behind it is inert,
  // and an inert element cannot take focus — SessionPanel's documented ordering, kept here.
  const dismiss = useCallback(() => {
    dialogRef.current?.close()
    openerRef.current?.focus()
  }, [])

  const confirm = useCallback(() => {
    commitment.onToggle()
    dialogRef.current?.close()
    openerRef.current?.focus()
  }, [commitment])

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => {
          // Releasing needs no notice: the disclosure FR-1074 is about happens on TAKING a
          // place, and withdrawing is the attendee reducing what is shared, not extending it.
          if (commitment.committed) commitment.onToggle()
          else dialogRef.current?.showModal()
        }}
        aria-label={
          commitment.committed
            ? `Release your place in ${session.title}`
            : `Take a place in ${session.title}`
        }
        className={`flex size-11 shrink-0 items-center justify-center rounded-md ${
          commitment.committed ? 'text-accent-strong' : 'text-text-muted'
        }`}
      >
        {commitment.committed ? (
          <TicketCheck aria-hidden="true" className="size-5" />
        ) : (
          <Ticket aria-hidden="true" className="size-5" />
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onCancel={(event) => {
          // Escape: the platform would close the dialog anyway; routed through `dismiss` so the
          // focus restoration cannot be skipped. Prevented so nothing closes twice.
          event.preventDefault()
          // React re-delivers a nested dialog's `cancel` to ancestor handlers (009): stopping it
          // here keeps SessionPanel's guard a second line of defence rather than the only one.
          event.stopPropagation()
          dismiss()
        }}
        // No `m-auto` and no positioning of this dialog's own: the base `dialog` rule in
        // `theme/tokens.css` restores the user-agent centring Tailwind's reset removes.
        className="w-full max-w-sm rounded-md border border-border-subtle bg-surface-raised p-0 backdrop:bg-surface-inverse/50"
      >
        <div className="px-4 py-4">
          <h2 id={headingId} className="mb-2 font-display text-lg font-medium text-text-primary">
            Before you take a place
          </h2>
          {/*
            FR-1074 — the disclosure, in full, before the act. Names WHO sees WHAT: the
            organizers of this conference, the attendee's name, because they prepare materials
            for the people attending. Constitution v5.3.0 O1's condition — "the attendee is told
            before they enrol" — is this paragraph.
          */}
          <p className="mb-4 text-sm text-text-body">
            Holding a place puts your name on this session&rsquo;s enrolment list, which the
            organizers of this conference can read — that is how they prepare for the people
            attending. Release your place at any time to come off the list.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="rounded-sm border border-border-strong px-3 py-2 text-sm font-medium text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              className="rounded-sm bg-accent-strong px-3 py-2 text-sm font-medium text-text-inverse"
            >
              Take a place
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

/**
 * One line of a programme: time, title, room, track, speakers — and, on Agenda, controls to
 * open and to save it.
 *
 * `time` is machine-readable through `dateTime` as well as human-readable, so the schedule is
 * available to assistive technology without the visible text having to be an ISO string.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The title is the link, and the save control is a sibling — not a row-wide click target.**
 *
 * Making the whole row open the panel would nest the save control inside a link, which is
 * invalid, unpredictable to activate by keyboard, and ambiguous to announce. Two adjacent
 * controls with distinct accessible names is what lets an attendee reach either one directly.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const SessionRow = ({
  session,
  timezone,
  commitment,
  openHref,
  registerOpener,
  changed = false,
}: {
  session: Session
  timezone: string
  /**
   * T076 (014) — whether **this attendee** has yet looked at this session since it materially
   * changed (FR-1030). Defaults to false, so the Home cards and the programme's "All" view —
   * which know nothing about the attendee's commitment set — render exactly the row they did
   * before.
   */
  changed?: boolean
  /**
   * Omitted by the Home cards, which stay exactly as 002 built them. T208 — was `save`; the
   * control it renders is the commitment control, whose identity the session's kind decides.
   */
  commitment?: CommitmentAffordance
  /**
   * The address of this session's detail panel (FR-198). Absent on the Home cards, which render
   * this row and must not gain an Agenda-only affordance.
   */
  openHref?: string
  /**
   * Hands the rendered link back to the programme, which keeps it so focus can be returned here
   * when the panel closes (FR-202). Feature code may not look an element up in the document
   * (Principle V), so the element is handed over rather than found.
   *
   * A **flat prop rather than a field on an `open` object**, deliberately: `react-hooks/refs`
   * reads any member access on a value that feeds a `ref=` attribute as dereferencing a stored
   * ref during render. The rule is right to be suspicious of that shape, and the flat form is
   * the simpler API anyway.
   */
  registerOpener?: (element: HTMLAnchorElement | null) => void
}) => (
  <li className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-b-0">
    <time
      dateTime={session.startsAt}
      className="w-14 shrink-0 py-1 font-mono text-sm text-text-muted tabular-nums"
    >
      {venueTimeOf(session.startsAt, timezone)}
    </time>

    <div className="min-w-0 flex-1 py-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-medium text-text-primary">
          {openHref ? (
            <Link ref={registerOpener} to={openHref} className="hover:underline">
              {session.title}
            </Link>
          ) : (
            session.title
          )}
        </h3>
        <TrackChip track={session.track} />
        {session.cancelled && <CancelledChip />}
        {changed && !session.cancelled && <ChangedChip />}
      </div>
      {/*
        T193 (014 tranche 2) — no room line at all when the session has none (SC-1022). A
        virtual session's whereabouts is its access link, shown on the detail panel; an empty
        room line here would be the placeholder FR-138's reasoning already forbids for speakers.
      */}
      {session.room && <p className="text-sm text-text-muted">{session.room.name}</p>}
      <SpeakerLine speakers={session.speakers} />
    </div>

    {commitment && <CommitmentControl session={session} commitment={commitment} />}
  </li>
)
