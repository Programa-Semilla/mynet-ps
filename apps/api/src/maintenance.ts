import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { pruneAttempts, pruneSessions } from './auth/throttle.js'

/**
 * Periodic retention sweeps.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `pruneAttempts` and `pruneSessions` existed before this file and **nothing called either of
 * them**. Their comments described a retention policy the service did not implement, which is
 * worse than an acknowledged gap: a reader auditing FR-042 or Principle VIII would conclude
 * retention was handled.
 *
 * `sign_in_attempts` is written on every sign-in attempt and holds keyed hashes of every
 * address ever typed at the service — including addresses belonging to people who are not
 * attendees. `auth_sessions` accumulates a row per sign-in, each recording when a particular
 * attendee was using MyNet. Neither has any use past its window.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * A timer in-process rather than a scheduled job, because it needs no new infrastructure and
 * the work is a single indexed DELETE. `unref()` means it never holds the process open, so it
 * cannot delay shutdown. Every instance sweeping is harmless — the DELETEs are idempotent.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000

const maintenancePlugin = async (app: FastifyInstance): Promise<void> => {
  const sweep = async (): Promise<void> => {
    try {
      await pruneAttempts()
      await pruneSessions()
    } catch (error) {
      // A failed sweep is not worth failing a request over, and the next one will retry. It is
      // logged rather than swallowed so that a persistently failing sweep is visible.
      app.log.error(error, 'retention sweep failed')
    }
  }

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
  timer.unref()

  app.addHook('onClose', async () => {
    clearInterval(timer)
  })

  // One sweep shortly after boot, so a long-running deployment is not the only thing that ever
  // prunes. Deferred rather than immediate so it never competes with startup.
  const initial = setTimeout(() => void sweep(), 30_000)
  initial.unref()
  app.addHook('onClose', async () => {
    clearTimeout(initial)
  })
}

export default fp(maintenancePlugin, { name: 'maintenance' })
