import type { SessionNote } from '@mynet/data'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MORNING, renderAgenda, type RenderedAgenda } from './agenda.js'

/**
 * A notes repository whose writes are **held open until the test resolves them**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The interval between "the attendee stopped typing" and "the server confirmed" is where every
 * interesting property of the autosave lives: the status must not claim success inside it, a
 * failure must leave the text alone, and an out-of-order response must not resurrect an older
 * verdict. A double that resolved immediately would collapse that interval to nothing and the
 * assertions would all pass vacuously.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface NotesDouble {
  /** Every write attempted, in order. `body: null` means a delete. */
  readonly writes: Array<{ body: string | null }>
  /** Resolves the nth write, as the server confirming it. */
  readonly resolveWrite: (index: number, updatedAt?: string) => void
  /** Rejects the nth write, as a failure. */
  readonly rejectWrite: (index: number, error: Error) => void
  readonly repository: {
    listNotes: (eventId: string) => Promise<SessionNote[]>
    writeNote: (eventId: string, sessionId: string, body: string) => Promise<SessionNote>
    deleteNote: (eventId: string, sessionId: string) => Promise<void>
  }
}

export const notesDouble = (initial: SessionNote[] = []): NotesDouble => {
  const writes: Array<{ body: string | null }> = []
  const settlers: Array<{ resolve: (value: never) => void; reject: (error: Error) => void }> = []

  const held = <T,>(body: string | null): Promise<T> => {
    writes.push({ body })
    return new Promise<T>((resolve, reject) => {
      settlers.push({ resolve: resolve as (value: never) => void, reject })
    })
  }

  return {
    writes,
    resolveWrite: (index, updatedAt = '2026-09-14T10:22:31.000Z') => {
      const settler = settlers[index]
      if (!settler) throw new Error(`No write at index ${index}; ${settlers.length} attempted.`)
      settler.resolve({
        sessionId: MORNING.id,
        body: writes[index]?.body ?? '',
        updatedAt,
      } as never)
    },
    rejectWrite: (index, error) => {
      const settler = settlers[index]
      if (!settler) throw new Error(`No write at index ${index}; ${settlers.length} attempted.`)
      settler.reject(error)
    },
    repository: {
      listNotes: async () => initial,
      writeNote: async (_eventId, _sessionId, body) => held<SessionNote>(body),
      deleteNote: async () => held<void>(null),
    },
  }
}

export interface OpenedNotePanel extends RenderedAgenda {
  readonly notes: NotesDouble
}

/**
 * Renders Agenda, opens the first session's panel, and returns the notes double.
 *
 * The panel is opened by clicking the session title, exactly as an attendee reaches it — not by
 * rendering `PanelNotes` directly. The editor's contract includes being inside a dialog that
 * may close mid-write (US3 scenario 6), and a test that mounted it standalone could not see
 * that at all.
 */
export const openNotePanel = async (initial: SessionNote[] = []): Promise<OpenedNotePanel> => {
  const notes = notesDouble(initial)
  const user = userEvent.setup()

  const rendered = renderAgenda({ overrides: { sessionNotes: notes.repository } })

  await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))
  await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })

  return { ...rendered, notes }
}
