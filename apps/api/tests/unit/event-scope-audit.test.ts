import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { requireEventAccess } from '../../src/plugins/event-access.js'

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

  it.each([true])('every route declaring an event parameter carries the access guard', () => {
    const unguarded = routes
      .filter((route) => EVENT_PARAM.test(route.url))
      .filter((route) => !preHandlersOf(route).includes(requireEventAccess))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      unguarded,
      'These routes name an event but do not verify that the attendee is registered for it ' +
        "(FR-146). Add `app.requireEventAccess` to the route's preHandler list. Every read of " +
        'conference content must pass through it — the verification is a precondition of ' +
        'reading, not a step a reader may omit (FR-147).',
    ).toEqual([])
  })

  it('every event-scoped route also binds identity first', () => {
    // `requireEventAccess` verifies a registration for `request.attendee`, so a route carrying
    // it without `requireAttendee` would be verifying against nobody.
    const missingIdentity = routes
      .filter((route) => EVENT_PARAM.test(route.url))
      .filter((route) => preHandlersOf(route).length < 2)
      .map((route) => route.url)

    expect(missingIdentity).toEqual([])
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
