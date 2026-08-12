import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { requireAttendee } from '../../src/plugins/auth-context.js'
// 008 — the third route predicate. Imported here only so the attendee-naming assertion below can
// name it; every other guarantee about card routes lives in `card-audit.test.ts`.
import { requireHeldCard } from '../../src/plugins/card-access.js'
import { assertVerifiedScope, requireEventAccess } from '../../src/plugins/event-access.js'
// 011 — imported so the unauthenticated-route assertion can exclude administrative routes by
// **the guard they carry** rather than by their path. See that assertion for why the difference
// matters.
import { requireOperator, requirePlatformOperator } from '../../src/admin/require-operator.js'

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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **T028 (013) — THE ADMINISTRATIVE PRODUCT IS OUT OF THIS AUDIT'S SCOPE, AND THAT IS THE MOST
 * DANGEROUS SENTENCE IN THIS FILE. READ THE WHOLE NOTE BEFORE ADDING ANYTHING TO IT.**
 *
 * Every assertion below was written about **the attendee surface**, and each rests on a premise
 * that is simply false of an administrative route:
 *
 *   - `requireEventAccess` proves *an attendee is registered for this conference*. A platform
 *     operator has **no `attendees` row at all** (FR-901), so the guard would refuse them
 *     entirely correctly — and the route would be unreachable by the only principal entitled to
 *     call it.
 *   - `requireAttendee` binds an **attendee** identity. Administrative sessions are a different
 *     store, a different cookie and a different principal (decision 37).
 *   - "no route names an attendee identifier in a write" (FR-106) exists so that nothing may act
 *     on somebody else *as an attendee*. Promotion and demotion act on somebody else **as an
 *     administrative decision**, which is exactly the power v4.0.0 admitted.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THIS IS NOT A HOLE, BECAUSE A FOURTH AUDIT COVERS EVERY ROUTE EXCLUDED HERE.**
 *
 * `tests/unit/operator-audit.test.ts` fails any route beneath `/admin` carrying neither
 * `requireOperator` nor `requirePlatformOperator`, holds a **positive** table of the routes only
 * the platform tier may call, and — critically — asserts that **no administrative route carries
 * an attendee-shaped guard**. That last assertion is the other half of this exclusion: without
 * it, somebody could satisfy this audit by adding `requireEventAccess` to an administrative
 * route and produce something that passes every gate and works for nobody.
 *
 * The one route where the two audits genuinely disagree about the same path is
 * `POST /admin/conferences/:eventId/organizers`, which declares an event parameter and must not
 * have the event guard. It is named individually below rather than covered only by the prefix,
 * so that the disagreement is a written decision rather than a side effect of a regular
 * expression.
 *
 * **Adding a non-`/admin` path to this predicate would be a genuine hole.** The prefix is the
 * whole population, and `operator-audit.test.ts` uses the same prefix — so a route that escapes
 * this one is caught by that one, and a route that escapes both would have to be outside
 * `/admin` while claiming administrative status, which nothing registers.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
const ADMINISTRATIVE = /^\/admin(\/|$)/

/**
 * The single administrative route that declares an event parameter, named explicitly.
 *
 * It is here so that the disagreement between the two audits is a decision somebody wrote down.
 * If this route is renamed and this entry is not updated, the assertion below fails — which is
 * the same discipline every allow-list in this file and in `deletion-coverage.test.ts` applies.
 */
const ADMIN_ROUTES_NAMING_AN_EVENT = new Map([
  [
    'POST /admin/conferences/:eventId/organizers',
    'Promotion names the conference it grants authority over. The caller is a PLATFORM ' +
      'OPERATOR who is not registered for it and has no attendees row, so `requireEventAccess` ' +
      'would refuse them correctly and the route would be unreachable by the only principal ' +
      'entitled to call it (FR-930, FR-906). Guarded by `requirePlatformOperator` and audited ' +
      'by `operator-audit.test.ts`, which additionally forbids it carrying an attendee guard.',
  ],
  [
    'DELETE /admin/conferences/:eventId/organizers/:attendeeId',
    'Demotion, for the same reason as promotion above. It also names an ATTENDEE identifier in ' +
      'a write path, which FR-106 forbids on the attendee surface — and which is precisely the ' +
      'power constitution v4.0.0 admitted: an administrative act on somebody else, performed ' +
      'by a principal who is not an attendee (FR-934).',
  ],
])

const isAdministrative = (route: RouteOptions): boolean => ADMINISTRATIVE.test(route.url)

const acceptsEventIdentifier = (route: RouteOptions): boolean =>
  EVENT_PARAM.test(route.url) ||
  (['body', 'querystring', 'params'] as const).some((part) =>
    mentionsEventId((route.schema as Record<string, unknown> | undefined)?.[part]),
  )

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

/** The seeded conference-content collections, which nothing may write to (FR-132, FR-134). */
const CONTENT_COLLECTIONS = new Set(['sessions', 'tracks', 'rooms', 'speakers'])

/**
 * Whether a path **addresses** seeded conference content, rather than merely passing through it.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T022 (009) — NARROWED FROM `/\/(sessions|tracks|rooms|speakers)\b/`, AND THE NARROWING IS
 * A DECISION RATHER THAN A CONVENIENCE.**
 *
 * The old pattern matched any path *containing* one of those segments, which was exactly right
 * for four features and became wrong at the fifth. 009 registers
 * `POST /events/:eventId/sessions/:sessionId/questions` — a write to **attendee state about
 * conference content**, which is 005's distinction and the reason `saved_sessions` and
 * `session_notes` live outside `catalog.ts`. 005 dodged this only by accident of naming: its
 * addresses are `/agenda/saved/:sessionId`, so the segment never appears. Q&A is the first
 * feature whose attendee-owned resource genuinely nests under a session.
 *
 * The rule is now **what the path addresses**, which is what the requirement was always about:
 * the last non-parameter segment. `…/sessions` and `…/sessions/:sessionId` address a session;
 * `…/sessions/:sessionId/questions` addresses that session's questions, which no attendee shares
 * ownership of with an organizer.
 *
 * **This does not widen what may be written.** Creating, editing or importing a programme still
 * has to name a content collection last, and `catalog-read-only.test.ts` independently forbids a
 * write method reaching `CatalogRepository` at all. The bulk-import assertion below is unchanged
 * and still catches `/import`, `/bulk`, `/upload` and `/admin` anywhere in a path.
 *
 * `addressesConferenceContent` is exported to the test below rather than inlined, so the
 * narrowing is checked against a table of paths that MUST still be caught — a guard whose
 * predicate is only exercised by the routes that happen to exist is a guard that silently stops
 * guarding when they change.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const addressesConferenceContent = (url: string): boolean => {
  const segments = url.split('/').filter((segment) => segment.length > 0)

  // The resource a path addresses is its last segment that is not a parameter. `/sessions/:id`
  // addresses `sessions`; `/sessions/:id/questions` addresses `questions`.
  const addressed = [...segments].reverse().find((segment) => !segment.startsWith(':'))

  return addressed !== undefined && CONTENT_COLLECTIONS.has(addressed)
}

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

  /**
   * T043 (006) — **the directory listing is covered by this audit, and would fail without the
   * guard** (FR-402, research D14).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * The generic assertion below already covers it: `/events/:eventId/attendees` matches
   * `EVENT_PARAM`, so a version registered without `requireEventAccess` lands in `unguarded`
   * and fails the build. This names it anyway, because "the audit covers the new route" and
   * "the audit happens to match a pattern the new route also matches" are different claims, and
   * only the first survives someone renaming the route to `/events/:eventId/directory`.
   *
   * The reader-side condition of FR-402 is therefore enforced by CI rather than by anyone
   * remembering it — which is the whole reason 006 puts the listing under `:eventId` at all.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it("carries the guard on 006's directory listing, specifically (FR-402)", () => {
    const listing = routes.find(
      (route) => route.url === '/events/:eventId/attendees' && methodsOf(route).includes('GET'),
    )

    expect(
      listing,
      'The directory listing is missing from the route table. If it moved, move this assertion ' +
        'with it — do not delete it: the reader-side half of FR-402 is enforced here and ' +
        'nowhere else.',
    ).toBeDefined()

    expect(preHandlersOf(listing as RouteOptions)).toContain(requireEventAccess)
    expect(preHandlersOf(listing as RouteOptions)).toContain(requireAttendee)
  })

  it('every route accepting a conference identifier carries the access guard', () => {
    const unguarded = routes
      .filter(acceptsEventIdentifier)
      // T028 (013) — administrative routes are covered by `operator-audit.test.ts` instead.
      // See `ADMINISTRATIVE` above for why the event guard cannot apply to them, and note that
      // the two routes this excludes are named individually in `ADMIN_ROUTES_NAMING_AN_EVENT`.
      .filter((route) => !isAdministrative(route))
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T028 (013) — the administrative exclusion is bounded, and this is what bounds it.**
   *
   * The assertion above stops examining `/admin/*`. On its own that is a licence to add any
   * number of event-naming administrative routes and have none of them checked by anything this
   * file knows about. This closes that: the set of administrative routes naming a conference
   * must be **exactly** the two written down, with their reasons.
   *
   * A third one fails here, naming itself, and the person adding it has to say why the event
   * guard cannot apply — which is the same conversation `VERIFIES_INSIDE_ITS_QUERY` forces one
   * level up, and the same one `deletion-coverage.test.ts` forces about a new table.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('bounds the administrative exclusion to the routes that declared themselves', () => {
    const naming = routes
      .filter(isAdministrative)
      .filter(acceptsEventIdentifier)
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))
      .filter((label) => !label.startsWith('HEAD '))
      .sort()

    expect(
      naming,
      'An administrative route names a conference and is not declared in ' +
        '`ADMIN_ROUTES_NAMING_AN_EVENT`. This audit no longer examines `/admin/*`, so an ' +
        'undeclared route here is covered by the operator audit alone — which checks that it ' +
        'has an OPERATOR guard, not that naming a conference was the right shape. Write down ' +
        'why the event guard cannot apply to it.',
    ).toEqual([...ADMIN_ROUTES_NAMING_AN_EVENT.keys()].sort())

    for (const [label, reason] of ADMIN_ROUTES_NAMING_AN_EVENT) {
      expect(reason.length, `${label} is declared without a written reason`).toBeGreaterThan(80)
    }
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
      .filter((route) => addressesConferenceContent(route.url))
      .filter((route) => methodsOf(route).some((method) => WRITE_METHODS.includes(method)))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      writes,
      'A write route against seeded conference content exists. Creating, editing or importing a ' +
        'programme is organizer administration, which Principle III places out of product scope ' +
        'and which the constitution separately forbids without an amendment (FR-132, FR-134).',
    ).toEqual([])
  })

  /**
   * T022 (009) — **the predicate above, checked against paths rather than against whatever
   * routes happen to exist today.**
   *
   * The assertion it feeds passes when the list is empty, which is also what it does when the
   * predicate stops recognising anything. That is a gate that cannot fail. 009 narrowed the
   * predicate from a substring match to "what does this path address", so the narrowing itself
   * needs a check — otherwise the next author widening it back, or breaking it entirely, gets a
   * green suite either way.
   */
  it('still recognises a write to the programme, after 009 narrowed the predicate', () => {
    const mustCatch = [
      '/events/:eventId/sessions',
      '/events/:eventId/sessions/:sessionId',
      '/events/:eventId/tracks',
      '/events/:eventId/tracks/:trackId',
      '/events/:eventId/rooms/:roomId',
      '/events/:eventId/speakers',
      '/sessions/:sessionId',
    ]

    for (const url of mustCatch) {
      expect(
        addressesConferenceContent(url),
        `${url} addresses seeded conference content and must still be caught (FR-132, FR-134)`,
      ).toBe(true)
    }
  })

  it('does not mistake attendee state about a session for the session itself', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The other half, and the reason the narrowing exists. These are the attendee's own records
    // *about* conference content — 005's distinction, and the reason `saved_sessions`,
    // `session_notes` and 009's `session_questions` live outside `catalog.ts` and cascade from
    // `attendees` rather than being seeded.
    //
    // If one of these ever starts returning true, a future feature's perfectly legitimate write
    // fails a guard about organizer administration, and the likely fix is somebody adding an
    // allow-list — which is how the real exclusion gets a hole in it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const mustNotCatch = [
      '/events/:eventId/sessions/:sessionId/questions',
      '/events/:eventId/questions/:questionId',
      '/events/:eventId/questions/:questionId/vote',
      '/events/:eventId/agenda/saved/:sessionId',
      '/events/:eventId/agenda/notes/:sessionId',
    ]

    for (const url of mustNotCatch) {
      expect(
        addressesConferenceContent(url),
        `${url} addresses the attendee's own state, not the programme (005's distinction)`,
      ).toBe(false)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T022 (009) — **every Q&A route names its conference, and this is the assertion that makes
   * the absence of a fourth audit safe** (FR-742, research R12).
   *
   * The audit above examines a route **only if it declares an event parameter, and reports
   * success otherwise.** That is not a flaw — it is the documented reason 007 built
   * `participation-audit.test.ts` and 008 built `card-audit.test.ts`, each for a resource that
   * genuinely names no conference.
   *
   * 009 needs neither, because a question always belongs to a session and a session to exactly
   * one event. But that reasoning holds only while the addresses say so, and three of these five
   * routes could find their question from `:questionId` alone. Somebody tidying
   * `/events/:eventId/questions/:questionId` to `/questions/:questionId` would remove them from
   * the audit's view entirely — **the whole suite would stay green** while the routes lost the
   * only structural check on their scoping.
   *
   * So the naming rule gets its own assertion rather than being left as a comment. This is the
   * cheapest of the three mechanisms 007 and 008 each had to build, and it is available only
   * because the resource is genuinely per-event.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('lets no Q&A route omit its conference from the address (T022, FR-742)', () => {
    const qa = routes
      .filter((route) => /\bquestions?\b/.test(route.url))
      // ─────────────────────────────────────────────────────────────────────────────────────
      // T028 (013) — **`DELETE /admin/questions/:questionId` is a Q&A-shaped path that must NOT
      // name a conference, and excluding it here is a decision rather than a convenience.**
      //
      // 009's rule exists because Q&A routes are covered by the *event* audit and only by it, so
      // omitting the conference makes them invisible to the one guard they have. That premise
      // does not hold for the administrative removal route: it is covered by
      // `operator-audit.test.ts`, which examines it by prefix and cannot be evaded by naming or
      // not naming anything.
      //
      // Adding `:eventId` to it to satisfy this assertion would be actively wrong. A platform
      // operator's authority is product-wide, so the conference in the path would assert a
      // scope the caller does not have and does not need — and would drag the route into the
      // event audit, which would then demand a guard that refuses platform operators.
      // ─────────────────────────────────────────────────────────────────────────────────────
      .filter((route) => !isAdministrative(route))
      // Fastify registers a `HEAD` alongside every `GET`, so the route table carries six entries
      // for the five routes this feature declares. Dropping it here keeps the count an assertion
      // about the feature rather than about Fastify's conveniences.
      .filter((route) => !methodsOf(route).every((method) => method === 'HEAD'))

    // A gate that cannot fail is not a gate: if the routes were renamed or unregistered, the
    // filter below would be empty and every assertion after it vacuous.
    expect(qa.length, 'no Q&A routes were found to audit — has the registration moved?').toBe(5)

    const unnamed = qa
      .filter((route) => !EVENT_PARAM.test(route.url))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      unnamed,
      'These Q&A routes do not name their conference. `event-scope-audit` examines a route only ' +
        'if it declares an event parameter and REPORTS SUCCESS otherwise — so a route without ' +
        'one is not merely unconventional, it is invisible to the only guard covering this ' +
        'feature. Naming the event costs one path segment and is why 009 needs no fourth branded ' +
        'scope and no fourth audit (FR-742, research R12).',
    ).toEqual([])

    // …and naming it is only half. The guard must actually be attached, which the audit's own
    // assertions cover — restated here so this test reads as the complete rule for the feature.
    const unguarded = qa
      .filter((route) => !preHandlersOf(route).includes(requireEventAccess))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(unguarded, 'These Q&A routes name a conference but do not verify it.').toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T028 (013) — THE PREDICATE LOST `admin`, AND THE REPLACEMENT IS STRICTER RATHER THAN
   * LOOSER.**
   *
   * This matched `/import|bulk|upload|admin/` on the reasoning that the constitution forbade a
   * content import path *and* forbade an administrative surface at all — so the word `admin`
   * anywhere in a URL was itself the violation.
   *
   * **Half of that premise is gone.** v4.0.0 admitted the administrative product, and `/admin/*`
   * is now twelve legitimate routes. Leaving `admin` in the pattern would fail the build for
   * every one of them, and the natural repair — deleting the assertion — would take the *content
   * import* half with it, which is still binding: FR-974 keeps `catalog-read-only.test.ts` in
   * force, and conference content authoring is **012's**, not this feature's.
   *
   * So the pattern keeps the three words that describe an import and drops the one that
   * described an actor, and a second assertion below names what must still be absent from the
   * administrative surface specifically. That is stricter than the original, which would have
   * been satisfied by any content-writing route that avoided four words.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('exposes no route that could import conference content in bulk', () => {
    const imports = routes
      .filter((route) => /import|bulk|upload/i.test(route.url))
      .map((route) => route.url)

    expect(
      imports,
      'The constitution forbids a content import path without an amendment. Administration came ' +
        'IN at v4.0.0; **conference content authoring did not** — that is 012, and FR-974 keeps ' +
        '`catalog-read-only.test.ts` in force until it lands.',
    ).toEqual([])
  })

  it('exposes no administrative route that writes conference content (FR-974)', () => {
    // The half of the assertion above that used to be carried by the word `admin`. 011 builds
    // moderation and promotion; it builds no way to create, edit or delete a session, track,
    // room, speaker or event. A route here would be 012 arriving without its amendment.
    const authoring = routes
      .filter(isAdministrative)
      .filter((route) => methodsOf(route).some((method) => WRITE_METHODS.includes(method)))
      .filter((route) => /\/(events|sessions|tracks|rooms|speakers)(\/|$)/.test(route.url))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      authoring,
      'An administrative route writes conference content. 011 delivers moderation and ' +
        'promotion; authoring is 012 (FR-974). `/admin/conferences` is a READ of which ' +
        'conferences exist and who organizes them — it writes assignments, never content.',
    ).toEqual([])
  })

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T117 (004) — 001's rule NARROWED, not abandoned, and the narrowing is the interesting
   * part.**
   *
   * 001 asserted that no route names an attendee identifier at all, and that was right while no
   * route needed to: an event identifier says *which conference*, and nothing said *which
   * person*. 004 adds the product's first route that must —
   * `GET /events/:eventId/attendees/:attendeeId`, which 006's directory consumes.
   *
   * The rule's **purpose** was that nothing may *act on* somebody else, and that purpose is
   * intact. The narrowing is to reads only, and it is narrow in three ways at once:
   *
   *   - **reads only.** A write naming an attendee is still forbidden outright, which is what
   *     the assertion below actually checks.
   *   - **under the event guard**, so the reader's own registration is proven by the branded
   *     `EventScope` before the identifier is looked at.
   *   - **behind three server-side conditions** that the identifier cannot influence: it can
   *     only narrow a set already bounded by shared registration, discoverability and
   *     verification (FR-357, FR-359).
   *
   * Recorded here rather than silently deleted, because "the audit stopped asserting this" and
   * "the rule was deliberately narrowed" look identical in a diff.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  it('lets NO route WRITE against an attendee identifier (FR-106, narrowed by 004)', () => {
    const naming = routes.filter((route) =>
      /:attendeeId|\{attendeeId\}|:userId|:personId/.test(route.url),
    )

    const writes = naming
      .filter((route) => methodsOf(route).some((method) => WRITE_METHODS.includes(method)))
      // ─────────────────────────────────────────────────────────────────────────────────────
      // T028 (013) — **administrative routes are excluded, and this is the exclusion that most
      // needs its reasoning written down**, because it looks like the rule being abandoned.
      //
      // FR-106's purpose is that nothing may act on somebody else **as an attendee**: identity
      // is bound from the sign-in session and no attendee may name another in a write. That
      // purpose is completely intact — every attendee-facing route is still checked here.
      //
      // Demotion names an attendee in a write **because acting on somebody else is exactly the
      // power constitution v4.0.0 admitted** (FR-934). It is performed by a principal who is not
      // an attendee, through a guard the attendee product has no access to, on a separate
      // origin. Excluding it is not a weakening of FR-106; applying it would be a claim that the
      // second actor does not exist.
      // ─────────────────────────────────────────────────────────────────────────────────────
      .filter((route) => !isAdministrative(route))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      writes,
      'A write route naming an attendee is a route that can act on somebody else. Identity is ' +
        'bound at the request boundary from the sign-in session and nowhere else (FR-385).',
    ).toEqual([])
  })

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T056 (008) — WIDENED FROM ONE PREDICATE TO TWO, AND THE WIDENING IS RECORDED RATHER THAN
   * PERFORMED QUIETLY** — exactly as 004 recorded its own narrowing directly above.
   *
   * This asserted `requireEventAccess` alone, which was right while every attendee-naming read
   * was per-event. `GET /cards/held/:attendeeId` is the first that is not: a held card is
   * **cross-event** (FR-614, standing decision 7), so there is no conference in the path and
   * `requireEventAccess` has nothing to verify. Demanding it here would force 008 either to fail
   * this build or to bolt a registration check onto a route where registration is precisely the
   * thing that must **not** decide the answer — a check that looks like authorization and is not.
   *
   * The rule's **purpose** is intact and is the reason the widening is safe: *a read naming
   * another attendee must sit behind a server-side predicate that proves the reader may see
   * them.* `requireHeldCard` is that predicate, and it is **stronger** than event access rather
   * than weaker:
   *
   *   - event access proves the reader shares a conference with **everybody** there;
   *   - the held-card guard proves this **specific** person handed this **specific** reader their
   *     card, which is a decision that individual took by hand.
   *
   * It is also directional (the reader must be the *recipient*, never the sharer) and it refuses
   * with the same 404 (FR-616, FR-642). `tests/unit/card-audit.test.ts` is its audit.
   *
   * **The list of acceptable predicates is enumerated, not open.** A third entry here means a
   * third way to read another attendee, and that is a decision worth making deliberately — which
   * is the same discipline the allow-lists in this file and in `deletion-coverage.test.ts` apply.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  it('guards every read that names an attendee with a server-side predicate', () => {
    // The narrowing is only safe because these routes carry a guard. Without one the identifier
    // would be reachable by anybody who could guess it.
    const ACCEPTABLE = [requireEventAccess, requireHeldCard]

    const unguarded = routes
      .filter((route) => /:attendeeId|\{attendeeId\}/.test(route.url))
      // T028 (013). A third predicate — `requirePlatformOperator` — is acceptable on the
      // administrative surface and only there, so it is expressed as an exclusion rather than
      // added to ACCEPTABLE: adding it would make it acceptable on ATTENDEE routes too, which
      // would be a way for an operator guard to satisfy an attendee-facing read.
      .filter((route) => !isAdministrative(route))
      .filter((route) => !ACCEPTABLE.some((guard) => preHandlersOf(route).includes(guard)))
      .map((route) => route.url)

    expect(
      unguarded,
      'These routes name another attendee and prove nothing about whether the caller may read ' +
        'them. Two predicates are acceptable, and only two: `requireEventAccess` (the reader is ' +
        'registered for the conference the route names) and `requireHeldCard` (this specific ' +
        'attendee handed this specific reader their card). A third one is a third way to read ' +
        'somebody else, and needs the reasoning written down first.',
    ).toEqual([])
  })

  /**
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **T117 (004) — the unauthenticated routes are an ENUMERATED ALLOW-LIST** (FR-387).
   *
   * 004 adds the product's first deliberately unauthenticated **write** routes. Before it,
   * every route but `/health` and sign-in required a session, so "is this route authenticated"
   * needed no policing — the answer was always yes.
   *
   * Now it does. FR-387 requires them to be *enumerable*, and this is what makes that true: a
   * route registered without `requireAttendee` and without an entry below fails the build.
   * Without it, dropping the guard from a route would be a silent change that no test noticed —
   * which on `/profile` or `/account` would be the whole of Principle VIII undone by one
   * deleted line.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  it('exposes exactly the unauthenticated routes it declares, and no others (FR-387)', () => {
    /** Each entry states why it cannot require a session. The list must stay this short. */
    const DELIBERATELY_UNAUTHENTICATED = new Map([
      ['GET /health', 'Liveness. Touches no attendee data and no database row.'],
      /**
       * 006 — readiness. **This entry is the audit doing its job**, and it is worth saying
       * so: `/ready` was added, this test failed, and the reason had to be written down before
       * it could pass. That is the mechanism FR-387 asks for.
       *
       * It cannot require a session, because it is what a *deployment* gates on — nothing has
       * signed in at the moment it is called (SC-412). It performs one `select 1` and reports
       * the word "database"; it reads no attendee row and discloses no host, port or driver
       * message.
       */
      [
        'GET /ready',
        'Readiness. Called by the deployment before any attendee is signed in, so it cannot ' +
          'require a session (FR-482). One `select 1`; no attendee data, no dependency detail.',
      ],
      ['POST /auth/sign-in', 'Obtaining a session is what it is for (001).'],
      ['POST /auth/sign-up', 'A person creating an account does not have one yet (FR-300).'],
      [
        'POST /auth/verify',
        'Followed out of a mail client, often in a different browser from the one that signed ' +
          'up — which carries no session (FR-319).',
      ],
      [
        'POST /auth/reset-request',
        'Requested by somebody who cannot sign in, which is why they are here (FR-326).',
      ],
      ['POST /auth/reset', 'Followed out of a mail client, like verification (FR-328).'],
      // ─────────────────────────────────────────────────────────────────────────────────────
      // T028 (013) — **every administrative route requires no ATTENDEE session, and eleven of
      // the twelve require an ADMINISTRATIVE one.**
      //
      // `requireAttendee` is the wrong question here: an administrative principal is not an
      // attendee, and a platform operator has no `attendees` row at all. Listing the twelve
      // individually would say "unauthenticated" about eleven routes that are nothing of the
      // kind, so they are excluded from the population below and covered by
      // `operator-audit.test.ts`, which checks the guard they actually carry.
      //
      // The ONE genuinely unauthenticated administrative route is declared here, in the same
      // list and to the same standard as the six above, because it is the same kind of thing:
      // a route that establishes a session and therefore cannot require one.
      // ─────────────────────────────────────────────────────────────────────────────────────
      [
        'POST /admin/session',
        'Obtaining an administrative session is what it is for (FR-914). Rate-limited under ' +
          'its own `admin_sign_in` counter, which is configured `mayDeny: false` (FR-916) — an ' +
          'identifier-keyed denial here would lock out the operator rather than the attacker.',
      ],
    ])

    const unauthenticated = routes
      .filter((route) => !preHandlersOf(route).includes(requireAttendee))
      // ─────────────────────────────────────────────────────────────────────────────────────
      // Administrative routes carry an OPERATOR guard, not an attendee one — see the note in the
      // list above. Excluded by **the guard they actually carry**, not by their path: a route
      // beneath `/admin` with neither guard stays in the population and must be declared, which
      // is how `POST /admin/session` reaches the list above and how a future unguarded one would.
      //
      // Filtering on the path instead would have excluded every administrative route including
      // an unguarded one — a hole the operator audit would catch, but which this assertion
      // should not have opened in the first place.
      // ─────────────────────────────────────────────────────────────────────────────────────
      .filter(
        (route) =>
          !preHandlersOf(route).includes(requireOperator) &&
          !preHandlersOf(route).includes(requirePlatformOperator),
      )
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))
      // Fastify registers a HEAD for every GET; it inherits the GET's guards and is not a
      // separate surface.
      .filter((label) => !label.startsWith('HEAD '))

    const undeclared = unauthenticated.filter((label) => !DELIBERATELY_UNAUTHENTICATED.has(label))

    expect(
      undeclared,
      'These routes require no session and are not declared as deliberately unauthenticated ' +
        '(FR-387). If that is intended, add an entry above saying why — and make sure the route ' +
        'is rate-limited under its own action counter. If it is not, the route is missing ' +
        '`app.requireAttendee`.',
    ).toEqual([])

    // An allow-list that outlives its routes is a hole waiting for a name collision.
    for (const declared of DELIBERATELY_UNAUTHENTICATED.keys()) {
      expect(unauthenticated, `${declared} is declared but no longer exists`).toContain(declared)
    }
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
