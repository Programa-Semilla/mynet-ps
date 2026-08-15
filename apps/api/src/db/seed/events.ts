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
/**
 * T036 (004) — the join codes, **committed in the open on purpose** (FR-311, FR-317a, D7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * These are real codes in a public repository, and that is a decision rather than a leak.
 * `schema/events.ts` carries the full reasoning; the short version is that a code buys
 * registration and nothing else — every profile still sits behind both a shared registration
 * (FR-357) and its owner's discoverability setting (FR-359), and a registration is evidence of
 * presence, never of vetting (FR-317b).
 *
 * **This is the only place a join code is ever written.** No attendee action and no product
 * surface creates, changes or deletes one (FR-311).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Written the way a code is printed on a badge or shown on a slide — short, unambiguous, and
 * with no character a person would have to guess the case of. The comparison trims and
 * lower-cases, so `pds-2026` and ` PDS-2026 ` both work.
 *
 * **This is what makes a conference joinable at all.** The migration adds `join_code` with a
 * random placeholder and drops the default; until this seed runs, every code is an unguessable
 * value and no conference can be joined (FR-317) — which is the intended failure for a database
 * that was migrated but not re-seeded, not an oversight.
 */
export const SEED_EVENTS = [
  {
    name: 'Product & Design Summit',
    location: 'Barcelona, Spain',
    startsOn: '2026-09-14',
    endsOn: '2026-09-17',
    timezone: 'Europe/Madrid',
    joinCode: 'PDS-2026',
    // FR-1048: every conference carries an explicit modality; the seeded programmes all carry
    // rooms, which is what in-person requires (FR-1050a). Virtual/hybrid fixtures are created
    // by the tests that need them rather than seeded, so the two disjoint programmes and the
    // deliberately empty third conference keep their shipped meaning.
    modality: 'in-person',
  },
  {
    name: 'Frontend Horizons',
    location: 'Lisbon, Portugal',
    startsOn: '2026-10-05',
    endsOn: '2026-10-07',
    timezone: 'Europe/Lisbon',
    joinCode: 'FH-2026',
    modality: 'in-person',
  },
  {
    name: 'Systems & Scale',
    location: 'Berlin, Germany',
    startsOn: '2026-11-11',
    endsOn: '2026-11-13',
    timezone: 'Europe/Berlin',
    joinCode: 'SS-2026',
    modality: 'in-person',
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
  // 004 — Alan attends the shared conference too, so he is a co-attendee of both. He has no
  // profile and is unverified, which makes him the fixture for two states at once: the empty
  // profile a reviewer sees at first run, and an attendee who appears to nobody however the
  // discoverability setting reads (FR-359, research D6).
  { attendee: 'alan@example.com', event: 'Product & Design Summit' },
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

/**
 * T036 (004) — join codes must stay distinct **after normalisation**, which the column's UNIQUE
 * constraint cannot check.
 *
 * The constraint compares `text` exactly, so `PDS-2026` and `pds-2026` are two perfectly legal
 * rows — while the lookup lower-cases before comparing and would match both. Joining would then
 * resolve to whichever row the planner returned first, which is the precise failure D7 cites
 * UNIQUE as preventing. The constraint covers the transcription slip; this covers the case slip.
 */
const assertJoinCodesDistinctWhenNormalised = (): void => {
  const seen = new Map<string, string>()
  for (const event of SEED_EVENTS) {
    const normalised = event.joinCode.trim().toLowerCase()
    const existing = seen.get(normalised)
    if (existing) {
      throw new Error(
        `Seed: "${event.name}" and "${existing}" declare join codes that differ only in case or ` +
          'whitespace. Codes are compared after trim().toLowerCase(), so joining would resolve to ' +
          'whichever row the planner returned first (data-model.md, research D7).',
      )
    }
    seen.set(normalised, event.name)
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

    assertJoinCodesDistinctWhenNormalised()

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
