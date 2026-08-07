import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { requireAttendee } from '../../src/plugins/auth-context.js'
import { assertVerifiedScope, requireEventAccess } from '../../src/plugins/event-access.js'

/**
 * T068, T072 (002) — the route audit (FR-149, FR-132, FR-134, SC-105).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS WALKS THE REAL APPLICATION'S ROUTE TABLE, NOT A LIST SOMEBODY MAINTAINS.**
 *
 * The branded `EventScope` protects the point where data is *read* — a handler that skipped
 * verification cannot call the query layer, because it has nothing to pass. This protects the
 * point where routes are *declared*, which the brand cannot reach: a route could be added that
 * reads nothing at all and still leaks existence through its status code, or that resolves a
 * scope for the wrong identifier.
 *
 * A feature adding `/events/:eventId/anything` without the guard fails here, in CI, rather than
 * in review — which matters because seven features after this one will add exactly that shape
 * of route, and each of them will be written by someone who has not read this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** URL segments that name an event. Extend deliberately, not to make a failure go away. */
const EVENT_PARAM = /:eventId\b|\{eventId\}/

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A conference identifier is not always in the URL**, and the audit used to assume it was.
 *
 * FR-149 says "a route accepting a conference identifier", not "a route with an event path
 * parameter". `PUT /workspace/active-event` already takes one in its **body**, and was
 * therefore invisible to this audit — it is safe, because `recordActiveEvent` folds the
 * registration check into a single `INSERT … WHERE EXISTS`, but the audit did not verify that
 * and would not have noticed a sibling route that omitted it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const EVENT_ID_KEY = /^(event|conference)_?id$/i

/**
 * Searches a JSON-schema fragment for any property naming a conference, at any depth.
 *
 * A top-level exact-match on `eventId` was the first version, and it missed every ordinary
 * variation: `allOf`, `items`, a nested object, and `conferenceId`. It also never looked at
 * `params`, so a route spelled `/events/:id/sessions` was invisible to both this and the URL
 * pattern. A gate that silently narrows is the failure this file's own header warns about.
 */
const mentionsEventId = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null) return false
  return Object.entries(node as Record<string, unknown>).some(
    ([key, value]) => EVENT_ID_KEY.test(key) || mentionsEventId(value),
  )
}

/**
 * Routes that take a conference identifier but verify registration inside their query rather
 * than through the guard. **Each entry must name why**, and the list must stay this short.
 */
const VERIFIES_INSIDE_ITS_QUERY = new Set([
  // `recordActiveEvent` inserts only `WHERE EXISTS (SELECT 1 FROM registrations …)`, so the
  // check and the write are one statement with no window between them. Using the guard here
  // would verify the same registration twice.
  'PUT /workspace/active-event',
])

const acceptsEventIdentifier = (route: RouteOptions): boolean =>
  EVENT_PARAM.test(route.url) ||
  (['body', 'querystring', 'params'] as const).some((part) =>
    mentionsEventId((route.schema as Record<string, unknown> | undefined)?.[part]),
  )

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

/** Paths that hold seeded conference content, which nothing may write to (FR-132, FR-134). */
const CONFERENCE_CONTENT = /\/(sessions|tracks|rooms|speakers)\b/

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const preHandlersOf = (route: RouteOptions): unknown[] => {
  const declared = route.preHandler
  if (!declared) return []
  return Array.isArray(declared) ? declared : [declared]
}

describe('event scope route audit', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    // The real application, with every plugin and every route the server registers.
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // A gate that cannot fail is not a gate. If the observer ever stopped receiving routes —
    // a Fastify change, a refactor that moved registration earlier — every assertion below
    // would pass vacuously while checking nothing. This is what notices.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(routes.length).toBeGreaterThan(5)
  })

  it('includes the per-event routes this feature added', () => {
    const eventScoped = routes.filter((route) => EVENT_PARAM.test(route.url))
    expect(
      eventScoped.length,
      'No event-scoped routes were found. Either they were removed, or the audit has stopped ' +
        'recognising the parameter shape — both need a human, not a green tick.',
    ).toBeGreaterThan(0)
  })

  it('every route accepting a conference identifier carries the access guard', () => {
    const unguarded = routes
      .filter(acceptsEventIdentifier)
      .filter((route) => !preHandlersOf(route).includes(requireEventAccess))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)
      .filter((label) => !VERIFIES_INSIDE_ITS_QUERY.has(label))

    expect(
      unguarded,
      'These routes name an event but do not verify that the attendee is registered for it ' +
        "(FR-146). Add `app.requireEventAccess` to the route's preHandler list. Every read of " +
        'conference content must pass through it — the verification is a precondition of ' +
        'reading, not a step a reader may omit (FR-147).',
    ).toEqual([])
  })

  it('every event-scoped route binds identity FIRST, by reference not by count', () => {
    // `requireEventAccess` verifies a registration for `request.attendee`, so a route carrying
    // it without `requireAttendee` — or after it — would be verifying against nobody.
    //
    // This asserted `preHandlers.length >= 2` until a deep review pointed out that
    // `[someUnrelatedHook, requireEventAccess]` satisfies a count. Now it compares the actual
    // function references, which is possible because both guards are exported.
    const wrong = routes
      .filter((route) => preHandlersOf(route).includes(requireEventAccess))
      .filter((route) => {
        const handlers = preHandlersOf(route)
        const identity = handlers.indexOf(requireAttendee)
        return identity === -1 || identity > handlers.indexOf(requireEventAccess)
      })
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      wrong,
      'These routes verify event access without binding identity first, so the registration ' +
        'check has no attendee to check against.',
    ).toEqual([])
  })

  it('the allowlist for query-verified routes stays justified and short', () => {
    // An allowlist that grows silently is a hole. Every entry must still exist as a route.
    const labels = routes.flatMap((route) =>
      methodsOf(route).map((method) => `${method} ${route.url}`),
    )
    for (const allowed of VERIFIES_INSIDE_ITS_QUERY) {
      expect(labels, `${allowed} is allowlisted but no longer exists`).toContain(allowed)
    }
    expect(VERIFIES_INSIDE_ITS_QUERY.size).toBeLessThanOrEqual(1)
  })

  /**
   * T072 — **no write path to conference content, at any privilege** (FR-132, FR-134).
   *
   * The audit already walks the route table, so this costs almost nothing — and it is the only
   * automated guard on the organizer-administration exclusion. Principle III puts that exclusion
   * in the product's scope rather than in its architecture, which means nothing else in the
   * codebase would object to a `POST /events/:eventId/sessions` appearing one day.
   */
  it('exposes NO write route against conference content', () => {
    const writes = routes
      .filter((route) => CONFERENCE_CONTENT.test(route.url))
      .filter((route) => methodsOf(route).some((method) => WRITE_METHODS.includes(method)))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      writes,
      'A write route against seeded conference content exists. Creating, editing or importing a ' +
        'programme is organizer administration, which Principle III places out of product scope ' +
        'and which the constitution separately forbids without an amendment (FR-132, FR-134).',
    ).toEqual([])
  })

  it('exposes no route that could import conference content in bulk', () => {
    const imports = routes
      .filter((route) => /import|bulk|upload|admin/i.test(route.url))
      .map((route) => route.url)

    expect(
      imports,
      'The constitution forbids a content import path without an amendment — it would be a route ' +
        'around the organizer-administration exclusion.',
    ).toEqual([])
  })

  it('keeps every route free of an attendee identifier (FR-106)', () => {
    // 001's rule, still binding. An event identifier says which conference; nothing may say
    // which person.
    const withAttendeeParam = routes
      .filter((route) => /:attendeeId|\{attendeeId\}|:userId/.test(route.url))
      .map((route) => route.url)

    expect(withAttendeeParam).toEqual([])
  })
})

/**
 * The runtime half of FR-147 (research D2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * A security review defeated the compile-time brand five different ways — `Object.assign` both
 * to forge and to mutate in place, `structuredClone`, `Object.create`, and the prototype's own
 * constructor — every one of them compiling clean and passing lint. The type says what a value
 * looks like; only membership of the guard's own set says where it came from.
 *
 * These assertions are what stop that fix from being quietly removed later. They use `as never`
 * to smuggle non-scopes past the compiler on purpose, which is the only way to test a runtime
 * check whose whole point is that the type system already refuses the obvious cases.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a scope must have been issued by the guard, not merely shaped like one', () => {
  const forged = [
    ['a plain object of the right shape', { attendeeId: 'a', eventId: 'e' }],
    ['a frozen object of the right shape', Object.freeze({ attendeeId: 'a', eventId: 'e' })],
    ['an object with a null prototype', Object.assign(Object.create(null), { eventId: 'e' })],
  ] as const

  it.each(forged)('refuses %s', (_label, candidate) => {
    expect(() => assertVerifiedScope(candidate as never)).toThrow()
  })

  it('refuses a structured clone of a real scope', () => {
    // The clone keeps the nominal type but is a different object, so it is not a member.
    const realish = structuredClone({ attendeeId: 'a', eventId: 'e' })
    expect(() => assertVerifiedScope(realish as never)).toThrow()
  })

  it('refuses identically to any other refusal, disclosing nothing (FR-148)', () => {
    // The same `notFound()` an unregistered or nonexistent conference produces — a forged scope
    // must not be distinguishable from either.
    try {
      assertVerifiedScope({ attendeeId: 'a', eventId: 'e' } as never)
      throw new Error('should have refused')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('not_found')
      expect((error as { statusCode?: number }).statusCode).toBe(404)
    }
  })
})
