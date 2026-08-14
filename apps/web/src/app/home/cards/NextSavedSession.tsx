import { OfflineError, type Session } from '@mynet/data'
import { useCatalogRepository, useSavedSessionRepository } from '@mynet/platform'
import { useCallback } from 'react'
import { Link } from 'react-router'

import { Failed, Loading, useAsync } from '../../AsyncState.js'
import { CancelledChip, ChangedChip, SpeakerLine, TrackChip } from '../../SessionPresentation.js'
import { nextSession, venueTimeOf } from '../../sessions.js'
import type { EventCardProps, HomeCard } from '../contract.js'

/**
 * T079–T081 (005) — **this feature's own Home card**: what is next from the sessions the
 * attendee chose (FR-223–FR-226, SC-208).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS CARD READS THE REPOSITORIES ITSELF AND TOUCHES NOTHING ELSE ON HOME** (FR-226,
 * research D8, standing decision 9).
 *
 * The delivery roadmap said "up-next prefers saved sessions", which describes editing the card
 * 002 contributed. Standing decision 9 and the registry both forbid a feature editing another
 * feature's card, and the roadmap is a plan that cannot override a ratified decision — so this
 * feature appends its own card and leaves `UpNext` untouched. The specification records that
 * departure explicitly rather than making it quietly.
 *
 * It follows that this card reads **nothing** from `UpNext` and shares no state with it. Its
 * independence is what allows it to fail alone (FR-164, SC-212), and the duplicate-read cost
 * that would normally follow is absorbed by the cache at the repository boundary — the same
 * reads, served once, which is why adding a third reader to Home does not add a request
 * (SC-210).
 *
 * **The two next-session cards may legitimately disagree.** The generic "Up next" names the
 * next session in the programme; this one names the next session the attendee *chose*. That is
 * recorded as an open question rather than engineered around.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const NextSavedSessionCard = ({ event }: EventCardProps) => {
  const catalog = useCatalogRepository()
  const savedSessions = useSavedSessionRepository()

  const load = useCallback(async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Both reads are this card's own. Neither is shared with a sibling, and neither is reached
    // through one — the cache makes them cheap without making them coupled.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const [sessions, saved] = await Promise.all([
      catalog.listSessions(event.id),
      savedSessions.listSaved(event.id),
    ])

    // =====================================================================================
    // **T074 (014), corrected by the deep review — THE MARKER IS CARRIED, NOT PROJECTED AWAY.**
    //
    // This used to reduce the saved read to bare identifiers, with a comment saying the card
    // "renders what is next, never a marker: Home's marker belongs on the rows the attendee can
    // act on". No Home surface rendered one. FR-1030 says the marker appears "on its row in
    // Agenda **and on Home**", and US3 scenario 2 says the same — so the requirement's named
    // surface was missing while the data to satisfy it was being read and discarded here.
    //
    // `RestOfDay` cannot be the surface: it renders the whole programme's remainder and knows
    // nothing about the attendee's saved set. This card already reads both, which makes it the
    // one place on Home where "a saved session of yours has changed" is answerable.
    //
    // **Still per-row and still never a count** (FR-1031): what travels below is one boolean for
    // one session, and nothing here can total them.
    // =====================================================================================
    const changed = new Set(
      saved.filter((entry) => entry.changedSinceViewed).map((entry) => entry.sessionId),
    )
    const savedIds = new Set(saved.map((entry) => entry.sessionId))

    return sessions
      .filter((session) => savedIds.has(session.id))
      .map((session) => ({ ...session, changed: changed.has(session.id) }))
  }, [catalog, savedSessions, event.id])

  // `emptyWhen: () => false` — "nothing saved" is a state this card renders itself, with its
  // own wording, because it is different from "nothing left today" and the attendee needs to
  // be able to tell them apart (FR-225).
  const saved = useAsync<MarkedSession[]>(load, [load], { emptyWhen: () => false })

  return (
    <section
      aria-label="Next saved session"
      className="h-full rounded-md border border-border-subtle bg-surface-raised px-4 py-4 shadow-card tablet:px-5"
    >
      <h2 className="mb-3 font-display text-base font-medium text-text-primary">
        Next saved session
      </h2>

      {saved.status === 'loading' && <Loading label="Loading your saved sessions…" />}

      {saved.status === 'failed' && (
        <Failed
          message={
            saved.error instanceof OfflineError
              ? 'Your saved sessions need a connection, and there is not one right now.'
              : 'Your saved sessions could not be loaded. This is a problem on our side.'
          }
          onRetry={saved.retry}
        />
      )}

      {saved.status === 'ready' && <NextSavedBody saved={saved.data} event={event} />}
    </section>
  )
}

/**
 * A saved session plus whether it has materially changed since this attendee last looked.
 *
 * One boolean per session, and deliberately nothing else — no total, no list, no "3 changes"
 * anywhere (FR-1031, v4.2.0 N2). The count that FR-1034a permits exists only in a push payload.
 */
type MarkedSession = Session & { readonly changed: boolean }

const NextSavedBody = ({
  saved,
  event,
}: {
  saved: MarkedSession[]
  event: EventCardProps['event']
}) => {
  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **T080 — scoped to the venue's current day, and that scoping IS the requirement** (FR-224,
   * FR-225).
   *
   * `nextSession` searches only today because searching the whole programme looks equivalent
   * and is not: at 20:00 on day one of a four-day conference, the next saved session overall
   * is tomorrow's 09:30 — and it renders as a bare `09:30` with no date, which reads as *later
   * today*. The attendee cannot tell it is wrong, which is precisely what FR-225 forbids.
   *
   * Reused from `sessions.ts` rather than reimplemented, so this card and Agenda cannot come to
   * disagree about what "today" means at 23:50 in one timezone.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const upcoming = nextSession(saved, new Date(), event.timezone)

  // FR-225 — nothing saved at all is a *different fact* from nothing left today, and gets its
  // own wording. Collapsing them would tell an attendee who has built a full agenda that they
  // have not, every evening.
  if (saved.length === 0) {
    return (
      <p className="text-sm text-text-body">
        You have not saved any sessions yet.{' '}
        <Link to="/agenda" className="font-medium text-accent-strong underline">
          Browse the programme
        </Link>{' '}
        and save the ones you intend to attend.
      </p>
    )
  }

  if (!upcoming) {
    return (
      <p className="text-sm text-text-body">
        Nothing more from your agenda today.{' '}
        <Link to="/agenda" className="font-medium text-accent-strong underline">
          See your full agenda
        </Link>
        .
      </p>
    )
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <time
          dateTime={upcoming.startsAt}
          className="font-mono text-lg font-medium text-accent-strong tabular-nums"
        >
          {venueTimeOf(upcoming.startsAt, event.timezone)}
        </time>
        <TrackChip track={upcoming.track} />
        {/*
          FR-1030 — the marker, on Home as well as on the Agenda row. In **text**, beside the
          track, for the reason `ChangedChip` records: a coloured dot is exactly the marker a
          screen reader cannot report. Suppressed while the session is cancelled, because
          `CancelledChip` is then the more specific truth — the same precedence `SessionRow` uses.
        */}
        {upcoming.cancelled ? <CancelledChip /> : upcoming.changed ? <ChangedChip /> : null}
      </div>

      <h3 className="font-display text-lg font-medium text-text-primary">
        {/* Straight into the session's own panel — the address this feature gave it (FR-198). */}
        <Link to={`/agenda/${upcoming.id}`} className="hover:underline">
          {upcoming.title}
        </Link>
      </h3>
      <p className="text-sm text-text-muted">{upcoming.room.name}</p>
      <SpeakerLine speakers={upcoming.speakers} />
    </div>
  )
}

export const nextSavedSessionCard: HomeCard = {
  id: 'next-saved-session',
  title: 'Next saved session',
  slot: 'primary',
  /**
   * After `up-next` (0) and `rest-of-day` (1).
   *
   * **Not `lead`**, and not ahead of the card 002 placed first. FR-157 allows at most one lead
   * card, and reordering existing entries is forbidden outright — `order` is what lets this
   * append without disturbing anything, because the shell sorts by it rather than by array
   * position.
   */
  order: 2,
  scope: 'event',
  Component: NextSavedSessionCard,
}
