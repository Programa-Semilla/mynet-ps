import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

import { getDb } from '../db/client.js'
import { registrations } from '../db/schema/events.js'
import { notAuthenticated, notFound } from '../errors.js'

/**
 * T036 (002) — the event scoping predicate, made impossible to forget (FR-145–FR-151,
 * research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS MODULE IS THE ONLY PLACE IN THE CODEBASE THAT CAN CONSTRUCT AN `EventScope`.**
 *
 * FR-147 requires verification to be a *precondition of reading*, not a step a reader may omit.
 * A guard `preHandler` alone — the familiar pattern, and the one 001 uses for identity — is
 * enforced only at test time: a new route can be written, type-check cleanly, and only fail once
 * somebody runs the audit.
 *
 * So the guard produces a **branded value**, and every per-event query takes that value instead
 * of a bare event id. A handler that skipped verification has no way to obtain one, so it does
 * not compile. The check moves from "did anyone run the test" to "does this build".
 *
 * Three mechanisms, covering three different surfaces:
 *   1. the brand      — protects the point where data is *read*   (compile time)
 *   2. the route audit — protects the point where routes are *declared* (T068, CI)
 *   3. the lint rule  — closes the brand's one escape hatch, a type assertion (T073)
 *
 * The brand alone is a guard against forgetting, not against a determined author. That limit is
 * stated here rather than left for someone to discover.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

declare const brand: unique symbol

/**
 * Proof that the signed-in attendee is registered for this event.
 *
 * Not constructible outside this module: the brand property is a unique symbol that is not
 * exported, so no other file can write an object literal satisfying this type.
 */
export type EventScope = {
  readonly attendeeId: string
  readonly eventId: string
  readonly [brand]: true
}

/** Route params for any route carrying an event identifier. */
export interface EventParams {
  readonly eventId: string
}

/**
 * Verifies registration and attaches the resulting `EventScope` (FR-145, FR-146).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The refusal discloses nothing about existence** (FR-148).
 *
 * "Not registered" and "no such event" return an identical status *and* an identical body, and
 * they do so **by construction rather than by two careful call sites**: there is one query, a
 * join over `registrations`, and an event that exists but is not the attendee's produces no row
 * exactly as an event that does not exist produces no row. The two cases are indistinguishable
 * without a second query that nobody makes — so there is no code path where a future edit could
 * accidentally make them differ.
 *
 * A 403 for "exists but not yours" and a 404 for "does not exist" would let an attendee
 * enumerate every conference in the product by watching which status came back.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const requireEventAccess = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
  const attendee = request.attendee
  // Ordering matters: an unauthenticated caller must not be able to probe event existence at
  // all. `requireAttendee` runs first in every route's preHandler list, and this is the
  // backstop if one were ever registered without it.
  if (!attendee) throw notAuthenticated()

  const { eventId } = request.params as Partial<EventParams>

  // A malformed identifier is refused exactly like a well-formed one that is not the
  // attendee's. Letting a 400 escape here would separate "not a uuid" from "not yours", which
  // is a smaller leak than existence but is still a difference an attacker can read.
  if (!eventId || !UUID.test(eventId)) throw notFound()

  const rows = await getDb()
    .select({ eventId: registrations.eventId })
    .from(registrations)
    .where(and(eq(registrations.attendeeId, attendee.id), eq(registrations.eventId, eventId)))
    .limit(1)

  if (rows.length === 0) throw notFound()

  // The single construction site. The assertion is unavoidable — the brand cannot be produced
  // by any expression — and it is what T073's lint rule forbids everywhere else.
  request.eventScope = {
    attendeeId: attendee.id,
    eventId,
  } as EventScope
}

/**
 * Matched rather than parsed, because Fastify's `format: uuid` validation would produce a 400
 * with a distinguishable body before this guard ever ran.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads the verified scope, or refuses.
 *
 * Handlers call this rather than reaching for `request.eventScope` directly, so the "it is
 * definitely there because the preHandler ran" assumption is asserted in one place instead of
 * being a non-null assertion in every handler.
 */
export const eventScopeOf = (request: FastifyRequest): EventScope => {
  const scope = request.eventScope
  if (!scope) throw notFound()
  return scope
}

const eventAccessPlugin = async (app: FastifyInstance): Promise<void> => {
  app.decorate('requireEventAccess', requireEventAccess)
}

export default fp(eventAccessPlugin, { name: 'event-access', dependencies: ['auth-context'] })
