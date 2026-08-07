import type { FastifyInstance } from 'fastify'

import { verificationLink } from '../../auth/links.js'
import {
  failureDelayMs,
  hashAttemptValue,
  recordAttempt,
  recordRequest,
  serveDelay,
} from '../../auth/throttle.js'
import { hashToken } from '../../auth/token.js'
import { consumeVerification, issueVerification } from '../../auth/verification.js'
import { isEmailVerified, markEmailVerified } from '../../db/queries/identity.js'
import { linkExpired, tooManyAttempts } from '../../errors.js'
import { dispatchMail } from '../../mail/dispatch.js'

/**
 * T058, T061 (004) — `POST /auth/verify` and `POST /auth/verify/resend`
 * (FR-319–FR-322, FR-325).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **VERIFICATION GATES EXACTLY ONE THING: DISCOVERABILITY** (FR-325).
 *
 * An unverified attendee uses the product fully — joins conferences, authors a profile, saves
 * sessions, writes notes — and appears to nobody until this route succeeds. Nothing else is
 * gated, which is what keeps the one-sitting journey intact while the mail provider is
 * unprovisioned (register entry 18).
 *
 * The reason is a compound exposure that none of its three parts showed alone: the join code is
 * public (FR-317a), an unverified address otherwise prevents nothing (FR-324), and profiles are
 * visible to co-attendees (FR-357). Together those would let anyone sign up **using an address
 * they do not own**, join any conference with a world-readable code, and appear in a
 * professional networking directory as that person (FR-325a, SC-304a).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const verifyRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/auth/verify',
    {
      schema: {
        tags: ['auth'],
        summary: 'Complete email verification from a link',
        description:
          'Unauthenticated by necessity: the link is followed out of a mail client, which carries no session. A consumed, expired or unknown token is refused IDENTICALLY (410) — the caller learns only that the link no longer works, which is all they are owed (FR-321).',
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: { token: { type: 'string', minLength: 1, maxLength: 512 } },
        },
        response: {
          204: {
            type: 'null',
            description:
              'Verified. If discoverability is on, the attendee becomes visible to co-attendees for the first time (FR-359).',
          },
          400: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          410: {
            description: 'Expired, already used, or unknown — one refusal for all three (FR-321).',
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
      const { token } = request.body as { token: string }

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **FR-387: this is one of the four unauthenticated routes that MUST be rate limited.**
      //
      // The identifier is the *token*, hashed — never an address, which this route never sees.
      // That is what makes `mayDeny` safe here: a refusal can only fall on somebody holding
      // this token, so there is no third party for an identifier-keyed denial to harm, and the
      // reasoning that forces reset-request to delay-only does not reach this route.
      //
      // The token is hashed twice on purpose: `hashToken` is the lookup digest, and
      // `hashAttemptValue` is the keyed hash that keeps the attempts table free of anything
      // that could be replayed against the token tables (FR-042).
      // ─────────────────────────────────────────────────────────────────────────────────────
      const identifierHash = hashAttemptValue(hashToken(token))
      const sourceHash = hashAttemptValue(request.ip)
      const action = 'verify_token' as const

      const outstanding = await serveDelay(
        await failureDelayMs({ identifierHash, sourceHash, action }),
      )
      if (outstanding > 0) {
        await recordAttempt({ identifierHash, sourceHash, action, succeeded: false })
        throw tooManyAttempts(outstanding, 'verification attempts')
      }

      // One statement claims the row and consumes it, so a double-submit or a mail client
      // prefetching the link cannot use it twice (FR-320). No row means unknown, expired or
      // already used, and the caller cannot tell which.
      const consumed = await consumeVerification(token)
      if (!consumed) {
        await recordAttempt({ identifierHash, sourceHash, action, succeeded: false })
        throw linkExpired()
      }

      await markEmailVerified(consumed.attendeeId)

      // A link that worked ends the streak, so a mail client that prefetched the link and then
      // the person who clicked it are not left throttled by their own success.
      await recordAttempt({ identifierHash, sourceHash, action, succeeded: true })

      return reply.status(204).send()
    },
  )

  app.post(
    '/auth/verify/resend',
    {
      preHandler: app.requireAttendee,
      schema: {
        tags: ['auth'],
        summary: 'Send a fresh verification message to the signed-in attendee',
        description:
          'Authenticated, deliberately: it sends to the address on the account rather than to an address in the request, so it cannot be aimed at anybody. Rate-limited (FR-322). Answers 202 whether or not a message was sent — an already-verified account produces the same response, so nothing here reports verification state to a caller who could be anyone holding a session.',
        security: [{ sessionCookie: [] }],
        response: {
          202: {
            type: 'null',
            description: 'Accepted. A send failure does not surface here (FR-318a).',
          },
          401: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          // **No 429**, matching `reset-request` and for its reason: this route borrows the
          // delay-only counter, so a refusal is unreachable by construction. Publishing one in
          // the contract would advertise a status this route cannot produce, and
          // `contracts/openapi.json` is generated from here — a client written against it would
          // carry a branch it will never take.
        },
      },
    },
    async (request, reply) => {
      const attendee = request.attendee!

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Counted under `reset_request`, which is the **delay-only** action.
      //
      // Deliberate: like a reset request, this sends mail to an address on somebody's account,
      // so a denial would be a denial of somebody's ability to receive their own link. The
      // identifier is the signed-in attendee, so a denial could only harm them — but the cost
      // of using the delay-only counter is a short wait, and the cost of getting it wrong is an
      // attendee who cannot verify. FR-322 asks for rate limiting, not for refusal.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const key = {
        identifierHash: hashAttemptValue(attendee.id),
        sourceHash: hashAttemptValue(request.ip),
        action: 'reset_request' as const,
      }
      const outstanding = await serveDelay(await failureDelayMs(key))
      // Counted on every request — a resend sends mail whether or not the account needed one.
      await recordRequest(key)

      // The delay-only mode clamps to what is servable, so a remainder cannot occur. Asserted
      // rather than turned into a status: a `429` here would contradict the schema above, and
      // if this invariant ever broke, a 500 naming it is far more use than a refusal the
      // contract does not describe.
      if (outstanding > 0) {
        throw new Error('reset_request is delay-only yet reported an outstanding remainder')
      }

      // Already verified: nothing to send, and the response is the same 202. Re-sending would
      // be a link that verifies something already verified, which is noise in an inbox.
      if (!(await isEmailVerified(attendee.id))) {
        const { token } = await issueVerification(attendee.id)

        // FR-318a's reasoning applies here too: an unprovisioned provider is the expected
        // state, and a failure to send must not become a failure the attendee has to
        // interpret. Bounded as well as caught — a hang would hold this response open just as
        // it would on sign-up, and this route answers 202 precisely so nobody has to wait.
        await dispatchMail(
          () => app.mail.sendVerification(attendee.email, verificationLink(token)),
          request.log,
          'verification resend failed to send',
        )
      }

      return reply.status(202).send()
    },
  )
}
