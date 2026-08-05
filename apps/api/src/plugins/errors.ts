import { randomUUID } from 'node:crypto'

import type { FastifyError, FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { AppError } from '../errors.js'

/**
 * T032 — the single error boundary for the API.
 *
 * Two requirements meet here and they pull opposite ways:
 *
 * - **FR-059** — the attendee-facing message explains what happened and what to do next, and
 *   exposes no internal detail, stack trace, or database error.
 * - **FR-060** — the server record carries enough to diagnose the failure, and no
 *   credentials, session tokens, or message content.
 *
 * The correlation id is what reconciles them: the attendee gets an opaque reference, the log
 * gets the detail, and support can join the two without the response ever carrying the cause.
 */
const errorsPlugin = async (app: FastifyInstance): Promise<void> => {
  app.setErrorHandler<FastifyError | AppError>((error, request, reply) => {
    if (error instanceof AppError) {
      // Expected refusals. Logged at info: they are the system working, not failing.
      request.log.info(
        { code: error.code, statusCode: error.statusCode, path: request.url },
        'request refused',
      )

      const body: Record<string, unknown> = { code: error.code, message: error.publicMessage }
      if (error.details) Object.assign(body, error.details)

      // FR-031d — retry guidance must not reveal whether the identifier exists. It says only
      // how long to wait, which is true regardless of who was asked about.
      if (
        error.code === 'too_many_attempts' &&
        typeof error.details?.['retryAfterSeconds'] === 'number'
      ) {
        void reply.header('retry-after', String(error.details['retryAfterSeconds']))
      }

      return reply.status(error.statusCode).send(body)
    }

    // Schema validation. Safe to detail — it describes the request the caller just sent, not
    // anything stored (contracts/README.md, Error responses).
    const validation = 'validation' in error ? error.validation : undefined
    if (validation) {
      request.log.info({ path: request.url }, 'request failed validation')
      return reply.status(400).send({
        code: 'validation_failed',
        message: 'Some of the information sent was not in the expected form.',
        fields: validation.map((issue) => ({
          field: issue.instancePath || issue.params?.['missingProperty'] || '(request)',
          problem: issue.message ?? 'is not valid',
        })),
      })
    }

    // Framework-level refusals that are the *caller's* fault — a malformed or empty JSON body,
    // an unsupported media type, a payload over the limit. Fastify raises these with a 4xx
    // `statusCode` of its own, and they are not `validation` errors.
    //
    // Without this branch they fall through to the 500 below, which is actively misleading:
    // the attendee is told something went wrong on our side when nothing did, and the log
    // records an "unhandled error" that will be investigated as a server fault. FR-059 asks the
    // message to explain what happened; calling a bad request an internal failure does not.
    //
    // The Fastify code stays in the log. The response carries one stable public code, so the
    // contract does not grow a vocabulary of framework internals.
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : undefined
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      request.log.info({ code: error.code, statusCode, path: request.url }, 'request refused')
      return reply.status(statusCode).send({
        code: 'bad_request',
        message: 'The request could not be understood. Nothing was changed.',
      })
    }

    // Everything unexpected. The attendee gets a reference; the cause goes only to the log.
    const correlationId = randomUUID()
    request.log.error(
      { err: error, correlationId, path: request.url, method: request.method },
      'unhandled error',
    )

    return reply.status(500).send({
      code: 'internal_error',
      message:
        'Something went wrong on our side. Try again, and quote this reference if it keeps happening.',
      correlationId,
    })
  })

  // FR-061's server-side counterpart: an unmatched route is answered inside the API's own
  // error vocabulary rather than Fastify's default HTML-ish 404.
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ code: 'not_found', message: 'That is not available.' }),
  )
}

export default fp(errorsPlugin, { name: 'errors' })
