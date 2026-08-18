import type { AdminConference } from '@mynet/data'
import { useState } from 'react'

import { classify, describe, detailOf } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T129 (013) — promoting a registered attendee to organizer (FR-930, FR-933).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ATTENDEE IS NAMED BY EMAIL, AND THERE IS STILL DELIBERATELY NO SEARCH.**
 *
 * A picker that let an operator search attendees by name would be a **directory of every attendee
 * in the product, readable by an administrative principal** — and FR-973 says no administrative
 * tier may read a profile at all. Decision 33 puts it in one sentence: conference content is
 * authorable, a person is not.
 *
 * So the operator brings the identifier with them, from the request that prompted the promotion —
 * **and 012's walk (step A4) found what "identifier" had quietly meant**: this field demanded the
 * attendee's UUID, which no surface anywhere can show an operator, deliberately. Every promotion
 * attempt 400'd, making the act unusable outside a test that already held the UUID. The
 * identifier a real request carries is the person's **email address**, so that is what the field
 * asks for now; the server resolves it blind, inside the promoting transaction.
 *
 * **A refused promotion still says nothing about the attendee.** The server answers 404 for "no
 * such conference", "not registered for it" and now "no such address" identically, so this route
 * is not an enumeration oracle for another attendee's presence — or existence — 008's exact
 * defect on proposing a meeting, where the caller controlled the slot so the invitee was the
 * only variable. Accepting the email widens no disclosure: the answer to a miss is the same
 * silence the UUID form always gave.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const PromoteDialog = ({
  open,
  conference,
  onClose,
  onPromoted,
}: {
  readonly open: boolean
  readonly conference: AdminConference | null
  readonly onClose: () => void
  readonly onPromoted: () => void
}) => {
  const { services } = useAdminSession()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // The clean-on-open reset lives at the RENDER SITE, not here: `ConferenceList` keys this
  // dialog by the conference, so every opening mounts fresh state (012 walk, step A4's second
  // finding — a failed attempt's address and error banner used to survive into the next
  // conference's dialog).

  // Email-shaped or the button stays disabled — the server's schema would refuse garbage with a
  // generic sentence anyway (012 walk, A4 round 2), and a refusal nobody can act on is exactly
  // what this product's own error rules forbid. The disabled control is the pre-submit form of
  // the same honesty, the shape the constitution's empty-input rule already prescribes.
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const submit = async () => {
    if (!conference || !ready || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      await services.conferences.promote({ eventId: conference.id, email: email.trim() })
      setEmail('')
      onPromoted()
    } catch (error) {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // The 404 is deliberately one answer for three causes (no such conference, address not
      // registered for it, no such address) — the walker met the generic "no longer available"
      // sentence and reasonably read it as breakage (012 walk, A4 round 2). Saying the
      // possibilities out loud discloses nothing the server did not: the server still answers
      // one indistinguishable 404, and this sentence merely repeats the dialog's own stated
      // precondition back at the moment it bit.
      // ─────────────────────────────────────────────────────────────────────────────────────
      // `refused` renders its specific sentence here (DR-6, 012 walk Part B): on THIS route a
      // 409 has exactly one documented meaning — the server even writes the sentence — and the
      // generic "could not be completed" swallowed it, the exact explained-refusal defect class
      // 008 and 014 each paid for. Safe to say aloud: it describes the caller's own duplicate
      // act against a queue they are already reading.
      const failure = classify(error)
      setFailure(
        failure === 'not_found'
          ? 'That did not go through. Either this conference no longer exists, or that address ' +
              'does not belong to an attendee registered for it — which of those it was is ' +
              'deliberately not disclosed. Check the address and the conference, and try again.'
          : failure === 'refused'
            ? 'That attendee already organizes this conference.'
            : describe(failure, detailOf(error)),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminDialog
      open={open}
      title={conference ? `Add an organizer to ${conference.name}` : 'Add an organizer'}
      onClose={onClose}
    >
      <p className="text-sm">
        They must already be registered for this conference. Promotion changes nothing they can see
        in MyNet — their account, profile and conversations are untouched.
      </p>

      <label htmlFor="attendee-email" className="mt-4 block text-sm font-medium text-text-primary">
        Attendee email
      </label>
      <input
        id="attendee-email"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-1 mb-4 block min-h-11 w-full rounded-lg border border-border-strong px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
      />

      {failure ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready || submitting}
          className="min-h-11 flex-1 rounded-lg bg-coral-600 px-4 text-sm font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50 hover:bg-coral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          {submitting ? 'Promoting…' : 'Promote'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-border-strong px-4 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
        >
          Cancel
        </button>
      </div>
    </AdminDialog>
  )
}
