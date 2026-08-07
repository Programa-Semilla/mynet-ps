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

export const SEED_EVENTS = [
  {
    name: 'Product & Design Summit',
    location: 'Barcelona, Spain',
    startsOn: '2026-09-14',
    endsOn: '2026-09-17',
  },
  {
    name: 'Frontend Horizons',
    location: 'Lisbon, Portugal',
    startsOn: '2026-10-05',
    endsOn: '2026-10-07',
  },
  {
    name: 'Systems & Scale',
    location: 'Berlin, Germany',
    startsOn: '2026-11-11',
    endsOn: '2026-11-13',
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

export const eventSeed: SeedModule = {
  name: 'events',

  async clear(db) {
    // Registrations first: they reference both events and attendees.
    await db.delete(registrations)
    await db.delete(events)
  },

  async run(db, context: SeedContext) {
    const inserted = await db
      .insert(events)
      .values([...SEED_EVENTS])
      .returning()

    for (const event of inserted) {
      context.eventIds.set(event.name, event.id)
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
