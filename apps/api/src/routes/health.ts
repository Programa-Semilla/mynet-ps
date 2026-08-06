import type { FastifyInstance } from 'fastify'

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
}
