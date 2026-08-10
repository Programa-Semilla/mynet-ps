import type { HeldCard } from '@mynet/data'
import { useCardRepository } from '@mynet/platform'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { Loading } from '../AsyncState.js'
import { AvatarFallback } from '../profile/AvatarFallback.js'
import { classify, NetworkFailed, NetworkOffline, NoContacts } from './NetworkStates.js'
import { ScheduleDialog } from './ScheduleDialog.js'

/**
 * T060, T064, T072 (008) — the contacts list (FR-610, FR-615, FR-617, FR-657).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T072 — THIS IS NOT FILTERED BY THE ACTIVE CONFERENCE, ANYWHERE, AND THERE IS NO `eventId`
 * IN THIS FILE TO FILTER BY** (FR-614).
 *
 * `CardRepository.listHeld()` takes no argument, so there is no expression a later edit could
 * write here that scopes the list to the conference the reader happens to be in. That absence is
 * the client half of standing decision 7's durability promise; the server half is the missing
 * registration join in `queries/cards.ts`.
 *
 * The one place the active conference *does* appear is `atActiveEvent` on each entry, which
 * decides whether the **scheduling action** is offered (FR-639a). It never decides whether the
 * contact is listed — the difference is the whole point, and a reader who conflated the two
 * would produce exactly the disappearing-contacts bug the feature exists to prevent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Every entry resolves the sharer's live profile** (FR-611). There is no stored copy and
 * nothing cached (FR-648), so an edit somebody makes to their company or role shows up here on
 * the next load with the holder doing nothing. That is SC-603, and it is the reason this
 * repository is deliberately left out of the caching decorator at the composition root.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

type Status = 'loading' | 'ready' | 'offline' | 'failed'

export const Contacts = ({ onProposed }: { readonly onProposed?: () => void }) => {
  const headingId = useId()
  const cards = useCardRepository()

  const [contacts, setContacts] = useState<readonly HeldCard[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [attempt, setAttempt] = useState(0)

  /** Which contact the scheduling dialog is open for, or null. See `ScheduleDialog`. */
  const [scheduling, setScheduling] = useState<HeldCard | null>(null)

  /**
   * The control that opened the dialog, so focus returns to it (FR-655).
   *
   * One ref rather than one per row: only one dialog can be open at a time, so the opener is
   * whichever control set `scheduling`. Passed in rather than read from `document.activeElement`,
   * which the platform boundary refuses in feature code — see `ScheduleDialog`.
   */
  const opener = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let cancelled = false

    cards
      .listHeld()
      .then((rows) => {
        if (cancelled) return
        setContacts(rows)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // T039b — the offline/fault split is decided once, from the error type, so this surface
        // and the appointments view beside it cannot disagree about what happened (FR-657).
        setStatus(classify(error))
      })

    return () => {
      cancelled = true
    }
  }, [cards, attempt])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  /**
   * Closes the dialog and tells the pane beside this one to re-read.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **It deliberately does NOT re-read the contacts list**, and an earlier version did — with a
   * justification that turned out not to describe the code: that a second dialog "must not offer
   * the slot just claimed". It cannot. `ScheduleDialog` fetches slots in its own effect on mount,
   * that read is not cached (`passThrough` at the composition root), and closing unmounts it. The
   * next dialog asks the server regardless of anything this component holds.
   *
   * So the re-read bought nothing and cost the heaviest request in the destination — every
   * contact and every avatar — after each proposal. What genuinely needs refreshing is the
   * appointments pane, which `onProposed` handles.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  const afterScheduling = useCallback(() => {
    setScheduling(null)
    onProposed?.()
  }, [onProposed])

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h2
        id={headingId}
        className="mb-3 font-display text-lg font-medium text-text-primary tablet:mb-4"
      >
        Contacts
      </h2>

      {status === 'loading' && <Loading label="Loading your contacts…" />}
      {status === 'offline' && (
        <NetworkOffline
          what="Your contacts"
          because="Nothing is stored on this device to show instead — a contact shows the person as they are today, so an old copy is not kept here."
          onRetry={retry}
        />
      )}
      {status === 'failed' && <NetworkFailed what="Your contacts" onRetry={retry} />}

      {status === 'ready' &&
        (contacts.length === 0 ? (
          <NoContacts />
        ) : (
          /*
            A list, so a screen reader is told how many contacts there are before walking them —
            the count is the first thing a sighted reader gets from the layout, and a bare stack
            of divs gives it to nobody else.

            Two columns from `tablet` up (T130), one below. `min-w-0` on the grid children is what
            stops a long company name widening the row past the viewport (FR-659).
          */
          <ul className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-1">
            {contacts.map((contact) => (
              <li key={contact.attendeeId} className="min-w-0">
                <ContactCard
                  contact={contact}
                  onSchedule={(control) => {
                    opener.current = control
                    setScheduling(contact)
                  }}
                />
              </li>
            ))}
          </ul>
        ))}

      {scheduling && (
        <ScheduleDialog
          attendeeId={scheduling.attendeeId}
          displayName={scheduling.displayName}
          onClose={() => setScheduling(null)}
          onProposed={afterScheduling}
          returnFocusTo={opener}
        />
      )}
    </section>
  )
}

/**
 * One contact.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T064 — the event and the date of the exchange are shown on every entry** (FR-615).
 *
 * They are the only two things here that do not move when the sharer edits their profile, and
 * they are what makes a contacts list navigable once it holds more than a handful of people:
 * "the designer I met in Barcelona in September" is how somebody actually looks for a contact,
 * and neither half of that sentence is in a name.
 *
 * The date is rendered in the reader's own locale rather than in venue time. That is deliberate
 * and differs from how a *slot* is rendered (FR-624): a meeting time is a thing you must turn up
 * to at a venue, while "when did I meet this person" is a fact about the reader's own past.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const ContactCard = ({
  contact,
  onSchedule,
}: {
  readonly contact: HeldCard
  readonly onSchedule: (control: HTMLButtonElement) => void
}) => (
  <article className="flex min-w-0 gap-3 rounded-md border border-border-subtle bg-surface-raised p-4">
    {contact.avatar ? (
      <img
        src={contact.avatar}
        // Presentational: the name is rendered immediately beside it, so describing the
        // photograph would announce the same person twice. Same treatment as 006's cards.
        alt=""
        className="h-12 w-12 shrink-0 rounded-full border border-border-subtle object-cover"
      />
    ) : (
      <AvatarFallback displayName={contact.displayName} size="medium" />
    )}

    <div className="min-w-0 flex-1">
      <h3 className="truncate font-medium text-text-primary">{contact.displayName}</h3>

      {(contact.role ?? contact.company) && (
        <p className="truncate text-sm text-text-body">
          {[contact.role, contact.company].filter(Boolean).join(' · ')}
        </p>
      )}

      {contact.headline && <p className="mt-1 text-sm text-text-muted">{contact.headline}</p>}

      {contact.interests.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {contact.interests.map((interest) => (
            <li
              key={interest}
              className="rounded-sm bg-cream-200 px-2 py-0.5 text-xs text-text-body"
            >
              {interest}
            </li>
          ))}
        </ul>
      )}

      {/* T064 — where and when you met (FR-615). */}
      <p className="mt-2 text-xs text-text-muted">
        Met at {contact.eventName} ·{' '}
        <time dateTime={contact.sharedAt}>
          {new Date(contact.sharedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      </p>

      {/*
        ═════════════════════════════════════════════════════════════════════════════════════
        T091 — **the scheduling action is ABSENT for a contact who is not at this conference,
        never present-and-refusing** (FR-639a).

        An appointment is a time and a place at one conference, so proposing one to somebody who
        is not registered for it is not a thing that can happen. Offering the control and
        answering with an error afterwards would spend the reader's attention on a dialog, a slot
        choice and a typed topic before telling them.

        Absence rather than a disabled control, for the reason 006 gave for the empty action row:
        a disabled affordance for something that cannot happen reads as the product being broken.
        The contact itself is listed either way, which is FR-614 — being unreachable *here* is
        not being forgotten.
        ═════════════════════════════════════════════════════════════════════════════════════
      */}
      {contact.atActiveEvent && (
        <button
          type="button"
          onClick={(event) => onSchedule(event.currentTarget)}
          aria-label={`Propose a meeting with ${contact.displayName}`}
          className="focus-ring mt-3 inline-flex min-h-11 items-center rounded-sm border border-accent-strong px-3 py-1.5 text-sm font-medium text-accent-strong"
        >
          Propose a meeting
        </button>
      )}
    </div>
  </article>
)
