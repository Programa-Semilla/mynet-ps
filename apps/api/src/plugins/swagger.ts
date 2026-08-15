import fastifySwagger from '@fastify/swagger'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * T029 — the contract is generated from route schemas (FR-044a, clarification 5).
 *
 * Fastify routes declare JSON Schema for params, body, and responses; `@fastify/swagger`
 * turns those registered definitions into an OpenAPI document, and `app.swagger()` returns
 * it. The same schemas validate requests at runtime, so contract and validation **cannot**
 * diverge — that inability is the whole reason D4 chose Fastify.
 *
 * `contracts/openapi.json` is an output of this, never an input. Editing it by hand achieves
 * nothing except a failing pipeline (contracts/README.md).
 */
const swaggerPlugin = async (app: FastifyInstance): Promise<void> => {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'MyNet API',
        description:
          'Project-owned API for the MyNet attendee workspace. Every endpoint except sign-in requires a valid sign-in session cookie, and every authenticated endpoint resolves the attendee from that cookie server-side — never from a client-supplied identifier (FR-035, FR-036).',
        version: '0.1.0',
      },
      tags: [
        { name: 'auth', description: 'Sign-in session lifecycle' },
        { name: 'workspace', description: "The signed-in attendee's own data" },
        { name: 'operational', description: 'Liveness for the hosting platform' },
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'mynet_session',
            description:
              'Opaque sign-in session token. HttpOnly, Secure, SameSite=Lax. Never appears in a response body.',
          },
        },
      },
    },
  })
}

export default fp(swaggerPlugin, { name: 'swagger' })
