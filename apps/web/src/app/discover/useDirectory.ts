import { OfflineError, type DirectoryEntry, type DirectoryQuery } from '@mynet/data'
import { useDirectoryRepository } from '@mynet/platform'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useActiveEvent } from '../active-event.js'

/**
 * T049 (006) — the directory, page by page (FR-401a, FR-401b, FR-410a, research D4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DE-DUPLICATION HERE IS NOT A CACHE, AND THE DISTINCTION IS THE WHOLE DESIGN.**
 *
 * FR-410a asks for a guarantee neither pagination style gives alone. Offset paging duplicates
 * whenever somebody joins the conference while you scroll. Keyset paging is stable against that,
 * but not against a score that *falls* for an attendee already passed — edit your interests and
 * you drop below a cursor the reader has already gone by, and you come back.
 *
 * The only server-side fix is a snapshot of the result set, and **FR-466 forbids retaining
 * anything**. So the closing happens here: a new page is checked against the list already being
 * rendered, by attendee identifier, before it is appended.
 *
 * That is **the rendered list**, not a cache. It holds nothing between views, it is not keyed by
 * anybody, it is never read after this component unmounts, and it does not survive a conference
 * switch or a change of query. Nothing about it is a second copy of personal data on the device,
 * which is the property FR-466 is actually protecting.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * What the directory currently is.
 *
 * `no-conference` is a **state, not an error** (FR-401b). It is where every attendee stands
 * between creating an account and entering their first join code, and rendering it as an empty
 * directory or a failure would tell them something untrue about a perfectly healthy account.
 */
export type DirectoryStatus = 'loading' | 'ready' | 'offline' | 'failed' | 'no-conference'

export interface Directory {
  /** Accumulated across pages, de-duplicated by attendee identifier. */
  readonly attendees: readonly DirectoryEntry[]
  readonly status: DirectoryStatus
  /** True while a *further* page is in flight. The pages already shown stay on screen. */
  readonly loadingMore: boolean
  /** A further page failed. What is already shown is not discarded (Principle IX declaration). */
  readonly moreFailed: boolean
  readonly hasMore: boolean
  readonly loadMore: () => void
  readonly retry: () => void
  /** The conference the results belong to, for a caller that must re-key on a switch. */
  readonly eventId: string | null
}

export const useDirectory = (query: DirectoryQuery): Directory => {
  const repository = useDirectoryRepository()
  const activeEvent = useActiveEvent()

  const eventId = activeEvent.status === 'ready' ? activeEvent.event.id : null

  const [attendees, setAttendees] = useState<readonly DirectoryEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<DirectoryStatus>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FR-401a: nothing from the previous conference survives, INCLUDING AN IN-FLIGHT PAGE.**
   *
   * Two mechanisms, because one is not enough:
   *
   *   1. the accumulated list is cleared **during render** when the conference or the query
   *      changes, so no frame is ever painted with the old conference's cards under the new
   *      conference's name. Clearing in an effect paints the stale frame first — the same
   *      reasoning `AsyncState.tsx` records for `useAsync`, and the same defect SC-102 named.
   *   2. every request takes a sequence number and a response is dropped unless it is the
   *      newest. Without this, a slow first page for conference A can land *after* conference
   *      B's and append A's attendees to B's directory — which is not a flicker, it is the
   *      leak FR-401a is written about.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const issued = useRef(0)
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE NEWEST ISSUED REQUEST — claimed AT ISSUE, not at apply. That is the fix.**
   *
   * This was `applied`, set when a response landed, and guarded with
   * `if (sequence < applied.current) return`. That rejects a response older than the newest
   * *applied* one, but not one superseded by a newer *issued* one — and the difference was a
   * genuine FR-401a violation:
   *
   *   page 1 for conference A resolves (applied = 1); the reader presses "Show more"
   *   (issued = 2, in flight); the reader switches to B; the render-time reset clears the list
   *   and the effect issues 3. A's page 2 now resolves, evaluates `2 < 1` as false, and appends
   *   **A's attendees and A's cursor** onto the list just cleared for B.
   *
   * FR-401a is explicit that nothing from the previous conference may be retained "including in
   * any in-flight or partially rendered page". The effect has a `cancelled` cleanup; `loadMore`
   * has none, so it needed this. Claiming at issue makes `sequence !== newest.current` mean
   * "somebody has asked a newer question", which is the actual test.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const newest = useRef(0)

  /**
   * **`resolving` is carried, not inferred from `eventId === null`** — the same distinction
   * `AttendeeProfile` draws, and for the same reason.
   *
   * A null identifier means two opposite things: the active conference has not resolved yet, and
   * the reader has joined none. Inferring the second from the first told an attendee who is *at*
   * a conference to go and join one — reachable on every re-resolution, including the retry on
   * the active-conference failure state and a change of signed-in attendee.
   */
  const resolving = activeEvent.status === 'loading'

  const key = `${eventId ?? ''}|${query.q ?? ''}|${query.role ?? ''}|${query.interest ?? ''}`
  const [appliedKey, setAppliedKey] = useState(key)
  if (key !== appliedKey) {
    setAppliedKey(key)
    setAttendees([])
    setCursor(null)
    setLoadingMore(false)
    setMoreFailed(false)
    setStatus(resolving || eventId !== null ? 'loading' : 'no-conference')
  }

  const statusFor = (error: unknown): DirectoryStatus =>
    // FR-467 — offline is worded distinguishably from a fault on our side, and the two are
    // separated here rather than at the presentation layer so both surfaces cannot disagree.
    error instanceof OfflineError ? 'offline' : 'failed'

  useEffect(() => {
    if (activeEvent.status === 'loading') return

    if (eventId === null) {
      // Registered for nothing, or the conference could not be resolved. The distinction is the
      // provider's to report, and Discover renders a different state for each.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(activeEvent.status === 'none' ? 'no-conference' : 'failed')
      return
    }

    const sequence = ++issued.current
    newest.current = sequence
    let cancelled = false

    repository
      .list(eventId, query)
      .then((page) => {
        if (cancelled || sequence !== newest.current) return
        setAttendees(page.attendees)
        setCursor(page.nextCursor)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (cancelled || sequence !== newest.current) return
        setStatus(statusFor(error))
      })

    return () => {
      cancelled = true
    }
    // `query` is spread into its four scalar parts: the object identity changes on every render
    // of the caller, and depending on it would re-fetch the directory continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, eventId, activeEvent.status, query.q, query.role, query.interest, attempt])

  const loadMore = useCallback(() => {
    if (eventId === null || cursor === null || loadingMore) return

    const sequence = ++issued.current
    newest.current = sequence
    setLoadingMore(true)
    setMoreFailed(false)

    repository
      .list(eventId, { ...query, cursor })
      .then((page) => {
        // Superseded by a conference switch, a changed query, or a newer page. See `newest`.
        if (sequence !== newest.current) return

        // ───────────────────────────────────────────────────────────────────────────────────
        // The de-duplication (research D4). Checked against the list being rendered, by
        // identifier, so an attendee whose score fell below the cursor is dropped rather than
        // shown twice. FR-410a permits the omission and forbids the repeat, and this is where
        // that asymmetry becomes true.
        // ───────────────────────────────────────────────────────────────────────────────────
        setAttendees((current) => {
          const seen = new Set(current.map((entry) => entry.attendeeId))
          return [...current, ...page.attendees.filter((entry) => !seen.has(entry.attendeeId))]
        })
        setCursor(page.nextCursor)
      })
      .catch(() => {
        if (sequence !== newest.current) return
        // **What is already shown is not discarded.** A further page failing is not the
        // directory failing, and blanking twenty-four cards because the twenty-fifth could not
        // be fetched would lose the reader their place for no reason.
        setMoreFailed(true)
      })
      .finally(() => {
        // Unconditional. Gating this on the sequence left "Show more" permanently disabled
        // whenever a request was superseded — and a superseded one is exactly the case where the
        // reader is still looking at a list they may want more of.
        setLoadingMore(false)
      })
    // Same reasoning as the effect: the four scalars, not the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, eventId, cursor, loadingMore, query.q, query.role, query.interest])

  /**
   * **Retries the right thing.**
   *
   * When the failure is the *active conference* rather than the directory, bumping `attempt`
   * re-runs an effect that finds `eventId` still null and sets `failed` again — a "Try again"
   * button that could never succeed, on the only control the state offers. Agenda handles the
   * same condition by delegating to the provider's own retry; so does this.
   */
  const reloadActiveEvent = activeEvent.reload
  const retry = useCallback(() => {
    setStatus('loading')
    if (eventId === null) reloadActiveEvent()
    setAttempt((n) => n + 1)
  }, [eventId, reloadActiveEvent])

  return {
    attendees,
    status,
    loadingMore,
    moreFailed,
    hasMore: cursor !== null,
    loadMore,
    retry,
    eventId,
  }
}
