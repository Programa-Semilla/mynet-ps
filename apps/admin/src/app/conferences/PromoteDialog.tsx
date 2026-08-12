import type { AdminConference } from '@mynet/data'
import { useState } from 'react'

import { classify, describe } from '../errors.js'
import { useAdminSession } from '../session.js'
import { AdminDialog } from '../shell/AdminDialog.js'

/**
 * T129 (013) — promoting a registered attendee to organizer (FR-930, FR-933).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ATTENDEE IS NAMED BY IDENTIFIER, AND THERE IS DELIBERATELY NO SEARCH.**
 *
 * A picker that let an operator search attendees by name would be a **directory of every attendee
 * in the product, readable by an administrative principal** — and FR-973 says no administrative
 * tier may read a profile at all. Decision 33 puts it in one sentence: conference content is
 * authorable, a person is not.
 *
 * So the operator brings the identifier with them, from the report or the request that prompted
 * the promotion. That is deliberately less convenient, and building the search would be the
 * single easiest way to give administration a view of everybody.
 *
 * **A refused promotion says nothing about the attendee.** The server answers 404 for "no such
 * conference" and "not registered for it" identically, so this route is not an enumeration oracle
 * for another attendee's presence at a conference — 008's exact defect on proposing a meeting,
 * where the caller controlled the slot so the invitee was the only variable.
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
  const [attendeeId, setAttendeeId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const ready = attendeeId.trim().length > 0

  const submit = async () => {
    if (!conference || !ready || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      await services.conferences.promote({ eventId: conference.id, attendeeId: attendeeId.trim() })
      setAttendeeId('')
      onPromoted()
    } catch (error) {
      setFailure(describe(classify(error)))
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

      <label htmlFor="attendee-id" className="mt-4 block text-sm font-medium text-text-primary">
        Attendee identifier
      </label>
      <input
        id="attendee-id"
        value={attendeeId}
        onChange={(event) => setAttendeeId(event.target.value)}
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
