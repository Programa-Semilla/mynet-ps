import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Outlet } from 'react-router'

import { useActiveEvent } from '../active-event.js'
import { Loading } from '../AsyncState.js'
import { AttendeeCard } from '../discover/AttendeeCard.js'
import {
  DirectoryFailed,
  DirectoryOffline,
  NobodyToShow,
  NoConference,
  NoMatches,
} from '../discover/DirectoryEmptyStates.js'
import type { DirectoryOutletContext } from '../discover/AttendeeProfile.js'
import { useDirectory } from '../discover/useDirectory.js'

/**
 * T051 (006) — Discover: who is at this conference (FR-401–FR-415).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DESTINATION OWNS ITS ADDRESS AND ITS NESTED ONE.** `navigation.ts` declares this
 * element and the `:attendeeId` child; `routes.tsx` names neither. That is 005's FR-233
 * inherited rather than re-litigated — the router stopped comparing addresses to literals, and
 * 006 extends the declaration rather than putting a branch back.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Every narrowing is a server-side query parameter, never a client-side filter** (FR-409).
 *
 * Filtering an already-fetched page in the browser would be less code and would be wrong twice
 * over: the ranking and the pagination are computed *from* the narrowed set, so a client-side
 * filter would rank and page the wrong population — and a response the client filters is a
 * response that already contains what it is hiding.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const Discover = () => {
  const activeEvent = useActiveEvent()

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [interest, setInterest] = useState('')

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Debounced, so typing is not one request per keystroke.**
   *
   * The field stays fully controlled and immediate — the reader never sees their own typing lag
   * — and only the *query* trails it. 300ms is short enough that the result count settles while
   * a reader is still looking at the field, which matters because that count is announced
   * (below) and an announcement arriving after attention has moved on is noise.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const query = useMemo(() => ({ q, role, interest }), [q, role, interest])
  const directory = useDirectory(query)

  const narrowed = q !== '' || role !== '' || interest !== ''

  const reset = useCallback(() => {
    setSearchInput('')
    setQ('')
    setRole('')
    setInterest('')
  }, [])

  /**
   * The options the two filters offer, derived from what has been on screen.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Not a separate endpoint, deliberately.** A list of every role and interest at the
   * conference would be a second read of the same personal data with its own visibility rules to
   * get right, and it would disclose the shape of the population — including of attendees the
   * three conditions exclude from the listing itself. Deriving them from what has been shown
   * keeps the disclosure identical to what the reader can already see.
   *
   * The consequence is honest and worth stating: the options grow as more pages load. That is
   * better than offering a filter for a value the reader has no way to have seen.
   * ───────────────────────────────────────────────────────────────────────────────────────
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **ACCUMULATED, NOT RECOMPUTED FROM THE CURRENT PAGE — AND THAT IS A FIX, NOT AN
   * OPTIMISATION.**
   *
   * Derived from `directory.attendees` alone, the option list is the roles *of the results the
   * current filter produced*. So selecting "Designer" leaves "Designer" as the only role on
   * offer, and the reader cannot switch to another — only clear and start again, which they have
   * to guess. The control removes its own alternatives the moment it is used.
   *
   * Accumulating across loads keeps every value the reader has actually seen available to choose
   * again. It is reset on a conference switch, because a role that existed at the previous
   * conference is not a value this reader has seen *here* — offering it would both mislead and
   * widen the disclosure beyond the current conference.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const [seen, setSeen] = useState<SeenOptions>({
    eventId: directory.eventId,
    roles: [],
    interests: [],
  })

  const observed = useMemo(
    () => ({
      roles: directory.attendees.map((a) => a.role).filter((r): r is string => !!r),
      interests: directory.attendees.flatMap((a) => a.interests),
    }),
    [directory.attendees],
  )

  /**
   * **Adjusted during render, not in an effect** — React's documented pattern for deriving state
   * from changed inputs, and the one `AsyncState.tsx` records at length. An effect would paint a
   * frame with the previous conference's options still on offer, and reading a ref here is what
   * `react-hooks/refs` refuses outright.
   *
   * Comparing lengths is enough because the union only ever grows, so this converges after a
   * single extra render rather than looping.
   */
  if (seen.eventId !== directory.eventId) {
    setSeen({ eventId: directory.eventId, roles: [], interests: [] })
  } else {
    const roles = union(seen.roles, observed.roles)
    const interests = union(seen.interests, observed.interests)
    if (roles.length !== seen.roles.length || interests.length !== seen.interests.length) {
      setSeen({ eventId: directory.eventId, roles, interests })
    }
  }

  const roleOptions = seen.roles
  const interestOptions = seen.interests

  /** Held by attendee id so focus returns to the exact card that opened the profile (FR-433). */
  const openers = useRef(new Map<string, HTMLAnchorElement>())
  const restoreFocusTo = useCallback((attendeeId: string) => {
    // Absent when the card is no longer rendered — the reader narrowed the directory while the
    // dialog was open. Focus then stays where the browser put it, which is honest: there is no
    // longer a control to return to.
    openers.current.get(attendeeId)?.focus()
  }, [])

  const outletContext = useMemo<DirectoryOutletContext>(
    () => ({
      // The dialog must wait rather than refuse while the conference is still resolving. A
      // null `eventId` alone cannot tell the two apart — see the field's own note.
      resolving: activeEvent.status === 'loading',
      eventId: directory.eventId,
      restoreFocusTo,
    }),
    [activeEvent.status, directory.eventId, restoreFocusTo],
  )

  const countId = useId()

  return (
    <section aria-labelledby="discover-heading" className="px-4 py-6 tablet:px-6">
      <h1
        id="discover-heading"
        className="mb-1 font-display text-2xl font-semibold text-text-primary"
      >
        Discover
      </h1>

      {activeEvent.status === 'ready' && (
        <p className="mb-4 text-sm text-text-muted">
          {activeEvent.event.name} · {activeEvent.event.location}
        </p>
      )}

      {directory.status === 'no-conference' ? (
        <NoConference />
      ) : (
        <>
          <DirectoryControls
            search={searchInput}
            onSearch={setSearchInput}
            role={role}
            onRole={setRole}
            roleOptions={roleOptions}
            interest={interest}
            onInterest={setInterest}
            interestOptions={interestOptions}
            activeCount={[q, role, interest].filter(Boolean).length}
            onReset={reset}
            describedBy={countId}
          />

          {/*
            ─────────────────────────────────────────────────────────────────────────────────
            **The result count is announced when it changes** (Principle IV, T058).

            A sighted reader watches the grid shrink as they type. Without this, a screen-reader
            user types into a search field and is told nothing at all — the page silently becomes
            a different page. `aria-live="polite"` waits for a pause in speech, which is right
            for a value that settles as the debounce lands.

            Rendered as visible text as well, because "12 people" above a grid of twelve is
            useful to everybody and a visually-hidden live region is a thing only some readers
            get.

            **`aria-live` without `role="status"`, deliberately.** The two are equivalent as live
            regions, and the offline notice below is the surface that genuinely wants the
            `status` role — two elements claiming it made "the status" ambiguous to anything
            querying by role, including the tests. One live region, one status role.
            ─────────────────────────────────────────────────────────────────────────────────
          */}
          <p id={countId} aria-live="polite" className="mb-4 text-sm text-text-muted">
            {directory.status === 'ready'
              ? describeCount(directory.attendees.length, narrowed)
              : ''}
          </p>

          {directory.status === 'loading' && <Loading label="Loading the directory…" />}

          {directory.status === 'offline' && <DirectoryOffline onRetry={directory.retry} />}

          {directory.status === 'failed' && <DirectoryFailed onRetry={directory.retry} />}

          {directory.status === 'ready' &&
            directory.attendees.length === 0 &&
            (narrowed ? <NoMatches onReset={reset} /> : <NobodyToShow />)}

          {/*
            **Gated on `ready`, not on `attendees.length > 0`.** Rendering the grid whenever the
            list is non-empty meant a failed or offline load for a NEW conference left the
            PREVIOUS conference's cards on screen beside "this is a problem on our side" — other
            attendees' names, employers and faces under the wrong conference's heading, which is
            exactly what FR-401a forbids.
          */}
          {directory.status === 'ready' && directory.attendees.length > 0 && (
            <>
              {/*
                ─────────────────────────────────────────────────────────────────────────────
                **One column at 320px, two on tablet, three on desktop** (Principle IV).

                A grid rather than a horizontally scrolling row of cards, which is what the
                prototype's phone frame suggests and what would fail the no-horizontal-scroll
                floor outright. Cards are `min-w-0` inside the grid so a long company name
                truncates rather than widening its column past the viewport.
                ─────────────────────────────────────────────────────────────────────────────
              */}
              <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
                {directory.attendees.map((attendee) => (
                  <AttendeeCard
                    key={attendee.attendeeId}
                    attendee={attendee}
                    registerOpener={(element) => {
                      if (element) openers.current.set(attendee.attendeeId, element)
                      else openers.current.delete(attendee.attendeeId)
                    }}
                  />
                ))}
              </ul>

              {/*
                A further page failing is reported beside what is already shown, never instead
                of it. Blanking twenty-four cards because the twenty-fifth could not be fetched
                would lose the reader their place for nothing.
              */}
              {directory.moreFailed && (
                <p role="alert" className="mt-4 text-sm text-danger-700">
                  More attendees could not be loaded. What is shown above is still current — try
                  again.
                </p>
              )}

              {directory.hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={directory.loadMore}
                    disabled={directory.loadingMore}
                    className="min-h-11 rounded-sm border border-border-subtle bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary disabled:opacity-60"
                  >
                    {directory.loadingMore ? 'Loading…' : 'Show more attendees'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/*
        The profile view, rendered by the nested `:attendeeId` route. The directory stays
        mounted behind it, so closing is a navigation rather than a refetch and the browser's
        Back control closes the dialog through its own mechanism — the pattern 005 established
        for the session panel.
      */}
      <Outlet context={outletContext} />
    </section>
  )
}

/** Which filter values this reader has seen at this conference. See `seen` for why it accumulates. */
interface SeenOptions {
  readonly eventId: string | null
  readonly roles: readonly string[]
  readonly interests: readonly string[]
}

/**
 * The sorted union. Returns a list of the same length when nothing is new, which is what stops the
 * render-time adjustment above from looping.
 */
const union = (kept: readonly string[], observed: readonly string[]): string[] =>
  [...new Set([...kept, ...observed])].sort()

/**
 * The count, worded for both cases.
 *
 * **It never says how many were withheld, and never reports a total that differs from what is
 * shown** (FR-404). It counts the cards on screen, which is the only number the reader is
 * entitled to and the only one this surface has.
 */
const describeCount = (shown: number, narrowed: boolean): string => {
  if (shown === 0) return narrowed ? 'No attendees matched' : 'Nobody to show'
  const people = shown === 1 ? '1 person' : `${shown} people`
  return narrowed ? `${people} matched` : `${people} to meet`
}

/**
 * T058 — search and the two filters (FR-407, FR-408).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SEARCH FIELD HAS A REAL LABEL, NOT A PLACEHOLDER** (Principle IV).
 *
 * A placeholder is not an accessible name in every browser and screen-reader combination, it
 * disappears the moment somebody types, and it fails contrast at the sizes it is usually drawn
 * at. This is the most-used control on the destination; it gets a `<label>`. The placeholder
 * stays as an example of *what* to type, which is what a placeholder is actually for.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Native `<select>`s for both filters. Each exposes its own state and its own options through
 * the platform — no listbox to rebuild, no arrow-key handling to get right, no `aria-expanded`
 * to keep in sync, and a real touch target on mobile by default.
 */
const DirectoryControls = ({
  search,
  onSearch,
  role,
  onRole,
  roleOptions,
  interest,
  onInterest,
  interestOptions,
  activeCount,
  onReset,
  describedBy,
}: {
  search: string
  onSearch: (value: string) => void
  role: string
  onRole: (value: string) => void
  roleOptions: readonly string[]
  interest: string
  onInterest: (value: string) => void
  interestOptions: readonly string[]
  activeCount: number
  onReset: () => void
  describedBy: string
}) => {
  const searchId = useId()
  const roleId = useId()
  const interestId = useId()

  return (
    <div className="mb-4 grid gap-3">
      <div>
        <label htmlFor={searchId} className="mb-1 block text-sm font-medium text-text-primary">
          Search attendees
        </label>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Name, company, role or headline"
          // The live count is what tells a screen-reader user what their typing did, so the
          // field points at it rather than leaving the change unannounced.
          aria-describedby={describedBy}
          className="focus-ring min-h-11 w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary"
        />
      </div>

      <div className="grid gap-3 tablet:grid-cols-2">
        <div>
          <label htmlFor={roleId} className="mb-1 block text-sm font-medium text-text-primary">
            Role
          </label>
          <select
            id={roleId}
            value={role}
            onChange={(event) => onRole(event.target.value)}
            className="focus-ring min-h-11 w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Any role</option>
            {roleOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={interestId} className="mb-1 block text-sm font-medium text-text-primary">
            Interest
          </label>
          <select
            id={interestId}
            value={interest}
            onChange={(event) => onInterest(event.target.value)}
            className="focus-ring min-h-11 w-full rounded-sm border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Any interest</option>
            {interestOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/*
        How many narrowings are in force, stated rather than left to be inferred from three
        controls a reader may have scrolled past — and the way to undo all of them at once.
        Present only when something is set, so it is not a permanently disabled control.
      */}
      {activeCount > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-body">
            {activeCount === 1 ? '1 filter applied' : `${activeCount} filters applied`}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="min-h-11 rounded-sm px-2 font-medium text-accent-strong underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
