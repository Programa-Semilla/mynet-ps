import type { FastifyInstance } from 'fastify'

import { passwordResetLink } from '../../auth/links.js'
import { hashPassword } from '../../auth/password.js'
import { consumePasswordReset, issuePasswordReset } from '../../auth/password-reset.js'
import { revokeAllSessions } from '../../auth/session.js'
import {
  failureDelayMs,
  hashAttemptValue,
  padElapsedTo,
  recordAttempt,
  serveDelay,
} from '../../auth/throttle.js'
import { hashToken } from '../../auth/token.js'
import { loadConfig } from '../../config.js'
import { dispatchMail } from '../../mail/dispatch.js'
import { normaliseEmail } from '../../db/queries/attendees.js'
import { findAttendeeIdByEmail, replacePassword } from '../../db/queries/identity.js'
import { linkExpired, tooManyAttempts } from '../../errors.js'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './sign-up.js'

/**
 * T059 (004) — `POST /auth/reset-request` and `POST /auth/reset` (FR-326–FR-333, research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE RECOVERY PATH SELF SIGN-UP MADE MANDATORY.**
 *
 * Before 004 there was no way to recover an account, and that was defensible only because there
 * was also no way to create one: accounts came from a seed script, and an organizer could in
 * principle have re-run it. Self sign-up removes that fallback entirely — a person who signs
 * themselves up and forgets their password has nobody to appeal to, because Principle III puts
 * organizer administration out of scope. Recovery is not a feature of this phase; it is the
 * obligation the identity decision carried with it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const resetRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/auth/reset-request',
    {
      preValidation: async (request) => {
        const body = request.body as { email?: unknown } | undefined
        if (body && typeof body.email === 'string') body.email = body.email.trim()
      },
      schema: {
        tags: ['auth'],
        summary: 'Request a password reset link',
        description:
          'ALWAYS answers 202, whether or not an account exists for the address (FR-327). This is the one non-disclosure guarantee that survives 004 — sign-up deliberately discloses (FR-303) because it cannot avoid it, and this path genuinely can. There is NO 429: a throttled request answers 202 like every other, because a 429 where an unknown address got a 202 would be exactly the account-existence oracle this route exists to close.',
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', format: 'email', maxLength: 320 } },
        },
        response: {
          202: {
            type: 'null',
            description:
              'Accepted. Identical whether or not an account exists, and identical whether or not the request was throttled.',
          },
          400: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string }

      const key = {
        identifierHash: hashAttemptValue(normaliseEmail(email)),
        sourceHash: hashAttemptValue(request.ip),
        action: 'reset_request' as const,
      }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The delay is served and the outcome is discarded — deliberately** (FR-331, D2).
      //
      // This is the one route in the product that may delay but must never deny. Two separate
      // requirements land on the same line:
      //
      //   1. An attacker spamming reset requests at a victim's address must not be able to deny
      //      that victim their own recovery path. The person an identifier-keyed denial harms is
      //      always the victim, never the attacker — which is FR-031b's failure reached by a
      //      new route.
      //   2. A 429 here would be an account-existence oracle by another name, if it could ever
      //      differ between a known and an unknown address.
      //
      // The throttle's `mayDeny: false` for this action clamps the delay to what is servable, so
      // `serveDelay` cannot report a remainder even if this handler wanted to act on one. The
      // cost to an attacker is real — every request occupies a connection — and the cost to the
      // victim is a few seconds.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await serveDelay(await failureDelayMs(key))
      await recordAttempt({ ...key, succeeded: false })

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **An identical body is not an identical response — elapsed time is observable too**
      // (FR-327).
      //
      // The branch below is deeply asymmetric: a known address costs a transaction (delete plus
      // insert) and a network round trip to the mail provider; an unknown address costs one
      // indexed lookup. With a real provider that is a difference of hundreds of milliseconds,
      // which is a remote, unauthenticated account-existence oracle that matching the status and
      // the body defeats nothing of.
      //
      // The throttle does not mask it: an enumerator probing *distinct* addresses spends one
      // identifier attempt on each (delay 0), and the source delay is a constant added to both
      // branches alike.
      //
      // So the branch is padded to a fixed budget measured from here. Sign-in defends the same
      // attack with a dummy Argon2id verification — this is that idea where the expensive
      // operation cannot be faked because it needs an account that does not exist.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const branchStartedAt = process.hrtime.bigint()

      const attendeeId = await findAttendeeIdByEmail(email)

      if (attendeeId) {
        // Issuing invalidates any outstanding link inside the same transaction (FR-329).
        const { token } = await issuePasswordReset(attendeeId)

        // Bounded: a hang here would reintroduce the very timing difference this pad closes,
        // and unboundedly so. A failure is not surfaced — it must not become the one observable
        // difference between an address that has an account and one that does not.
        await dispatchMail(
          () => app.mail.sendPasswordReset(normaliseEmail(email), passwordResetLink(token)),
          request.log,
          'password reset failed to send',
        )
      }

      await padElapsedTo(branchStartedAt, loadConfig().auth.resetRequestBranchBudgetMs)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **One response, one code path, no branch above it that could diverge.** The `if` above
      // decides whether to *send*, never what to *answer* — which is what makes FR-327 true by
      // construction rather than by two carefully-matched returns.
      // ─────────────────────────────────────────────────────────────────────────────────────
      return reply.status(202).send()
    },
  )

  app.post(
    '/auth/reset',
    {
      schema: {
        tags: ['auth'],
        summary: 'Set a new password from a reset link',
        description:
          'Unauthenticated by necessity — the person cannot sign in, which is why they are here. On success EVERY existing session for that attendee is revoked, on every device (FR-330): a reset is what somebody does when they believe their account is compromised, and leaving the compromiser signed in would defeat the point. The attendee then signs in with the new password.',
        body: {
          type: 'object',
          required: ['token', 'password'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 1, maxLength: 512 },
            password: {
              type: 'string',
              minLength: PASSWORD_MIN_LENGTH,
              maxLength: PASSWORD_MAX_LENGTH,
              description: 'The same policy sign-up states, enforced identically (FR-304).',
            },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'Password changed, and every session revoked. Sign in again.',
          },
          400: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          410: {
            description: 'Expired, already used, or unknown — one refusal for all three.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description: 'Throttled (FR-387). Keyed on the submitted token, never on an address.',
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
      const { token, password } = request.body as { token: string; password: string }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **FR-387: reset completion is the fourth route the requirement names.**
      //
      // Keyed on the token, never on the address — this route never learns one before consuming
      // the row. A refusal therefore falls only on somebody holding this token, which is why
      // this action may deny where `reset_request` above deliberately may not: there the key is
      // an address an attacker chooses, and the person a denial would harm is always the victim.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const identifierHash = hashAttemptValue(hashToken(token))
      const sourceHash = hashAttemptValue(request.ip)
      const action = 'reset_submit' as const

      const outstanding = await serveDelay(
        await failureDelayMs({ identifierHash, sourceHash, action }),
      )
      if (outstanding > 0) {
        await recordAttempt({ identifierHash, sourceHash, action, succeeded: false })
        throw tooManyAttempts(outstanding, 'password reset attempts')
      }

      // Claim and consume in one statement (FR-328). A link followed after its account was
      // deleted finds no row — the cascade took it — and fails exactly as an expired link does.
      const consumed = await consumePasswordReset(token)
      if (!consumed) {
        await recordAttempt({ identifierHash, sourceHash, action, succeeded: false })
        throw linkExpired()
      }

      // A link that worked ends the streak: the person is about to sign in with the new
      // password and must not meet a delay they earned by succeeding.
      await recordAttempt({ identifierHash, sourceHash, action, succeeded: true })

      await replacePassword(consumed.attendeeId, await hashPassword(password))

      // ─────────────────────────────────────────────────────────────────────────────────────
      // FR-330 — **every** session, on every device. Ordered after the password change so that
      // a failure between the two leaves the old password working with the old sessions, rather
      // than an account with no sessions and an unknown credential.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await revokeAllSessions(consumed.attendeeId)

      // Deliberately **not** signed in. Sign-up signs the person in because they have just
      // proved they own the address they typed; a reset proves only that they hold a link, and
      // the next step — signing in with the new password — is the one that confirms they know
      // it.
      return reply.status(204).send()
    },
  )
}
