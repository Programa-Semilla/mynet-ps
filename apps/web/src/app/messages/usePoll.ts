import { useDocumentVisible } from '@mynet/platform'
import { useEffect, useRef, useState } from 'react'

/**
 * T015 (016) — **the poll shape 007 argued for, extracted so a second caller cannot re-argue it**
 * (FR-1007, FR-1008, FR-1009, FR-1010, FR-1054).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **FOUR PROPERTIES, AND NOT ONE OF THEM IS A PERFORMANCE TWEAK.**
 *
 * `useConversation` worked all four out for the thread's three-second poll and wrote down why.
 * The conversation list needs the same four at a different interval, and the thing worth copying
 * is the **reasoning** rather than the code — so it is restated here rather than left behind in
 * a file this one no longer resembles:
 *
 *   1. **Visible-only**, because a backgrounded tab is a tab nobody is looking at — and the
 *      browser throttles its timers unpredictably, so a poll that "runs" there fires in *bursts*
 *      when the tab wakes. It is not scheduled at all while hidden, rather than scheduled and
 *      skipped, and it reads **immediately** on becoming visible rather than waiting for the
 *      next tick (FR-1008). That is the moment freshness actually matters: somebody has just
 *      come back.
 *   2. **Jittered**, so a hall full of clients does not re-converge on the same instant after an
 *      outage.
 *   3. **Backing off to a ceiling** on consecutive failure, because during an incident the load
 *      has to *drop*, not hold steady — and it must recover on its own when the service does,
 *      without the reader reloading (FR-1009).
 *   4. **A failure threshold of three** before saying anything, because announcing a single
 *      missed tick would train people to ignore the notice (FR-1010).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`enabled` is what FR-1054 is expressed through, and it is deliberately not a width.**
 *
 * The list additionally pauses when the layout has replaced it with an open thread. The caller
 * passes that as a condition on **what is on screen**, never on which layout band is active —
 * the band is merely how the answer happens to be determined today, and a future layout change
 * must not silently re-enable a poll against a list nobody can see.
 *
 * A disabled poll is not scheduled, for the same reason a hidden one is not.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Nothing here is a cache** (FR-1013). This hook owns a timer and a failure count; whatever
 * `onTick` writes lives in the caller's own state for the lifetime of its mount. That is the
 * distinction `useConversation` and 006's `useDirectory` both had to draw, and Messages is
 * entirely uncached by decision.
 */

/**
 * The ceiling the backoff climbs to while refreshes keep failing.
 *
 * A minute rather than "give up": the surface must recover on its own when the service does, and
 * an attendee who put their phone down should not have to reload to find out.
 */
const MAX_POLL_INTERVAL_MS = 60_000

/**
 * How many consecutive failures before the reader is told this has stopped keeping up.
 *
 * Not one: a single missed tick on a train is ordinary and self-correcting.
 */
const STALE_AFTER_FAILURES = 3

/**
 * The smallest gap this will ever leave between one tick finishing and the next starting.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A GUARD ON THE ELAPSED-TIME SUBTRACTION BELOW, NOT A TUNING KNOB.**
 *
 * Subtracting the request's own duration is what makes the documented worst case true, and taken
 * alone it has one bad end: a service answering *successfully* but slower than `intervalMs` would
 * be polled back to back, which is the load shape the backoff exists to avoid arriving by a
 * different door. This floor keeps a gap there. It costs the bound nothing at the durations that
 * matter — a two-second round trip against a ten-second interval still lands well inside
 * SC-1002's fifteen.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const MIN_GAP_MS = 1_000

/**
 * Thrown by an `onTick` whose work has been **superseded** — a newer read owns the screen.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A THIRD OUTCOME, BECAUSE "IT DID NOT FAIL" AND "IT SUCCEEDED" ARE DIFFERENT THINGS AND THIS
 * HOOK USED TO CONFLATE THEM** (review finding P-m2).
 *
 * `Messages.read` returned normally when a newer read had overtaken it, so a superseded tick was
 * recorded here as a **success**: `failures` reset to zero and `stale` cleared. During an
 * incident that is a real, compounding fault rather than a tidiness point — pressing *Try again*
 * supersedes the tick in flight, so the backoff drops from as much as sixty seconds straight back
 * to ten and the "stopped updating" notice disappears **while the retry itself is still
 * failing**. Load amplification at the worst possible moment, and a notice that flickers, which
 * is precisely what FR-1010's three-failure threshold exists to prevent.
 *
 * So a superseded tick changes **nothing**: not the failure count, not `stale`, not the schedule.
 * It is still followed by the next tick, at whatever interval was already in force.
 *
 * A thrown sentinel rather than a resolved marker value, because `onTick` returns `void` and the
 * only channel it has is rejection — and because a caller that *forgets* to signal supersession
 * then falls into the old behaviour rather than into a silent no-op. **FR-1012 is unaffected**:
 * what a superseded read must not do is write to the screen, and that guard lives in the caller,
 * before it throws.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const POLL_SUPERSEDED = Symbol('poll-superseded')

/** Spread, not entropy — see `useConversation`, which records why this needs no platform port. */
const jitter = (): number => Math.random()

export interface PollOptions {
  /** 10s for the conversation list; 3s for an open thread. */
  readonly intervalMs: number
  /**
   * `false` pauses the poll entirely — nothing is scheduled and nothing fires.
   *
   * FR-1054 passes **list visibility** here. Combined with the document-visibility condition this
   * hook applies itself, a tick happens only when the reader could actually see the result.
   */
  readonly enabled: boolean
  /**
   * One refresh. **Rejecting is the failure signal** that drives the backoff and `stale`, so a
   * caller that swallows its own errors will poll at a fixed rate forever and never report a
   * fault — which is the shape 007 found and fixed in the thread.
   *
   * **Rejecting with `POLL_SUPERSEDED` is the third outcome** — a newer read owns the screen and
   * this one is neither a success nor a failure. See that symbol for why the distinction matters.
   */
  readonly onTick: () => Promise<void>
}

export interface PollState {
  /** Consecutive failed refreshes. Zero after any success. */
  readonly failures: number
  /** True once failures have reached the threshold, meaning it rather than a missed tick. */
  readonly stale: boolean
}

export const usePoll = ({ intervalMs, enabled, onTick }: PollOptions): PollState => {
  const visible = useDocumentVisible()

  const [failures, setFailures] = useState(0)
  const [stale, setStale] = useState(false)

  /**
   * The failure count the *scheduler* reads, kept in a ref as well as in state.
   *
   * The effect below closes over its values once per run, so a state-only counter would compute
   * every backoff from the count as it stood when the effect started — which is zero — and the
   * interval would never grow. The state copy exists for rendering; this copy exists for timing.
   */
  const failureCount = useRef(0)

  /**
   * The latest `onTick`, so a caller passing an inline closure does not restart the poll on every
   * render — which would reset the timer forever and produce a request per render rather than
   * per interval. The effect depends on the *conditions*, never on the callback.
   */
  const tick = useRef(onTick)
  useEffect(() => {
    tick.current = onTick
  }, [onTick])

  useEffect(() => {
    if (!enabled || !visible) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async (): Promise<void> => {
      try {
        await tick.current()
        if (cancelled) return
        failureCount.current = 0
        setFailures(0)
        setStale(false)
      } catch (error: unknown) {
        // Both branches skip a superseded tick: the success path cannot be reached at all when
        // the caller throws, and this one leaves the failure count, `stale` and the interval
        // exactly as they were. See `POLL_SUPERSEDED`.
        if (cancelled || error === POLL_SUPERSEDED) return
        failureCount.current += 1
        setFailures(failureCount.current)
        setStale(failureCount.current >= STALE_AFTER_FAILURES)
      }
    }

    /**
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **THE DELAY IS MEASURED FROM WHEN THE TICK STARTED, NOT FROM WHEN IT ANSWERED** (review
     * finding P-m1).
     *
     * This runs in `.finally`, so scheduling naively from *now* would add the request's own
     * duration to every gap and the real worst case would be `T_request + interval×1.2 +
     * T_request` — one whole round trip more than `LIST_POLL_INTERVAL_MS`'s docblock and SC-1002
     * both claim. At a two-second round trip on congested cellular that is roughly sixteen
     * seconds against a fifteen-second bound, and it would fail **looking like flakiness**, which
     * is the exact outcome that docblock predicted for a bound that was never satisfiable.
     *
     * Subtracting the elapsed time makes the documented arithmetic true rather than restating it.
     * `MIN_GAP_MS` is the floor that stops the subtraction turning a slow-but-working service
     * into a back-to-back request loop.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    const schedule = (startedAt: number): void => {
      if (cancelled) return

      const backoff = Math.min(intervalMs * 2 ** failureCount.current, MAX_POLL_INTERVAL_MS)
      // ±20%. Deterministic jitter would not be jitter.
      const jittered = backoff * (0.8 + jitter() * 0.4)
      const delay = Math.max(jittered - (Date.now() - startedAt), MIN_GAP_MS)

      timer = setTimeout(runAndSchedule, delay)
    }

    const runAndSchedule = (): void => {
      const startedAt = Date.now()
      void run().finally(() => schedule(startedAt))
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The first read IS the poll's first tick, and it happens now rather than in `intervalMs`.**
    //
    // Because `visible` and `enabled` are dependencies, coming back to the tab — or returning to
    // the list from a thread — re-runs this effect body immediately. That is FR-1008's
    // refresh-on-visible with no second listener to keep in step with the first, and it is the
    // shape `useConversation` arrived at after two effects raced each other on mount.
    // ───────────────────────────────────────────────────────────────────────────────────────
    runAndSchedule()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs, enabled, visible])

  return { failures, stale }
}
