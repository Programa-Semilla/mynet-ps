import { type SessionNote } from '@mynet/data'
import { useSessionNotesRepository } from '@mynet/platform'
import { useCallback, useEffect, useState } from 'react'

/**
 * The attendee's notes for one conference, read **once as a set** (FR-208, contracts).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A set rather than one note per session, for three reasons that all point the same way:
 * opening the detail panel then needs no request of its own, so the panel appears immediately
 * on a cold load; the whole set caches as a single entry per conference; and there is exactly
 * one loading and one failure state to reason about instead of one per session.
 *
 * Keyed by session id because that is how every consumer asks for it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **A failure here is not a failure of the programme.** Notes are the personal layer over a
 * schedule that is perfectly readable without them, so this reports its own state and the
 * caller decides what to do with it — rather than throwing and taking Agenda down with it.
 */
export interface SessionNotes {
  readonly status: 'loading' | 'ready' | 'failed'
  readonly bySession: ReadonlyMap<string, SessionNote>
  readonly error: Error | null
  readonly retry: () => void
}

export const useSessionNotes = (eventId: string): SessionNotes => {
  const repository = useSessionNotesRepository()

  const [status, setStatus] = useState<SessionNotes['status']>('loading')
  const [bySession, setBySession] = useState<ReadonlyMap<string, SessionNote>>(() => new Map())
  const [error, setError] = useState<Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    repository
      .listNotes(eventId)
      .then((notes) => {
        if (cancelled) return
        setBySession(new Map((notes as SessionNote[]).map((note) => [note.sessionId, note])))
        setError(null)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        // Never an empty map presented as success: an attendee shown a blank note where they
        // wrote one would type it again over the top of the original.
        setError(cause instanceof Error ? cause : new Error('Your notes could not be read.'))
        setStatus('failed')
      })

    return () => {
      cancelled = true
    }
  }, [repository, eventId, attempt])

  const retry = useCallback(() => {
    setStatus('loading')
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { status, bySession, error, retry }
}
