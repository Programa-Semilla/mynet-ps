/**
 * T027 — development and preview seed data.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **TWO attendees, with DIFFERENT event registrations. This is not arbitrary.**
 *
 * Isolation is the central claim of this slice, and one attendee cannot demonstrate it —
 * there is nobody else's data to fail to see. FR-069 requires an automated isolation test,
 * quickstart.md Scenario 2 calls itself "the most important scenario in this slice", and both
 * need two identities whose data visibly differs to be meaningful.
 *
 * They also share one event. That overlap matters: it proves the isolation boundary is the
 * *registration*, not the event — an attendee sees a shared event because they are registered
 * for it, not because event visibility is global.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Administrative provisioning is an interim assumption** (spec Assumptions, pending Open
 * Question 1 — the attendee identity model is a client decision). There is no self-service
 * sign-up in this slice, so seeded accounts are how an attendee comes to exist.
 *
 * This never runs against an environment holding real attendee data. It is for local
 * development and per-PR preview branches only (data-model.md, Seed data).
 */
import { hashPassword } from '../auth/password.js'
import { closeDb, getDb } from './client.js'
import { attendeeCredentials, attendees } from './schema/attendees.js'
import { events, registrations } from './schema/events.js'

/**
 * A known password, in a file that never runs against real data. It is written here rather
 * than generated so that quickstart.md's scenarios are reproducible — a reviewer following
 * Scenario 1 needs credentials that work.
 */
const SEED_PASSWORD = 'correct-horse-battery-staple'

const SEED_ATTENDEES = [
  { email: 'ada@example.com', displayName: 'Ada Lovelace' },
  { email: 'grace@example.com', displayName: 'Grace Hopper' },
] as const

const SEED_EVENTS = [
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

export const seed = async (): Promise<void> => {
  const db = getDb()

  // Idempotent: re-seeding a local database is routine, and failing on the second run would
  // make quickstart.md's Setup section wrong.
  await db.delete(registrations)
  await db.delete(attendeeCredentials)
  await db.delete(attendees)
  await db.delete(events)

  const insertedEvents = await db
    .insert(events)
    .values([...SEED_EVENTS])
    .returning()
  const insertedAttendees = await db
    .insert(attendees)
    .values([...SEED_ATTENDEES])
    .returning()

  const passwordHash = await hashPassword(SEED_PASSWORD)
  await db
    .insert(attendeeCredentials)
    .values(insertedAttendees.map((attendee) => ({ attendeeId: attendee.id, passwordHash })))

  const [ada, grace] = insertedAttendees
  const [summit, frontend, systems] = insertedEvents

  if (!ada || !grace || !summit || !frontend || !systems) {
    throw new Error('Seed failed to insert its own fixtures — refusing to continue.')
  }

  await db.insert(registrations).values([
    // Ada: the shared event plus one of her own.
    { attendeeId: ada.id, eventId: summit.id },
    { attendeeId: ada.id, eventId: frontend.id },
    // Grace: the shared event plus a different one. The difference is what the isolation
    // test asserts on.
    { attendeeId: grace.id, eventId: summit.id },
    { attendeeId: grace.id, eventId: systems.id },
  ])
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  try {
    await seed()
    console.warn(
      `Seeded ${SEED_ATTENDEES.length} attendees with different registrations.\n` +
        SEED_ATTENDEES.map((a) => `  ${a.email} / ${SEED_PASSWORD}`).join('\n'),
    )
  } catch (error) {
    console.error('Seed failed:', error)
    process.exitCode = 1
  } finally {
    await closeDb()
  }
}
