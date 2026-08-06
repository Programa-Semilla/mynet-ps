import { randomBytes } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { SESSION_COOKIE, sessionCookieOptions } from '../../auth/cookie.js'
import { hashPassword, verifyPassword } from '../../auth/password.js'
import { failureDelayMs, hashAttemptValue, recordAttempt, serveDelay } from '../../auth/throttle.js'
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

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The credential is verified BEFORE the throttle is consulted, and that ordering is
      // load-bearing for FR-031b.**
      //
      // Gating the request on the throttle first — the obvious arrangement — made the account
      // lockout the spec forbids. Failures from *anyone* counted toward the streak, the
      // outstanding delay was measured from the newest failure, and only a success could clear
      // it. An attacker failing once every few minutes against a known address therefore held
      // that account shut for as long as they cared to continue, because the owner's correct
      // password was refused before it was ever looked at. SC-003a requires the number of
      // accounts that can be rendered permanently inaccessible to be zero.
      //
      // Verifying first costs one Argon2id hash on every attempt including throttled ones.
      // That is the intended price: it is what makes the throttle a delay imposed on guessing
      // rather than a denial imposed on the owner.
      // ─────────────────────────────────────────────────────────────────────────────────────
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

        // FR-031a — the escalating delay, applied to the *failure*. Served in-request up to a
        // bound; anything beyond becomes retry-after guidance. Both branches are reached
        // identically whether or not the identifier exists, so FR-031d still holds.
        const outstanding = await serveDelay(await failureDelayMs({ identifierHash, sourceHash }))
        if (outstanding > 0) {
          throw tooManyAttempts(outstanding)
        }

        throw invalidCredentials()
      }

      // A correct credential is never throttled. This is the line SC-003a rests on.
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
