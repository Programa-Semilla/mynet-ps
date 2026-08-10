import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { requireAttendee } from '../../src/plugins/auth-context.js'
import {
  assertVerifiedParticipation,
  requireParticipation,
} from '../../src/plugins/participation.js'

/**
 * T015 (007) — the participation route audit (FR-523, FR-524, research R9).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE `event-scope-audit.test.ts` SILENTLY PASSES THESE ROUTES.**
 *
 * That is the whole justification, and it is worth being precise about, because "we already
 * have a route audit" is the obvious objection to a second one.
 *
 * The event audit matches a route by `:eventId` in the URL or an event-naming property in its
 * schema. **Conversation routes name no event** — correctly, since FR-507 makes conversations
 * cross-event and permanent — so they match nothing it looks for. They are not *failed* by it;
 * they are never *examined* by it, and it reports success either way.
 *
 * So a future feature adding `/conversations/:conversationId/anything` with no guard at all
 * would fail no test, pass review as "consistent with the existing audit", and expose one
 * attendee's private correspondence to anyone who can guess a uuid.
 *
 * The event audit's own header says why it was written: *"seven features after this one will
 * add exactly that shape of route, and each of them will be written by someone who has not read
 * this file."* The same sentence applies here, and 008's appointments — which are also
 * cross-event and also two-party — are the first that will inherit it.
 *
 * **Widening the event audit was considered and rejected** (research R9): it would conflate two
 * different predicates in one test and make the failure message name the wrong requirement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Any parameterised route beneath `/conversations`, **whatever its parameter is called.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS USED TO MATCH ONE SPELLING, AND A GATE KEYED ON A NAME IS DEFEATED BY CHOOSING ANOTHER.**
 *
 * It read `/:conversationId\b|\{conversationId\}/`. A route registered as
 * `GET /conversations/:id/messages` names a conversation, reads correspondence, and matched
 * neither this nor the schema-property branch below — so it was never examined, and an unguarded
 * route passed the audit reporting success.
 *
 * `:id` is at least as natural a parameter name as `:conversationId`, and a new author has no
 * reason to prefer one. That is the same failure this whole file exists to correct one level up:
 * `event-scope-audit` *silently passes* a route naming no conference, which is why the spec calls
 * this audit its replacement — and 008's appointments are declared to inherit it.
 *
 * Matching on **path shape** rather than parameter name removes the naming dependency entirely.
 * The old pattern is kept as a second alternative so a conversation identifier appearing in some
 * other route's URL is still caught.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const CONVERSATION_PARAM = /^\/conversations\/[:{]|:conversationId\b|\{conversationId\}/

/**
 * A conversation or message identifier is not always in the URL — the same lesson the event
 * audit had to learn about `PUT /workspace/active-event`, recorded there in full. A route
 * taking one in a body or query string is just as much a read of somebody's correspondence.
 */
const CONVERSATION_ID_KEY = /^(conversation|thread|message)_?id$/i

/** Searches a JSON-schema fragment for any property naming a conversation, at any depth. */
const mentionsConversationId = (node: unknown): boolean => {
  if (typeof node !== 'object' || node === null) return false
  return Object.entries(node as Record<string, unknown>).some(
    ([key, value]) => CONVERSATION_ID_KEY.test(key) || mentionsConversationId(value),
  )
}

/**
 * Routes that name a conversation but establish participation inside their own query rather
 * than through the guard. **Each entry must name why**, and the list must stay this short.
 *
 * Empty on purpose, and it should stay that way. Unlike the event audit's one entry — where
 * folding the check into an `INSERT … WHERE EXISTS` genuinely removed a redundant query — there
 * is no conversation route that benefits from doing this by hand.
 */
const VERIFIES_INSIDE_ITS_QUERY = new Set<string>([])

/**
 * The matcher itself, asserted against synthetic routes.
 *
 * A predicate that silently stopped matching is exactly how this gate failed before, so the
 * shapes it must catch are written down rather than assumed.
 */
export const MATCHER_CASES: readonly { url: string; matches: boolean }[] = [
  { url: '/conversations/:conversationId/messages', matches: true },
  // The evasion this pattern was widened to close.
  { url: '/conversations/:id/messages', matches: true },
  { url: '/conversations/:cid/read', matches: true },
  { url: '/conversations/{conversationId}/messages', matches: true },
  { url: '/conversations/:id/attachments', matches: true },
  // Not parameterised: the collection routes are guarded by identity alone, correctly.
  { url: '/conversations', matches: false },
  { url: '/conversations/unread', matches: false },
  { url: '/blocks', matches: false },
]

const acceptsConversationIdentifier = (route: RouteOptions): boolean =>
  CONVERSATION_PARAM.test(route.url) ||
  (['body', 'querystring', 'params'] as const).some((part) =>
    mentionsConversationId((route.schema as Record<string, unknown> | undefined)?.[part]),
  )

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const preHandlersOf = (route: RouteOptions): unknown[] => {
  const declared = route.preHandler
  if (!declared) return []
  return Array.isArray(declared) ? declared : [declared]
}

describe('participation route audit', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    // The real application, with every plugin and every route the server registers.
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate. If the observer ever stopped receiving routes,
    // every assertion below would pass vacuously. This is what notices.
    expect(routes.length).toBeGreaterThan(5)
  })

  it.each(MATCHER_CASES)(
    'recognises $url as naming a conversation: $matches',
    ({ url, matches }) => {
      // **The matcher is asserted, not assumed.** It previously keyed on the single parameter
      // name `:conversationId`, so `/conversations/:id/messages` was never examined at all and an
      // unguarded route passed this audit while it reported success. A predicate that can quietly
      // stop matching is not a control, so the shapes it must catch are written down.
      expect(acceptsConversationIdentifier({ url, method: 'GET' } as RouteOptions)).toBe(matches)
    },
  )

  it('includes the conversation routes this feature added', () => {
    const scoped = routes.filter((route) => CONVERSATION_PARAM.test(route.url))
    expect(
      scoped.length,
      'No conversation-scoped routes were found. Either they were removed, or the audit has ' +
        'stopped recognising the parameter shape — both need a human, not a green tick.',
    ).toBeGreaterThan(0)
  })

  it('every route accepting a conversation identifier carries the participation guard', () => {
    const unguarded = routes
      .filter(acceptsConversationIdentifier)
      .filter((route) => !preHandlersOf(route).includes(requireParticipation))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)
      .filter((label) => !VERIFIES_INSIDE_ITS_QUERY.has(label))

    expect(
      unguarded,
      'These routes name a conversation but do not verify that the caller participates in it ' +
        "(FR-523). Add `app.requireParticipation` to the route's preHandler list. Participation " +
        'is the only authorization predicate in this feature — not event scope, which cannot ' +
        'apply to a cross-event conversation, and not discoverability.',
    ).toEqual([])
  })

  it('every participation-scoped route binds identity FIRST, by reference not by count', () => {
    // `requireParticipation` looks for a participation row belonging to `request.attendee`, so a
    // route carrying it without `requireAttendee` — or after it — verifies against nobody.
    //
    // Compared by function reference rather than by count, because `[unrelatedHook,
    // requireParticipation]` satisfies a length check while proving nothing. That lesson was
    // learned in the event audit and is not re-learned here.
    const wrong = routes
      .filter((route) => preHandlersOf(route).includes(requireParticipation))
      .filter((route) => {
        const handlers = preHandlersOf(route)
        const identity = handlers.indexOf(requireAttendee)
        return identity === -1 || identity > handlers.indexOf(requireParticipation)
      })
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      wrong,
      'These routes verify participation without binding identity first, so the participation ' +
        'check has no attendee to check against.',
    ).toEqual([])
  })

  it('the allowlist for query-verified routes stays justified and short', () => {
    const labels = routes.flatMap((route) =>
      methodsOf(route).map((method) => `${method} ${route.url}`),
    )
    for (const allowed of VERIFIES_INSIDE_ITS_QUERY) {
      expect(labels, `${allowed} is allowlisted but no longer exists`).toContain(allowed)
    }
    expect(
      VERIFIES_INSIDE_ITS_QUERY.size,
      'The participation allowlist is meant to stay empty. An entry here is a route reading ' +
        'correspondence without the guard, and it needs the reasoning written down first.',
    ).toBeLessThanOrEqual(1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **Conversation routes must NOT live under `/events/:eventId`** (plan, Structure Decision 1).
   *
   * Registering them there would produce one of two bad outcomes: the event audit would demand
   * `requireEventAccess` and fail the build, or somebody would satisfy it by adding a guard that
   * verifies a registration having nothing to do with who may read the conversation — a check
   * that looks like authorization and is not.
   *
   * FR-507 is the reason: a conversation persists across every event, so scoping its route to
   * one is wrong even where it happens to pass.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('registers no conversation route under an event path', () => {
    const misplaced = routes
      .filter((route) => CONVERSATION_PARAM.test(route.url))
      .filter((route) => /:eventId|\{eventId\}/.test(route.url))
      .map((route) => route.url)

    expect(
      misplaced,
      'A conversation route is registered under an event path. Conversations are cross-event ' +
        '(FR-507), so an event identifier there is either meaningless or an invitation to ' +
        'authorize with the wrong predicate.',
    ).toEqual([])
  })

  /**
   * **FR-516 — a message cannot be edited or deleted once sent**, checked at the route table.
   *
   * T050a asserts the same absence from the other direction. Both exist because the
   * implementation of FR-516 is nothing at all, and nothing at all is what erodes first.
   */
  it('exposes no route that mutates an individual message (FR-516)', () => {
    const mutating = routes
      .filter((route) => /\/messages\/:messageId|\/messages\/\{messageId\}/.test(route.url))
      .filter((route) =>
        methodsOf(route).some((method) => ['PUT', 'PATCH', 'DELETE'].includes(method)),
      )
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      mutating,
      'A message edit or delete route exists. FR-516 makes a sent message immutable, and its ' +
        'implementation is the absence of exactly this route.',
    ).toEqual([])
  })
})

/**
 * The runtime half of FR-523, mirroring the event scope's own runtime assertions.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The event guard's brand was defeated five ways by a security review — `Object.assign` both to
 * forge and to mutate in place, `structuredClone`, `Object.create`, and reconstruction through
 * the prototype's constructor — each compiling clean and passing lint. `ConversationScope` is
 * the same construction and inherits both the fix and the obligation to keep proving it.
 *
 * `as never` smuggles non-scopes past the compiler on purpose: the point of a runtime check is
 * to catch what the type system has already been shown not to catch.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a conversation scope must have been issued by the guard', () => {
  const forged = [
    ['a plain object of the right shape', { attendeeId: 'a', conversationId: 'c' }],
    ['a frozen object of the right shape', Object.freeze({ attendeeId: 'a', conversationId: 'c' })],
    [
      'an object with a null prototype',
      Object.assign(Object.create(null), { conversationId: 'c' }),
    ],
  ] as const

  it.each(forged)('refuses %s', (_label, candidate) => {
    expect(() => assertVerifiedParticipation(candidate as never)).toThrow()
  })

  it('refuses a structured clone of a real scope', () => {
    const realish = structuredClone({ attendeeId: 'a', conversationId: 'c' })
    expect(() => assertVerifiedParticipation(realish as never)).toThrow()
  })

  it('refuses with 404, disclosing nothing about existence (FR-524)', () => {
    // Identical to the refusal a nonexistent conversation produces. A 403 here would confirm
    // that a conversation between two specific people exists, which is the metadata this
    // destination exists to keep private — a stronger stake than the event guard's.
    try {
      assertVerifiedParticipation({ attendeeId: 'a', conversationId: 'c' } as never)
      throw new Error('should have refused')
    } catch (error) {
      expect((error as { code?: string }).code).toBe('not_found')
      expect((error as { statusCode?: number }).statusCode).toBe(404)
    }
  })
})
