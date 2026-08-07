import { hashPassword } from '../../auth/password.js'
import { attendeeCredentials, attendees } from '../schema/attendees.js'
import {
  attendeeInterests,
  attendeeProfiles,
  type Availability,
  type NetworkingIntent,
} from '../schema/profiles.js'
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

/**
 * T076 (004) — **three attendees now, and the third one is bare on purpose** (FR-342, D6).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * 005 deliberately seeded nothing attendee-authored, and `schema/agenda.ts` records why:
 * seeding personal content would fabricate data attributed to a real identity, and leaving it
 * empty means **the empty states are what a reviewer sees first** — the states most likely to
 * be skipped are the ones on screen at first run.
 *
 * FR-342 asks 004 to seed profiles anyway, and the two are reconcilable because 005's concern
 * is narrower than it looks: the objection is to fabricating data attributed to a **real**
 * person, and these two accounts are fixtures. 006 builds a directory, and shipping it against
 * an empty one would make the feature undemonstrable and its empty state the only state anybody
 * ever sees — the mirror of the problem 005 was avoiding.
 *
 * **Alan is what preserves 005's actual benefit.** With two populated profiles and one bare
 * account, both the populated and the empty profile states are reachable at first run without
 * anyone having to construct either. He is registered for a conference and has written nothing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const SEED_ATTENDEES = [
  { email: 'ada@example.com', displayName: 'Ada Lovelace' },
  { email: 'grace@example.com', displayName: 'Grace Hopper' },
  { email: 'alan@example.com', displayName: 'Alan Turing' },
] as const

/**
 * T076 (004) — seeded profile content (FR-342).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Alan is absent from this list, and that absence is the design** — see above.
 *
 * **Nobody here has an avatar** (FR-354). The prototype's sample photographs are Unsplash
 * images of real people, and this repository is public: shipping them as seeded attendee faces
 * would attribute real likenesses to fictional attendees. `tests/unit/seed-avatars.test.ts`
 * asserts that nothing here ever acquires one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const SEED_PROFILES: readonly {
  attendee: string
  company: string
  role: string
  headline: string
  networkingIntent: NetworkingIntent
  availability: Availability
  interests: readonly string[]
}[] = [
  {
    attendee: 'ada@example.com',
    company: 'Analytical Engines',
    role: 'Principal Engineer',
    headline: 'Making machines describe what they are about to do.',
    networkingIntent: 'open_to_meetings',
    availability: 'available',
    interests: ['Design systems', 'Developer experience', 'Documentation'],
  },
  {
    attendee: 'grace@example.com',
    company: 'Naval Systems Group',
    role: 'Director of Engineering',
    headline: 'Compilers, standards, and persuading people that both matter.',
    networkingIntent: 'open_to_messages',
    availability: 'busy',
    interests: ['Platform engineering', 'Standards', 'Mentoring'],
  },
]

/**
 * Verification state for the seeded accounts.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Ada and Grace are verified; Alan is not, and that is a third state worth having.**
 *
 * FR-359 makes a profile readable by others only when discoverability is on **and** the address
 * is verified. Seeding everybody verified would leave the unverified branch of that condition
 * untested by anything a reviewer does by hand, and it is the branch that carries the whole of
 * SC-304a. Alan therefore demonstrates two things at once: an empty profile, and an attendee
 * who does not appear to anybody.
 *
 * Nothing is *sent* to establish this — the seed writes the timestamp directly, because a seed
 * that depended on a mail provider would depend on register entry 18.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const SEED_VERIFIED = new Set(['ada@example.com', 'grace@example.com'])

export const attendeeSeed: SeedModule = {
  name: 'attendees',

  async clear(db) {
    // `attendee_profiles` and `attendee_interests` cascade from `attendees`, so deleting the
    // parent takes them — the same cascade the delete-account route relies on, exercised on
    // every seed run.
    await db.delete(attendeeCredentials)
    await db.delete(attendees)
  },

  async run(db, context: SeedContext) {
    const inserted = await db
      .insert(attendees)
      .values(
        SEED_ATTENDEES.map((attendee) => ({
          ...attendee,
          // Written directly rather than by sending anything: a seed that depended on a mail
          // provider would depend on register entry 18, which is open.
          emailVerifiedAt: SEED_VERIFIED.has(attendee.email) ? new Date() : null,
        })),
      )
      .returning()

    const passwordHash = await hashPassword(SEED_PASSWORD)
    await db
      .insert(attendeeCredentials)
      .values(inserted.map((attendee) => ({ attendeeId: attendee.id, passwordHash })))

    for (const attendee of inserted) {
      context.attendeeIds.set(attendee.email, attendee.id)
    }

    for (const profile of SEED_PROFILES) {
      const attendeeId = context.attendeeIds.get(profile.attendee)
      // A typo in the address above would otherwise insert nothing and leave a silently
      // under-populated fixture — which shows up much later as a directory test that passes
      // for the wrong reason.
      if (!attendeeId) {
        throw new Error(`Seed: no attendee "${profile.attendee}" — check SEED_ATTENDEES`)
      }

      await db.insert(attendeeProfiles).values({
        attendeeId,
        company: profile.company,
        role: profile.role,
        headline: profile.headline,
        networkingIntent: profile.networkingIntent,
        availability: profile.availability,
      })

      await db
        .insert(attendeeInterests)
        .values(profile.interests.map((interest) => ({ attendeeId, interest })))
    }
  },
}
