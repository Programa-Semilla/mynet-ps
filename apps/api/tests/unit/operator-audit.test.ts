import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { requireOperator, requirePlatformOperator } from '../../src/admin/require-operator.js'

/**
 * T011 (013) — the administrative route audit (FR-905, FR-906, contracts, research R5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FOURTH ROUTE AUDIT, AND IT EXISTS FOR THE THIRD TIME FOR THE SAME REASON.**
 *
 * `tests/unit/event-scope-audit.test.ts` examines a route **only if it declares an event
 * parameter, and reports success otherwise.** Every administrative route names no conference —
 * correctly, because an operator's authority is product-wide or assignment-wide and never
 * derived from a registration — so all twelve of them would pass that audit while being guarded
 * by nothing at all.
 *
 * 007 found this hole for conversations and built `participation-audit.test.ts`. 008 found it
 * again for cards and built `card-audit.test.ts`, whose header records that the *event* audit
 * walks past a route naming no conference "reporting success either way". 009 was the exception
 * that proved the rule — it needed no fourth audit precisely because every one of its routes
 * names its conference, and its plan says so explicitly.
 *
 * 011 is not that exception. So this is the fourth, and the pattern is now established enough
 * that the argument is not re-derived here: read `plugins/event-access.ts` for the original.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT IS DIFFERENT HERE, AND IT IS THE REASON THIS IS NOT A WIDENED THIRD AUDIT.**
 *
 * The three existing audits all ask a question about **an attendee's relationship to a record**:
 * are you registered for this conference, do you participate in this conversation, do you hold
 * this card. This one asks a question about **which principal is calling at all** — and the
 * principal may not be an attendee. A platform operator has no `attendees` row.
 *
 * It also enforces something none of the others do: a **two-tier** distinction. Twelve routes
 * carry `requireOperator`; nine of them must carry `requirePlatformOperator` instead, because a
 * conference organizer must not read the report queue or promote anybody (FR-906, decision 35).
 * That is checked below as a positive obligation per route, not as a convention.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Every route beneath `/admin`, whatever its parameters are called.
 *
 * **Matched by prefix rather than by parameter name**, which is the lesson 007 had to learn the
 * hard way and 008 inherited: `participation-audit.test.ts` originally keyed on the single
 * spelling `:conversationId`, so `/conversations/:id/messages` was never examined and an
 * unguarded route passed while the audit reported success. A gate keyed on a name is defeated by
 * choosing another name.
 *
 * There is no schema-property branch here, and its absence is deliberate. The other audits need
 * one because a conversation or event identifier can arrive in a body — but administrative
 * authority is not carried by any identifier the caller supplies. It is carried by the session
 * cookie, so the *path prefix* is the complete population and nothing can smuggle itself in
 * through a request body.
 */
const ADMIN_ROUTE = /^\/admin(\/|$)/

/**
 * The matcher, asserted against synthetic routes rather than assumed.
 *
 * A predicate that quietly stopped matching is exactly how the participation audit failed before
 * it was widened, so the shapes this must catch — and the ones it must not — are written down.
 */
export const MATCHER_CASES: readonly { url: string; matches: boolean }[] = [
  { url: '/admin/session', matches: true },
  { url: '/admin/me', matches: true },
  { url: '/admin/reports/:reportId', matches: true },
  { url: '/admin/reports/:id/resolution', matches: true },
  { url: '/admin/conferences/:eventId/organizers', matches: true },
  { url: '/admin/questions/:questionId', matches: true },
  { url: '/admin', matches: true },
  // Attendee routes. None of these may ever be caught by this audit — if one were, the failure
  // message would send somebody to add an operator guard to a route an attendee calls.
  { url: '/events/:eventId/sessions', matches: false },
  { url: '/conversations/:id/messages', matches: false },
  { url: '/reports', matches: false },
  // The near-miss that a bare `/^\/admin/` would wrongly catch. There is no such route today,
  // and that is the point: the guard has to be right before the route exists, not after.
  { url: '/administrators', matches: false },
]

/**
 * Routes beneath `/admin` that legitimately carry **neither** guard.
 *
 * **One entry, and it is a sign-in route** — a route that establishes a session cannot require
 * one. Every entry must name why, in prose, because an allow-list entry is a written decision
 * and an unguarded route is an oversight, and the two must never look alike (contracts).
 *
 * `PUT /admin/session/credential` is deliberately **not** here: forced credential replacement
 * happens *after* sign-in, so it carries `requireOperator` and is merely exempt from the
 * unreplaced-credential refusal — which is a different mechanism, enforced inside the guard.
 */
const NO_SESSION_TO_REQUIRE = new Map<string, string>([
  [
    'POST /admin/session',
    'Sign-in. It is the route that CREATES an administrative session, so requiring one would ' +
      'make administrative access unreachable. Throttled as `admin_sign_in` instead (FR-916), ' +
      'and it answers all four failure causes identically (FR-915).',
  ],
])

/**
 * Routes the **platform tier alone** may call (decision 35, FR-906, contracts).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS TABLE IS A POSITIVE OBLIGATION, NOT A DENY-LIST, AND THAT IS THE WHOLE DESIGN.**
 *
 * A deny-list would mean a new administrative route defaults to being reachable by a conference
 * organizer, and the failure mode of forgetting is *"an organizer can read the abuse-report
 * queue"* — the one thing v4.1.0's decision 38 conditions on tier above all else. Listing the
 * platform-only routes explicitly means a new route in this area fails until somebody decides
 * which tier it belongs to.
 *
 * The branded `PlatformScope` makes a platform-only *handler* fail to typecheck without one;
 * this makes the *route registration* fail if the guard is downgraded to `requireOperator`.
 * Two mechanisms, because the type only protects the handler body and this only protects the
 * preHandler list.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const PLATFORM_TIER_ONLY: readonly string[] = [
  'GET /admin/reports',
  'GET /admin/reports/:reportId',
  'POST /admin/reports/:reportId/resolution',
  'DELETE /admin/questions/:questionId',
  'POST /admin/conferences/:eventId/organizers',
  'DELETE /admin/conferences/:eventId/organizers/:attendeeId',
  'POST /admin/operators/:operatorId/deactivation',
]

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const preHandlersOf = (route: RouteOptions): unknown[] => {
  const declared = route.preHandler
  if (!declared) return []
  return Array.isArray(declared) ? declared : [declared]
}

const labelsOf = (route: RouteOptions): string[] =>
  methodsOf(route).map((method) => `${method} ${route.url}`)

describe('administrative route audit', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate. If the observer stopped receiving routes, every
    // assertion below would pass vacuously.
    expect(routes.length).toBeGreaterThan(5)
  })

  it.each(MATCHER_CASES)('recognises $url as administrative: $matches', ({ url, matches }) => {
    expect(ADMIN_ROUTE.test(url)).toBe(matches)
  })

  it('includes the administrative routes this feature added', () => {
    const admin = routes.filter((route) => ADMIN_ROUTE.test(route.url))
    expect(
      admin.length,
      'No administrative routes were found. Either they were removed, or the audit has stopped ' +
        'recognising the prefix — both need a human, not a green tick.',
    ).toBeGreaterThan(0)
  })

  it('every administrative route carries an operator guard', () => {
    const unguarded = routes
      .filter((route) => ADMIN_ROUTE.test(route.url))
      .filter((route) => {
        const handlers = preHandlersOf(route)
        return !handlers.includes(requireOperator) && !handlers.includes(requirePlatformOperator)
      })
      .flatMap(labelsOf)
      .filter((label) => !NO_SESSION_TO_REQUIRE.has(label))

    expect(
      unguarded,
      'These routes are administrative but verify no administrative principal (FR-905). Add ' +
        '`requireOperator` — or `requirePlatformOperator` where only the platform tier may act ' +
        "— to the route's preHandler list. Note that `event-scope-audit.test.ts` REPORTS " +
        'SUCCESS on these routes, because they name no conference: this audit is the only one ' +
        'that covers them.',
    ).toEqual([])
  })

  it('every platform-tier-only route carries requirePlatformOperator, not requireOperator', () => {
    const downgraded = routes
      .filter((route) => preHandlersOf(route).includes(requireOperator))
      .flatMap(labelsOf)
      .filter((label) => PLATFORM_TIER_ONLY.includes(label))

    expect(
      downgraded,
      'These routes are reachable by a conference organizer and must not be. A platform ' +
        'operator is the only tier that may read reports, remove a question, promote anybody, ' +
        'or deactivate an operator (decision 35, FR-906). Use `requirePlatformOperator`.',
    ).toEqual([])
  })

  it('every route named platform-tier-only actually exists', () => {
    // The table above is the obligation, so an entry naming a route that has been renamed or
    // removed is an obligation that has silently stopped applying — the failure mode every
    // allow-list in this codebase is written to notice.
    const labels = new Set(routes.flatMap(labelsOf))
    for (const required of PLATFORM_TIER_ONLY) {
      expect(
        labels.has(required),
        `${required} is listed as platform-tier-only but no longer exists. Either restore it ` +
          `or remove the entry — a stale entry protects nothing while looking like it does.`,
      ).toBe(true)
    }
  })

  it('the unguarded allow-list stays justified and short', () => {
    const labels = new Set(routes.flatMap(labelsOf))
    for (const [allowed, reason] of NO_SESSION_TO_REQUIRE) {
      expect(labels.has(allowed), `${allowed} is allowlisted but no longer exists`).toBe(true)
      expect(reason.length, `${allowed} is allowlisted without a written reason`).toBeGreaterThan(
        40,
      )
    }
    expect(
      NO_SESSION_TO_REQUIRE.size,
      'Only a sign-in route can legitimately be unguarded here. A second entry means an ' +
        'administrative surface is reachable without an administrative session.',
    ).toBeLessThanOrEqual(1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **No administrative route may carry `requireAttendee` or `requireEventAccess`**, and this is
   * the one place two audits disagree about the same path.
   *
   * `POST /admin/conferences/:eventId/organizers` **declares an event parameter**, so
   * `event-scope-audit.test.ts` will examine it and demand `requireEventAccess`. It must not
   * have one: the caller is a platform operator who is not registered for that conference and
   * would fail that guard entirely correctly. That route therefore carries an explicit entry in
   * the *event* audit's allow-list, with the reason written down (T028).
   *
   * This assertion is the other half of that agreement. Without it, somebody satisfying the
   * event audit by adding `requireEventAccess` would produce a route that typechecks, passes
   * three audits, and can never be called by the only principal entitled to call it.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('no administrative route carries an attendee-shaped guard', () => {
    const misguarded = routes
      .filter((route) => ADMIN_ROUTE.test(route.url))
      .filter((route) =>
        preHandlersOf(route).some(
          (handler) =>
            typeof handler === 'function' &&
            [
              'requireAttendee',
              'requireEventAccess',
              'requireParticipation',
              'requireHeldCard',
            ].includes(handler.name),
        ),
      )
      .flatMap(labelsOf)

    expect(
      misguarded,
      'An administrative route carries a guard written for attendees. A platform operator has ' +
        'no `attendees` row and no registration, so these guards refuse them correctly and the ' +
        'route becomes unreachable by the only principal entitled to call it.',
    ).toEqual([])
  })

  /**
   * **Administrative routes must NOT live under `/events/:eventId`.**
   *
   * The mirror of the rule 007 wrote for conversations and 008 wrote for cards, and it points
   * the opposite way to 009's. Nesting an administrative route beneath the attendee event prefix
   * would put it inside a guarantee that does not apply to it, and would make the event audit
   * demand a registration the caller does not and must not have.
   */
  it('registers no administrative route beneath the attendee event prefix', () => {
    const misplaced = routes
      .filter((route) => /^\/events\/[:{].*\/admin/.test(route.url))
      .flatMap(labelsOf)

    expect(
      misplaced,
      'An administrative route is nested under `/events/:eventId`. Administrative authority is ' +
        'not derived from a registration, so that path asserts something false about the caller.',
    ).toEqual([])
  })
})
