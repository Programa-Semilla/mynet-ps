import { randomBytes } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { SESSION_COOKIE, sessionCookieOptions } from '../../auth/cookie.js'
import { hashPassword, verifyPassword } from '../../auth/password.js'
import { hashAttemptValue, nextDelayMs, recordAttempt } from '../../auth/throttle.js'
import { issueToken } from '../../auth/token.js'
import { loadConfig } from '../../config.js'
import { getDb } from '../../db/client.js'
import { findAttendeeForSignIn, normaliseEmail } from '../../db/queries/attendees.js'
import { authSessions } from '../../db/schema/auth-sessions.js'
import { invalidCredentials, tooManyAttempts } from '../../errors.js'

/**
 * T048, T049, T050 — `POST /auth/sign-in`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-030: every failure looks the same.**
 *
 * Unknown identifier and wrong credential produce one response, from one factory
 * (`invalidCredentials()`), on one code path. Two call sites returning "the same" 401 would
 * drift; producing them from a single place is what makes them indistinguishable by
 * construction.
 *
 * Timing is handled too: an unknown identifier still pays for a password verification against
 * a dummy hash, so "no such attendee" and "wrong password" take comparable time. Without
 * that, response latency alone is an account-existence oracle.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * A **genuine** Argon2id hash of a random value nobody knows, verified against when the
 * identifier is unknown. Its only job is to burn the same CPU the real path would.
 *
 * It must be a real hash. A malformed placeholder would fail to parse almost instantly, and
 * `verifyPassword` would return false in microseconds — which is precisely the timing
 * difference this defence exists to erase. Hashing a random value also means it is not a
 * recognisable constant and is not a hash of anything meaningful.
 *
 * Computed lazily on first use rather than at module load, so that importing this module
 * (which the contract generator does) does not pay for a deliberately expensive hash.
 */
let dummyHash: Promise<string> | undefined
const getDummyHash = (): Promise<string> => {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'))
  return dummyHash
}

export const signInRoutes = async (app: FastifyInstance): Promise<void> => {
  const config = loadConfig()

  app.post(
    '/auth/sign-in',
    {
      /**
       * FR-025b requires surrounding whitespace to be trimmed. Trimming has to happen
       * *before* schema validation, not in the handler: `format: 'email'` rejects
       * `"  ada@example.com  "`, so an attendee whose password manager or mobile keyboard
       * appended a space would be told their request was malformed — a 400 for typing
       * correctly.
       *
       * Normalising at the boundary means the schema validates what will actually be used,
       * and the handler never sees an untrimmed identifier.
       */
      preValidation: async (request) => {
        const body = request.body as { email?: unknown } | undefined
        if (body && typeof body.email === 'string') {
          body.email = body.email.trim()
        }
      },
      schema: {
        tags: ['auth'],
        summary: 'Exchange credentials for a sign-in session cookie',
        description:
          'On success, sets an HttpOnly, Secure, SameSite=Lax cookie. The token never appears in the response body. Every failure — unknown identifier, wrong credential — returns one identical refusal (FR-030).',
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 320 },
            password: { type: 'string', minLength: 1, maxLength: 1024 },
          },
        },
        response: {
          204: { type: 'null', description: 'Signed in. The session is in the cookie.' },
          400: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          401: {
            description: 'One identical refusal for every cause (FR-030).',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description:
              'Throttled. Reveals nothing about whether the identifier exists (FR-031d).',
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              retryAfterSeconds: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string }

      const identifierHash = hashAttemptValue(normaliseEmail(email))
      const sourceHash = hashAttemptValue(request.ip)

      // FR-031a — throttling is checked before any credential work, so a throttled caller
      // cannot use response timing to distinguish anything either.
      const delay = await nextDelayMs({ identifierHash, sourceHash })
      if (delay > 0) {
        throw tooManyAttempts(Math.ceil(delay / 1000))
      }

      const attendee = await findAttendeeForSignIn(email)

      // FR-030 — the unknown-identifier path does the same work as the real one, so the two
      // are indistinguishable in elapsed time as well as in status and body. The result of
      // the dummy verification is discarded; only its cost matters.
      let verified = false
      if (attendee) {
        verified = await verifyPassword(password, attendee.passwordHash)
      } else {
        await verifyPassword(password, await getDummyHash())
      }

      if (!attendee || !verified) {
        // FR-031c — records the hashed identifier only. There is no parameter for the
        // credential, so it cannot be written here even by mistake.
        await recordAttempt({ identifierHash, sourceHash, succeeded: false })
        throw invalidCredentials()
      }

      await recordAttempt({ identifierHash, sourceHash, succeeded: true })

      // FR-026 — an opaque high-entropy token; only its hash is stored.
      const { token, tokenHash } = issueToken()
      const expiresAt = new Date(Date.now() + config.auth.sessionIdleMs)

      // FR-029 — one row per sign-in, which is what makes devices independent. No attempt is
      // made to reuse or replace an existing session.
      await getDb().insert(authSessions).values({
        attendeeId: attendee.id,
        tokenHash,
        expiresAt,
      })

      void reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config.auth.sessionIdleMs))

      // 204: no body at all, so the token cannot leak into one.
      return reply.status(204).send()
    },
  )
}
