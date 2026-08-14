import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T093 (014) — **no route suspends, removes or restricts an attendee** (FR-1041).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **AN OPERATOR ACTS ON CONTENT AND ON AUTHORITY. ACTING ON A PERSON IS A DIFFERENT POWER AND
 * THIS PRODUCT DOES NOT HAVE IT.**
 *
 * 013 asserted this as FR-955 the day the actor was created. 014 is the first feature to widen
 * what an administrator can *do*, and it widens it into the part of the product attendees are
 * attached to — sessions they saved, questions they asked, notes they wrote. That is exactly the
 * context in which "and remove the attendee who keeps doing this" starts to sound like the
 * missing piece, so the absence is re-proved here rather than inherited.
 *
 * Two boundaries, and they are different rules that happen to look alike:
 *
 *   - **No moderation of a person.** An operator may remove one reported question (013, bounded
 *     by the report queue) and may promote or demote an organizer. Suspending, banning, muting or
 *     restricting an attendee is a power with its own governance — who decides, on what standard,
 *     with what appeal — and none of that is decided. Register entry 19 is the live example of
 *     what happens when a capability is built before the policy exists.
 *   - **No deletion on somebody's behalf.** Decision 12 makes erasure the attendee's **own**
 *     right, exercised by them, and v4.1.0 restates that deletion is *never conditional*. An
 *     administrative delete-account route would invert that: the same button, pressed by
 *     somebody else, is removal rather than erasure.
 *
 * **014 has a specific temptation the earlier features did not**: cancellation preserves
 * everybody's engagement (FR-1021), so an organizer facing content they object to cannot remove
 * it by cancelling the session. The gap is real and is answered by the report queue, which
 * already exists — not by a new power over the person.
 *
 * Comments are stripped before matching, as 009's guards do — every verb below appears in the
 * prose above.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const label = (path: string): string => path.slice(apiSrc.length)

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const labelsOf = (route: RouteOptions): string[] =>
  methodsOf(route).map((method) => `${method} ${route.url}`)

describe('014 — an operator acts on content, never on a person (FR-1041)', () => {
  let admin: RouteOptions[]

  beforeAll(async () => {
    const routes: RouteOptions[] = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
    admin = routes.filter((route) => /^\/admin(\/|$)/.test(route.url))
  })

  it('found administrative routes to audit', () => {
    expect(admin.length).toBeGreaterThan(5)
  })

  it('registers no route that suspends, bans, mutes or restricts an attendee (FR-1041)', () => {
    const acting = admin
      .filter((route) => /suspend|ban\b|mute|restrict|disable|block|silence/i.test(route.url))
      .flatMap(labelsOf)

    expect(
      acting,
      'An administrative route acts on an attendee as a person. That power has its own ' +
        'governance — who decides, on what standard, with what appeal — and none of it is ' +
        'decided (FR-1041). Register entry 19 is what building a capability before the policy ' +
        'looks like.',
    ).toEqual([])
  })

  it('registers no route that deletes or deactivates an attendee account (FR-1041, decision 12)', () => {
    const removing = admin
      .filter((route) => methodsOf(route).some((method) => ['DELETE', 'POST'].includes(method)))
      .filter((route) => /attendees?/i.test(route.url))
      .filter((route) => /delete|remove|deactivat|close/i.test(route.url))
      .flatMap(labelsOf)

    expect(
      removing,
      'An administrative route removes an attendee. Erasure is the attendee’s OWN right ' +
        '(decision 12) and is never conditional (v4.1.0) — the same act performed by somebody ' +
        'else is removal, not erasure.',
    ).toEqual([])
  })

  /**
   * **The only administrative writes touching an attendee are the two that act on AUTHORITY**,
   * stated positively.
   *
   * Enumerating what is permitted is what stops the negative patterns above being satisfied by a
   * route with an innocuous name. Promotion and demotion change what somebody may *do*; neither
   * changes what they *are* or whether they may use MyNet at all.
   */
  it('touches an attendee only through promotion and demotion (FR-1041)', () => {
    const touching = admin
      .filter((route) => methodsOf(route).some((method) => method !== 'GET'))
      .filter((route) => /attendee|organizers?/i.test(route.url))
      .flatMap(labelsOf)
      .sort()

    expect(
      touching,
      'An administrative write reaches an attendee outside promotion and demotion. Those two ' +
        'act on AUTHORITY — what somebody may do — and 013 built nothing that acts on the ' +
        'person. 014 adds authoring, which acts on content (FR-1041).',
    ).toEqual([
      'DELETE /admin/conferences/:eventId/organizers/:attendeeId',
      'POST /admin/conferences/:eventId/organizers',
    ])
  })

  it('writes no attendee row from the authoring surface (FR-1041)', () => {
    // The layer below: an update to `attendees` from an authoring module would restrict somebody
    // without any route being named for it.
    const authoring = [
      join(apiSrc, 'routes', 'admin', 'catalog.ts'),
      join(apiSrc, 'db', 'queries', 'admin-catalog.ts'),
    ]

    const writing = authoring
      .filter((path) => {
        const code = codeOnly(path)
        return /\.update\(\s*attendees\s*\)|\.delete\(\s*attendees\s*\)/.test(code)
      })
      .map(label)

    expect(
      writing,
      'The authoring surface writes to an attendee row. An organizer authors CONTENT; the people ' +
        'attached to it are not theirs to change (FR-1041, decision 33).',
    ).toEqual([])
  })

  /**
   * **Cancellation is the answer to the temptation**, asserted so the reasoning stays attached.
   *
   * FR-1021 preserves everybody's engagement through a cancellation, which means an organizer
   * cannot use the authoring tools to remove content they object to. That is deliberate, and the
   * available answer is the report queue rather than a power over the person.
   */
  it('preserves engagement through cancellation, leaving the report queue as the answer (FR-1021)', () => {
    const catalog = codeOnly(join(apiSrc, 'db', 'queries', 'admin-catalog.ts'))
    const cancel = /export const cancelSession[\s\S]{0,1500}?\n\}/.exec(catalog)?.[0] ?? ''

    expect(cancel, 'cancelSession could not be located').not.toBe('')
    expect(
      /\.delete\(|DELETE\s+FROM/i.test(cancel),
      'Cancellation deletes something. It must preserve every saved session, note, question and ' +
        'vote (FR-1021) — which is exactly what stops an organizer using the authoring tools to ' +
        'remove content they object to, and leaves the report queue as the answer.',
    ).toBe(false)
  })
})
