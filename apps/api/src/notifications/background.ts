import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * T-review (014) — **work that outlives the response, and the drain that makes it safe.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WHY A FAN-OUT MUST NOT BE AWAITED INSIDE THE REQUEST THAT CAUSED IT.**
 *
 * 007's message send fanned out to one recipient's devices — at most a handful, all bounded
 * individually by `dispatchPush`. 014's saved-session change fans out to **every attendee who
 * saved the session**, which at a keynote is hundreds or thousands. Awaited in the organizer's
 * request, the arithmetic is fatal: `recipients × push RTT`, so a thousand savers against a
 * *healthy* push service is several minutes, and `app.ts` sets `connectionTimeout: 10_000`.
 *
 * The organizer therefore saw **a network failure for a cancellation that had succeeded** — and
 * their retry got the 404 `cancelSession` returns for an already-cancelled session. The worst
 * possible pairing for the one act this whole trigger exists for.
 *
 * So the act commits, the organizer is answered, and the fan-out continues here.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THIS IS NOT A JOB QUEUE, AND IT MUST NOT BECOME ONE.**
 *
 * There is no persistence, no retry, no schedule and no timer. A task is a promise that started
 * **because a request arrived**, and the only thing tracked is whether it has finished. That
 * boundary is load-bearing: `tests/unit/no-session-start-trigger.test.ts` asserts that nothing
 * time-driven can dispatch, because a reminder needs a scheduler and v5.2.0 N1 forbids a session
 * *starting* from reaching anybody. A `setInterval` or a durable queue here would be the
 * mechanism that guard exists to keep out, so this file deliberately has neither and a reviewer
 * should refuse one.
 *
 * If a dispatch is lost to a crash it stays lost. That is the same guarantee 007 already gives —
 * a failed delivery is logged and not retried — and it is why `last_change_act_id` is not a work
 * item: nothing re-reads it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE DRAIN IS A PRODUCTION REQUIREMENT FIRST AND A TEST AFFORDANCE SECOND.**
 *
 * `server.ts` shuts down on SIGTERM by calling `app.close()` under a bounded timeout, so without
 * a drain a deploy would kill an in-flight fan-out and a hundred attendees would never learn
 * their session moved. `server.ts` therefore drains **before** `app.close()`, inside that
 * existing bound.
 *
 * **Deliberately not an `onClose` hook**, which is the obvious placement and the wrong one:
 * `buildApp` registers an `onClose` that closes the database pool, and every task here needs the
 * pool. Two hooks at the same level leave the ordering to Fastify's execution order rather than
 * to anything this file can state, and getting it backwards means the drain runs against a closed
 * pool — a fan-out that fails at exactly the moment it was being protected. An explicit call in
 * the shutdown path is one line and cannot be read the wrong way round.
 *
 * That it also lets an integration test assert *after* the fan-out has completed is a
 * consequence rather than the purpose — which matters, because this project refuses test-only
 * endpoints in production code. A test that awaits this is asserting the same thing an operator
 * relies on at shutdown.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

export interface BackgroundWork {
  /**
   * Starts a task that outlives the response.
   *
   * **Never rejects, and never returns the task.** A caller who could await it would be back to
   * blocking the request, and a rejection reaching the event loop unhandled would take the
   * process down — so the failure is logged here and goes no further. Every caller's own body is
   * expected to be failure-tolerant too; this is the backstop, not the handler.
   */
  run(name: string, task: () => Promise<void>): void

  /** Resolves once every task started so far has settled. */
  drain(): Promise<void>

  /** How many tasks are outstanding. For logging and assertions, never for control flow. */
  readonly pending: number
}

const createBackgroundWork = (log: FastifyBaseLogger): BackgroundWork => {
  const outstanding = new Set<Promise<void>>()

  return {
    run(name, task) {
      // Wrapped so the set is cleaned up on both outcomes, and so a synchronous throw inside
      // `task()` is captured rather than escaping past `run`.
      const settled = (async () => {
        try {
          await task()
        } catch (error) {
          log.error({ err: error, task: name }, 'background task failed')
        }
      })()

      outstanding.add(settled)
      void settled.finally(() => outstanding.delete(settled))
    },

    async drain() {
      // Re-read the set each pass: a task may start another while it runs, and a single
      // `Promise.all` over a snapshot would return with that one still in flight.
      while (outstanding.size > 0) {
        await Promise.all([...outstanding])
      }
    },

    get pending() {
      return outstanding.size
    },
  }
}

const backgroundPlugin = async (app: FastifyInstance): Promise<void> => {
  app.decorate('background', createBackgroundWork(app.log))
}

export default fp(backgroundPlugin, { name: 'background-work' })
