import { useCallback, useEffect, useState } from 'react'

/**
 * T063 — loading and failure presentation for every network-crossing state (FR-058).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A failure must never render as an empty success.**
 *
 * That is the whole reason this is a four-state machine rather than `data | undefined`. With
 * a nullable value, "still loading", "loaded nothing", and "failed" all collapse into the
 * same falsy check, and the screen shows an empty state for a request that actually errored.
 * The attendee then believes they have no events, which is worse than an error message.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty' }
  | { status: 'failed'; error: Error }

export interface UseAsyncOptions {
  /** Treats an empty array as the `empty` state rather than `ready` with no items. */
  readonly emptyWhen?: (data: unknown) => boolean
}

export const useAsync = <T,>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  options: UseAsyncOptions = {},
): AsyncState<T> & { retry: () => void } => {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **005 — WHEN THE INPUTS CHANGE, THE ANSWER TO THE OLD QUESTION IS DISCARDED.**
   *
   * Without this, a `ready` state fetched for one set of inputs stays on screen while the read
   * for the *new* inputs is in flight. On Agenda that is not a cosmetic flicker: switching
   * conference left the **previous conference's programme** rendered under the new
   * conference's name, which is precisely what SC-102 forbids — "no surface still shows the
   * previous conference".
   *
   * The race was always here. 002 did not see it because the replacement fetch was a fast
   * local round trip that usually won; 005 added a cache read and write on the same path,
   * which was enough to lose the race reliably and to turn a latent defect into a failing
   * end-to-end test. The fix belongs here rather than at the call site, because every surface
   * that swaps conference has exactly this problem.
   *
   * **Set during render, not in an effect.** This is React's documented "adjusting state when
   * a prop changes" pattern: it re-renders immediately with the corrected state, before
   * anything is committed to the screen, so the stale data is never shown at all. Doing it in
   * an effect would paint the stale frame first — and would be the cascading `setState` that
   * `react-hooks/set-state-in-effect` rejects, which is why the effect below still does not.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const [appliedDeps, setAppliedDeps] = useState(deps)
  if (
    deps.length !== appliedDeps.length ||
    deps.some((dep, index) => !Object.is(dep, appliedDeps[index]))
  ) {
    setAppliedDeps(deps)
    setState({ status: 'loading' })
  }

  const isEmpty = options.emptyWhen ?? ((data: unknown) => Array.isArray(data) && data.length === 0)

  useEffect(() => {
    let cancelled = false

    // No synchronous `setState({ status: 'loading' })` here. It is what react-hooks flags as
    // a cascading render, and it is unnecessary: the initial state is already `loading`, and
    // `retry` sets it from an event handler where setState belongs.
    load()
      .then((data) => {
        if (cancelled) return
        setState(isEmpty(data) ? { status: 'empty' } : { status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'failed',
          error: error instanceof Error ? error : new Error('Something went wrong.'),
        })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { ...state, retry }
}

/** Shared loading presentation. Announced, so the wait is not silent to a screen reader. */
export const Loading = ({ label }: { label: string }) => (
  <p role="status" aria-live="polite" className="py-6 text-sm text-text-muted">
    {label}
  </p>
)

/**
 * Shared failure presentation.
 *
 * Always offers a retry. A failure the attendee can do nothing about is a dead end, and
 * FR-059 requires an error to say what to do next — "try again" is the honest answer when the
 * cause is on our side.
 */
export const Failed = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div
    role="alert"
    className="rounded-md border border-danger-500 bg-danger-100 px-4 py-3 text-sm text-danger-700"
  >
    <p className="mb-2">{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="rounded-sm border border-danger-500 px-3 py-1 font-medium"
    >
      Try again
    </button>
  </div>
)
