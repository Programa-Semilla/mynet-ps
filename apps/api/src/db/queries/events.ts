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
