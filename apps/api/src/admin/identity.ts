import { and, eq, isNull } from 'drizzle-orm'

import { getDb } from '../db/client.js'
import { normaliseEmail } from '../db/queries/attendees.js'
import { attendeeCredentials, attendees } from '../db/schema/attendees.js'
import { operators } from '../db/schema/operators.js'
import { organizerAssignments } from '../db/schema/organizer-assignments.js'

/**
 * T059 (013) — **resolving an address to an administrative principal, as ONE lookup** (FR-914,
 * FR-915, FR-918, research R4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-915 REQUIRES FOUR FAILURES TO BE INDISTINGUISHABLE, AND ONE LOOKUP IS HOW THAT BECOMES
 * STRUCTURAL RATHER THAN CAREFUL.**
 *
 * The four are: an address that names nobody, a wrong password, an attendee who has not been
 * promoted, and a deactivated operator. Each is a different fact about the world, and a caller
 * must not be able to tell them apart — including by timing.
 *
 * The tempting implementation asks a series of questions: *is this an operator? no — is it an
 * attendee? yes — are they promoted? no.* Every branch is an observable difference in work done,
 * and the branch that is skipped is the answer. Somebody probing addresses learns which ones
 * belong to attendees, which is a directory of the product's users obtainable from a sign-in form.
 *
 * So this returns **one shape** for every outcome: a candidate with a hash to verify, or nothing.
 * The caller cannot see which store answered, and there is no code path in which it could branch
 * on that. The refusal it produces comes from one factory, exactly as `invalidCredentials()` does
 * for attendee sign-in.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **FR-918's cross-table uniqueness is what makes "one lookup" honest.**
 *
 * An address identifies at most one principal product-wide, enforced by both insert paths
 * checking the other table inside their transaction (plus the concurrency test in T049). Without
 * that, this function would have to *choose* between an operator and an attendee holding the same
 * address — and the choice would be observable.
 *
 * It is recorded in `data-model.md` and in plan.md's Complexity Tracking as a genuine weakness:
 * every other uniqueness rule in this product is database-enforced, and Postgres cannot express
 * this one as a constraint.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * What sign-in needs: something to verify a password against, and who it turns out to be.
 *
 * **`tier` is present on a candidate and says nothing until the password verifies.** Returning it
 * up front costs nothing observable — the caller does the same work either way — and keeps the
 * verification path from having to ask a second question after the fact.
 */
export interface AdminCandidate {
  readonly passwordHash: string
  readonly operatorId: string | null
  readonly attendeeId: string | null
  readonly tier: 'platform' | 'organizer'
  /** FR-992 — true only for a platform operator whose credential was set by the bootstrap. */
  readonly credentialIsInitial: boolean
}

/**
 * Resolves an address to at most one administrative candidate.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **Two queries run, and they run CONCURRENTLY rather than in sequence.**
 *
 * That is not an optimisation, it is the timing property: `Promise.all` means the elapsed cost is
 * one query for every outcome, so an address that hits neither store, one that hits `operators`,
 * and one that hits `attendees` are the same duration. Sequenced with an early return, an
 * operator address would answer measurably faster than an attendee address.
 *
 * **A deactivated operator returns nothing at all** (FR-908, FR-915) — filtered in the `WHERE`,
 * so there is no row for a later check to forget. Likewise an operator with a **null**
 * `password_hash`: the seed creates identities with no usable credential (FR-990), and a null
 * here means sign-in is *impossible* rather than defaulted. Neither is a separate refusal.
 *
 * **An attendee with no live organizer assignment returns nothing**, and this is the case worth
 * pausing on: an ordinary attendee typing their perfectly correct MyNet password into the
 * administrative sign-in form gets the same refusal as somebody guessing. That is deliberate. A
 * distinguishable answer would confirm both that the address has an account and that the person
 * asking is not an organizer — and the second half is exactly what an attacker probing for
 * organizers wants to know.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const findAdminCandidate = async (email: string): Promise<AdminCandidate | undefined> => {
  const normalised = normaliseEmail(email)
  const db = getDb()

  const [operatorRows, attendeeRows] = await Promise.all([
    db
      .select({
        id: operators.id,
        passwordHash: operators.passwordHash,
        credentialIsInitial: operators.credentialIsInitial,
      })
      .from(operators)
      .where(and(eq(operators.email, normalised), isNull(operators.deactivatedAt)))
      .limit(1),

    // The attendee half joins the live-assignment check into the same statement. Doing it as a
    // follow-up query would be a second, observable round trip on exactly the addresses that
    // belong to real attendees.
    db
      .select({
        id: attendees.id,
        passwordHash: attendeeCredentials.passwordHash,
        assignmentId: organizerAssignments.id,
      })
      .from(attendees)
      .innerJoin(attendeeCredentials, eq(attendeeCredentials.attendeeId, attendees.id))
      .innerJoin(
        organizerAssignments,
        and(
          eq(organizerAssignments.attendeeId, attendees.id),
          isNull(organizerAssignments.revokedAt),
        ),
      )
      .where(eq(attendees.email, normalised))
      .limit(1),
  ])

  const operator = operatorRows[0]
  if (operator?.passwordHash) {
    return {
      passwordHash: operator.passwordHash,
      operatorId: operator.id,
      attendeeId: null,
      tier: 'platform',
      credentialIsInitial: operator.credentialIsInitial,
    }
  }

  const attendee = attendeeRows[0]
  if (attendee) {
    return {
      passwordHash: attendee.passwordHash,
      operatorId: null,
      attendeeId: attendee.id,
      tier: 'organizer',
      // FR-992 applies to the bootstrapped platform credential alone. An organizer signs in with
      // their own MyNet password, which they chose — there is nothing to force them to replace.
      credentialIsInitial: false,
    }
  }

  return undefined
}

/**
 * FR-918's cross-table check, for the two paths that create an address.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **CALLED INSIDE THE CALLER'S TRANSACTION, AND THAT IS THE ENTIRETY OF WHAT MAKES IT WORK.**
 *
 * Called before a transaction, this is a read-then-write race: two concurrent registrations of
 * the same address both see nothing and both insert. Inside one, the caller's own unique index on
 * its own table serialises the pair — attendee sign-up contends on `attendees.email`, operator
 * creation on `operators.email` — and this check covers the gap the two constraints cannot see
 * between them.
 *
 * It is still weaker than a constraint, and `tests/integration/admin-concurrency.test.ts`
 * drives both paths concurrently precisely because a weakness that is only reasoned about is a
 * weakness nobody has measured.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const addressTakenByOtherPrincipal = async (
  email: string,
  by: 'attendee' | 'operator',
  db: Pick<ReturnType<typeof getDb>, 'select'> = getDb(),
): Promise<boolean> => {
  const normalised = normaliseEmail(email)

  if (by === 'attendee') {
    const rows = await db
      .select({ id: operators.id })
      .from(operators)
      .where(eq(operators.email, normalised))
      .limit(1)
    return rows.length > 0
  }

  const rows = await db
    .select({ id: attendees.id })
    .from(attendees)
    .where(eq(attendees.email, normalised))
    .limit(1)
  return rows.length > 0
}
