import { sql } from 'drizzle-orm'

import { events, registrations } from '../schema/events.js'
import type { SeedContext, SeedModule } from './index.js'

/**
 * T027 (001), split out by T003 (002) — the seeded conferences and who is registered for them.
 *
 * Registrations live here rather than in `attendees.ts` because they are declared with `events`
 * in `schema/events.ts`, and the seed modules mirror the schema modules. They are also the
 * whole access-control story: an event is reachable only through the requesting attendee's
 * registrations.
 *
 * **Ada and Grace share one event.** That overlap is deliberate — it proves the isolation
 * boundary is the *registration*, not the event: an attendee sees a shared conference because
 * they are registered for it, not because event visibility is global.
 *
 * This never runs against an environment holding real attendee data. Local development and
 * per-PR preview branches only (data-model.md, Seed data).
 */

/**
 * T010 (002) — each venue's real IANA zone, which is what back-fills `events.timezone` after
 * the migration drops its temporary `'UTC'` default (research D11).
 *
 * **Three different zones, deliberately, and none of them UTC.** They are what makes the day
 * number falsifiable: `Europe/Lisbon` is an hour behind the other two for most of the year, so
 * a device-local computation — the bug FR-120 exists to prevent — produces a visibly wrong
 * answer on a real fixture rather than only in a contrived test.
 */
export const SEED_EVENTS = [
  {
    name: 'Product & Design Summit',
    location: 'Barcelona, Spain',
    startsOn: '2026-09-14',
    endsOn: '2026-09-17',
    timezone: 'Europe/Madrid',
  },
  {
    name: 'Frontend Horizons',
    location: 'Lisbon, Portugal',
    startsOn: '2026-10-05',
    endsOn: '2026-10-07',
    timezone: 'Europe/Lisbon',
  },
  {
    name: 'Systems & Scale',
    location: 'Berlin, Germany',
    startsOn: '2026-11-11',
    endsOn: '2026-11-13',
    timezone: 'Europe/Berlin',
  },
] as const

/**
 * Who attends what, by the names above and the emails in `attendees.ts`.
 *
 * Written as names rather than array positions so that adding an event does not silently
 * re-point somebody's registration at a different conference.
 */
const SEED_REGISTRATIONS: readonly { attendee: string; event: string }[] = [
  // Ada: the shared event plus one of her own.
  { attendee: 'ada@example.com', event: 'Product & Design Summit' },
  { attendee: 'ada@example.com', event: 'Frontend Horizons' },
  // Grace: the shared event plus a different one. The difference is what the isolation tests
  // assert on.
  { attendee: 'grace@example.com', event: 'Product & Design Summit' },
  { attendee: 'grace@example.com', event: 'Systems & Scale' },
]

/**
 * Timezone validity is enforced **here, at the seed boundary** (data-model.md), and not by a
 * table constraint: PostgreSQL's `pg_timezone_names` is not usable inside a `CHECK`, and a
 * wrong-but-valid zone would satisfy such a constraint anyway.
 *
 * This catches the typo — `Europe/Madird` — which would otherwise reach the client as a zone
 * `Intl.DateTimeFormat` rejects, turning a seed slip into a runtime failure on Home for every
 * attendee at that conference.
 */
const assertKnownTimeZone = (timezone: string, eventName: string): void => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  } catch {
    throw new Error(
      `Seed: "${eventName}" declares timezone "${timezone}", which this runtime does not recognise. ` +
        'It must be an IANA zone such as "Europe/Madrid" (data-model.md, events.timezone).',
    )
  }
}

export const eventSeed: SeedModule = {
  name: 'events',

  async clear(db) {
    // Registrations first: they reference both events and attendees.
    await db.delete(registrations)
    await db.delete(events)
  },

  async run(db, context: SeedContext) {
    for (const event of SEED_EVENTS) {
      assertKnownTimeZone(event.timezone, event.name)
    }

    // ─────────────────────────────────────────────────────────────────────────────────────
    // …and against **PostgreSQL's** zone database, which is the one that actually consumes it.
    //
    // The ICU check above is Node's. The two sets are not identical, and a zone ICU accepts but
    // PostgreSQL does not would raise inside the `now() AT TIME ZONE e.timezone` expression in
    // `resolveActiveEvent` — which sits in the ORDER BY and is evaluated for every registration
    // the attendee holds. `GET /workspace/active-event` would then return 500 for every
    // attendee registered alongside the bad conference, and since the active event gates every
    // conference-scoped surface, the whole product would degrade to failure banners. Silent at
    // seed time, total at read time.
    // ─────────────────────────────────────────────────────────────────────────────────────
    for (const event of SEED_EVENTS) {
      // One row per conference rather than an `= ANY(…)`: drizzle expands a JS array into a
      // parameter tuple, which `ANY` rejects, and there are three conferences.
      const rows = await db.execute<{ known: boolean }>(
        sql`SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${event.timezone}) AS known`,
      )
      if (!rows[0]?.known) {
        throw new Error(
          `Seed: "${event.name}" declares timezone "${event.timezone}", which PostgreSQL does ` +
            'not recognise. Node accepted it, but the database is what evaluates it at read time.',
        )
      }
    }

    const inserted = await db
      .insert(events)
      .values([...SEED_EVENTS])
      .returning()

    for (const event of inserted) {
      context.eventIds.set(event.name, event.id)
      context.eventDates.set(event.name, {
        startsOn: event.startsOn,
        timezone: event.timezone,
      })
    }

    await db.insert(registrations).values(
      SEED_REGISTRATIONS.map(({ attendee, event }) => {
        const attendeeId = context.attendeeIds.get(attendee)
        const eventId = context.eventIds.get(event)

        // A typo in either name above would otherwise insert nothing and leave a silently
        // under-registered fixture, which shows up much later as an isolation test that
        // passes for the wrong reason.
        if (!attendeeId) throw new Error(`Seed: no attendee "${attendee}" — check attendees.ts`)
        if (!eventId) throw new Error(`Seed: no event "${event}" — check SEED_EVENTS`)

        return { attendeeId, eventId }
      }),
    )
  },
}
