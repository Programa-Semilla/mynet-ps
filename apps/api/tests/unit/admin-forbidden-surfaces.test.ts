import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T015 (011) — **six absences with no other guard** (FR-902, FR-903, FR-954, FR-955, FR-973,
 * FR-999).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EACH OF THESE IS A CAPABILITY SOMEBODY WILL TRY TO ADD IN GOOD FAITH, AND EACH IS FORBIDDEN
 * FOR A DIFFERENT REASON.**
 *
 * This feature builds the first administrative actor in the product's history. The natural next
 * thought — for a reviewer, for 012, for anyone reading `apps/api/src/routes/admin/` — is *"what
 * else should an operator be able to do?"* These six answer that question with reasons, so the
 * answer does not have to be re-derived by whoever asks next:
 *
 *   - **FR-902 — no self-creation route, for either tier.** This is the load-bearing one.
 *     Decision 32 is explicit that neither tier is reachable by self sign-up, and calls it *the
 *     mirror of decision 11*: self sign-up was mandatory for attendees because it was the only
 *     model leaving the attendee sole actor, and it is forbidden here because **anyone who can
 *     sign themselves up as an administrator is not an administrator**. A tier reachable by self
 *     sign-up is a privilege escalation with a form.
 *
 *   - **FR-903 — no attendee-facing payload names an operator.** The attendee product must not
 *     learn that operators exist. This is the API-side counterpart of FR-973's client-side
 *     absence: `apps/web` cannot branch on a tier it is never told about.
 *
 *   - **FR-954 — no avatar moderation route.** Register entry 19 asks *who* moderates an avatar,
 *     *against what standard*, *on whose complaint*, with *what appeal*, and whether a removed
 *     image is replaced or blanked. **None of that is decided**, and v4.0.0 explicitly says the
 *     entry is addressed but NOT closed. Building the action would decide the policy by
 *     inference, which is precisely what opening a register entry is meant to prevent.
 *
 *   - **FR-955 — no attendee suspension, removal or restriction.** An operator may act on
 *     *content* (one question, from one report) and on *authority* (promotion, demotion). Acting
 *     on a *person* is a different power with its own governance, and this feature does not have
 *     it. Note this is also why there is no route to delete somebody's account: decision 12's
 *     erasure right is the attendee's own and is never exercised on their behalf.
 *
 *   - **FR-973 — no profile read or write route for any tier.** Decision 33 states it in one
 *     sentence: **conference content is authorable, a person is not.** 012 will make conference
 *     content editable and must not be read as licence to widen this.
 *
 *   - **FR-999 — no route exposes the audit trail, and none re-discloses content through it.**
 *     The audit exists to record that a disclosure happened. A route returning audit entries
 *     that name reported content would turn the accountability record into a second, unbounded
 *     copy of the thing v4.1.0's third Principle VIII exception carefully bounded.
 *
 * Comments are stripped before matching (009's rule), which matters more here than anywhere:
 * every one of the words below appears in the prose above.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const files = sourceFiles(apiSrc)

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const labelsOf = (route: RouteOptions): string[] =>
  methodsOf(route).map((method) => `${method} ${route.url}`)

const writes = (route: RouteOptions): boolean =>
  methodsOf(route).some((method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))

describe('011 — the administrative capabilities that must not exist', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes and source files to audit', () => {
    expect(routes.length).toBeGreaterThan(5)
    expect(files.length).toBeGreaterThan(30)
  })

  /**
   * **FR-902 — neither tier is reachable by self sign-up.**
   *
   * Matched at the route table, on the shape a self-creation route would have: a write to an
   * address naming operators or organizers that is *not* the promotion route. Promotion is the
   * only way an organizer comes into being, and it is performed **by a platform operator on
   * somebody else** — which is exactly the distinction this assertion has to preserve.
   */
  it('exposes no route by which a principal creates its own administrative identity (FR-902)', () => {
    const creation = routes
      .filter(writes)
      .filter((route) => /\b(operators?|organiz)/i.test(route.url))
      // Promotion and demotion act on ANOTHER attendee, named in the path, by a platform
      // operator. Deactivation likewise names its subject. Neither is self-creation.
      .filter((route) => !/^\/admin\/conferences\/[:{]/.test(route.url))
      .filter((route) => !/^\/admin\/operators\/[:{][^/]+\/deactivation$/.test(route.url))
      .flatMap(labelsOf)

    expect(
      creation,
      'A route creates an administrative identity. Neither tier may be reachable by self ' +
        'sign-up (decision 32, FR-902): a platform operator is SEEDED, and a conference ' +
        'organizer is PROMOTED by a platform operator. Anyone who can sign themselves up as an ' +
        'administrator is not an administrator.',
    ).toEqual([])
  })

  /**
   * **FR-903 — no attendee-facing payload carries an operator.**
   *
   * Scoped to the attendee route modules rather than to all of `src`, because
   * `routes/admin/**` naturally and correctly names operators everywhere.
   */
  it('returns no operator in any attendee-facing route (FR-903)', () => {
    const attendeeRouteFiles = files.filter(
      (path) => path.startsWith(join(apiSrc, 'routes')) && !path.includes(join('routes', 'admin')),
    )

    const leaking = attendeeRouteFiles
      .filter((path) => /\boperators?\b/.test(codeOnly(path)))
      // `mail.operatorAddress` is 007's abuse-report destination and predates this actor
      // entirely — it is an email address in configuration, not a principal.
      .filter((path) => !/operatorAddress/.test(codeOnly(path)))
      .map((path) => path.slice(apiSrc.length))

    expect(
      leaking,
      'An attendee-facing route names an operator. MyNet must never learn that operators exist ' +
        '(FR-903) — that absence is what makes FR-973\'s "no tier-dependent rendering" ' +
        'achievable rather than merely required.',
    ).toEqual([])
  })

  it('exposes no avatar moderation route (FR-954)', () => {
    const moderating = routes
      .filter(writes)
      .filter((route) => /avatar|photo|image/i.test(route.url))
      .filter((route) => /^\/admin(\/|$)/.test(route.url))
      .flatMap(labelsOf)

    expect(
      moderating,
      'An administrative avatar route exists. Register entry 19 — who moderates, against what ' +
        'standard, on whose complaint, with what appeal, and whether a removed image is ' +
        'replaced or blanked — is ADDRESSED BUT NOT CLOSED by v4.0.0. Building the action ' +
        'decides the policy by inference (FR-954).',
    ).toEqual([])
  })

  it('exposes no attendee suspension, removal or restriction route (FR-955)', () => {
    const acting = routes
      .filter((route) => /^\/admin(\/|$)/.test(route.url))
      .filter((route) => /suspend|ban|restrict|disable|deactivate|remove/i.test(route.url))
      // Operator deactivation is an act on an OPERATOR, by a platform operator — the one
      // identity in this product with no erasure right of its own, because it is not an attendee.
      .filter((route) => !/^\/admin\/operators\//.test(route.url))
      .flatMap(labelsOf)

    expect(
      acting,
      'An administrative route acts on an attendee as a person. An operator may act on CONTENT ' +
        '(one reported question) and on AUTHORITY (promotion, demotion). Acting on a person is ' +
        'a different power with its own governance, and this feature does not have it (FR-955).',
    ).toEqual([])
  })

  it('exposes no profile read or write route for any administrative tier (FR-973)', () => {
    const profileRoutes = routes
      .filter((route) => /^\/admin(\/|$)/.test(route.url))
      .filter((route) => /profile|attendees?\/[:{][^/]+$/i.test(route.url))
      .flatMap(labelsOf)

    expect(
      profileRoutes,
      'An administrative route reaches an attendee profile. Decision 33 states it in one ' +
        'sentence: conference content is authorable, a person is not. 012 makes conference ' +
        'content editable and must not be read as licence to widen this (FR-973).',
    ).toEqual([])
  })

  it('exposes no route that reads the audit trail (FR-999)', () => {
    const reading = routes.filter((route) => /audit/i.test(route.url)).flatMap(labelsOf)

    expect(
      reading,
      'A route exposes the audit trail. The audit records THAT a disclosure happened; a route ' +
        'returning entries naming reported content would turn the accountability record into a ' +
        'second, unbounded copy of what v4.1.0 carefully bounded (FR-999).',
    ).toEqual([])
  })

  /**
   * **The audit table stores no content**, which is the other half of FR-999.
   *
   * A route absence protects the trail from being read; this protects it from being worth
   * reading. `admin_audit_entries` holds identifiers and an action — never a message body, never
   * a question body, never a reporter's stated reason.
   */
  it('stores no disclosed content in the audit schema (FR-999)', () => {
    const schema = codeOnly(join(apiSrc, 'db/schema/admin-audit.ts'))
    expect(
      /\b(body|content|text|reason|message)\b\s*:/.test(schema),
      'The audit schema declares a content-bearing column. It records that a disclosure ' +
        'happened, not what was disclosed (FR-999).',
    ).toBe(false)
  })
})
