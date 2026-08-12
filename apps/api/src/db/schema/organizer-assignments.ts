import { sql } from 'drizzle-orm'
import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'
import { events } from './events.js'
import { operators } from './operators.js'

/**
 * T019 (013) — **authority over one conference, held by one attendee** (FR-930–FR-939,
 * data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A CONFERENCE ORGANIZER IS NOT A ROW IN A PEOPLE TABLE. THIS *IS* THE ORGANIZER.**
 *
 * The second tier has no identity record of its own, deliberately. A conference organizer is an
 * ordinary attendee — same account, same credentials (FR-914), same MyNet experience in every
 * observable way (FR-904) — who additionally holds a live row here. Everything that follows from
 * that is the design:
 *
 *   - Promotion writes a row; demotion sets `revoked_at`. Neither touches the `attendees` table,
 *     which is what makes FR-904 achievable rather than merely required.
 *   - Authority is therefore **queried, never stored on the person**. There is no `is_organizer`
 *     column anywhere, and adding one would create a second source of truth for a question these
 *     rows already answer — 009 records the same reasoning for vote counts.
 *   - An attendee promoted for two conferences has **two rows, independently revocable**
 *     (FR-932). A single column could not express that at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **SCOPING: PER-EVENT, EXPLICITLY.** An assignment *is* authority over one conference — it is
 * the most per-event record in the product. Standing decision 7 demands the declaration; this is
 * the one table in this feature where the answer is one of the two the decision offers.
 *
 * **DELETION / EXPORT**: reached by the attendee cascade (FR-982) and included in the attendee
 * export (FR-981) — an assignment is data *about the attendee who holds it*, unlike `operators`
 * and `admin_audit_entries`, which are not attendee data at all and are declared so.
 */
export const organizerAssignments = pgTable(
  'organizer_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * **CASCADE**, because an attendee's erasure must take their authority with it (FR-960,
     * decision 39: *authority must not outlive the access it depends on*).
     *
     * Deliberately unconditional. Decision 12 holds absolutely and no administrative role may
     * make an attendee's erasure right depend on another person existing — so deletion is never
     * refused, never warned about, and never gated on "this conference would have no organizer".
     * The conference simply enters the derived `unassigned` state, which platform operators can
     * see (FR-936).
     */
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **`NO ACTION`, AND THE ABSENCE OF A CASCADE IS A REQUIREMENT** (FR-937, FR-938, FR-939).
     *
     * A surviving assignment **refuses `DELETE FROM events`**, so the seed must name organizer
     * assignments among the things it clears (T125). That is not an inconvenience to be
     * engineered around; it is the mechanism.
     *
     * The reason a cascade is wrong is stated in FR-939 and is worth repeating in place: **a
     * cascade is not an administrative write, so `admin_audit_entries` would not record it.** A
     * re-seed in a deployed environment would silently strip every organizer's authority with no
     * trace, and the first anyone would know is an operator finding they could no longer act.
     *
     * This mirrors `shared_cards.event_id` exactly, and the constitution predicted this feature
     * would meet it — *"The next feature with a non-cascading reference to seeded content will
     * meet this."* 008 records that a surviving card breaks the re-seed "with an error naming
     * neither table", which is why T117 asserts the failure **names organizer assignments**.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),

    /**
     * The platform operator who granted this (FR-933). `NO ACTION` for the reason `operators`'
     * own header gives: an operator is deactivated rather than deleted, precisely so that
     * records naming them keep resolving (FR-909).
     */
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => operators.id),

    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Demotion (FR-934) and the two lifecycle revocations (FR-960, FR-961).
     *
     * A revoked row is **history, not a deletion**: it records that authority was held and then
     * ended, which is what an audit trail explaining a promotion needs to stay coherent against.
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    /**
     * **One LIVE assignment per person per conference** — a partial unique index, following
     * 008's `appointments_live_claim_per_proposer_slot` exactly.
     *
     * A plain unique on `(attendee_id, event_id)` would be wrong in a way that only appears
     * later: somebody demoted and then promoted again for the same conference is an entirely
     * ordinary sequence, and a full unique constraint would refuse the second promotion because
     * of a revoked row that is meant to be history. The constraint has to stop applying the
     * moment the row stops being live, which a plain unique cannot express.
     */
    uniqueIndex('organizer_assignments_live_per_attendee_event')
      .on(table.attendeeId, table.eventId)
      .where(sql`${table.revokedAt} is null`),

    // The two reads: "which conferences may this person act on" and "who organizes this
    // conference / is it unassigned". Postgres creates no index for a foreign key.
    index('organizer_assignments_attendee_idx').on(table.attendeeId),
    index('organizer_assignments_event_idx').on(table.eventId),
    // `assigned_by` is `ON DELETE NO ACTION`, which is the reference that **blocks**: removing an
    // operator row has to prove no assignment names it, and without an index that proof is a
    // sequential scan. The seed clears this table for exactly that reason, so the check is not
    // hypothetical — it runs on every re-seed and on every operator sweep.
    index('organizer_assignments_assigned_by_idx').on(table.assignedBy),
  ],
)

export type OrganizerAssignment = typeof organizerAssignments.$inferSelect
export type NewOrganizerAssignment = typeof organizerAssignments.$inferInsert
