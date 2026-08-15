import { OfflineError, type Session } from '@mynet/data'
import { useCatalogRepository, useFreshness } from '@mynet/platform'
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { Outlet } from 'react-router'

import { ActiveEventFailure, NoConferencesNotice, useActiveEvent } from '../active-event.js'
import { MyAgendaEmptyState } from '../agenda/MyAgendaEmptyState.js'
import { StalenessStamp } from '../agenda/StalenessStamp.js'
import type { AgendaOutletContext } from '../agenda/SessionPanel.js'
import { useCommitments } from '../agenda/useCommitments.js'
import { useSessionNotes } from '../agenda/useSessionNotes.js'
import { Failed, Loading, useAsync } from '../AsyncState.js'
import { SessionRow } from '../SessionPresentation.js'
import { groupByVenueDay } from '../sessions.js'

/**
 * T049 (002), T026/T028 (005) — Agenda: the conference programme, and the attendee's own
 * schedule within it (FR-137, FR-184–FR-197).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T028 — THIS COMMENT REPLACES THE ONE THAT SAID THERE IS NO SAVE CONTROL** (FR-237).
 *
 * 002 shipped this destination deliberately read-only, with a load-bearing comment saying so
 * and an acceptance scenario asserting the absence of a save control — on the reasoning that a
 * greyed-out star is an affordance for a capability that does not exist. That reasoning was
 * right then and it is spent now: **005 is the feature that makes the capability exist.**
 *
 * Every session now carries a save control, and the filter above the programme narrows it to
 * the attendee's own — since tranche 2, saves AND held places (FR-1066). No stale statement
 * that saving does not exist may remain in this source, and
 * the 002 scenario asserting the absence was *updated* rather than deleted, so the history
 * records that the absence was deliberate and is now deliberately ended (FR-236).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **FR-192 — the programme itself is unchanged.** Still the active conference's full schedule,
 * chronological and grouped into venue-local days, exactly as 002 delivers it: the grouping is
 * still `groupByVenueDay` from `sessions.ts`, so this destination and the Home cards cannot come
 * to disagree about what "today" means at 23:50 in one timezone. 005 adds a filter above it and
 * a control on each row; it does not re-implement the programme.
 *
 * The "My agenda" view keeps that same grouping (FR-194) — the same schedule with fewer rows,
 * not a list of bookmarks.
 */
export const Agenda = () => {
  const activeEvent = useActiveEvent()

  return (
    <section aria-labelledby="agenda-heading" className="px-4 py-6 tablet:px-6">
      <h1
        id="agenda-heading"
        className="mb-1 font-display text-2xl font-semibold text-text-primary"
      >
        Agenda
      </h1>

      {activeEvent.status === 'loading' && <Loading label="Loading your conference…" />}

      {activeEvent.status === 'none' && <NoConferencesNotice />}

      {activeEvent.status === 'failed' && (
        <ActiveEventFailure message={activeEvent.message} onRetry={activeEvent.retry} />
      )}

      {activeEvent.status === 'ready' && (
        <>
          <p className="mb-4 text-sm text-text-muted">
            {activeEvent.event.name} · {activeEvent.event.location}
          </p>
          <Programme event={activeEvent.event} />
        </>
      )}
    </section>
  )
}

/**
 * Which sessions the programme is showing. Defaults to `all` (FR-193).
 *
 * T194 (014 tranche 2) — `saved` became `mine`, and the label "Saved" became "My agenda"
 * (FR-1066a): the filtered set carries held places as well as saves, so a label asserting it
 * holds only saves would lie about what it contains — the specification renamed it rather
 * than leaving that to implementation.
 */
type Filter = 'all' | 'mine'

const Programme = ({ event }: { event: { id: string; timezone: string } }) => {
  const catalog = useCatalogRepository()
  const freshness = useFreshness()
  const committed = useCommitments(event.id)
  const notes = useSessionNotes(event.id)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(() => catalog.listSessions(event.id), [catalog, event.id])
  // `emptyWhen` claims the no-programme case (FR-139) so it cannot be rendered as a bare
  // `ready` with an empty list — which would look identical to a failure that returned nothing.
  const sessions = useAsync<Session[]>(load, [load], {
    emptyWhen: (data) => Array.isArray(data) && data.length === 0,
  })

  const showAll = useCallback(() => setFilter('all'), [])

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The controls that open the panel, held by session id, so focus can be returned to the
   * exact one that opened it** (FR-202, T038).
   *
   * `<dialog>` does not restore focus to the opener reliably across engines, so this feature
   * does it explicitly. The element is *handed over* by a callback ref rather than looked up
   * in the document, because feature code may not reach a DOM global — a lookup would be both
   * a Principle V violation and a lie waiting to happen, since the row may have been filtered
   * out of the list while the panel was open.
   *
   * A ref rather than state: storing elements in state would re-render the whole programme on
   * every row mount, and nothing renders *from* this.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const openers = useRef(new Map<string, HTMLAnchorElement>())

  const restoreFocusTo = useCallback((sessionId: string) => {
    // Absent when the row is no longer rendered — the attendee withdrew it from the panel, or
    // switched to "My agenda" while it was open. Focus then stays where the browser put it,
    // which is the honest outcome: there is no longer a control to return to.
    openers.current.get(sessionId)?.focus()
  }, [])

  const programmeState = sessions.status
  const outletContext = useMemo<AgendaOutletContext>(
    () => ({
      status:
        programmeState === 'loading' ? 'loading' : programmeState === 'failed' ? 'failed' : 'ready',
      // FR-218 — the panel words a failure the same way the programme behind it does, so an
      // attendee is never told two different things about one cause.
      offline: sessions.status === 'failed' && sessions.error instanceof OfflineError,
      // The panel selects from the programme rather than fetching a session of its own, which
      // is what keeps one source of truth for session data (research D4, FR-203).
      sessions: programmeState === 'ready' ? sessions.data : [],
      timezone: event.timezone,
      eventId: event.id,
      // The map AND the read's own state, because the map alone cannot say "not read yet".
      // A sentence here used to call the empty-map-while-loading display acceptable *because*
      // a write replaces whatever is on the server — which is precisely why it was not: an
      // editor mounted over a pending read stayed empty when the note arrived (the controller
      // never adopts a late value, FR-214), and the replace-on-keystroke rule then made that
      // convincing blank a data-loss path. The panel now mounts the editor only once this
      // status reads `ready`, which is the arrangement the hook's header always described —
      // "this reports its own state and the caller decides".
      notes: notes.bySession,
      notesStatus: notes.status,
      retryNotes: notes.retry,
      restoreFocusTo,
      /**
       * T075 (014) — opening the panel is what clears this session's change marker (FR-1030).
       *
       * The panel is the surface an attendee reads to find out **what** changed, so viewing it
       * is what "they have looked at it" means. Handed down rather than called from the panel's
       * own repository, because the marker lives in `useCommitments` here — one owner for the
       * commitment set and the markers on it, rather than two readers that can disagree.
       */
      markViewed: committed.markViewed,
      /**
       * T208 (014 tranche 2) — the commitment set, handed down whole so the panel's fifth
       * section operates the same instance the rows do: one owner for the set, its markers and
       * its refusals, rather than two readers that can disagree.
       */
      commitments: committed,
    }),
    [
      programmeState,
      sessions,
      event.timezone,
      event.id,
      notes.bySession,
      notes.status,
      notes.retry,
      restoreFocusTo,
      committed,
    ],
  )

  if (sessions.status === 'loading') {
    return (
      <>
        <Loading label="Loading the programme…" />
        {/* Mounted while the programme loads, so a cold load opens the panel on its own
            loading state rather than on an empty destination (FR-203). */}
        <Outlet context={outletContext} />
      </>
    )
  }

  if (sessions.status === 'failed') {
    return (
      <>
        <Failed
          message={
            sessions.error instanceof OfflineError
              ? 'The programme needs a connection, and there is not one right now. Nothing is cached for offline use.'
              : 'The programme could not be loaded. This is a problem on our side, not with your account.'
          }
          onRetry={sessions.retry}
        />
        {/* A panel address loaded while the programme is failing says so inside the panel,
            rather than opening an empty one or silently not opening at all. */}
        <Outlet context={outletContext} />
      </>
    )
  }

  // ───────────────────────────────────────────────────────────────────────────────────────
  // FR-139 — a conference with no published programme is a valid answer, not a failure. The
  // filter is still rendered below it, because an attendee who switches to "My agenda" must be
  // told they have committed to nothing rather than shown the programme's wording again.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const programme = sessions.status === 'empty' ? [] : sessions.data

  // T194 — the "Mine" filter shows the UNION of both commitments: `ids` already carries saves
  // and held places from one discriminated list (R13), so widening the set cost no second read
  // and no second predicate — this line is byte-for-byte the membership test 005 shipped.
  const visible =
    filter === 'mine' ? programme.filter((session) => committed.ids.has(session.id)) : programme

  return (
    <>
      {/*
        FR-216 — a surface served from the cache states when its content was retrieved. `null`
        while the programme is live, so nothing is stamped that is not stale (SC-204).
      */}
      <StalenessStamp retrievedAt={freshness.lastRetrieved(event.id, 'programme')} />

      <AgendaFilter value={filter} onChange={setFilter} />

      {/*
        The commitment set failing is not the programme failing, so it is reported beside the
        programme rather than instead of it: the whole schedule is still readable, and only the
        personal layer is missing. Announced, because the attendee is about to see commitment
        controls whose state we do not actually know. Worded for both commitments (FR-1066a).
      */}
      {committed.status === 'failed' && (
        <div className="mb-4">
          <Failed
            message={
              committed.error instanceof OfflineError
                ? 'Your agenda needs a connection, and there is not one right now. The programme below is still readable.'
                : 'Your agenda could not be read. This is a problem on our side — the programme below is still readable.'
            }
            onRetry={committed.retry}
          />
        </div>
      )}

      {/*
        FR-217, FR-1069 — a refused write is explained, and the displayed state did not change.
        The message is the server's own sentence wherever one was written to be read: each of
        the five commitment refusals carries its own code and its own explanation, classified on
        `error.code` and never on the class (FR-1069a).
      */}
      {committed.refusal && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-warning-500 bg-warning-100 px-4 py-3 text-sm text-warning-700"
        >
          {committed.refusal.message}
        </div>
      )}

      {sessions.status === 'empty' && filter === 'all' && (
        <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
          <p className="mb-1 font-medium text-text-primary">
            This conference has no published programme yet
          </p>
          <p className="text-sm text-text-body">
            When the organisers publish sessions, they will appear here in chronological order.
          </p>
        </div>
      )}

      {/* FR-195 — nothing committed to, said explicitly, with the way back to the programme. */}
      {filter === 'mine' && visible.length === 0 && <MyAgendaEmptyState onShowAll={showAll} />}

      {visible.length > 0 && (
        <div className="grid gap-6">
          {groupByVenueDay(visible, event.timezone).map((day) => (
            <section key={day.date} aria-label={day.label}>
              <h2 className="mb-1 font-display text-lg font-medium text-text-primary">
                {day.label}
              </h2>
              <ul className="grid rounded-md border border-border-subtle bg-surface-raised px-4">
                {day.sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    timezone={event.timezone}
                    commitment={{
                      committed: committed.ids.has(session.id),
                      // The whole session, not its id: the KIND is what decides which write
                      // runs (FR-1063), and the hook must not re-derive it from membership.
                      onToggle: () => committed.toggle(session),
                    }}
                    changed={committed.changed.has(session.id)}
                    openHref={`/agenda/${session.id}`}
                    registerOpener={(element) => {
                      if (element) openers.current.set(session.id, element)
                      else openers.current.delete(session.id)
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/*
        The detail panel, rendered by the nested `:sessionId` route (FR-198, research D4). The
        programme above stays mounted behind it, so closing is a navigation rather than a
        refetch and the browser's Back control closes the panel by its own mechanism (FR-205).
      */}
      <Outlet context={outletContext} />
    </>
  )
}

/**
 * T026 (005), T194 (014 tranche 2) — the All/Mine filter (FR-193, FR-197, FR-1066a).
 *
 * The second option was labelled "Saved" until tranche 2 made that label false: the set it
 * shows is the union of both commitments — saved mandatory sessions and held places in
 * optional ones — and FR-1066 requires an enrolled session to appear here exactly as a saved
 * one does. "My agenda" is true of both.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A radio group, not a pair of toggle buttons.** The two states are mutually exclusive, so
 * radios say so structurally; the current state is exposed by `checked` without any ARIA of
 * this feature's own; and arrow-key movement between the options comes from the platform
 * rather than from key handling that would have to be written and kept correct (FR-197).
 *
 * The same reasoning as the detail panel's native `<dialog>`: where the platform already
 * implements the accessible behaviour correctly, taking it is the least likely route to
 * failing it again.
 *
 * Rendered as a segmented control. It does not scroll horizontally at 320px because it is two
 * short options in a flex row, not a scrolling tab strip (SC-211).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const AgendaFilter = ({ value, onChange }: { value: Filter; onChange: (next: Filter) => void }) => {
  const name = useId()

  const option = (option: Filter, label: string) => (
    <label
      key={option}
      // ─────────────────────────────────────────────────────────────────────────────────
      // `focus-ring-within` forwards the input's focus ring to this box. Without it the ring
      // is drawn around a control with no visible extent — present in the DOM, absent to the
      // attendee. See the rule's own note in `theme/tokens.css`.
      //
      // `min-h-11` is the 44px touch target, met by the segment rather than by the input, so
      // the target is real at 320px (FR-197, SC-211).
      // ─────────────────────────────────────────────────────────────────────────────────
      className={`focus-ring-within relative flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-center text-sm font-medium ${
        value === option ? 'bg-surface-raised text-text-primary shadow-card' : 'text-text-muted'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={option}
        checked={value === option}
        onChange={() => onChange(option)}
        // ───────────────────────────────────────────────────────────────────────────────
        // Transparent and stretched over the whole segment, rather than `sr-only`.
        //
        // `sr-only` clips the input to a 1px box. It stays in the accessibility tree, so a
        // screen reader is served correctly — but the element a pointer or a finger can
        // actually hit becomes 1px, and only the label's implicit activation saves it. That
        // is a real difference, not a testing artifact: it showed up as a browser refusing
        // to click the control because the label was intercepting its own input's pointer
        // events.
        //
        // Stretched, the input *is* the hit area, at the full 44px segment size.
        // ───────────────────────────────────────────────────────────────────────────────
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      {label}
    </label>
  )

  return (
    <fieldset className="mb-6">
      <legend className="sr-only">Which sessions to show</legend>
      <div className="flex gap-1 rounded-md border border-border-subtle bg-surface p-1">
        {option('all', 'All sessions')}
        {option('mine', 'My agenda')}
      </div>
    </fieldset>
  )
}
