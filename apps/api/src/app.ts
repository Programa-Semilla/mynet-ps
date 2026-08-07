/**
 * T028 — Fastify application composition.
 *
 * **Registration order is load-bearing and is expressed only here.** Each step below states
 * why it sits where it does; reordering them silently breaks a requirement rather than
 * producing an obvious error.
 *
 * Kept separate from `server.ts` so tests build the application and drive it with
 * `fastify.inject()` without binding a port — exercising the real routing, validation, and
 * auth stack rather than a substitute for it (research.md D11).
 */
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify'

import { loadConfig } from './config.js'
import { closeDb } from './db/client.js'
import maintenance from './maintenance.js'
import authContext from './plugins/auth-context.js'
import errors from './plugins/errors.js'
import eventAccess from './plugins/event-access.js'
import swagger from './plugins/swagger.js'
import { ROUTES } from './routes/index.js'

export interface BuildAppOptions {
  /**
   * Observes every route as it registers — the seam the route audit uses (002, T068, FR-149).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * A test seam in production code, and worth justifying rather than hiding. Fastify's
   * `onRoute` hook only sees routes registered *after* it is added, so an audit that built the
   * app and then asked what it contained would be too late. The alternative — parsing
   * `printRoutes()` output — would make the guarantee depend on a human-readable format that
   * carries no compatibility promise.
   *
   * The audit's whole value is that it inspects the **real** application rather than a
   * reconstruction of it, so this stays.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  readonly onRoute?: (route: RouteOptions) => void
}

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const config = loadConfig()

  const app = Fastify({
    logger: {
      level: config.isProduction ? 'info' : 'warn',
      // FR-060 — server records carry no credentials, session tokens, or message content.
      // Declared at the logger rather than trusted to every call site, because a call site
      // that forgets is a leak that no test would notice.
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.body.password',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
    },
    // ─────────────────────────────────────────────────────────────────────────────────────
    // The request source drives throttling (FR-031a). Behind a proxy the socket address is the
    // load balancer, so some `X-Forwarded-For` handling is required — but **`true` is the wrong
    // amount of trust**.
    //
    // `trustProxy: true` trusts every hop, which means Fastify takes the leftmost
    // `X-Forwarded-For` entry — a value any client can write. The source dimension of the
    // throttle then becomes attacker-chosen: rotate the header per request and every guess
    // lands in a fresh bucket, so the source threshold never binds and a password spray from
    // one machine is unlimited. Worse, an attacker can *name* a venue's public address and
    // poison that bucket from anywhere, denying sign-in to everyone behind it.
    //
    // A hop count trusts exactly the proxies actually in front of this service and no further.
    // One is correct for a single Fly.io edge; raise it only when another proxy is genuinely
    // added, and never back to `true`.
    // ─────────────────────────────────────────────────────────────────────────────────────
    trustProxy: config.trustedProxyHops,
  })

  // 1. Cookies. Must precede auth-context, which reads the sign-in session cookie.
  await app.register(fastifyCookie)

  // 2. CORS. Credentialed requests need an explicit origin — a wildcard is rejected by the
  //    browser when credentials are included, which is the behaviour we want: the allowed
  //    origin is named, not open.
  await app.register(fastifyCors, {
    origin: config.webOrigin,
    credentials: true,
    // PUT is here for `PUT /workspace/active-event` (002, T056). Without it the browser's
    // preflight refuses the switch and the client sees an opaque network failure — which the
    // integration suite cannot catch, because `fastify.inject()` performs no preflight.
    methods: ['GET', 'POST', 'PUT'],
  })

  // 3. Error handling. Registered before routes so that a failure *inside* route
  //    registration is still shaped by FR-059/FR-060 rather than leaking a stack trace.
  await app.register(errors)

  // 4. Swagger. Must precede route registration — it builds the contract by observing routes
  //    as they register, so a route added before it is silently absent from the contract
  //    (FR-044a).
  await app.register(swagger)

  // 5. Authenticated context. Decorates the instance with `requireAttendee`; routes below
  //    attach it as a preHandler.
  await app.register(authContext)

  // 5a. Event access. Decorates the instance with `requireEventAccess`, which produces the
  //     `EventScope` every per-event query demands. Must follow auth-context: it verifies a
  //     registration for `request.attendee`, so identity has to be bound first (002, FR-146).
  await app.register(eventAccess)

  // 6. Retention sweeps. Registered here rather than in `server.ts` so that the integration
  //    harness tears the timers down with the app rather than leaking them between suites.
  await app.register(maintenance)

  // 7. The database pool follows the application's lifecycle, so every entry point — the
  //    server, the test harness, the contract generator — releases it the same way. Doing this
  //    only in `server.ts` left the pool to be torn down by process death.
  app.addHook('onClose', async () => {
    await closeDb()
  })

  // 7a. The audit observer, if one was supplied. Added here — after the plugins, before the
  //     routes — because `onRoute` only sees what registers after it.
  if (options.onRoute) app.addHook('onRoute', options.onRoute)

  // 8. Routes, from the append-only registry in `routes/index.ts` (T002, FR-181). A feature
  //    adding routes appends there and leaves this file — and the ordering above — alone.
  //    Sequential rather than concurrent: registration order decides the order paths appear in
  //    the generated contract, and `Promise.all` would make that order non-deterministic.
  for (const route of ROUTES) {
    await app.register(route)
  }

  return app
}
