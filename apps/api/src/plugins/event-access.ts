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
 * Four mechanisms, covering four different surfaces:
 *   1. the nominal type   — protects the point where data is *read*        (compile time)
 *   2. the `VERIFIED` set — proves the value came from here                (run time)
 *   3. the route audit    — protects the point where routes are *declared* (T068, CI)
 *   4. the lint rule      — closes the type's assertion escape hatch       (T073)
 *
 * **Two and one are not redundant, and the history is worth keeping.** The type began as a
 * structural symbol brand, which a spread defeated. It became a private-field class, which
 * `Object.assign`, `structuredClone`, `Object.create` and the prototype's own constructor each
 * defeated in a different way — one of them by mutating a genuine scope in place, because
 * `readonly` is erased at emit. Every one of those compiled cleanly and passed lint.
 *
 * A type can say what a value looks like. Only the set can say where it came from.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Proof that the signed-in attendee is registered for this event.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **NOMINAL, NOT STRUCTURAL — and the difference is the whole guarantee.**
 *
 * This was first written as `{ attendeeId, eventId, [brand]: true }` with a unique symbol, on
 * the reasoning that no other file could name the symbol. That reasoning was wrong, and a deep
 * review demonstrated it with a compiling probe:
 *
 *     listSessions({ ...scope, eventId: attackerSuppliedId })   // 0 type errors, 0 lint errors
 *
 * A spread **copies the brand**, so the result satisfied the type structurally while carrying an
 * `eventId` nobody had verified. That is a forgetting-shaped mistake, not a determined bypass —
 * exactly what the brand existed to prevent — and it would have compiled, passed lint, and
 * passed the route audit, because the route still declares the guard.
 *
 * The class below fixes it properly: `#verified` is a genuine private field, so `{ ...scope }`
 * produces a plain object that does **not** satisfy `EventScope`. The class itself is **not
 * exported** — only the type is — so no other module can construct one either. There is no
 * escape hatch left except a type assertion, which is what the ESLint rule in
 * `packages/config/eslint.config.js` exists to reject.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
class VerifiedEventScope {
  /**
   * The nominal marker. A `#` field is absent from spreads and object literals, which is what
   * makes the *type* unforgeable at compile time.
   *
   * It is **not** sufficient on its own — see `VERIFIED` below.
   */
  readonly #verified = true

  constructor(
    readonly attendeeId: string,
    readonly eventId: string,
  ) {
    // `readonly` is a compile-time annotation and is erased at emit: without this, the own
    // properties are writable and `Object.assign(scope, { eventId })` silently repoints a
    // verified scope at another conference, brand intact. Freezing makes the annotation real —
    // in ESM (always strict) that assignment now throws.
    Object.freeze(this)
  }

  /** Referenced so the field is not elided as unused; never called. */
  get verified(): boolean {
    return this.#verified
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ACTUAL GUARANTEE: a scope must have been issued by `requireEventAccess`.**
 *
 * The private field makes the type unforgeable; it does not make the *value* trustworthy, and
 * a second security review demonstrated the difference with compiling probes. All of these
 * type-checked and passed lint against the class alone:
 *
 *   Object.assign({}, scope, { eventId: other })   // intersection keeps the brand in the TYPE
 *   Object.assign(scope, { eventId: other })       // mutates the real instance in place
 *   structuredClone(scope)                         // typed <T>(v: T) => T, so the brand survives
 *   Object.create(scope) / JSON.parse(...)         // laundered through `any`
 *   new (Object.getPrototypeOf(scope).constructor)(…)  // a genuine instance for any event
 *
 * Membership of this set cannot be laundered, cloned, spread or reconstructed: it is added in
 * exactly one place, and every entry is an object this module built after a database check.
 * `Object.freeze` closes the mutation route; this closes the rest.
 *
 * This is what makes FR-147 — "a conference-scoped read MUST NOT be performable with an
 * unverified conference identifier" — true at runtime rather than only in the type system.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const VERIFIED = new WeakSet<VerifiedEventScope>()

/**
 * The type consumers see. The class is deliberately not exported, so `new` is unavailable
 * outside this module and the only way to obtain one is `requireEventAccess`.
 */
export type EventScope = VerifiedEventScope

/**
 * Confirms this scope was issued by the guard, and not assembled by something that merely
 * satisfies its shape.
 *
 * Called at the **query layer** — the boundary where data is actually read — rather than only
 * at the route, because that is the point FR-147 is about. It costs one `WeakSet` lookup.
 */
export const assertVerifiedScope = (scope: EventScope): EventScope => {
  if (!VERIFIED.has(scope)) {
    // Refused identically to an unregistered or nonexistent conference (FR-148): a forged
    // scope must not be distinguishable from any other refusal.
    throw notFound()
  }
  return scope
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
export const requireEventAccess = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
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

  // The single construction site, and the single place membership is granted. Both matter: the
  // class makes the type unforgeable, the set makes the value trustworthy.
  const scope = new VerifiedEventScope(attendee.id, eventId)
  VERIFIED.add(scope)
  request.eventScope = scope
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
