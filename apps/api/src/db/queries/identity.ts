import { eq, sql } from 'drizzle-orm'

import { getDb } from '../client.js'
import { attendeeCredentials, attendees } from '../schema/attendees.js'
import { events, registrations } from '../schema/events.js'
import { normaliseEmail } from './attendees.js'

/**
 * T027 (004) — account creation, address lookup, verification state, and join-code resolution
 * (FR-301, FR-302, FR-305, FR-311).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Every function here takes what the route was given and nothing else.** None accepts an
 * attendee identifier from a client: `markEmailVerified` is handed the id that
 * `consumeVerification` recovered from a token, and `joinConference` is handed
 * `request.attendee.id`. There is no parameter anywhere below in which a caller could name
 * somebody else (FR-385).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Creates an account and its credential row, or reports that the address is taken.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`ON CONFLICT DO NOTHING` rather than a look-then-insert, and that is not an optimisation.**
 *
 * Checking whether the address exists and then inserting leaves a window in which two
 * simultaneous sign-ups both see "available" and both proceed. One would then fail on the
 * unique constraint and surface as a 500 — an internal error for an ordinary race, on the
 * product's most public route.
 *
 * Folding the check into the insert makes the database the only arbiter. `null` here means
 * exactly one thing: the address was already registered by the time this statement ran. The
 * caller turns that into FR-303's deliberate disclosure.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The transaction covers both rows** because an attendee without a credential row cannot sign
 * in and cannot be recovered — it is an account that exists and cannot be used, and the address
 * would be taken by it. `findAttendeeForSignIn` inner-joins the two, so such a row would be
 * invisible to sign-in and visible to sign-up's uniqueness check at the same time.
 *
 * **`email_verified_at` is left null and `discoverable` takes its `true` default** (FR-319,
 * FR-359). Together those mean a brand-new account is discoverable-in-setting and invisible-in-
 * fact until its owner proves they can receive mail — which is what makes the default safe.
 */
export const createAccount = async ({
  email,
  displayName,
  passwordHash,
}: {
  email: string
  displayName: string
  passwordHash: string
}): Promise<{ id: string; email: string; displayName: string } | null> =>
  getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(attendees)
      .values({ email: normaliseEmail(email), displayName })
      .onConflictDoNothing({ target: attendees.email })
      .returning({
        id: attendees.id,
        email: attendees.email,
        displayName: attendees.displayName,
      })

    const attendee = inserted[0]
    if (!attendee) return null

    await tx.insert(attendeeCredentials).values({ attendeeId: attendee.id, passwordHash })

    return attendee
  })

/**
 * The attendee id for an address, or `undefined`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is the one function in the codebase whose result must never reach the caller's
 * response**, and the reason is FR-327: a password-reset request answers identically whether or
 * not an account exists. `undefined` here means "send nothing"; it must never mean "say
 * nothing was found".
 *
 * It returns the id alone — no display name, no verification state, nothing that a careless
 * `return` could serialise into a body that discloses membership.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const findAttendeeIdByEmail = async (email: string): Promise<string | undefined> => {
  const rows = await getDb()
    .select({ id: attendees.id })
    .from(attendees)
    .where(eq(attendees.email, normaliseEmail(email)))
    .limit(1)

  return rows[0]?.id
}

/**
 * Records that an address has been proven reachable (FR-319).
 *
 * Idempotent, and **does not overwrite an earlier timestamp**: verifying twice is not an event
 * worth re-dating, and `consumeVerification` has already made a second use of the same link
 * impossible. The `IS NULL` guard is what keeps "since when" answerable.
 */
export const markEmailVerified = async (attendeeId: string): Promise<void> => {
  await getDb().execute(sql`
    UPDATE ${attendees}
    SET email_verified_at = now(), updated_at = now()
    WHERE ${attendees.id} = ${attendeeId}::uuid AND ${attendees.emailVerifiedAt} IS NULL
  `)
}

/** Replaces the credential after a reset (FR-330). The old hash is overwritten, never kept. */
export const replacePassword = async (attendeeId: string, passwordHash: string): Promise<void> => {
  await getDb()
    .update(attendeeCredentials)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(attendeeCredentials.attendeeId, attendeeId))
}

/** Whether this attendee's address is verified — read for their **own** surfaces only. */
export const isEmailVerified = async (attendeeId: string): Promise<boolean> => {
  const rows = await getDb()
    .select({ verifiedAt: attendees.emailVerifiedAt })
    .from(attendees)
    .where(eq(attendees.id, attendeeId))
    .limit(1)

  return (rows[0]?.verifiedAt ?? null) !== null
}

export type JoinOutcome =
  | { readonly status: 'joined'; readonly eventId: string }
  /** FR-312 — **not an error.** Entering the same code twice is idempotent and says so. */
  | { readonly status: 'already-registered'; readonly eventId: string }
  /** FR-313 — one outcome for every cause of rejection. */
  | { readonly status: 'unrecognised' }

/**
 * Registers the attendee for the conference a join code names (FR-310–FR-315, D7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE STATEMENT RESOLVES THE CODE AND CREATES THE REGISTRATION**, so there is no window
 * between them and no separately-reportable "no such code".
 *
 * `RETURNING` distinguishes the two outcomes that matter and collapses the rest:
 *   - a row returned  → newly registered;
 *   - no row + the code resolves → already registered (FR-312, idempotent, not an error);
 *   - no row + the code does not resolve → unrecognised (FR-313).
 *
 * The second probe reads `events` alone, which is seeded conference content rather than
 * attendee data, and it runs only after the write has already been constrained — the same
 * shape `saveSession` uses in `queries/agenda.ts` for the same reason.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The comparison trims and lower-cases**, following `normaliseEmail`'s precedent: a code read
 * off a badge or a slide arrives with arbitrary case and stray whitespace, and telling somebody
 * their correctly-transcribed code is wrong because of a trailing space would be the product
 * being pedantic at their expense (D7).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-315 — "on first registration the conference becomes active" — needs no row written here,
 * and writing one would be wrong.**
 *
 * `resolveActiveEvent` derives the active conference from the attendee's registrations whenever
 * no explicit selection exists, so an attendee whose only registration is this one resolves to
 * it immediately. Writing an `active_event_selections` row instead would record an *explicit
 * choice*, and FR-104 makes an explicit choice permanent — it is never re-derived, even after
 * the conference ends. Joining your first conference would then silently pin you to it for
 * good. Derivation gives the required behaviour and keeps the pin for an attendee who actually
 * asked for one.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const joinConference = async (
  attendeeId: string,
  joinCode: string,
): Promise<JoinOutcome> => {
  const normalised = joinCode.trim().toLowerCase()

  // An empty code cannot match anything, and short-circuiting keeps a bare `trim()` of
  // whitespace from becoming a full table comparison.
  if (normalised.length === 0) return { status: 'unrecognised' }

  const db = getDb()

  const inserted = await db.execute<{ event_id: string }>(sql`
    INSERT INTO ${registrations} (attendee_id, event_id)
    SELECT ${attendeeId}::uuid, e.id
    FROM ${events} e
    WHERE lower(btrim(e.join_code)) = ${normalised}
    ON CONFLICT (attendee_id, event_id) DO NOTHING
    RETURNING event_id
  `)

  const row = inserted[0]
  if (row) return { status: 'joined', eventId: row.event_id }

  // No insert: either the code names nothing, or it names a conference already registered.
  // Only the second is a success, and only this probe can tell them apart — `DO NOTHING`
  // returns no row for both.
  const resolved = await db.execute<{ id: string }>(sql`
    SELECT e.id FROM ${events} e WHERE lower(btrim(e.join_code)) = ${normalised} LIMIT 1
  `)

  const event = resolved[0]
  return event ? { status: 'already-registered', eventId: event.id } : { status: 'unrecognised' }
}

/** The conference behind a successful join, for the response body. */
export const findEventById = async (
  eventId: string,
): Promise<{
  id: string
  name: string
  location: string
  startsOn: string
  endsOn: string
  timezone: string
} | null> => {
  const rows = await getDb()
    .select({
      id: events.id,
      name: events.name,
      location: events.location,
      startsOn: events.startsOn,
      endsOn: events.endsOn,
      timezone: events.timezone,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)

  return rows[0] ?? null
}
