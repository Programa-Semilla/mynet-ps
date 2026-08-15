import type { SessionNote } from '@mynet/data'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MORNING, renderAgenda } from '../support/agenda.js'

/**
 * The notes editor mounts only once the notes read has settled (FR-208, FR-214).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN EMPTY EDITOR OVER A PENDING READ WAS A DATA-LOSS PATH, AND THIS IS ITS REGRESSION
 * TEST.** The autosave controller initialises from the note it is handed and deliberately
 * never adopts a late-arriving server value — FR-214's replace-don't-merge rule. Mounted
 * against the empty map the Agenda used to hand down while `listNotes` was still in flight,
 * the editor stayed blank after the note arrived, and the attendee's first keystroke into
 * that convincing blank replaced the note the server still held. Found as an intermittent
 * end-to-end failure on a loaded machine — the timing a slow connection gives a real
 * attendee — and fixed by gating the editor on the read's own status, which is what this
 * file drives: the read is held open by the test, so the interval the defect lived in is a
 * real interval the assertions sit inside (`notes.tsx`'s reasoning, applied to the read).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

interface HeldRead {
  readonly resolve: (notes: SessionNote[]) => void
  readonly reject: (error: Error) => void
}

const heldNotesRepository = () => {
  const reads: HeldRead[] = []
  return {
    reads,
    repository: {
      listNotes: () =>
        new Promise<SessionNote[]>((resolve, reject) => {
          reads.push({ resolve, reject })
        }),
      writeNote: () => Promise.reject(new Error('no write expected in this test')),
      deleteNote: () => Promise.reject(new Error('no delete expected in this test')),
    },
  }
}

const NOTE: SessionNote = {
  sessionId: MORNING.id,
  body: 'Written earlier, on another device.',
  updatedAt: '2026-09-14T10:22:31.000Z',
}

describe('the notes section while the read is unsettled', () => {
  it('shows the note that arrives AFTER the panel opened — the defect this file exists for', async () => {
    const held = heldNotesRepository()
    const user = userEvent.setup()
    renderAgenda({ overrides: { sessionNotes: held.repository } })

    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))
    await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })

    // While the read is in flight: a stated loading line, and NO editor — a blank field here
    // is indistinguishable from "no note", and typing into it would replace one.
    expect(screen.getByText('Loading your note…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /private notes/i })).not.toBeInTheDocument()

    held.reads[0]?.resolve([NOTE])

    // The read settles late, and the note is THERE — not an empty editor that ignored it.
    const editor = await screen.findByRole('textbox', { name: /private notes/i })
    expect(editor).toHaveValue(NOTE.body)
  })

  it('offers a retry instead of an editor when the read fails, and recovers through it', async () => {
    const held = heldNotesRepository()
    const user = userEvent.setup()
    renderAgenda({ overrides: { sessionNotes: held.repository } })

    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))
    await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })

    held.reads[0]?.reject(new Error('the notes read failed'))

    // Failed: the absence of the editor is the safety property, stated rather than blank.
    expect(await screen.findByText(/your notes could not be read/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /private notes/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    held.reads[1]?.resolve([NOTE])

    const editor = await screen.findByRole('textbox', { name: /private notes/i })
    expect(editor).toHaveValue(NOTE.body)
  })
})
