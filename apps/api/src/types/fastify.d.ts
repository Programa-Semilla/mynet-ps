import 'fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { EventScope } from '../plugins/event-access.js'

/**
 * The authenticated request context (tasks.md → Shared Interfaces).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `request.attendee` is present **only** on authenticated routes, and it is the *only* way a
 * handler learns who is asking.
 *
 * **There is no `attendeeId` parameter on any route or repository method.** That absence is
 * what makes FR-036 structural rather than a rule to remember: a handler cannot express
 * "read another attendee's data", because it has no way to name another attendee.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface AuthenticatedAttendee {
  readonly id: string
  readonly email: string
  readonly displayName: string
}

declare module 'fastify' {
  interface FastifyRequest {
    attendee?: AuthenticatedAttendee
    /** The current sign-in session id, used by sign-out to revoke exactly this device. */
    authSessionId?: string
    /**
     * 002 — proof that the attendee is registered for the event named in the path (FR-146).
     *
     * Set only by `requireEventAccess`, which is the only module that can construct one. A
     * handler reads it through `eventScopeOf` rather than directly.
     */
    eventScope?: EventScope
  }

  interface FastifyInstance {
    /** Route-level guard. Populates `request.attendee` or refuses the request. */
    requireAttendee: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /**
     * 002 — route-level event guard. Verifies registration for `:eventId` and populates
     * `request.eventScope`, or refuses indistinguishably from a nonexistent event (FR-148).
     */
    requireEventAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
