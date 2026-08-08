import { eq, inArray } from 'drizzle-orm'

import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { events, registrations } from '../../src/db/schema/events.js'
import { attendeeInterests, attendeeProfiles } from '../../src/db/schema/profiles.js'
import type { Availability, NetworkingIntent } from '../../src/db/schema/profiles.js'
import { SEED_EVENTS } from '../../src/db/seed/events.js'

/**
 * Fixture builder for the directory suites (006, T035–T042).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SEEDED THREE ARE NOT ENOUGH TO TEST THE DIRECTORY, AND THE REASON IS INSTRUCTIVE.**
 *
 * Ada and Grace share a conference and **share no interest at all**, which is exactly the
 * fixture 004 needed and exactly the wrong one for a ranking whose whole subject is overlap.
 * A ranking test against them would assert that two zeros tie, which is true of any
 * implementation including a broken one.
 *
 * So every directory suite builds the population it needs — with stated interests, stated
 * visibility, and names carrying the accents FR-407's search has to survive — rather than
 * bending the seed, which every other suite in this directory depends on being what it is.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Created attendees carry **no credentials**, because none of them signs in. The reader is
 * always a seeded account; these are the people being read about.
 */

export interface DirectoryPerson {
  readonly email: string
  readonly displayName: string
  readonly company?: string | null
  readonly role?: string | null
  readonly headline?: string | null
  readonly networkingIntent?: NetworkingIntent | null
  readonly availability?: Availability | null
  readonly interests?: readonly string[]
  /** Defaults to `true`. `false` is the FR-402 exclusion under test. */
  readonly discoverable?: boolean
  /** Defaults to `true`. `false` is the other FR-402 exclusion. */
  readonly verified?: boolean
  /** Which seeded conference they are registered for, by name. Defaults to the shared one. */
  readonly event?: string
  /** Set to give them an avatar without uploading one. */
  readonly avatarObjectKey?: string | null
}

export const SHARED_EVENT = SEED_EVENTS[0].name
export const OTHER_EVENT = SEED_EVENTS[2].name

/** Conference identifiers by seeded name, so no test hard-codes a uuid. */
export const eventIdsByName = async (): Promise<Map<string, string>> => {
  const rows = await getDb().select({ id: events.id, name: events.name }).from(events)
  return new Map(rows.map((row) => [row.name, row.id]))
}

/** Attendee identifiers by seeded email, likewise. */
export const attendeeIdsByEmail = async (): Promise<Map<string, string>> => {
  const rows = await getDb().select({ id: attendees.id, email: attendees.email }).from(attendees)
  return new Map(rows.map((row) => [row.email, row.id]))
}

/**
 * Creates the people, their profiles, their interests and their registrations.
 *
 * Returns identifiers keyed by email. Written as one function rather than four so a fixture
 * cannot be half-built — an attendee with interests but no registration is invisible to the
 * directory for the *right* reason, which would make a genuinely broken query look correct.
 */
export const createDirectoryPopulation = async (
  people: readonly DirectoryPerson[],
): Promise<Map<string, string>> => {
  const db = getDb()
  const eventIds = await eventIdsByName()

  const inserted = await db
    .insert(attendees)
    .values(
      people.map((person) => ({
        email: person.email,
        displayName: person.displayName,
        discoverable: person.discoverable ?? true,
        emailVerifiedAt: (person.verified ?? true) ? new Date() : null,
        avatarObjectKey: person.avatarObjectKey ?? null,
      })),
    )
    .returning({ id: attendees.id, email: attendees.email })

  const ids = new Map(inserted.map((row) => [row.email.toLowerCase(), row.id]))

  for (const person of people) {
    const attendeeId = ids.get(person.email.toLowerCase())
    if (!attendeeId) throw new Error(`fixture: ${person.email} was not inserted`)

    const eventName = person.event ?? SHARED_EVENT
    const eventId = eventIds.get(eventName)
    if (!eventId) throw new Error(`fixture: no seeded conference named "${eventName}"`)

    await db.insert(registrations).values({ attendeeId, eventId })

    // A profile row only when there is something to put in it, so "has written nothing" stays
    // a reachable fixture state rather than being papered over with a row of nulls.
    if (
      person.company !== undefined ||
      person.role !== undefined ||
      person.headline !== undefined ||
      person.networkingIntent !== undefined ||
      person.availability !== undefined
    ) {
      await db.insert(attendeeProfiles).values({
        attendeeId,
        company: person.company ?? null,
        role: person.role ?? null,
        headline: person.headline ?? null,
        networkingIntent: person.networkingIntent ?? null,
        availability: person.availability ?? null,
      })
    }

    if (person.interests?.length) {
      await db
        .insert(attendeeInterests)
        .values(person.interests.map((interest) => ({ attendeeId, interest })))
    }
  }

  return ids
}

/** Replaces one attendee's interest set, for the ranking and paging suites. */
export const setInterests = async (
  attendeeId: string,
  interests: readonly string[],
): Promise<void> => {
  const db = getDb()
  await db.delete(attendeeInterests).where(eq(attendeeInterests.attendeeId, attendeeId))
  if (interests.length > 0) {
    await db
      .insert(attendeeInterests)
      .values(interests.map((interest) => ({ attendeeId, interest })))
  }
}

/**
 * Removes everything `createDirectoryPopulation` made, by email.
 *
 * Deletes `attendees` only and lets the cascade take the rest — the same cascade
 * `DELETE /account` depends on, so every fixture teardown is a small daily proof it works.
 */
export const removeDirectoryPopulation = async (emails: readonly string[]): Promise<void> => {
  if (emails.length === 0) return
  // `email` is `citext`, so this comparison is already case-insensitive — the same property
  // that makes the column's UNIQUE constraint mean what FR-025a says it means.
  await getDb()
    .delete(attendees)
    .where(inArray(attendees.email, [...emails]))
}
