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
import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig } from './config.js'
import authContext from './plugins/auth-context.js'
import errors from './plugins/errors.js'
import swagger from './plugins/swagger.js'
import { healthRoutes } from './routes/health.js'

export const buildApp = async (): Promise<FastifyInstance> => {
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
    // The request source drives throttling (FR-031a). Behind a proxy, the socket address is
    // the load balancer — throttling every attendee as one source.
    trustProxy: true,
  })

  // 1. Cookies. Must precede auth-context, which reads the sign-in session cookie.
  await app.register(fastifyCookie)

  // 2. CORS. Credentialed requests need an explicit origin — a wildcard is rejected by the
  //    browser when credentials are included, which is the behaviour we want: the allowed
  //    origin is named, not open.
  await app.register(fastifyCors, {
    origin: config.webOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
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

  // 6. Routes.
  await app.register(healthRoutes)

  return app
}
