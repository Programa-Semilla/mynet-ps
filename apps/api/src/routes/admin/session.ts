import { randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { findAdminCandidate } from '../../admin/identity.js'
import { operatorScopeOf, requireOperator } from '../../admin/require-operator.js'
import { revokeAdminSession, startAdminSession } from '../../admin/session.js'
import { hashPassword, verifyPassword } from '../../auth/password.js'
import { failureDelayMs, hashAttemptValue, recordAttempt, serveDelay } from '../../auth/throttle.js'
import { getDb } from '../../db/client.js'
import { normaliseEmail } from '../../db/queries/attendees.js'
import { operators } from '../../db/schema/operators.js'
import { invalidCredentials, notFound, tooManyAttempts } from '../../errors.js'

/**
 * T060–T064 (011) — administrative sign-in, sign-out, and forced credential replacement
 * (FR-914–FR-919, FR-992).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE IS `routes/auth/sign-in.ts` WITH ONE STRUCTURAL DIFFERENCE AND ONE NEW RULE.**
 *
 * The difference: there is **one lookup**, not two paths. `findAdminCandidate` resolves an
 * address to at most one principal across both stores concurrently, so an operator address, an
 * attendee address and an unknown address cost the same. See that module for why a sequence of
 * questions would be an enumeration oracle.
 *
 * The new rule: **FR-992's forced credential replacement.** A platform operator whose credential
 * came from `pnpm admin:bootstrap` can sign in and reach exactly one route — the one below that
 * replaces it. `requireOperator` enforces that for every other address, so a new administrative
 * route cannot forget it.
 *
 * Everything else is inherited deliberately and is not re-derived here: the credential is
 * verified **before** the throttle is consulted (FR-031b's no-lockout property, which matters
 * more for an operator than for anybody — see `admin_sign_in`'s `mayDeny: false`), an unknown
 * address still pays for a password verification against a real dummy hash, and the token appears
 * in no response body.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * A **genuine** Argon2id hash of a random value nobody knows, verified against when the address
 * names nobody. Its only job is to burn the same CPU the real path would.
 *
 * Must be a real hash — `routes/auth/sign-in.ts` records why a malformed placeholder would defeat
 * the whole defence by failing to parse in microseconds. Computed lazily so importing this module
 * (which the contract generator does) does not pay for a deliberately expensive hash.
 */
let dummyHash: Promise<string> | undefined
const getDummyHash = (): Promise<string> => {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'))
  return dummyHash
}

const refusalSchema = {
  type: 'object',
  properties: { code: { type: 'string' }, message: { type: 'string' } },
} as const

export const adminSessionRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/admin/session',
    {
      // FR-025b's reasoning, unchanged: trimming has to happen before schema validation, or an
      // operator whose password manager appended a space is told their request was malformed.
      preValidation: async (request) => {
        const body = request.body as { email?: unknown } | undefined
        if (body && typeof body.email === 'string') body.email = body.email.trim()
      },
      schema: {
        tags: ['admin'],
        summary: 'Exchange administrative credentials for a session cookie',
        description:
          'Sets a host-only, HttpOnly, SameSite=Lax cookie scoped to the administrative host, independent of any MyNet session (FR-912). Every failure — unknown address, wrong password, an attendee who is not an organizer, a deactivated operator — returns one identical refusal (FR-915).',
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
          401: {
            description: 'One identical refusal for all four causes (FR-915).',
            ...refusalSchema,
          },
          429: {
            description:
              'Throttled. May delay but never denies (FR-916) — an identifier-keyed denial here would lock out the operator rather than the attacker.',
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

      // Verified BEFORE the throttle is consulted — FR-031b's no-lockout property. It matters
      // more here than anywhere: `admin_sign_in` is `mayDeny: false` precisely because a locked
      // out operator may be the only person who can act on the product.
      const candidate = await findAdminCandidate(email)

      let verified = false
      if (candidate) {
        verified = await verifyPassword(password, candidate.passwordHash)
      } else {
        // The same work for an address that names nobody, so elapsed time answers nothing.
        await verifyPassword(password, await getDummyHash())
      }

      if (!candidate || !verified) {
        await recordAttempt({
          identifierHash,
          sourceHash,
          action: 'admin_sign_in',
          succeeded: false,
        })

        const outstanding = await serveDelay(
          await failureDelayMs({ identifierHash, sourceHash, action: 'admin_sign_in' }),
        )
        if (outstanding > 0) throw tooManyAttempts(outstanding, 'sign-in attempts')

        // One factory, one shape, for all four causes (FR-915). `invalidCredentials` is reused
        // rather than given an administrative twin: a second factory returning "the same" 401 is
        // two things that can drift, and on the day they do the difference is a signal.
        throw invalidCredentials()
      }

      await recordAttempt({ identifierHash, sourceHash, action: 'admin_sign_in', succeeded: true })

      await startAdminSession(
        reply,
        candidate.operatorId !== null
          ? { operatorId: candidate.operatorId }
          : // `attendeeId` is non-null whenever `operatorId` is null — `findAdminCandidate`
            // returns exactly one of the two — and the check constraint on the table agrees.
            { attendeeId: candidate.attendeeId as string },
      )

      // 204: no body at all, so neither the token nor the tier can leak into one. **The response
      // does not say which tier signed in**, deliberately: the client learns that from
      // `GET /admin/me` with a session in hand, which is a different question from "did these
      // credentials work".
      return reply.status(204).send()
    },
  )

  app.delete(
    '/admin/session',
    {
      preHandler: [requireOperator],
      schema: {
        tags: ['admin'],
        summary: 'Sign out of the administrative site',
        description:
          'Revokes this administrative session server-side and clears its cookie. Does NOT affect any MyNet session the same person holds (FR-912, decision 37).',
        response: {
          204: { type: 'null' },
          401: refusalSchema,
        },
      },
    },
    async (request, reply) => {
      // The scope proves a live session; the session id comes from the same resolution, so
      // sign-out revokes exactly this device rather than every administrative session.
      const sessionId = request.adminSessionId
      if (sessionId) await revokeAdminSession(reply, sessionId)
      return reply.status(204).send()
    },
  )

  app.put(
    '/admin/session/credential',
    {
      preHandler: [requireOperator],
      schema: {
        tags: ['admin'],
        summary: 'Replace the initial administrative credential',
        description:
          'The ONE route reachable while `credential_is_initial` is true (FR-992). Every other administrative address refuses with 403 until this succeeds.',
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', minLength: 1, maxLength: 1024 },
            // The same floor the attendee product uses. A bootstrapped operator replacing a
            // generated credential must not be able to choose something weaker than an attendee
            // may choose for an ordinary account.
            newPassword: { type: 'string', minLength: 12, maxLength: 1024 },
          },
        },
        response: {
          204: { type: 'null' },
          401: refusalSchema,
          404: {
            description:
              'A conference organizer has no administrative credential to replace — they sign in with their MyNet password (FR-914).',
            ...refusalSchema,
          },
        },
      },
    },
    async (request, reply) => {
      const scope = operatorScopeOf(request)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **A conference organizer is refused with 404, not 403.**
      //
      // They genuinely have nothing to replace: FR-914 says they sign in with their attendee
      // credentials, which they chose themselves and change through MyNet's own profile screen.
      // A 403 saying "this is not for you" would confirm that a separate administrative
      // credential exists for somebody, which is a fact about the platform tier.
      // ─────────────────────────────────────────────────────────────────────────────────────
      if (scope.operatorId === null) throw notFound()

      const { currentPassword, newPassword } = request.body as {
        currentPassword: string
        newPassword: string
      }

      const rows = await getDb()
        .select({ passwordHash: operators.passwordHash })
        .from(operators)
        .where(eq(operators.id, scope.operatorId))
        .limit(1)

      const current = rows[0]?.passwordHash
      // A null hash cannot reach here — the guard resolved a live session, which required a
      // successful sign-in, which required a hash. Checked anyway rather than asserted, because
      // the alternative is passing `null` to a verifier.
      if (!current || !(await verifyPassword(currentPassword, current))) {
        // The same refusal as a wrong password anywhere else. Being signed in does not entitle
        // the caller to a more specific answer about their own credential.
        throw invalidCredentials()
      }

      await getDb()
        .update(operators)
        .set({
          passwordHash: await hashPassword(newPassword),
          // The line FR-993 turns on: once this is false, `pnpm admin:bootstrap` must never
          // reset this operator again.
          credentialIsInitial: false,
        })
        .where(eq(operators.id, scope.operatorId))

      // **The session is deliberately NOT revoked.** Replacing a credential the operator was
      // handed is the first thing they do; signing them straight out again would make the
      // product's opening interaction a dead end. This is not a password *reset* — there is no
      // suspicion that the session was stolen.
      return reply.status(204).send()
    },
  )
}
