import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T042 (012) — **`GET /events` must answer with a COMPLETE enumeration, asserted over the
 * declared route schema** (FR-1141, research R4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY COMPLETENESS IS LOAD-BEARING, AND WHY THE CLIENT CHANGES FIRST.**
 *
 * `erasingWithdrawnConferences` (apps/web/src/app/services.ts) treats this route's answer as
 * the full list of conferences the attendee is registered for, and **erases every cached
 * conference absent from it** — programme, saved sessions, private notes, appointments, the
 * whole per-conference prefix. That is the mechanism decision 54 licensed for purging a
 * withdrawn registration from a device, and it is only safe while absence means withdrawal.
 * The moment this route can answer with *less than everything* — a page, a limit, a filter —
 * absence starts meaning "not on this page", and the erasure destroys working offline copies
 * of conferences the attendee is still registered for.
 *
 * So a failure here is not an instruction to loosen this file. It is an instruction to change
 * the client first: remove or rework the erasure at the composition root, then let the route's
 * shape move. Research R4 names the four ways this breaks; this file covers the two a schema
 * can express (a querystring, and a pagination-shaped response), the compile-time bindings in
 * `packages/data/src/contract.ts` cover the envelope, and
 * `apps/api/tests/integration/registered-events-complete.test.ts` covers the one nothing
 * static can reach — a date predicate quietly dropping conferences that have ended.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Anything that would name a page, a bound, or a cursor, however spelled. Extend deliberately —
 * to catch a new spelling — never to let a match through.
 */
const PAGINATION_PROPERTY =
  /^(limit|offset|cursor|next_?cursor|total(_?count)?|count|page|page_?size|per_?page|has_?(more|next))$/i

/** Every property name declared anywhere in a schema fragment, at any depth. */
const propertyNamesOf = (node: unknown, found: string[] = []): string[] => {
  if (typeof node !== 'object' || node === null) return found
  const record = node as Record<string, unknown>

  const properties = record['properties']
  if (typeof properties === 'object' && properties !== null) {
    found.push(...Object.keys(properties))
  }

  for (const value of Object.values(record)) {
    propertyNamesOf(value, found)
  }
  return found
}

describe('GET /events declares a complete enumeration (FR-1141)', () => {
  let route: RouteOptions | undefined

  beforeAll(async () => {
    const routes: RouteOptions[] = []
    const app = await buildApp({ onRoute: (observed) => routes.push(observed) })
    await app.close()
    route = routes.find(
      (candidate) =>
        candidate.url === '/events' &&
        (Array.isArray(candidate.method)
          ? candidate.method.includes('GET')
          : candidate.method === 'GET'),
    )
  })

  it('found the route to audit', () => {
    // A gate that cannot fail is not a gate. If the route moves and this stops finding it,
    // every assertion below passes vacuously — that needs a human, not a green tick.
    expect(
      route,
      'GET /events was not found in the route table. Either it was removed or renamed — and ' +
        'if renamed, `erasingWithdrawnConferences` in apps/web/src/app/services.ts still ' +
        'consumes it as the complete list of registrations, so this audit must follow it.',
    ).toBeDefined()
  })

  it('declares no querystring', () => {
    expect(
      route?.schema?.querystring,
      'GET /events gained a querystring. `erasingWithdrawnConferences` ' +
        '(apps/web/src/app/services.ts) consumes this route as a COMPLETE enumeration of the ' +
        "attendee's registrations and erases every cached conference absent from the answer — " +
        'so any parameter that can narrow the answer (a limit, an offset, a filter) turns that ' +
        'erasure into deletion of conferences the attendee is still registered for, including ' +
        'their private notes. The client changes FIRST: rework the erasure at the composition ' +
        'root, then give this route parameters. Do not weaken this test to ship a query.',
    ).toBeUndefined()
  })

  it('declares no pagination-shaped property anywhere in its schema', () => {
    const declared = propertyNamesOf(route?.schema)
    const paginationShaped = declared.filter((name) => PAGINATION_PROPERTY.test(name))
    expect(
      paginationShaped,
      'The GET /events schema declares a pagination-shaped property. ' +
        '`erasingWithdrawnConferences` (apps/web/src/app/services.ts) erases every cached ' +
        'conference absent from this response, which is only safe while the response is the ' +
        "WHOLE of the attendee's registrations — a page marker means the answer can be less " +
        'than everything, and the erasure then destroys offline copies of conferences that ' +
        'were merely on the next page. Change the client before the route: rework the erasure, ' +
        'then paginate. (The compile-time binding `_EventsMatchContract` in ' +
        'packages/data/src/contract.ts fails on an envelope for the same reason.)',
    ).toEqual([])
  })
})
