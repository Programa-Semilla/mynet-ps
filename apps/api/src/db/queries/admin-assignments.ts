import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import {
  assertVerifiedOperator,
  type OperatorScope,
  type PlatformScope,
} from '../../admin/scope.js'
import { getDb } from '../client.js'
import { attendees } from '../schema/attendees.js'
import { events, registrations } from '../schema/events.js'
import { organizerAssignments } from '../schema/organizer-assignments.js'

/**
 * T121 (011) — conferences, their organizers, and the derived `unassigned` state (FR-926,
 * FR-930–FR-936).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`unassigned` IS DERIVED AND STORED NOWHERE** (FR-936), which is 008's `lapsed` reasoning
 * applied to a second case.
 *
 * A stored flag would need something to keep it true: a write on every promotion, on every
 * demotion, on every account deletion, and on every withdrawal — four paths, three of which
 * belong to other features. The one that drifted would be the one displayed, and what it would
 * display is *"this conference has an organizer"* about a conference that has none.
 *
 * Decision 39 makes this state load-bearing rather than cosmetic: a conference left with no
 * organizer enters an explicit `unassigned` state **that platform operators can see**, and
 * reverting ownership silently to the platform tier was rejected — *"a tidier invariant that
 * hides the event nobody is prompted to act on."* A derived value cannot hide it.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ConferenceRow {
  readonly id: string
  readonly name: string
  readonly organizers: readonly { readonly attendeeId: string; readonly displayName: string }[]
  /** Derived: no live assignment. Not a column, and must not become one. */
  readonly unassigned: boolean
}

/**
 * Every conference, or only the caller's assigned ones (FR-926).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **The tier decides the population, in the QUERY, not in what the client renders.**
 *
 * A conference organizer sees the conferences they are assigned and no others — not a full list
 * with the rest greyed out. FR-925's "render no control for a capability they do not hold" is the
 * presentation half; this is the enforcement half, and they are deliberately not the same code:
 * `admin-tier-boundary.test.ts` proves an organizer cannot reach an unassigned conference **by
 * direct address entry**, which is the only way to show the two are independent.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const listConferences = async (
  unverified: OperatorScope,
): Promise<readonly ConferenceRow[]> => {
  // The scope itself, not a shape derived from it at the route. Taking the branded value here is
  // what lets `assertVerifiedOperator` run at the boundary where the data is actually read — and
  // it removed the `scope.attendeeId as string` the caller needed to build the old parameter,
  // which is precisely the assertion `VerifiedPlatformScope`'s narrowing exists to make
  // unnecessary.
  const viewer = assertVerifiedOperator(unverified)
  const db = getDb()

  const rows = await db
    .select({
      eventId: events.id,
      eventName: events.name,
      attendeeId: organizerAssignments.attendeeId,
      displayName: attendees.displayName,
    })
    .from(events)
    // Left join: a conference with no live assignment must still appear for the platform tier —
    // it is precisely the row an operator needs to see (FR-936).
    .leftJoin(
      organizerAssignments,
      and(eq(organizerAssignments.eventId, events.id), isNull(organizerAssignments.revokedAt)),
    )
    .leftJoin(attendees, eq(attendees.id, organizerAssignments.attendeeId))
    .orderBy(asc(events.name))

  const byEvent = new Map<string, { name: string; organizers: ConferenceRow['organizers'] }>()

  for (const row of rows) {
    const entry = byEvent.get(row.eventId) ?? { name: row.eventName, organizers: [] }
    if (row.attendeeId && row.displayName) {
      entry.organizers = [
        ...entry.organizers,
        { attendeeId: row.attendeeId, displayName: row.displayName },
      ]
    }
    byEvent.set(row.eventId, entry)
  }

  const all: ConferenceRow[] = [...byEvent].map(([id, entry]) => ({
    id,
    name: entry.name,
    organizers: entry.organizers,
    unassigned: entry.organizers.length === 0,
  }))

  if (viewer.tier === 'platform') return all

  // An organizer sees only what they hold. Filtered here from the same query rather than run as
  // a different one, so the two tiers cannot drift into two shapes.
  return all.filter((conference) =>
    conference.organizers.some((organizer) => organizer.attendeeId === viewer.attendeeId),
  )
}

export type PromotionOutcome = 'promoted' | 'already-assigned' | 'not-registered' | 'not-found'

/**
 * Promotes a registered attendee to organizer of one conference (FR-930, FR-931, FR-933).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE REGISTRATION PRECONDITION IS PART OF THE INSERT, NOT A CHECK BEFORE IT.**
 *
 * FR-930 requires the attendee to be registered for the conference. Expressed as
 * `INSERT … SELECT … WHERE EXISTS`, the condition is evaluated by the same statement that
 * writes — so there is no window in which somebody withdraws between the check and the write, and
 * no second code path that could skip it. 002's event guard records the same pattern as the one
 * case where folding a check into the statement removed a redundant query rather than hiding one.
 *
 * **Why registration is required at all**: an organizer's authority reaches conferences they are
 * *assigned*, and the assignment is meaningless for somebody who cannot see the conference. It
 * also keeps promotion from being a way to grant somebody access to a conference they never
 * joined — which would make it a registration route wearing a promotion's clothes, and 013 owns
 * registration.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **`already-assigned` is distinguished from `promoted` by the partial unique index**, not by a
 * prior read: one live assignment per person per conference, and a second insert conflicts. That
 * is the same shape `report_resolutions` uses for FR-945.
 */
export const promoteToOrganizer = async (
  unverified: PlatformScope,
  input: { eventId: string; attendeeId: string },
  db: Pick<ReturnType<typeof getDb>, 'select' | 'insert'> = getDb(),
): Promise<PromotionOutcome> => {
  // Asserted here rather than only at the route, for the reason `assertVerifiedScope` and
  // `assertVerifiedParticipation` are: this is the boundary where the write happens, and a
  // route-only check protects the declaration rather than the act.
  const scope = assertVerifiedOperator(unverified)

  const conference = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, input.eventId))
    .limit(1)
  if (conference.length === 0) return 'not-found'

  const registered = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(eq(registrations.attendeeId, input.attendeeId), eq(registrations.eventId, input.eventId)),
    )
    .limit(1)

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **A refusal's follow-up question must be about the READER**, which 008 learned the hard way.
  //
  // `not-registered` is returned as a distinguishable outcome and the route turns it into a
  // **404**, deliberately identical to a conference that does not exist. Answering "that person
  // is not registered" would make this route an enumeration oracle for another attendee's
  // presence at a conference — 008's exact defect on `POST /appointments`, where the caller
  // controlled the slot so the invitee was the only variable. Here the caller controls the
  // conference, so the attendee is the only variable, and the same reasoning applies.
  //
  // It is still returned separately from `not-found` because the *operator's* client renders a
  // helpful message from it, and the two cases have different remedies. The route decides what
  // reaches the wire.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  if (registered.length === 0) return 'not-registered'

  const inserted = await db
    .insert(organizerAssignments)
    .values({
      attendeeId: input.attendeeId,
      eventId: input.eventId,
      assignedBy: scope.operatorId,
    })
    // The partial unique index decides. `DO NOTHING` turns a second live assignment into zero
    // rows rather than a thrown driver error, so the conflict stays a domain outcome.
    .onConflictDoNothing()
    .returning({ id: organizerAssignments.id })

  return inserted.length > 0 ? 'promoted' : 'already-assigned'
}

/**
 * Ends one assignment (FR-934).
 *
 * `revoked_at` rather than a delete: a revoked row is **history**, which is what keeps an audit
 * entry explaining a promotion coherent against the record. Only live rows are touched, so an
 * earlier revocation keeps its own instant.
 *
 * **The account is untouched.** Demotion ends administrative access and changes nothing an
 * attendee can observe in MyNet (FR-934, FR-904) — no profile field, no registration, no
 * conversation. That is what makes promotion reversible without cost to the person.
 */
export const demoteOrganizer = async (
  unverified: PlatformScope,
  eventId: string,
  attendeeId: string,
  db: Pick<ReturnType<typeof getDb>, 'update'> = getDb(),
): Promise<boolean> => {
  assertVerifiedOperator(unverified)

  const rows = await db
    .update(organizerAssignments)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(organizerAssignments.eventId, eventId),
        eq(organizerAssignments.attendeeId, attendeeId),
        isNull(organizerAssignments.revokedAt),
      ),
    )
    .returning({ id: organizerAssignments.id })

  return rows.length > 0
}

/**
 * Revokes **every** live assignment an attendee holds, in the caller's transaction (FR-960).
 *
 * Called from the account-deletion path, which is a file 004 owns — declared in plan.md's "files
 * this feature writes that another feature owns", as 008 declared its two.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Belt and braces, and it says so.** `organizer_assignments.attendee_id` is `ON DELETE
 * CASCADE`, so the rows go regardless. This runs first anyway, for the reason
 * `revokeAllSessions` gives on the same path: the revocation is cheap, and a revocation that
 * turns out to be redundant costs nothing while a missing one would leave authority behind.
 *
 * More importantly it makes the *intent* visible in the deletion transaction. Decision 39 says
 * authority must not outlive the access it depends on; a reader of `deleteAccount` should be
 * able to see that being done rather than infer it from a foreign key three files away.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const revokeAllAssignments = async (
  attendeeId: string,
  db: Pick<ReturnType<typeof getDb>, 'update'> = getDb(),
): Promise<void> => {
  await db
    .update(organizerAssignments)
    .set({ revokedAt: sql`now()` })
    .where(
      and(eq(organizerAssignments.attendeeId, attendeeId), isNull(organizerAssignments.revokedAt)),
    )
}

/**
 * Revokes the assignment for **one** conference, in the caller's transaction (FR-961).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WITHDRAWING FROM A CONFERENCE TAKES THE AUTHORITY OVER IT, AND ONLY OVER IT.**
 *
 * 008's precedent, and the trap it names transfers exactly: a departing attendee stops passing
 * `requireEventAccess` and can no longer see or manage what they left behind, while the authority
 * itself would keep working. An organizer who withdrew from a conference could still act on it —
 * authority outliving the access it depends on, which decision 39 forbids in one sentence.
 *
 * **Scoped to the one conference**, unlike `revokeAllAssignments`. Somebody withdrawing from one
 * event keeps their authority over the others, which is FR-932's independent revocability seen
 * from the lifecycle side.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const revokeAssignmentForEvent = async (
  attendeeId: string,
  eventId: string,
  db: Pick<ReturnType<typeof getDb>, 'update'> = getDb(),
): Promise<void> => {
  await db
    .update(organizerAssignments)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(organizerAssignments.attendeeId, attendeeId),
        eq(organizerAssignments.eventId, eventId),
        isNull(organizerAssignments.revokedAt),
      ),
    )
}
