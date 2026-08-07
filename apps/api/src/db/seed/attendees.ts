import { hashPassword } from '../../auth/password.js'
import { attendeeCredentials, attendees } from '../schema/attendees.js'
import type { SeedContext, SeedModule } from './index.js'

/**
 * T027 (001), split out by T003 (002) — the seeded attendees and their credentials.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **TWO attendees, with DIFFERENT event registrations. This is not arbitrary.**
 *
 * Isolation is a central claim of this product, and one attendee cannot demonstrate it —
 * there is nobody else's data to fail to see. FR-069 requires an automated isolation test,
 * and 002's FR-150 widens it to conference content; both need two identities whose data
 * visibly differs to be meaningful.
 *
 * The registrations themselves live in `events.ts`, with the table they belong to.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Administrative provisioning is an interim assumption** (spec Assumptions, pending the
 * attendee identity model — constitution Open Question 5). There is no self-service sign-up,
 * so seeded accounts are how an attendee comes to exist.
 */

/**
 * A known password, in a module that never runs against real data. Written here rather than
 * generated so that quickstart.md's scenarios are reproducible — a reviewer following Scenario
 * 1 needs credentials that work.
 */
export const SEED_PASSWORD = 'correct-horse-battery-staple'

export const SEED_ATTENDEES = [
  { email: 'ada@example.com', displayName: 'Ada Lovelace' },
  { email: 'grace@example.com', displayName: 'Grace Hopper' },
] as const

export const attendeeSeed: SeedModule = {
  name: 'attendees',

  async clear(db) {
    await db.delete(attendeeCredentials)
    await db.delete(attendees)
  },

  async run(db, context: SeedContext) {
    const inserted = await db
      .insert(attendees)
      .values([...SEED_ATTENDEES])
      .returning()

    const passwordHash = await hashPassword(SEED_PASSWORD)
    await db
      .insert(attendeeCredentials)
      .values(inserted.map((attendee) => ({ attendeeId: attendee.id, passwordHash })))

    for (const attendee of inserted) {
      context.attendeeIds.set(attendee.email, attendee.id)
    }
  },
}
