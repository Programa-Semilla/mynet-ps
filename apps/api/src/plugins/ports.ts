import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { loadConfig } from '../config.js'
import type { MailService } from '../mail/service.js'
import { SinkMailService } from '../mail/sink-adapter.js'
import { DbStorageService } from '../storage/db-adapter.js'
import type { StorageService } from '../storage/service.js'

/**
 * T020 (004) — the two ports this feature introduces, bound to their implementations in one
 * place (FR-352, FR-393, FR-394).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A plugin rather than four lines inside `app.ts`.** That file's steps 1–7 encode a
 * registration order that is load-bearing for reasons unrelated to routing, and its own header
 * says so; every feature that adds a few lines there is how the ordering eventually gets
 * disturbed by accident. This adds one registration step and nothing else.
 *
 * It is the **server-side composition root** — the mirror of `apps/web/src/app/services.ts` on
 * the client — and it exists for the same reason: something has to hand real implementations to
 * interfaces, and it should be one reviewable file rather than a habit spread across handlers.
 * A route reads `app.storage` and `app.mail` and cannot tell which adapter it received.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **PRODUCTION HAS NO ADAPTER FOR EITHER PORT YET, AND THIS FILE SAYS SO OUT LOUD.**
 *
 * Register entry 11 has not chosen an object-storage provider and entry 18 has not chosen a
 * transactional mail provider. FR-352 and FR-394 keep both off the critical path by requiring
 * implementations that need no provisioning, which is what `DbStorageService` and
 * `SinkMailService` are.
 *
 * They are not equivalent risks, and the difference is recorded rather than averaged away.
 * `DbStorageService` genuinely works — it stores and serves real bytes durably, so a preview
 * deployment behaves correctly and only the *scale* argument is deferred. `SinkMailService`
 * sends nothing, so **verification and password recovery cannot be proven in a deployed
 * environment until entry 18 is answered** — the specification's Dependencies section names it
 * as the one open dependency capable of making a shipped surface non-functional rather than
 * merely unproven. The sink refuses to construct under `NODE_ENV=production`, so this shows up
 * as a boot failure rather than as mail that silently goes nowhere.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface PortOverrides {
  readonly storage?: StorageService
  readonly mail?: MailService
}

const portsPlugin = async (app: FastifyInstance, options: PortOverrides): Promise<void> => {
  const config = loadConfig()

  app.decorate('storage', options.storage ?? new DbStorageService())

  // The sink throws under production rather than being silently swapped for a no-op, so the
  // absence of a provider is a startup failure with a message naming the register entry.
  app.decorate('mail', options.mail ?? new SinkMailService())

  // Recorded at boot rather than only in this comment, because "mail is not provisioned" is the
  // sort of thing that is obvious for a week and invisible for a quarter.
  //
  // Not under test, where the harness builds an application per file and the warning would be
  // sixteen identical lines of noise around the assertions somebody is trying to read. The
  // integration suite asserts the sink's *behaviour* instead, which is the stronger signal.
  if (config.nodeEnv === 'development' && !options.mail) {
    app.log.warn(
      'Transactional mail is not provisioned (register entry 18). Verification and reset links ' +
        'are written to the development sink, not sent.',
    )
  }
}

export default fp(portsPlugin, { name: 'ports' })
