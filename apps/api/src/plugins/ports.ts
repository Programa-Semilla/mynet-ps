import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { loadConfig } from '../config.js'
import type { MailService } from '../mail/service.js'
import { SinkMailService } from '../mail/sink-adapter.js'
import type { PushService } from '../notifications/service.js'
import { SinkPushService } from '../notifications/sink-adapter.js'
import { WebPushService } from '../notifications/web-push-adapter.js'
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
  /** 007 — notification delivery. See below for why its unconfigured state differs from mail's. */
  readonly push?: PushService
}

const portsPlugin = async (app: FastifyInstance, options: PortOverrides): Promise<void> => {
  const config = loadConfig()

  app.decorate('storage', options.storage ?? new DbStorageService())

  // The sink throws under production rather than being silently swapped for a no-op, so the
  // absence of a provider is a startup failure with a message naming the register entry.
  app.decorate('mail', options.mail ?? new SinkMailService())

  // ───────────────────────────────────────────────────────────────────────────────────────
  // 007 — the third port, and **its unconfigured state is deliberately less severe than mail's**.
  //
  // `SinkMailService` refuses to construct under production because it holds verification and
  // reset links, and a reset link *is* the account. `SinkPushService` holds a sender's name and a
  // message the recipient was about to be shown anyway — nothing that is a credential — so a boot
  // failure would be refusing to start over a capability FR-552 says every attendee may decline.
  //
  // What it is instead is a silent non-delivery, which the warning below makes visible.
  // ───────────────────────────────────────────────────────────────────────────────────────
  //
  // ───────────────────────────────────────────────────────────────────────────────────────
  // **THE REAL ADAPTER IS SELECTED BY CONFIGURATION, NOT BY ENVIRONMENT.**
  //
  // A VAPID pair being present *is* the provisioning signal — there is nothing else to configure,
  // because Web Push has no vendor to sign up with (see `web-push-adapter.ts`). So the same rule
  // holds everywhere: keys present, deliver for real; keys absent, record to the sink. That makes
  // a local end-to-end test identical to production rather than a special mode, which is the only
  // arrangement in which testing it locally proves anything.
  //
  // Both halves are already required together — `config.ts` refuses to start with exactly one —
  // so checking the private key is checking the pair.
  //
  // The sink's logger is handed over **only in development**, so a recorded delivery is visible to
  // somebody walking `quickstart.md` and invisible everywhere else: that line carries the message
  // body, and a body is content rather than diagnostics.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const push =
    options.push ??
    (config.push.vapidPrivateKey && config.push.vapidPublicKey
      ? new WebPushService({
          subject: config.push.vapidSubject,
          publicKey: config.push.vapidPublicKey,
          privateKey: config.push.vapidPrivateKey,
          log: app.log,
        })
      : new SinkPushService(config.nodeEnv === 'development' ? app.log : undefined))

  app.decorate('push', push)

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

  // 007 — the same signal for the second pending dependency. Logged outside development too when
  // the keys are absent, because in a deployed environment "notifications are not arriving" is a
  // question somebody asks of the logs, and a missing provider is the answer.
  if (!options.push && !config.push.vapidPrivateKey) {
    app.log.warn(
      'Web Push is not provisioned (register entry 20 — no VAPID keys). ' +
        'Notifications are recorded by the development sink, not delivered. Messages, unread ' +
        'state and the open-thread poll are unaffected: delivery is deniable by design (FR-552).',
    )
  }
}

export default fp(portsPlugin, { name: 'ports' })
