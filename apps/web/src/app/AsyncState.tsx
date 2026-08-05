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
