import { asc, eq, sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'
import { attendees } from '../schema/attendees.js'
import {
  attendeeInterests,
  attendeeProfiles,
  PROFILE_LIMITS,
  type Availability,
  type NetworkingIntent,
} from '../schema/profiles.js'

/**
 * T028 (004) — reads and writes of attendee profiles (FR-334–FR-363, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TWO KINDS OF READ, AND THEY ARE DELIBERATELY NOT THE SAME FUNCTION WITH A FLAG.**
 *
 * `readOwnProfile` takes an attendee id that came from the sign-in session and applies no
 * visibility conditions at all — FR-340 requires an owner to read their own profile regardless
 * of any setting, and an unverified attendee who could not see their own profile would be
 * unable to fill it in.
 *
 * `readCoAttendeeProfile` takes an `EventScope` and applies **three** conditions. Merging the
 * two behind a boolean is exactly how a future edit ends up passing `false` on the path that
 * needed `true`, on the one query in this feature where that mistake exposes personal data to
 * the wrong person.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ProfileFields {
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  readonly networkingIntent: NetworkingIntent | null
  readonly availability: Availability | null
  readonly interests: readonly string[]
}

export interface OwnProfile extends ProfileFields {
  readonly displayName: string
  readonly email: string
  /** FR-362 — the attendee's setting, shown to them plainly alongside its effect. */
  readonly discoverable: boolean
  /** FR-325b — what verification adds, stated rather than left mysterious. */
  readonly emailVerified: boolean
  readonly hasAvatar: boolean
}

/** What a co-attendee sees. **No email, and no verification state** (FR-361, FR-391). */
export interface VisibleProfile extends ProfileFields {
  readonly attendeeId: string
  readonly displayName: string
  readonly hasAvatar: boolean
}

const listInterests = async (attendeeId: string): Promise<string[]> => {
  const rows = await getDb()
    .select({ interest: attendeeInterests.interest })
    .from(attendeeInterests)
    .where(eq(attendeeInterests.attendeeId, attendeeId))
    // A total order, so two reads cannot disagree and a diff of the response is meaningful.
    .orderBy(asc(attendeeInterests.interest))

  return rows.map((row) => row.interest)
}

/**
 * The attendee's own profile (FR-334, FR-340, FR-341).
 *
 * **Never `null` for a real attendee.** An account with no `attendee_profiles` row reads as a
 * profile whose every field is empty, because "you have not written one yet" is not an error
 * and a `404` here would make the client render a failure state for the ordinary condition of
 * a new account (FR-341). The row is created on first save, so "empty" has exactly one
 * representation in the database.
 */
export const readOwnProfile = async (attendeeId: string): Promise<OwnProfile | null> => {
  const rows = await getDb()
    .select({
      displayName: attendees.displayName,
      email: attendees.email,
      discoverable: attendees.discoverable,
      emailVerifiedAt: attendees.emailVerifiedAt,
      avatarObjectKey: attendees.avatarObjectKey,
      company: attendeeProfiles.company,
      role: attendeeProfiles.role,
      headline: attendeeProfiles.headline,
      networkingIntent: attendeeProfiles.networkingIntent,
      availability: attendeeProfiles.availability,
    })
    .from(attendees)
    // LEFT, not INNER: an attendee who has written nothing has no profile row, and an inner
    // join would report them as not existing at all.
    .leftJoin(attendeeProfiles, eq(attendeeProfiles.attendeeId, attendees.id))
    .where(eq(attendees.id, attendeeId))
    .limit(1)

  const row = rows[0]
  // Only reachable if the account was deleted between the session check and this read.
  if (!row) return null

  return {
    displayName: row.displayName,
    email: row.email,
    discoverable: row.discoverable,
    emailVerified: row.emailVerifiedAt !== null,
    hasAvatar: row.avatarObjectKey !== null,
    company: row.company,
    role: row.role,
    headline: row.headline,
    networkingIntent: row.networkingIntent,
    availability: row.availability,
    interests: await listInterests(attendeeId),
  }
}

export interface ProfileInput {
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  readonly networkingIntent: NetworkingIntent | null
  readonly availability: Availability | null
  readonly interests: readonly string[]
}

/**
 * Writes the attendee's whole profile (FR-334, FR-335, FR-336).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Whole-profile semantics: an absent field CLEARS.** The client sends the complete profile,
 * so "field omitted" has exactly one meaning and there is no partial-update path in which a
 * cleared field and an unmentioned field look the same.
 *
 * Interests are replaced rather than merged, for the same reason: removing an interest is
 * expressed by sending the set without it, and a merge would make removal impossible without a
 * second verb.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Returns `false` when the interest set exceeds its bound, which the route turns into a
 * refusal. That bound is checked here as well as at the route because a per-row `CHECK` cannot
 * see a set — see `PROFILE_LIMITS.interestCount` for why there is no column constraint.
 */
export const writeOwnProfile = async (
  attendeeId: string,
  input: ProfileInput,
): Promise<boolean> => {
  // Normalised before the count, so twelve interests that collapse to three duplicates are
  // three rather than a refusal — the primary key would have deduplicated them anyway, and
  // refusing on the pre-deduplication count would be arbitrary.
  const interests = [
    ...new Set(input.interests.map((interest) => interest.trim()).filter((i) => i.length > 0)),
  ]

  if (interests.length > PROFILE_LIMITS.interestCount) return false
  if (interests.some((interest) => interest.length > PROFILE_LIMITS.interest)) return false

  await getDb().transaction(async (tx) => {
    await tx
      .insert(attendeeProfiles)
      .values({
        attendeeId,
        company: input.company,
        role: input.role,
        headline: input.headline,
        networkingIntent: input.networkingIntent,
        availability: input.availability,
      })
      .onConflictDoUpdate({
        target: attendeeProfiles.attendeeId,
        set: {
          company: input.company,
          role: input.role,
          headline: input.headline,
          networkingIntent: input.networkingIntent,
          availability: input.availability,
          updatedAt: new Date(),
        },
      })

    // Replace-in-place inside the transaction: no instant exists in which the attendee has a
    // profile and none of their interests.
    await tx.delete(attendeeInterests).where(eq(attendeeInterests.attendeeId, attendeeId))
    if (interests.length > 0) {
      await tx
        .insert(attendeeInterests)
        .values(interests.map((interest) => ({ attendeeId, interest })))
    }
  })

  return true
}

/**
 * Sets the discoverability flag and reports what it **effectively** means (FR-359, FR-362).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Returns effective visibility, not the flag that was just written**, and the difference is
 * the requirement. An unverified attendee who turns discoverability on is still invisible
 * (FR-359); echoing the flag back would tell them the exact opposite of what is true, which is
 * the one thing FR-362 asks this surface not to do.
 *
 * A change takes effect on the very next request (FR-363) because nothing caches it: every read
 * evaluates the column, and no session or token carries a copy that could go stale.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const setDiscoverable = async (
  attendeeId: string,
  discoverable: boolean,
): Promise<{
  discoverable: boolean
  emailVerified: boolean
  effectivelyVisible: boolean
} | null> => {
  const rows = await getDb()
    .update(attendees)
    .set({ discoverable, updatedAt: new Date() })
    .where(eq(attendees.id, attendeeId))
    .returning({
      discoverable: attendees.discoverable,
      emailVerifiedAt: attendees.emailVerifiedAt,
    })

  const row = rows[0]
  if (!row) return null

  const emailVerified = row.emailVerifiedAt !== null
  return {
    discoverable: row.discoverable,
    emailVerified,
    effectivelyVisible: row.discoverable && emailVerified,
  }
}

/** Records or clears the storage key for an avatar (FR-346, FR-350). */
export const setAvatarObjectKey = async (attendeeId: string, key: string | null): Promise<void> => {
  await getDb()
    .update(attendees)
    .set({ avatarObjectKey: key, updatedAt: new Date() })
    .where(eq(attendees.id, attendeeId))
}

/** The attendee's own avatar key, for replacing and for deletion. */
export const readOwnAvatarKey = async (attendeeId: string): Promise<string | null> => {
  const rows = await getDb()
    .select({ key: attendees.avatarObjectKey })
    .from(attendees)
    .where(eq(attendees.id, attendeeId))
    .limit(1)

  return rows[0]?.key ?? null
}

/**
 * Matched rather than parsed, for the same reason `requireEventAccess` matches the event id: a
 * `format: uuid` on the route would answer a malformed identifier with a 400 and a validation
 * body *before* the handler ran, separating "not a uuid" from "not visible to you". Smaller
 * than an existence leak, still a difference an attacker can read (FR-361).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Another attendee's profile, or `null` (FR-357, FR-358, FR-359, FR-361, FR-390, research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ALL THREE CONDITIONS ARE ONE `WHERE` OVER ONE JOIN, AND THAT IS WHAT MAKES FR-361 TRUE BY
 * CONSTRUCTION RATHER THAN BY THREE CAREFUL BRANCHES.**
 *
 * The conditions are:
 *   1. the target is registered for **this** conference — the reader's own registration is
 *      already proven by the `EventScope`, which only `requireEventAccess` can produce;
 *   2. the target's discoverability setting is on (FR-359);
 *   3. the target's address is verified (FR-359, FR-325).
 *
 * Because they are one predicate, *not registered*, *does not exist*, *not discoverable* and
 * *not verified* all produce **no row**. There is no branch that knows which one failed, so
 * there is no branch a later edit could make report differently — the requesting attendee
 * cannot learn another attendee's verification state (FR-361) because nothing in this process
 * ever computed it. This is FR-148's property, obtained the same way 002 obtained it for events.
 *
 * The third condition is what stops a person signing up under an address they do not own,
 * joining with a world-readable code, and appearing in a professional directory as its owner
 * (FR-325a, SC-304a). It is a `WHERE` clause carrying a whole threat model.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **`attendeeId` is the only client-supplied value here, and it can only ever narrow.** It
 * cannot widen the result set, cannot reach outside the scope's conference, and cannot select a
 * hidden attendee — the other three conditions are not expressible by the caller.
 */
export const readCoAttendeeProfile = async (
  unverified: EventScope,
  attendeeId: string,
): Promise<VisibleProfile | null> => {
  // Membership, not merely shape. A value can satisfy `EventScope` and still never have been
  // through the guard; this is the check that makes the guarantee true at runtime.
  const scope = assertVerifiedScope(unverified)

  if (!UUID.test(attendeeId)) return null

  const rows = await getDb().execute<{
    attendee_id: string
    display_name: string
    has_avatar: boolean
    company: string | null
    role: string | null
    headline: string | null
    networking_intent: NetworkingIntent | null
    availability: Availability | null
  }>(sql`
    SELECT
      a.id                              AS attendee_id,
      a.display_name                    AS display_name,
      (a.avatar_object_key IS NOT NULL) AS has_avatar,
      p.company                         AS company,
      p.role                            AS role,
      p.headline                        AS headline,
      p.networking_intent               AS networking_intent,
      p.availability                    AS availability
    FROM attendees a
    JOIN registrations r
      ON r.attendee_id = a.id AND r.event_id = ${scope.eventId}::uuid
    LEFT JOIN attendee_profiles p ON p.attendee_id = a.id
    WHERE a.id = ${attendeeId}::uuid
      AND a.discoverable = true
      AND a.email_verified_at IS NOT NULL
    LIMIT 1
  `)

  const row = rows[0]
  if (!row) return null

  return {
    attendeeId: row.attendee_id,
    displayName: row.display_name,
    hasAvatar: row.has_avatar,
    company: row.company,
    role: row.role,
    headline: row.headline,
    networkingIntent: row.networking_intent,
    availability: row.availability,
    interests: await listInterests(row.attendee_id),
  }
}

/**
 * The storage key of a co-attendee's avatar, under **the same three conditions** as the profile
 * (FR-357, and the reason T083 depends on US5).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Avatar bytes are part of the profile, not a public asset. Serving them under weaker
 * conditions would make a hidden attendee's photograph readable by anyone who could guess an
 * identifier — the profile withheld and the face served.
 *
 * It reuses `readCoAttendeeProfile` rather than repeating the predicate, so the two cannot
 * drift: a change to the visibility rule reaches both by construction.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const readVisibleAvatarKey = async (
  scope: EventScope,
  attendeeId: string,
): Promise<string | null> => {
  const visible = await readCoAttendeeProfile(scope, attendeeId)
  if (!visible?.hasAvatar) return null

  return readOwnAvatarKey(visible.attendeeId)
}
