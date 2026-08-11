import type { FastifyInstance } from 'fastify'

import { verificationLink } from '../../auth/links.js'
import { hashPassword } from '../../auth/password.js'
import { startSession } from '../../auth/session.js'
import {
  beginAttempt,
  failureDelayMs,
  hashAttemptValue,
  serveDelay,
  settleAttempt,
} from '../../auth/throttle.js'
import { issueVerification } from '../../auth/verification.js'
import { normaliseEmail } from '../../db/queries/attendees.js'
import { createAccount } from '../../db/queries/identity.js'
import { addressRegistered, tooManyAttempts } from '../../errors.js'
import { dispatchMail } from '../../mail/dispatch.js'

/**
 * T043 (004) — `POST /auth/sign-up` (FR-300, FR-301, FR-303, FR-306, FR-307).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PRODUCT'S FIRST DELIBERATELY UNAUTHENTICATED WRITE ROUTE.**
 *
 * A person becomes an attendee here, under their own power, with no invitation and no organizer
 * — which is the identity model brainstorm #04 settled and constitution v2.3.0 ratified. Three
 * properties of this route are decisions rather than defaults, and each is recorded where it is
 * implemented rather than only in the specification.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * FR-301 — **email, display name, password, and nothing else.**
 *
 * `additionalProperties: false` is what makes that structural: a client cannot smuggle a
 * company, a role, or an avatar into account creation, so "MUST NOT collect any other personal
 * data at that moment" is enforced by the schema rather than by a reviewer noticing.
 */
const DISPLAY_NAME_MAX = 120

/**
 * FR-304 — the password policy, stated once and enforced here.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Length alone, deliberately.** No character-class rules: they demonstrably push people
 * toward `Password1!` and away from the long passphrases that are actually strong, and this
 * product hashes with Argon2id and a pepper rather than relying on composition to do that work.
 *
 * Twelve characters is the floor. The client shows this requirement **before** submission and
 * keeps its confirmation disabled until it is met (FR-304), so reaching the refusal below means
 * something bypassed the form — it is defence, not the designed path.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 1024

export const signUpRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    '/auth/sign-up',
    {
      /**
       * Trimmed before validation, following `sign-in.ts`'s precedent and for its reason:
       * `format: 'email'` rejects a trailing space, so an attendee whose password manager or
       * mobile keyboard appended one would be told their request was malformed — a 400 for
       * typing correctly.
       */
      preValidation: async (request) => {
        const body = request.body as { email?: unknown; displayName?: unknown } | undefined
        if (body && typeof body.email === 'string') body.email = body.email.trim()
        if (body && typeof body.displayName === 'string') {
          body.displayName = body.displayName.trim()
        }
      },
      schema: {
        tags: ['auth'],
        summary: 'Create an account and sign in',
        description:
          'Self-serve account creation (FR-300). On success the attendee is signed in without a second credential entry (FR-306) and the session is set as an HttpOnly cookie — there is no body, so the token cannot leak into one. A 409 states plainly that the address is already registered: that disclosure is a decision (FR-303), because it cannot be hidden alongside auto-sign-in, and rate limiting is what actually defends enumeration.',
        body: {
          type: 'object',
          required: ['email', 'displayName', 'password'],
          // FR-301 — nothing else may be collected at this moment.
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 320 },
            displayName: { type: 'string', minLength: 1, maxLength: DISPLAY_NAME_MAX },
            password: {
              type: 'string',
              minLength: PASSWORD_MIN_LENGTH,
              maxLength: PASSWORD_MAX_LENGTH,
              description:
                'At least 12 characters. Length only — no character-class rules, which push people toward weaker passwords than a long passphrase. Stated before submission and enforced by a disabled confirmation, so a 400 here means the form was bypassed (FR-304).',
            },
          },
        },
        response: {
          204: {
            type: 'null',
            description: 'Created and signed in. The session is in the cookie.',
          },
          400: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fields: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
          409: {
            description:
              'The address already has an account (FR-303). Deliberately disclosed, and offering both exits — sign in, or reset.',
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
          },
          429: {
            description: "Throttled on the `sign_up` counter, which is separate from sign-in's.",
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
      const { email, displayName, password } = request.body as {
        email: string
        displayName: string
        password: string
      }

      const identifierHash = hashAttemptValue(normaliseEmail(email))
      const sourceHash = hashAttemptValue(request.ip)
      const action = 'sign_up' as const

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The throttle gates this route, unlike sign-in — and that difference is why the
      // `action` column exists** (FR-307a, research D2).
      //
      // 001's no-lockout guarantee rests on verifying the credential *before* consulting the
      // throttle, so a correct password is never refused. There is no credential to verify
      // here, so the gate has to come first. The cost is bounded and lands on the right person:
      // a denial here delays somebody trying to create an account, and creating an account is
      // not something an attacker can deny to a *specific* victim — the address they would be
      // attacking does not have an account yet, by definition.
      //
      // The separate counter is what keeps that true elsewhere: without it, a sign-up storm
      // aimed at an address would inflate the streak `sign-in` reads and lock its rightful
      // owner out of signing in, which is FR-031b's failure arriving by a new route.
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 010 T017 — recorded before it is judged (FR-804), excluded from its own count so the
      // allowance is unchanged (FR-805). The row starts `succeeded: false`, so the two refusal
      // branches below need no write of their own — they simply leave it as it is.
      const attemptId = await beginAttempt({ identifierHash, sourceHash, action })
      const outstanding = await serveDelay(
        await failureDelayMs({ identifierHash, sourceHash, action }, attemptId),
      )
      if (outstanding > 0) {
        throw tooManyAttempts(outstanding, 'account creation attempts')
      }

      // FR-305 — hashed before it reaches the database, and the plaintext exists only as this
      // local. There is no path from here to a log: the logger redacts `req.body.password`,
      // and no code below names it.
      const passwordHash = await hashPassword(password)

      const attendee = await createAccount({ email, displayName, passwordHash })

      if (!attendee) {
        // A refused sign-up counts as a failure, so repeated attempts against one address
        // escalate — which is the only defence FR-303's disclosure leaves in place. The row
        // already says so; leaving it alone is what records the failure.
        throw addressRegistered()
      }

      // A created account ends the streak, exactly as it did when this was `settleAttempt(true)`.
      await settleAttempt(attemptId, true)

      // FR-306 — signed in without a second credential entry. 204 with no body, so the token
      // cannot leak into one.
      await startSession(reply, attendee.id)

      // ═════════════════════════════════════════════════════════════════════════════════════
      // T060 — **verification mail is dispatched AFTER the account is committed, and a send
      // failure does not fail the request** (FR-318, FR-318a).
      //
      // Both halves are requirements rather than robustness habits.
      //
      // *After*, because the account is the thing the person came for and the message is a
      // consequence of it. Sending first would mean an account that exists only if a third
      // party answered.
      //
      // *Tolerated*, because **an unprovisioned or failing mail provider is the EXPECTED state**
      // — register entry 18 has not chosen one, and the development adapter deliberately sends
      // nothing. Coupling account creation to it would make sign-up unusable in exactly the
      // environments where it is most needed, and it would do so silently: the person would see
      // a failure and try again, and the second attempt would answer 409.
      //
      // The consequence is bounded and stated: an attendee whose message never arrives is
      // unverified, and FR-359 already withholds discoverability from them. They keep every
      // other capability (FR-324, FR-325) and can ask for a fresh link at any time.
      // ═════════════════════════════════════════════════════════════════════════════════════
      // Bounded by `dispatchMail`, because the account is already committed and the session
      // cookie already staged by this point. A provider that *hangs* rather than fails would
      // hold the response past the client's own 20-second abort — the attendee would see a
      // connection error, retry, and meet 409 on an account that was created successfully,
      // which is exactly the outcome the paragraph above says this design prevents.
      try {
        const { token } = await issueVerification(attendee.id)
        await dispatchMail(
          () => app.mail.sendVerification(attendee.email, verificationLink(token)),
          request.log,
          'verification mail failed to send after sign-up',
        )
      } catch (error) {
        // Reached when *issuing* fails; the send itself no longer throws. Logged rather than
        // swallowed, so a persistent failure is visible — but never rethrown, and never turned
        // into a status the caller has to interpret.
        request.log.error({ err: error }, 'verification mail failed to send after sign-up')
      }

      return reply.status(204).send()
    },
  )
}
