import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T045 (008) — **the requirements whose implementation is nothing at all.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN ABSENCE THAT NOBODY ASSERTED IS AN ABSENCE THE NEXT FEATURE DELETES.**
 *
 * Six of this feature's requirements are satisfied by *not building something*. Every one of
 * them looks, to a later reader, exactly like a gap somebody ran out of time for — and each
 * would be filled in perfectly good faith:
 *
 *   - **FR-623** — no route creates, edits or deletes a meeting slot. Looks like a missing admin
 *     screen; is Principle III.
 *   - **FR-618** — no card revocation. Looks like a missing "remove contact"; is the honest
 *     position that you cannot un-give what somebody already holds.
 *   - **FR-619–FR-622** — no column on `attendees`. Looks like a missing contact-detail field;
 *     is standing decision 16's one-visibility-decision-per-attendee.
 *   - **FR-643** — no notification, from any path in this feature. Looks like an oversight; is
 *     the bounded scope constitution v3.1.0 (decision 21) deliberately drew.
 *   - **FR-610 / v3.2.0 N1** — contacts are never derived from conversations or appointments.
 *     Looks like a missing convenience; is what stops a stranger inserting themselves into
 *     somebody's Network with one message.
 *
 * 007 established this discipline with `no-message-mutation-routes.test.ts` and
 * `no-report-read-surface.test.ts`. This is 008's equivalent, gathered in one file because the
 * absences share one justification: they are all *decisions*.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

/** Every `.ts` file under `src/`, read as text — the same shape as 007's source-level audit. */
const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('008 — the absences that are requirements', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate. Every assertion below is over a filtered list, and
    // an empty route table would satisfy all of them while checking nothing.
    expect(routes.length).toBeGreaterThan(5)
  })

  /**
   * T045 — **no route creates, edits or deletes a meeting slot** (FR-623, Principle III).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * The grid is seeded conference content in exactly the sense sessions, tracks and rooms are,
   * and `event-scope-audit.test.ts` already forbids writes against those four by name. It does
   * **not** know about slots, and 008 deliberately does not edit that 002-owned test to teach it
   * — the assertion belongs to the feature that introduced the table.
   *
   * A write route here would be organizer administration whoever it was shown to, which
   * Principle III places out of product scope. The read route (`GET …/slots`) is the whole of
   * the product's relationship with this table.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('exposes NO write route against the meeting-slot grid (FR-623)', () => {
    const writes = routes
      .filter((route) => /\/slots\b/.test(route.url))
      .filter((route) =>
        methodsOf(route).some((method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
      )
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      writes,
      'A write route against the meeting-slot grid exists. Creating or editing the grid is ' +
        'organizer administration, which Principle III places out of product scope — and seed ' +
        'data must not become a route around that exclusion (FR-623).',
    ).toEqual([])
  })

  it('offers exactly one way to read the grid, and it is a read (FR-623)', () => {
    // The positive half. Without it, deleting `GET …/slots` would make the assertion above pass
    // more emphatically, which is the failure mode every absence test has to defend against.
    const slotRoutes = routes.filter((route) => /\/slots\b/.test(route.url))

    expect(
      slotRoutes.length,
      'No slot route was found at all. The grid must be readable — FR-627 depends on an empty ' +
        'answer being reachable — so its disappearance is a failure, not a stricter pass.',
    ).toBeGreaterThan(0)

    // **Read-only, rather than literally `GET`.** Fastify registers a companion `HEAD` for every
    // `GET` (`exposeHeadRoutes`), so the route table legitimately contains both — and asserting
    // the exact array would fail on a framework default that discloses nothing and writes
    // nothing. What matters is that no method here can change the grid.
    const READ_ONLY = ['GET', 'HEAD']
    for (const route of slotRoutes) {
      expect(
        methodsOf(route).every((method) => READ_ONLY.includes(method)),
        `${methodsOf(route).join('/')} ${route.url} is not a read. The grid is seeded ` +
          'conference content with no write path at any privilege (FR-623).',
      ).toBe(true)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE AVAILABILITY QUERY CANNOT NAME THE INVITEE, BECAUSE IT IS NOT GIVEN ONE** (FR-626,
   * SC-605).
   *
   * `listOfferableSlots` takes exactly one argument — the `EventScope`, which carries the
   * reader's identity and the conference. There is no parameter in which an invitee could be
   * passed, so a query that filtered on invitee state would have to *fetch* them first, which is
   * a line review would see.
   *
   * `appointments-slots.test.ts` proves the behaviour against a real database. This proves the
   * **shape**, and the two are different claims: a behavioural test passes for a query that
   * happens to ignore an argument it was given, and this is what stops the argument existing.
   *
   * The route is the other half: it receives `attendeeId` so the dialog can be titled, and
   * deliberately does not pass it on.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('gives the availability query no way to name the invitee (FR-626, SC-605)', () => {
    const source = readFileSync(join(apiSrc, 'db/queries/appointments.ts'), 'utf8')

    const signature = /export const listOfferableSlots = async \(([^)]*)\)/.exec(source)?.[1] ?? ''

    expect(
      signature,
      'The availability query could not be located, so this test would check nothing.',
    ).not.toBe('')

    expect(
      /invitee|attendeeId|withAttendee|counterpart/i.test(signature),
      'The availability query has acquired a parameter naming the other attendee. Availability ' +
        "may be computed ONLY from the reader's own commitments (FR-626): filtering out times " +
        'the invitee is busy discloses their Agenda by omission, which constitution v3.2.0 (N2) ' +
        'forbids outright. The reader comes from the scope; there is nobody else to name.',
    ).toBe(false)

    // And the route does not smuggle it in either: it reads the query parameter for the title
    // and passes only the scope.
    const route = readFileSync(join(apiSrc, 'routes/events/appointments.ts'), 'utf8')
    expect(/listOfferableSlots\(eventScopeOf\(request\)\)/.test(route)).toBe(true)
  })

  /**
   * T045 — **the seed is the only writer**, checked at the source rather than at the route table.
   *
   * The route audit above catches an HTTP write. This catches the other shape: a query module
   * that inserts or deletes slots on some other trigger — a "top up the grid" convenience, a
   * cleanup path — which would be a write path to conference content with no route to notice it.
   */
  it('writes meeting_slots from the seed and from nowhere else (FR-623)', () => {
    const writers = sourceFiles(apiSrc)
      .filter((path) => !path.endsWith(join('db', 'seed', 'network.ts')))
      .filter((path) => {
        const source = readFileSync(path, 'utf8')
        return (
          /\b(insert|delete|update)\s*\(\s*meetingSlots\s*\)/.test(source) ||
          /(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+meeting_slots\b/i.test(source)
        )
      })
      .map((path) => path.slice(apiSrc.length))

    expect(
      writers,
      'Something outside `db/seed/network.ts` writes to `meeting_slots`. The grid is seeded ' +
        'conference content with no write path at any privilege (FR-623); a second writer is ' +
        'organizer administration arriving without a route to notice it.',
    ).toEqual([])
  })
})
