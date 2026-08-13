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
import fastifyCors, { type FastifyCorsOptions } from '@fastify/cors'
import Fastify, { type FastifyInstance, type FastifyRequest, type RouteOptions } from 'fastify'

import { loadConfig } from './config.js'
import { closeDb } from './db/client.js'
import maintenance from './maintenance.js'
import authContext from './plugins/auth-context.js'
import requireConferenceAuthorityPlugin from './admin/require-conference-authority.js'
import requireOperatorPlugin from './admin/require-operator.js'
import cardAccess from './plugins/card-access.js'
import errors from './plugins/errors.js'
import eventAccess from './plugins/event-access.js'
import participation from './plugins/participation.js'
import ports, { type PortOverrides } from './plugins/ports.js'
import securityHeaders from './plugins/security-headers.js'
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
  /**
   * 004 — substitutes for the storage and mail ports (FR-352, FR-394).
   *
   * Absent in production and in nearly every test: the default adapters need no provisioning,
   * which is exactly why FR-352 requires one. This exists for the tests that must observe what
   * an adapter was *asked* to do — that a send failure does not fail account creation
   * (FR-318a), for instance, which needs a mail service that fails on purpose.
   */
  readonly ports?: PortOverrides
}

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const config = loadConfig()

  const app = Fastify({
    /**
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **Fastify 5 disables both of these by default (`0`), and 004 is what makes that matter.**
     *
     * This feature adds the product's first publicly reachable write routes. One of them
     * (`PUT /profile/avatar`) raises the body limit to hold a 5 MiB image as base64, and two
     * of them deliberately hold the connection open while sleeping (`serveDelay`,
     * `padElapsedTo`). With no `requestTimeout`, a client dribbling that 10 MB body one byte at
     * a time occupies a handler indefinitely; with no `connectionTimeout`, a connection that
     * never sends a request is never reclaimed.
     *
     * `reset_request` compounds it: that action is `mayDeny: false` *by design*, so it can
     * never refuse — every request against it is guaranteed to be served, and to sleep first.
     * The throttle's own comment notes the cost to the attacker; this is the symmetric cost to
     * the service, and nothing else bounds it.
     *
     * `requestTimeout` must stay comfortably above `AUTH_MAX_SERVED_DELAY_MS` plus
     * `AUTH_RESET_BRANCH_BUDGET_MS`, or the throttle's own sleep would trip it and turn a
     * deliberate delay into a 503.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 30_000,
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
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 011 — **THE ALLOW-LIST IS PER ROUTE PREFIX, BECAUSE THE TWO PRODUCTS MUST NOT BE ABLE TO
  // CALL EACH OTHER'S API.**
  //
  // This was one global list — `[webOrigin, adminOrigin]`, collapsing to `webOrigin` alone in
  // every deployed environment, since `ADMIN_ORIGIN` is deliberately unset there. That named
  // **the wrong party on the wrong routes**: the one origin permitted to read `/admin/*`
  // responses was the *attendee* origin, and the administrative origin was not on the list at
  // all.
  //
  // It worked anyway, which is what made it invisible: `admin.<host>` calling its own `/api/*`
  // is same-origin, so CORS never engages. The hole is the other direction. `admin.<host>` is
  // **same-site** with the apex (that is decision 37's whole point), so `SameSite=Lax` still
  // sends the administrative session cookie on a cross-origin `fetch` from the attendee
  // document — and with `credentials: true` and the apex echoed back as the allowed origin,
  // the response was readable. One XSS on a public, self-sign-up product with attendee-uploaded
  // avatars would read the report queue: reported private message content, which decision 38
  // grants to the platform tier alone as the THIRD recorded Principle VIII exception.
  //
  // So: administrative routes permit the administrative origin and nothing else, and in a
  // deployed environment they permit **no** cross-origin caller at all. Attendee routes are
  // unchanged. The delegator form is what makes this expressible — the static `origin` option
  // cannot vary by request, and this must.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  const CORS_METHODS = ['GET', 'POST', 'PUT', 'DELETE']
  await app.register(
    fastifyCors,
    () =>
      (
        request: FastifyRequest,
        callback: (error: Error | null, options: FastifyCorsOptions) => void,
      ) => {
        // The prefix, not the Host header: `request.url` is what routing itself uses, so this
        // cannot disagree with which handler will run. Host is proxy-supplied and spoofable.
        const administrative = request.url.startsWith('/admin/') || request.url === '/admin'

        callback(null, {
          // `false` emits no `Access-Control-Allow-Origin`, so a cross-origin reader gets nothing.
          // Same-origin requests are unaffected — the browser does not consult CORS for them, which
          // is why the deployed administrative product keeps working with an empty allow-list.
          origin: administrative ? (config.adminOrigin ?? false) : config.webOrigin,
          credentials: true,
          // PUT is here for `PUT /workspace/active-event` (002, T056). Without it the browser's
          // preflight refuses the switch and the client sees an opaque network failure — which the
          // integration suite cannot catch, because `fastify.inject()` performs no preflight.
          //
          // DELETE is here for 005: unsaving a session and clearing a note are both `DELETE`
          // (research D6, FR-212), and 011 needs it for sign-out and demotion.
          methods: CORS_METHODS,
        })
      },
  )

  // 2a. T063 (006) — security response headers on **every** API response (FR-480, research D8).
  //
  //     Before the error handler on purpose. The hook runs `onSend`, so it applies to whatever
  //     the response turned out to be — including a 500 shaped by step 3 and a 401 from a guard.
  //     A header set only on the success path is a header absent from exactly the responses an
  //     attacker is most interested in.
  //
  //     The API sets its own; Caddy sets the static document's. Neither sets the other's — which
  //     is what makes these assertable by the integration suite with no proxy in front (SC-411).
  await app.register(securityHeaders)

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

  // 5a-bis. Participation access (007). Decorates the instance with `requireParticipation`,
  //     which produces the `ConversationScope` every conversation and message query demands.
  //     Follows auth-context for the same reason 5a does: it verifies a participation row for
  //     `request.attendee` (FR-523).
  //
  //     **A sibling of 5a, never a substitute.** Conversations are cross-event (FR-507), so
  //     `EventScope` has no event to verify and the existing route audit walks past these
  //     routes reporting success — research R9. Two predicates, two guards, two audits.
  await app.register(participation)

  // 5a-ter. Held-card access (008). Decorates the instance with `requireHeldCard`, which
  //     produces the `CardScope` every card read demands. Follows auth-context for the reason
  //     5a and 5a-bis do: it verifies a `shared_cards` row for `request.attendee` (FR-616).
  //
  //     **A third sibling, and its predicate is the first with a DIRECTION.** Event scope proves
  //     a registration and participation proves a symmetric membership; this proves that the
  //     reader holds a card *from* the named attendee, never the reverse — which is what stops
  //     sharing your own card from granting you a read of somebody else's (FR-602).
  //
  //     It needs a third guard for the same structural reason 007 needed a second: card routes
  //     name no conference, so `event-scope-audit` never examines them and reports success
  //     (research R1, FR-641).
  await app.register(cardAccess)

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 5a-quater. Administrative access (013). Decorates the instance with `requireOperator` and
  //     `requirePlatformOperator`, which produce the `OperatorScope` and `PlatformScope` every
  //     administrative route demands (FR-905, FR-906).
  //
  //     **The fourth sibling, and the first that does NOT follow auth-context in spirit.** Steps
  //     5a, 5a-bis and 5a-ter each verify a relationship for `request.attendee`, so identity has
  //     to be bound first. This one establishes *which principal is calling at all*, and the
  //     principal may not be an attendee: a platform operator has no `attendees` row (FR-901).
  //     It reads its own cookie and resolves its own session store, so it depends on
  //     auth-context for nothing — the position here is for readability beside its three
  //     siblings, not for ordering.
  //
  //     It needs a fourth guard for the structural reason 007 and 008 each met: administrative
  //     routes name no conference, so `event-scope-audit` never examines them and **reports
  //     success** (research R5, FR-905). `tests/unit/operator-audit.test.ts` is the fourth audit.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  await app.register(requireOperatorPlugin)

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // 5a-quinquies. Conference authority (014). Decorates the instance with
  //     `requireConferenceAuthority`, which produces the `ConferenceAuthorityScope` every
  //     authoring write demands (FR-1035, research R2).
  //
  //     **The fifth sibling, and the first whose ordering genuinely matters.** It reads the
  //     `OperatorScope` that step 5a-quater's guard produced, so it declares
  //     `dependencies: ['require-operator']` — a registration order that is a real constraint
  //     rather than a readability choice, and `fastify-plugin` enforces it rather than this
  //     comment.
  //
  //     No sixth route audit accompanies it. Every authoring route names its conference in the
  //     path, and `operator-audit.test.ts` — which already covers `/admin/*` by prefix — gained
  //     the two assertions that make naming it load-bearing: an administrative route naming a
  //     conference must carry this guard, and it must bind the operator first.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  await app.register(requireConferenceAuthorityPlugin)

  // 5b. The two ports 004 introduces — durable binary content and transactional account mail
  //     (FR-352, FR-394). Appended after the guards and before maintenance: nothing in steps
  //     1–5a depends on them, and the sweep in step 6 does not use them either, so this is the
  //     first position that disturbs no existing ordering. Overridable so a test can substitute
  //     an adapter without reaching past the interface.
  await app.register(ports, options.ports ?? {})

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
