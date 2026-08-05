/**
 * Fastify application composition.
 *
 * Plugin registration order matters and is not incidental — it is expanded in T028 as the
 * error handler, contract generation, and the authenticated-context binding land. This file
 * is the single place that order is expressed.
 */
import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig } from './config.js'

export const buildApp = async (): Promise<FastifyInstance> => {
  const config = loadConfig()

  const app = Fastify({
    logger: {
      level: config.isProduction ? 'info' : 'debug',
      // FR-060: server records carry no credentials, session tokens, or message content.
      // Redaction is declared at the logger rather than trusted to every call site.
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
    // Trust the proxy so the request source used for throttling (FR-031a) is the client
    // address rather than the load balancer's.
    trustProxy: true,
    disableRequestLogging: false,
  })

  return app
}
