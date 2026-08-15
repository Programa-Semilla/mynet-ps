import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { getDb } from '../db/client.js'

/**
 * T033 — liveness for the hosting platform.
 *
 * Deliberately minimal, and deliberately **not** a readiness or dependency check. A fuller
 * observability surface — readiness, metrics, request logging — is spec Open Question 20,
 * deferred at the clarification quota and recorded rather than quietly skipped
 * (contracts/README.md).
 *
 * It reports no version, build, or dependency state. Those would be free reconnaissance on an
 * unauthenticated endpoint, and nothing in this slice needs them.
 */
export const healthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['operational'],
        summary: 'Liveness probe',
        description: 'Reports that the process is running. Does not check dependencies.',
        response: {
          200: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['ok'] } },
          },
        },
      },
    },
    async () => ({ status: 'ok' as const }),
  )

  /**
   * T064 (006) — **readiness, which is a different question from liveness** (FR-482, FR-483,
   * SC-412).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **`/health` ABOVE IS UNCHANGED, AND THAT IS A REQUIREMENT RATHER THAN AN OVERSIGHT.**
   *
   * FR-483 keeps it dependency-free on purpose: it is unauthenticated, and an unauthenticated
   * endpoint that reports on infrastructure is free reconnaissance. So the two are separate
   * routes rather than one route with a query parameter — a parameter is a thing somebody can
   * pass.
   *
   * |                        | `/health` | `/ready`          |
   * |------------------------|-----------|-------------------|
   * | Touches the database   | No        | **Yes** (`select 1`) |
   * | Discloses dependencies | No        | Yes               |
   * | Answers                | the process is up | the process can serve |
   *
   * **This is what a deploy gates on.** Without it, a deploy with an unreachable database
   * passes every check and then fails every request — the container is running, `/health`
   * answers `ok`, and the first attendee to open the product is the monitoring (SC-412).
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  app.get(
    '/ready',
    {
      schema: {
        tags: ['operational'],
        summary: 'Readiness probe',
        description:
          'Reports whether this process can actually serve, which requires the database. Distinct from /health, which is deliberately dependency-free because it is unauthenticated (FR-483). 503 when the database is unreachable, so a deploy is reported unhealthy BEFORE it takes traffic rather than after every request has failed (SC-412).',
        response: {
          200: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['ready'] } },
          },
          503: {
            type: 'object',
            required: ['status'],
            /**
             * **Names the failing dependency and nothing about it.** "database" is what an
             * operator needs to know where to look; a connection string, a host, or the
             * driver's own error message would be reconnaissance on an unauthenticated
             * endpoint — which is the very thing `/health` stays minimal to avoid.
             */
            properties: {
              status: { type: 'string', enum: ['unavailable'] },
              dependency: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await getDb().execute(sql`select 1`)
        return { status: 'ready' as const }
      } catch (error) {
        // Logged in full on our side; disclosed as one word on the wire.
        app.log.error({ err: error }, 'readiness probe: the database is unreachable')
        return reply.status(503).send({ status: 'unavailable', dependency: 'database' })
      }
    },
  )
}
