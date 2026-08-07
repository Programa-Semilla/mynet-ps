import { sql } from 'drizzle-orm'

import { getDb } from '../client.js'

/**
 * T019 (002) — resolving the attendee's active conference (FR-100–FR-104, research D4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE QUERY, ON ONE CLOCK, AND THAT IS THE DESIGN DECISION.**
 *
 * The derivation asks "which registered conference is happening at the venue *now*", and every
 * part of that question — the tier test and the ordering — is answered against the database's
 * own `now()`. Fetching the rows and deciding in TypeScript would work, and would reintroduce
 * the failure the inbox records from 001 as `throttle-clock-provenance`: the API process's
 * clock and the database's `now()` were mixed in the sign-in throttle, and nothing in the code
 * established that the two were comparable. Two clocks that are usually within a second of each
 * other are indistinguishable from one clock, right up until they are not.
 *
 * It also keeps work that scales with registration count out of the API process.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Declared as a type alias rather than an interface on purpose: `db.execute<T>` constrains `T`
 * to `Record<string, unknown>`, and only a type alias carries the implicit index signature that
 * satisfies it.
 */
export type EventRow = {
  readonly id: string
  readonly name: string
  readonly location: string
  readonly startsOn: string
  readonly endsOn: string
  readonly timezone: string
}

/**
 * The attendee's active conference: their recorded choice if they have one, otherwise derived
 * (FR-102).
 *
 * `null` means **registered for no conferences** (FR-105) — a valid answer, not a failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Scoped by joining from `registrations`, never from `events`.** The attendee's own
 * registrations are the entire universe this query can see, so there is no ordering of the
 * rest of the table that could surface somebody else's conference. `attendeeId` comes from
 * `request.attendee.id`, which the auth-context plugin set from the session cookie; no route
 * accepts one.
 *
 * **A recorded choice wins outright, and is never re-derived** (FR-104). An attendee who chose
 * a conference that has since ended stays there indefinitely. That is the decision brainstorm
 * #02 took, and the rejected alternative — falling back to derivation once the chosen
 * conference ends — is exactly what the `chosen` sort key below would silently implement if it
 * were dropped. T052 asserts it, because nothing else would catch its removal.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The tiers** (FR-102), each evaluated against the *venue's* date, not the server's:
 *   0. in progress — today falls within `[starts_on, ends_on]` inclusive
 *   1. upcoming    — starts after today; the **soonest to start** wins
 *   2. past        — ended before today; the **most recently ended** wins
 *
 * **The total order** (FR-103) is completed by `starts_on`, `ends_on`, then `id`. `id` is a
 * generated UUID — stable, unique, and unchanging for the life of the event — so the order
 * depends on nothing that can change without the event changing, and never on insertion order.
 * Without that last key two conferences with identical dates could resolve differently on two
 * reads, and an attendee with two devices would see them disagree.
 */
export const resolveActiveEvent = async (attendeeId: string): Promise<EventRow | null> => {
  const rows = await getDb().execute<EventRow>(sql`
    SELECT
      e.id,
      e.name,
      e.location,
      e.starts_on AS "startsOn",
      e.ends_on   AS "endsOn",
      e.timezone
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN active_event_selections s
      ON s.attendee_id = r.attendee_id AND s.event_id = r.event_id
    WHERE r.attendee_id = ${attendeeId}
    ORDER BY
      -- An explicit choice outranks every derived candidate (FR-104).
      (s.attendee_id IS NOT NULL) DESC,

      -- Tier. The venue's clock decides, which is what makes the answer the same for an
      -- attendee reading from Lima as for one standing in the venue (FR-120).
      CASE
        WHEN (now() AT TIME ZONE e.timezone)::date BETWEEN e.starts_on AND e.ends_on THEN 0
        WHEN e.starts_on > (now() AT TIME ZONE e.timezone)::date THEN 1
        ELSE 2
      END ASC,

      -- Within the past tier only, "most recently ended" is the requirement, so this one key
      -- runs backwards. It is NULL — and therefore inert — in the other two tiers, where the
      -- ascending keys below already express "soonest to start".
      CASE
        WHEN e.ends_on < (now() AT TIME ZONE e.timezone)::date THEN e.ends_on
      END DESC NULLS LAST,

      e.starts_on ASC,
      e.ends_on ASC,
      e.id ASC
    LIMIT 1
  `)

  return rows[0] ?? null
}
