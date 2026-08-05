import { eq } from 'drizzle-orm'

import { getDb } from '../client.js'
import { attendeeCredentials, attendees } from '../schema/attendees.js'

/**
 * T056 — attendee queries, respecting the scoping rule in data-model.md.
 *
 * `attendees`: a request may read only the row matching the authenticated attendee id.
 * `attendee_credentials`: never read outside the sign-in path, never serialised.
 */

/** FR-025b — trim surrounding whitespace, lower-case for comparison. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase()

/**
 * The sign-in path, and the **only** place credentials are read.
 *
 * Returns the hash alongside the identity because sign-in needs both. Every other read path
 * uses `findAttendeeById`, which cannot return a hash — that is the point of the separate
 * table (data-model.md).
 */
export const findAttendeeForSignIn = async (
  email: string,
): Promise<
  { id: string; email: string; displayName: string; passwordHash: string } | undefined
> => {
  const rows = await getDb()
    .select({
      id: attendees.id,
      email: attendees.email,
      displayName: attendees.displayName,
      passwordHash: attendeeCredentials.passwordHash,
    })
    .from(attendees)
    .innerJoin(attendeeCredentials, eq(attendeeCredentials.attendeeId, attendees.id))
    .where(eq(attendees.email, normaliseEmail(email)))
    .limit(1)

  return rows[0]
}

/**
 * Identity only. There is no overload of this that returns credential material, deliberately.
 */
export const findAttendeeById = async (
  id: string,
): Promise<{ id: string; email: string; displayName: string } | undefined> => {
  const rows = await getDb()
    .select({ id: attendees.id, email: attendees.email, displayName: attendees.displayName })
    .from(attendees)
    .where(eq(attendees.id, id))
    .limit(1)

  return rows[0]
}
