import type { DirectoryEntry } from '@mynet/data'
import { Link } from 'react-router'

import { availabilityLabelFor, intentLabelFor } from '../profile/labels.js'
import { AvatarFallback } from '../profile/AvatarFallback.js'

/**
 * T050 (006) — one attendee card (FR-405, FR-412, FR-434).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NO MESSAGE CONTROL, NO SHARE-CARD CONTROL, NO SCHEDULE CONTROL** (FR-434).
 *
 * The prototype's card carries all three, and 007 and 008 are the features that build them.
 * Shipping them now as dead or permanently-disabled buttons is the specific thing the roadmap
 * rule forbids: a disabled control is an affordance for a capability that does not exist, and
 * an attendee who presses it learns that the product is broken rather than that the feature is
 * not built. The card offers the one action that *is* built — open this person's profile.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The whole card is the link, and the link is the only interactive element in it.**
 *
 * A card with a heading link plus a separate "View profile" button gives a keyboard user two
 * stops for one destination and a screen-reader user two announcements of the same name. One
 * link, named by the attendee, is both simpler and more usable.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const AttendeeCard = ({
  attendee,
  registerOpener,
}: {
  attendee: DirectoryEntry
  /**
   * Hands this card's link over so focus can be returned to it when the profile dialog closes
   * (FR-433). A callback ref rather than a document lookup, for the reason `Agenda.tsx` records:
   * feature code may not reach a DOM global, and the card may have been filtered out of the
   * list while the dialog was open.
   */
  registerOpener?: (element: HTMLAnchorElement | null) => void
}) => {
  // Narrowed by membership rather than asserted: an unexpected value yields `null`, which both
  // renders as "not set" — the honest answer — instead of silently vanishing (`labels.ts`).
  const intent = intentLabelFor(attendee.networkingIntent)
  const availability = availabilityLabelFor(attendee.availability)

  return (
    <li className="focus-ring-within relative flex flex-col rounded-md border border-border-subtle bg-surface-raised p-4 shadow-card">
      <div className="flex items-start gap-3">
        {attendee.avatar ? (
          <img
            src={attendee.avatar}
            // Presentational: the name is rendered immediately beside it, so describing the
            // photograph would announce the same person twice.
            alt=""
            className="h-12 w-12 shrink-0 rounded-full border border-border-subtle object-cover"
          />
        ) : (
          <AvatarFallback displayName={attendee.displayName} size="medium" />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-text-primary">
            {/*
              `after:absolute after:inset-0` stretches the link over the whole card, so the
              entire card is the target at a touch size — without nesting the card's other
              content inside an anchor, which would make every line of it part of the link's
              accessible name.
            */}
            <Link
              to={`/discover/${attendee.attendeeId}`}
              ref={registerOpener}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {attendee.displayName}
            </Link>
          </h3>

          {(attendee.role || attendee.company) && (
            <p className="truncate text-sm text-text-body">
              {[attendee.role, attendee.company].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {attendee.headline && <p className="mt-3 text-sm text-text-body">{attendee.headline}</p>}

      {attendee.interests.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {attendee.interests.map((interest) => (
            <li
              key={interest}
              className="rounded-sm bg-cream-200 px-2 py-0.5 text-xs text-text-body"
            >
              {interest}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {/*
          ─────────────────────────────────────────────────────────────────────────────────────
          **Intent and availability are never colour-only** (Principle IV, T058).

          The prototype shows availability as a coloured dot. A dot alone is unreadable to anyone
          who cannot distinguish the two colours and invisible to a screen reader entirely, and
          "available" versus "busy" is exactly the kind of status a reader acts on. Each carries
          its word; the colour is an additional cue, never the cue.
          ─────────────────────────────────────────────────────────────────────────────────────
        */}
        {availability && (
          <span
            className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 font-medium ${
              // mint-800 on mint-100, not mint-700: the tokens file records that mint-700 is
              // 3.85:1 there and below AA, and this pairing is measured at 6.51:1.
              attendee.availability === 'available'
                ? 'bg-mint-100 text-mint-800'
                : 'bg-cream-200 text-text-body'
            }`}
          >
            <span aria-hidden="true" className="text-[0.6em]">
              ●
            </span>
            {availability}
          </span>
        )}

        {intent && <span className="text-text-muted">{intent}</span>}

        {/*
          FR-412 — the shared-interest count, shown on the card.

          **Zero is not displayed**, and that is a stated decision rather than an omission
          (spec, Assumptions): the label is a reason to make contact, and "0 interests in
          common" is not one. The ordering is unaffected — a zero-overlap attendee still
          appears, simply last (FR-411).
        */}
        {attendee.sharedInterestCount > 0 && (
          <span className="font-medium text-accent-strong">
            {attendee.sharedInterestCount === 1
              ? '1 interest in common'
              : `${attendee.sharedInterestCount} interests in common`}
          </span>
        )}
      </div>
    </li>
  )
}
