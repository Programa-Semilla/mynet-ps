import 'fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { MailService } from '../mail/service.js'
import type { PushService } from '../notifications/service.js'
import type { EventScope } from '../plugins/event-access.js'
import type { ConversationScope } from '../plugins/participation.js'
import type { StorageService } from '../storage/service.js'

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
    /**
     * 007 — proof that the attendee participates in the conversation named in the path
     * (FR-523).
     *
     * Set only by `requireParticipation`, the only module that can construct one. A handler
     * reads it through `conversationScopeOf` rather than directly.
     *
     * **A sibling of `eventScope`, not a replacement for it, and the two never both apply.**
     * Conversations are cross-event (FR-507), so no conversation route carries an `:eventId`
     * and no per-event route carries a `:conversationId`. That disjointness is what lets the
     * two route audits stay separate — and it is also why the event audit walks past these
     * routes without inspecting them, which is the whole reason the second guard exists
     * (research R9).
     */
    conversationScope?: ConversationScope
  }

  interface FastifyInstance {
    /** Route-level guard. Populates `request.attendee` or refuses the request. */
    requireAttendee: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /**
     * 002 — route-level event guard. Verifies registration for `:eventId` and populates
     * `request.eventScope`, or refuses indistinguishably from a nonexistent event (FR-148).
     */
    requireEventAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /**
     * 007 — route-level participation guard. Verifies a `conversation_participants` row for
     * `:conversationId` and populates `request.conversationScope`, or refuses with **404 rather
     * than 403** (FR-524) — a 403 would confirm that a conversation between two specific people
     * exists, which is the metadata this destination exists to keep private.
     */
    requireParticipation: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    /**
     * 004 — durable binary content, behind a project-owned port (FR-352, research D3).
     *
     * A route reads bytes through this and never through a storage vendor's SDK; the lint rule
     * in `packages/config/eslint.config.js` is what makes that a boundary rather than a
     * sentence. Server-side, deliberately not a seventh `DeviceServices` member — see
     * `storage/service.ts`.
     */
    storage: StorageService
    /**
     * 004 — transactional account mail, and nothing else (FR-394, FR-395).
     *
     * Two methods, one per message this product may send. There is deliberately no generic
     * `send`, which is what keeps the engagement-notification exclusion structural.
     */
    mail: MailService
    /**
     * 007 — notification delivery, behind a **vendor-free** port (FR-559, research R8).
     *
     * No push provider is chosen (register entry 20), so the sink adapter is what a clean clone,
     * the test suite and CI all run. A route calls this and cannot tell which adapter it received
     * — the same property `mail` above relies on.
     */
    push: PushService
  }
}
