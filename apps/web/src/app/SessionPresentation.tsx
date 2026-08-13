import type { Session } from '@mynet/data'
import { Bookmark, BookmarkCheck } from 'lucide-react'
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
 * **PER-ROW, IN TEXT, AND NEVER A COUNT** (FR-1031, constitution v4.2.0 N2).
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
 * T024 (005) — whether this row can be saved, and what doing so would mean.
 *
 * Optional on `SessionRow`, and that optionality is deliberate rather than convenience: this
 * row is also what the Home rest-of-day card renders. A mandatory save control would have
 * changed a card belonging to another feature, which standing decision 9 and FR-226 both
 * forbid. Absent, the row is byte-for-byte the row 002 shipped.
 */
export interface SaveAffordance {
  readonly saved: boolean
  readonly onToggle: () => void
}

/**
 * The save control (FR-184, FR-186, FR-189, FR-196).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The accessible name states what activating it will do, and changes with the state**
 * (FR-189). The icon carries the same information for a sighted reader and the name carries it
 * for everyone else; neither is the sole carrier. The session title is in the name because a
 * programme contains dozens of these, and "Save" repeated forty times tells a screen-reader
 * user which control they are on and nothing about which session.
 *
 * **Never `disabled` while the write is in flight.** A disabled element is not focusable, so
 * the browser would move focus to the body and a keyboard reader would lose their place
 * mid-list — the handoff SC-206 tests across the whole journey. Re-entry is safe without it
 * because saving is idempotent (FR-187), so a double activation is the same request twice.
 *
 * **Touch sizing at 44px** (`size-11`), met by the control's own box rather than by padding on
 * the row, so the target is real at 320px without crowding the time, title and track beside it
 * (SC-211, FR-199).
 *
 * No focus styling here: `:focus-visible` is applied once, globally, in `theme/tokens.css`.
 * Adding `focus:outline-none` is the prototype defect the constitution names by name.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const SaveControl = ({ session, save }: { session: Session; save: SaveAffordance }) => (
  <button
    type="button"
    onClick={save.onToggle}
    aria-label={
      save.saved
        ? `Remove ${session.title} from your agenda`
        : `Save ${session.title} to your agenda`
    }
    className={`flex size-11 shrink-0 items-center justify-center rounded-md ${
      save.saved ? 'text-accent-strong' : 'text-text-muted'
    }`}
  >
    {save.saved ? (
      <BookmarkCheck aria-hidden="true" className="size-5" />
    ) : (
      <Bookmark aria-hidden="true" className="size-5" />
    )}
  </button>
)

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
  save,
  openHref,
  registerOpener,
  changed = false,
}: {
  session: Session
  timezone: string
  /**
   * T076 (014) — whether **this attendee** has yet looked at this session since it materially
   * changed (FR-1030). Defaults to false, so the Home cards and the programme's "All" view —
   * which know nothing about the attendee's saved set — render exactly the row they did before.
   */
  changed?: boolean
  /** Omitted by the Home cards, which stay exactly as 002 built them. */
  save?: SaveAffordance
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
      <p className="text-sm text-text-muted">{session.room.name}</p>
      <SpeakerLine speakers={session.speakers} />
    </div>

    {save && <SaveControl session={session} save={save} />}
  </li>
)
