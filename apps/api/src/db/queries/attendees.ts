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
 * T023 (010) — **whether this attendee has confirmed the address they signed up with**
 * (FR-806).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A NARROW FUNCTION FOR ONE CALLER, AND THE NARROWNESS IS THE DESIGN.**
 *
 * The standing invariant is that verification gates *exactly one thing: discoverability*, and
 * that no feature may use it for anything else. FR-806 is a specified exception — the card-share
 * route, checking **the actor at write time** — and it is the only one.
 *
 * The obvious alternative was to add `emailVerified` to `request.attendee`, where it would be
 * free on every request because the session join already reads that row. That is exactly why it
 * was rejected: an ambient flag on the request object is an invitation, and the next feature that
 * wants to "just check" verification would find it already there with nothing to consult and
 * nobody to ask. A function somebody has to import, named for the one requirement that permits
 * it, keeps the second use visible and the third one a decision.
 *
 * **It must never be called from a read path** (FR-807). Card *resolution* consults neither
 * discoverability nor verification, and those absences are what a standing consent means.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const isEmailVerified = async (id: string): Promise<boolean> => {
  const rows = await getDb()
    .select({ verifiedAt: attendees.emailVerifiedAt })
    .from(attendees)
    .where(eq(attendees.id, id))
    .limit(1)

  // `!== null && !== undefined` rather than `!= null`: the repository lints `eqeqeq`, and the
  // two cases are genuinely different here — `undefined` means no such attendee, `null` means an
  // attendee who has not verified. Both refuse, and neither is distinguishable to the caller.
  const verifiedAt = rows[0]?.verifiedAt
  return verifiedAt !== null && verifiedAt !== undefined
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
