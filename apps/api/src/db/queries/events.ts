import { asc, eq } from 'drizzle-orm'

import { getDb } from '../client.js'
import { events, registrations } from '../schema/events.js'

/**
 * T056 — event queries, respecting the scoping rule in data-model.md.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `events` is reachable **only** through the authenticated attendee's `registrations`. There
 * is no "list all events" query in this slice, and adding one would create a read path that
 * is not identity-scoped — precisely what FR-035 forbids.
 *
 * The `attendeeId` parameter here comes from `request.attendee.id`, which the auth-context
 * plugin sets from the sign-in session cookie. It is never a value the client supplied: no
 * route accepts one, so there is no path by which a caller-controlled id could arrive here.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T044 (012) — THE ANSWER IS A COMPLETE ENUMERATION, AND CLIENT-SIDE ERASURE DEPENDS ON
 * IT** (FR-1141, research R4).
 *
 * `erasingWithdrawnConferences` (apps/web/src/app/services.ts) erases every cached conference
 * absent from this answer, treating absence as withdrawal. A `.limit(N)` here, or a
 * "hasn't ended yet" predicate in the `where`, would make absence mean something else — and
 * the erasure would destroy attendees' offline copies of conferences they are still
 * registered for, private notes included. This paragraph is not the guard (013's
 * false-header lesson: a header claiming a property nobody enforces is a claim, not a
 * record). The guards are `apps/api/tests/unit/registered-events-complete.test.ts`, which
 * pins the route schema against a querystring or a pagination shape, and
 * `apps/api/tests/integration/registered-events-complete.test.ts`, which proves a conference
 * whose dates have ended is still listed — the one break no static check reaches. If either
 * fails, the client changes first.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const listRegisteredEvents = async (
  attendeeId: string,
): Promise<
  Array<{
    id: string
    name: string
    location: string
    startsOn: string
    endsOn: string
    timezone: string
  }>
> =>
  getDb()
    .select({
      id: events.id,
      name: events.name,
      location: events.location,
      startsOn: events.startsOn,
      endsOn: events.endsOn,
      // T011 (002) — the venue's zone travels with every event, because day context is
      // computed against the venue's clock and not the device's (FR-120). Selecting it here
      // rather than only on the active-event endpoint keeps one `Event` shape across the
      // product; the compile-time contract binding in `packages/data/src/contract.ts` will not
      // accept two.
      timezone: events.timezone,
    })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.attendeeId, attendeeId))
    // Chronological. The workspace is built around "what is happening next" (constitution
    // Principle III), so an arbitrary order would be actively unhelpful.
    .orderBy(asc(events.startsOn), asc(events.name))
