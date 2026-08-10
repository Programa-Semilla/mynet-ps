import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { requireAttendee } from '../../src/plugins/auth-context.js'
import { assertVerifiedCard, requireHeldCard } from '../../src/plugins/card-access.js'

/**
 * T020–T022 (008) — **the third route audit** (FR-641, FR-642, SC-613, research R1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE `event-scope-audit.test.ts` SILENTLY PASSES THESE ROUTES — AND SO DOES
 * `participation-audit.test.ts`.**
 *
 * FR-641 is the requirement this whole guard exists to satisfy, and it is worth being precise
 * about, because "we already have two route audits" is the obvious objection to a third.
 *
 * The **event** audit matches a route by `:eventId` in the URL or an event-naming property in
 * its schema. **Card routes name no conference** — correctly, since standing decision 7 and
 * constitution v3.2.0 (N1) make a held card cross-event and permanent — so they match nothing it
 * looks for. They are not *failed* by it; they are never *examined* by it, and it reports success
 * either way. A route added as `GET /cards/held/:attendeeId` with no guard at all would fail no
 * test and look protected.
 *
 * The **participation** audit does not reach them either, and its own header names the wrong
 * feature as its heir: it says *"008's appointments — which are also cross-event and also
 * two-party"*. Appointments are **per-event** and sit under `/events/:eventId`, inside the event
 * audit's existing guarantee. It is **cards** that are cross-event and two-party. 008 corrects
 * that prediction in place, in both files, and points them here.
 *
 * **Widening either audit was considered and rejected** (research R1), on the reasoning
 * `participation.ts` already recorded one level up: it would conflate different predicates in one
 * test and make the failure message name the wrong requirement. Three predicates, three audits,
 * three failure messages that each name the right thing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Any parameterised route beneath `/cards`, **whatever its parameter is called** (T021).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **MATCHED BY PATH SHAPE RATHER THAN BY PARAMETER NAME, AND THAT LESSON IS INHERITED RATHER
 * THAN RE-LEARNED.**
 *
 * `participation-audit.test.ts` records what a name-keyed matcher costs: it read
 * `/:conversationId\b/`, and a route registered as `GET /conversations/:id/messages` named a
 * conversation, read correspondence, and **matched nothing** — so it was never examined and an
 * unguarded route passed an audit that reported success.
 *
 * `:id` is at least as natural a parameter name as `:attendeeId`, and a new author has no reason
 * to prefer one. **A gate keyed on a name is defeated by choosing another name**, which is not a
 * hypothetical here: `/cards/held/:id` is the shape somebody writes without thinking.
 *
 * Matching on path shape removes the naming dependency entirely. The name alternatives are kept
 * so that a card route living somewhere unexpected is still caught.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const CARD_PARAM = /^\/cards\/[^/]+\/[:{]|^\/cards\/[:{]|:sharerId\b|\{sharerId\}/

/**
 * The static card addresses, which are guarded by identity alone and correctly carry no
 * `requireHeldCard`.
 *
 * `POST /cards` shares *your* card — there is no held card to verify, since the whole point is
 * that one does not exist yet. `GET /cards/held` and `GET /cards/shared` are collections scoped
 * to the caller by the session. Listed so the "found routes to audit" assertion below can tell
 * "no parameterised card routes exist yet" from "the matcher stopped working".
 */
const COLLECTION_ROUTES = ['/cards', '/cards/held', '/cards/shared']

/**
 * Routes that name a card's sharer but establish the holding inside their own query rather than
 * through the guard. **Each entry must state why**, and the list must stay this short (T022).
 *
 * Empty on purpose, and it should stay that way. The event audit has one entry, where folding
 * the check into an `INSERT … WHERE EXISTS` genuinely removed a redundant query; the
 * participation audit has none. There is no card route that benefits from doing this by hand —
 * every read here resolves another person's live profile, which is the most expensive place in
 * this feature to get authorization subtly wrong.
 */
const VERIFIES_INSIDE_ITS_QUERY: Record<string, string> = {}

/**
 * The matcher itself, asserted against synthetic routes.
 *
 * A predicate that silently stopped matching is exactly how the participation gate failed before
 * it was widened, so the shapes this one must catch are written down rather than assumed.
 */
export const MATCHER_CASES: readonly { url: string; matches: boolean }[] = [
  { url: '/cards/held/:attendeeId', matches: true },
  // The evasion the path-shape pattern exists to close.
  { url: '/cards/held/:id', matches: true },
  { url: '/cards/held/{attendeeId}', matches: true },
  { url: '/cards/shared/:id', matches: true },
  { url: '/cards/:attendeeId', matches: true },
  // Not parameterised: guarded by identity alone, correctly.
  { url: '/cards', matches: false },
  { url: '/cards/held', matches: false },
  { url: '/cards/shared', matches: false },
  // Somebody else's routes, which this audit must not claim.
  { url: '/conversations/:conversationId/messages', matches: false },
  { url: '/events/:eventId/appointments', matches: false },
]

const acceptsCardIdentifier = (route: RouteOptions): boolean => CARD_PARAM.test(route.url)

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const preHandlersOf = (route: RouteOptions): unknown[] => {
  const declared = route.preHandler
  if (!declared) return []
  return Array.isArray(declared) ? declared : [declared]
}

describe('held-card route audit (T020, FR-641)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    // The real application, with every plugin and every route the server registers.
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate. If the observer ever stopped receiving routes,
    // every assertion below would pass vacuously. This is what notices — the same reasoning
    // both older audits record for their own "found routes" case.
    expect(routes.length).toBeGreaterThan(5)
  })

  it.each(MATCHER_CASES)('recognises $url as naming a held card: $matches', ({ url, matches }) => {
    // **The matcher is asserted, not assumed** (T021). The participation audit keyed on a single
    // parameter name and an unguarded route passed it while it reported success. A predicate that
    // can quietly stop matching is not a control.
    expect(acceptsCardIdentifier({ url, method: 'GET' } as RouteOptions)).toBe(matches)
  })

  it('includes the card routes this feature added', () => {
    const cards = routes.filter(
      (route) => acceptsCardIdentifier(route) || COLLECTION_ROUTES.includes(route.url),
    )

    expect(
      cards.length,
      'No card routes were found at all. Either they were removed, or this audit has stopped ' +
        'recognising their shape — both need a human, not a green tick.',
    ).toBeGreaterThan(0)

    const parameterised = routes.filter(acceptsCardIdentifier)
    expect(
      parameterised.length,
      'No PARAMETERISED card route was found. `GET /cards/held/:attendeeId` is the route this ' +
        'audit exists for (FR-616): it is the one that reads a specific other person on the ' +
        'strength of holding their card.',
    ).toBeGreaterThan(0)
  })

  it('every route naming a card carries the held-card guard (FR-641)', () => {
    const unguarded = routes
      .filter(acceptsCardIdentifier)
      .filter((route) => !preHandlersOf(route).includes(requireHeldCard))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)
      .filter((label) => !(label in VERIFIES_INSIDE_ITS_QUERY))

    expect(
      unguarded,
      'These routes name a card but do not verify that the caller HOLDS it (FR-616, FR-641). ' +
        "Add `app.requireHeldCard` to the route's preHandler list.\n\n" +
        'Note that neither existing audit would have caught this. A card route names no ' +
        'conference, so `event-scope-audit` never examines it and reports success; and holding a ' +
        'card is directional where participation is symmetric, so `requireParticipation` asks ' +
        'the wrong question even where it would compile.',
    ).toEqual([])
  })

  it('every card-scoped route binds identity FIRST, by reference not by count', () => {
    // `requireHeldCard` looks for a `shared_cards` row whose recipient is `request.attendee`, so
    // a route carrying it without `requireAttendee` — or after it — verifies against nobody.
    //
    // Compared by function reference rather than by count, because `[unrelatedHook,
    // requireHeldCard]` satisfies a length check while proving nothing. That lesson was learned
    // in the event audit and is not re-learned here.
    const wrong = routes
      .filter((route) => preHandlersOf(route).includes(requireHeldCard))
      .filter((route) => {
        const handlers = preHandlersOf(route)
        const identity = handlers.indexOf(requireAttendee)
        return identity === -1 || identity > handlers.indexOf(requireHeldCard)
      })
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      wrong,
      'These routes verify a held card without binding identity first, so the holding check has ' +
        'no attendee to check against.',
    ).toEqual([])
  })

  it('the allowlist for query-verified routes stays justified and short (T022)', () => {
    const labels = routes.flatMap((route) =>
      methodsOf(route).map((method) => `${method} ${route.url}`),
    )

    for (const [allowed, reason] of Object.entries(VERIFIES_INSIDE_ITS_QUERY)) {
      expect(labels, `${allowed} is allowlisted but no longer exists`).toContain(allowed)
      // The same demand `deletion-coverage.test.ts` makes of its two allow-lists: an entry
      // without reasoning is an omission with a comment character in front of it.
      expect(
        reason.trim().length,
        `${allowed} is allowlisted with no reason stated. An entry here is a route reading ` +
          "another attendee's profile without the guard, and it needs the reasoning written " +
          'down first.',
      ).toBeGreaterThan(20)
    }

    expect(
      Object.keys(VERIFIES_INSIDE_ITS_QUERY).length,
      'The held-card allowlist is meant to stay empty.',
    ).toBeLessThanOrEqual(1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **Card routes must NOT live under `/events/:eventId`** (data-model.md, research R1).
   *
   * Registering them there would produce one of two bad outcomes: the event audit would demand
   * `requireEventAccess` and fail the build, or somebody would satisfy it by adding a guard that
   * verifies a registration having nothing to do with whether the reader holds the card — a
   * check that looks like authorization and is not.
   *
   * FR-614 is the reason: a held card resolves after the reader switches to an event the sharer
   * is not in, so scoping its route to one conference is wrong even where it happens to pass.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('registers no card route under an event path', () => {
    const misplaced = routes
      .filter((route) => route.url.startsWith('/cards'))
      .filter((route) => /:eventId|\{eventId\}/.test(route.url))
      .map((route) => route.url)

    expect(
      misplaced,
      'A card route is registered under an event path. Cards are cross-event (FR-614, standing ' +
        'decision 7), so an event identifier there is either meaningless or an invitation to ' +
        'authorize with the wrong predicate.',
    ).toEqual([])
  })

  /**
   * **FR-618 — a card cannot be recalled**, checked at the route table.
   *
   * `tests/unit/network-absences.test.ts` asserts the same absence from the schema side. Both
   * exist because the implementation of FR-618 is nothing at all, and nothing at all is what
   * erodes first.
   */
  it('exposes no route that revokes or deletes a shared card (FR-618)', () => {
    const mutating = routes
      .filter((route) => route.url.startsWith('/cards'))
      .filter((route) =>
        methodsOf(route).some((method) => ['PUT', 'PATCH', 'DELETE'].includes(method)),
      )
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      mutating,
      'A card revocation or edit route exists. FR-618 makes a shared card irrevocable — you ' +
        'cannot un-give something somebody already has — and its implementation is the absence ' +
        'of exactly this route.',
    ).toEqual([])
  })
})

/**
 * The runtime half of FR-616, mirroring both older scopes' own runtime assertions.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The event guard's brand was defeated five ways by a security review — `Object.assign` both to
 * forge and to mutate in place, `structuredClone`, `Object.create`, and reconstruction through
 * the prototype's constructor — each compiling clean and passing lint. `CardScope` is the same
 * construction and inherits both the fix and the obligation to keep proving it.
 *
 * `as never` smuggles non-scopes past the compiler on purpose: the point of a runtime check is
 * to catch what the type system has already been shown not to catch.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a card scope must have been issued by the guard', () => {
  const forged = [
    ['a plain object of the right shape', { attendeeId: 'a', sharerId: 's' }],
    ['a frozen object of the right shape', Object.freeze({ attendeeId: 'a', sharerId: 's' })],
    ['an object with a null prototype', Object.assign(Object.create(null), { sharerId: 's' })],
  ] as const

  it.each(forged)('refuses %s', (_label, candidate) => {
    expect(() => assertVerifiedCard(candidate as never)).toThrow()
  })

  it('refuses a structured clone of a real scope', () => {
    const realish = structuredClone({ attendeeId: 'a', sharerId: 's' })
    expect(() => assertVerifiedCard(realish as never)).toThrow()
  })

  it('refuses with 404, disclosing nothing about existence (FR-642)', () => {
    // Identical to the refusal a nonexistent card produces. A 403 here would confirm that two
    // specific people exchanged cards, to somebody holding nothing but an attendee identifier —
    // and attendee identifiers appear in Discover, in URLs, and in browser history.
    try {
      assertVerifiedCard({ attendeeId: 'a', sharerId: 's' } as never)
      throw new Error('should have refused')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('not_found')
      expect((error as { statusCode?: number }).statusCode).toBe(404)
    }
  })
})
