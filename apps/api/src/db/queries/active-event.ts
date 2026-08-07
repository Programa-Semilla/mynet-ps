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

/** Matched rather than parsed — see the note in `recordActiveEvent`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Declared as a type alias rather than an interface on purpose: `db.execute<T>` constrains `T`
 * to `Record<string, unknown>`, and only a type alias carries the implicit index signature that
 * satisfies it. Changing this to an `interface` breaks the build in a way whose cause is not
 * obvious from the error.
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

/**
 * T055 (002) — records an explicit choice (FR-104).
 *
 * Returns the newly active event, or `null` when the attendee is not registered for it — which
 * the caller turns into a refusal **indistinguishable from a nonexistent event** (FR-148).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The registration check and the write are one statement**, so there is no window between
 * them in which a registration could be removed. `INSERT … SELECT … WHERE EXISTS` inserts only
 * if the registration is there; the composite foreign key would refuse the row anyway, but
 * relying on a constraint violation to express a business outcome means catching an error to
 * decide a 404, and error-shape parsing is how "not registered" and "database is unwell"
 * eventually become the same branch.
 *
 * **Idempotent** (contracts/README.md): selecting the already-active conference succeeds and
 * changes nothing observable. `ON CONFLICT` updates the timestamp so a repeat is a no-op rather
 * than a failure.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const recordActiveEvent = async (
  attendeeId: string,
  eventId: string,
): Promise<EventRow | null> => {
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // A malformed identifier is refused **exactly like** a well-formed one that is not the
  // attendee's. Without this, PostgreSQL's uuid cast raises on `not-a-uuid`, the handler
  // returns 500, and "malformed" becomes distinguishable from "not registered" — a smaller
  // leak than existence, but still a difference an attacker can read (FR-148).
  // ─────────────────────────────────────────────────────────────────────────────────────────
  if (!UUID.test(eventId)) return null

  const db = getDb()

  const inserted = await db.execute<{ attendeeId: string }>(sql`
    INSERT INTO active_event_selections (attendee_id, event_id, updated_at)
    SELECT ${attendeeId}, ${eventId}, now()
    WHERE EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.attendee_id = ${attendeeId} AND r.event_id = ${eventId}
    )
    ON CONFLICT (attendee_id) DO UPDATE
      SET event_id = EXCLUDED.event_id, updated_at = now()
    RETURNING attendee_id AS "attendeeId"
  `)

  // No row inserted means no registration — which is also what a nonexistent event produces.
  // The two are the same answer here, deliberately, so the route cannot tell them apart either.
  if (inserted.length === 0) return null

  const rows = await db.execute<EventRow>(sql`
    SELECT
      e.id,
      e.name,
      e.location,
      e.starts_on AS "startsOn",
      e.ends_on   AS "endsOn",
      e.timezone
    FROM events e
    WHERE e.id = ${eventId}
  `)

  return rows[0] ?? null
}
