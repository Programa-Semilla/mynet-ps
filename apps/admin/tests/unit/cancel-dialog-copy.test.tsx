import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CancelDialog } from '../../src/app/conferences/CancelDialog.js'
import { adminSession } from '../support/services.js'

/**
 * T151 (014 tranche 2) — **the confirmation never claims nothing is attached to a session with
 * places held** (FR-1077c, SC-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS TEST READS THE RENDERED COPY, BECAUSE PROSE IS ITS SUBJECT** — 016's
 * `card-model-record` precedent. The shipped dialog decided its "nothing attached" sentence
 * from the four engagement counts alone, and FR-1077 keeps enrolment OUTSIDE them — so an
 * optional session with twenty places held rendered *"Nobody has saved this session … It can
 * be deleted outright"*, which was false at the one moment it mattered most: this confirmation
 * is the ONLY warning anybody in the product receives before those places are destroyed with
 * no notification, no marker and no trace (FR-1077a, register entry 31).
 *
 * A test asserting the places-held branch renders its own copy would pass against a dialog
 * that rendered BOTH paragraphs; the load-bearing assertions are the absences — the false
 * sentence must be gone whenever places are held, in every branch that can coexist with them.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The sentence FR-1077c forbids beside held places, matched loosely enough to survive edits. */
const NOTHING_ATTACHED = /nobody has saved this session/i
const DELETED_OUTRIGHT = /deleted outright/i

const renderDialog = (
  placesHeld: number,
  engagement = { saved: 0, notes: 0, questions: 0, votes: 0 },
) => {
  const onDeleteSession = vi.fn()
  render(
    <CancelDialog
      open
      session={adminSession({
        kind: 'optional',
        capacity: 30,
        enrolmentClosingOffsetHours: 2,
        placesHeld,
        engagement,
      })}
      placesHeld={placesHeld}
      busy={false}
      failure={null}
      onCancelSession={vi.fn()}
      onDeleteSession={onDeleteSession}
      onClose={vi.fn()}
    />,
  )
  return { onDeleteSession }
}

describe('the delete-versus-cancel confirmation with places held (FR-1077c, SC-1025)', () => {
  it('NEVER claims nothing is attached while places are held', () => {
    renderDialog(20)

    expect(
      screen.queryByText(NOTHING_ATTACHED),
      'The confirmation claimed nobody has engaged with a session that has 20 places held. ' +
        'Held places sit outside the four engagement counts by decision (v5.3.0 O2), so this ' +
        'sentence — decided from those counts alone — is false at the one moment it matters ' +
        'most: deleting destroys every held place silently (FR-1077a).',
    ).not.toBeInTheDocument()
    expect(screen.queryByText(DELETED_OUTRIGHT)).not.toBeInTheDocument()
  })

  it('states the number held, the silence, the tracelessness, and the preserving alternative', () => {
    renderDialog(20)

    // The four facts FR-1077c enumerates, each asserted separately so weakening one fails.
    expect(screen.getByText(/20 attendees hold places/i)).toBeInTheDocument()
    expect(
      screen.getByText(/will not be notified and their rows will carry no marker/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/nothing survives to explain the session’s absence/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/cancelling instead preserves everything/i)).toBeInTheDocument()
  })

  it('still OFFERS deletion beside the warning — O2 keeps such a session deletable', async () => {
    // The falsehood was the claim, not the control: FR-1077 says an optional session with
    // places held MUST remain deletable, so the fix must not quietly withhold the button.
    const { onDeleteSession } = renderDialog(7)

    const remove = screen.getByRole('button', { name: /delete it permanently/i })
    await userEvent.click(remove)

    // FR-1077b — the figure SHOWN travels as `placesSeen`, so the server can refuse and
    // re-present when the count has risen since the organizer read it.
    expect(onDeleteSession).toHaveBeenCalledWith(7)
  })

  it('keeps the nothing-attached sentence for a session with NO places and NO engagement, now naming places too', () => {
    renderDialog(0)

    // With genuinely nothing attached the reassurance is true and stays — and it now says "no
    // places are held" explicitly, so the sentence is decided by everything it claims.
    expect(screen.getByText(/no places are held/i)).toBeInTheDocument()
    expect(screen.getByText(DELETED_OUTRIGHT)).toBeInTheDocument()
  })

  it('does not claim nothing is attached when places AND engagement coexist', () => {
    // An optional session cannot be saved, but notes, questions and votes still attach to it —
    // so both figures can be non-zero at once, deletion is withheld (FR-1019), and neither
    // branch may render the false sentence.
    renderDialog(5, { saved: 0, notes: 2, questions: 0, votes: 0 })

    expect(screen.queryByText(NOTHING_ATTACHED)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete it permanently/i })).not.toBeInTheDocument()
  })
})
