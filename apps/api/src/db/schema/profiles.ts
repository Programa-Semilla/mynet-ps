import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { attendees } from './attendees.js'

/**
 * T008 (004) — the attendee's own description of themselves (FR-334–FR-342).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: CROSS-EVENT, FOR BOTH TABLES IN THIS FILE.**
 *
 * The constitution makes neither per-event nor cross-event a default that may be assumed, so
 * the reasoning is stated rather than inherited: a profile describes **the person**, not their
 * presence at one conference. A per-conference profile would mean a professional identity that
 * resets when the attendee switches events, which is not the product `requirements.md`
 * describes, and the hybrid rule (standing decision 7) puts person-level data on the
 * cross-event side alongside relationships.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A recorded consequence, so a later feature does not mistake it for a scoping rule.**
 *
 * These are cross-event rows **read through a per-event condition**: another attendee may read
 * this profile only from inside a conference they share with its owner (FR-357). That is a
 * *visibility* rule, not a partition. The row is not duplicated per conference and the event
 * in `GET /events/:eventId/attendees/:attendeeId` is an authorization predicate rather than a
 * partition key (research D5).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Deletion**: `ON DELETE CASCADE` from `attendees`, on both tables. That is the mechanism
 * behind FR-366, and it is schema-level precisely so a future deletion path cannot forget it.
 * **Export**: every column of both tables (FR-374), asserted structurally by the guard in
 * `tests/unit/export-coverage.test.ts` — a column added here without export coverage fails
 * that test by existing (FR-377).
 */

/** FR-337 — every free-text limit, in one place, so the route and the column cannot disagree. */
export const PROFILE_LIMITS = {
  company: 120,
  role: 120,
  headline: 200,
  interest: 60,
  /**
   * T114 (014 tranche 2) — the taxonomy fields' bounds (FR-1090). `sector` and `subsector`
   * bound the **vocabulary labels too** (`schema/vocabulary.ts` reads these constants), so an
   * operator can never author a value no attendee can store — the same single-constant rule
   * `interest` established for the interest options (R18).
   */
  sector: 120,
  subsector: 120,
  productiveActivity: 200,
  /**
   * How many interests one attendee may hold.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **This bound is NOT a column CHECK, and the reason is worth stating rather than leaving
   * as an apparent oversight.** data-model.md asks for count and length both bounded by
   * `CHECK`; PostgreSQL forbids a subquery in one, so a per-row constraint cannot see the set
   * it belongs to. The alternatives are a trigger — machinery this schema uses nowhere else,
   * invisible in the Drizzle schema, and therefore invisible to the two structural guards
   * that read it — or bounding the set where the set is written.
   *
   * It is bounded where it is written: `PUT /profile` carries whole-profile semantics, so the
   * interest set arrives complete in one request, is refused by `maxItems` at the route
   * schema, and is refused again in `queries/profiles.ts` before the write. The **length** of
   * each interest is still a column CHECK, because that one a per-row constraint can see.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  interestCount: 12,
} as const

/**
 * FR-339 — networking intent, chosen from stated options rather than typed.
 *
 * `requirements.md` describes intent and availability as *states* that Discover filters on,
 * and 006 cannot filter meaningfully on free text — which is the whole reason these are
 * constrained here rather than left as prose. They are **attendee-authored**: no seed process
 * and no other attendee may set them (FR-339, asserted by an integration test).
 */
export const NETWORKING_INTENTS = [
  'open_to_meetings',
  'open_to_messages',
  'not_networking',
] as const
export type NetworkingIntent = (typeof NETWORKING_INTENTS)[number]

export const AVAILABILITIES = ['available', 'busy'] as const
export type Availability = (typeof AVAILABILITIES)[number]

/** `a IS NULL OR length(a) BETWEEN 1 AND n` — "unset" therefore has exactly one representation. */
const boundedOptionalText = (column: string, max: number) =>
  sql.raw(`("${column}" IS NULL OR (length("${column}") > 0 AND length("${column}") <= ${max}))`)

const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`("${column}" IS NULL OR "${column}" IN (${values.map((v) => `'${v}'`).join(', ')}))`)

/**
 * One row per attendee, **created on first save rather than at sign-up**.
 *
 * An attendee who has written nothing has no row, so "empty profile" has exactly one
 * representation and `GET /profile` answers `200` with empty fields rather than `404` — "you
 * have not written one yet" is not an error (FR-341).
 *
 * Every field is optional (FR-336). The display name is the only required identity value and
 * it already exists on `attendees`; an incomplete profile is valid.
 */
export const attendeeProfiles = pgTable(
  'attendee_profiles',
  {
    attendeeId: uuid('attendee_id')
      .primaryKey()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    company: text('company'),
    role: text('role'),
    headline: text('headline'),

    /**
     * T114 (014 tranche 2) — the taxonomy fields (FR-1090): a sector and subsector chosen
     * from the product-wide controlled vocabulary, and a short free-text description of what
     * this person actually makes or does.
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * **ALL NULLABLE, AND THAT IS FR-336 HOLDING** (FR-1091, FR-1097): every field optional,
     * an incomplete profile valid, no capability gated on completeness. REQ-027's mandatory
     * completion at sign-up is explicitly NOT granted.
     *
     * **Stored as the chosen LABEL, not a reference** (R18's model, extended): vocabulary
     * membership — and FR-1087's subsector-belongs-to-chosen-sector rule — is enforced at
     * the profile write in `queries/profiles.ts`, where the choosable set is unioned with
     * what this attendee already holds (FR-1095b), so a held-but-retired value never blocks
     * an unrelated save. FR-1094c's refusal to rename a held value is what makes carrying
     * the label safe from divergence. No administrative tier can write any of these
     * (FR-1093): maintaining the vocabulary is permitted, correcting somebody's chosen
     * sector for them is not.
     *
     * **Attendee data**, like everything else in this table: cascades with the account,
     * exported with the profile, governed by the one visibility decision (FR-1097, FR-1098).
     * ═════════════════════════════════════════════════════════════════════════════════════
     */
    sector: text('sector'),
    subsector: text('subsector'),
    productiveActivity: text('productive_activity'),

    networkingIntent: text('networking_intent').$type<NetworkingIntent>(),
    availability: text('availability').$type<Availability>(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    /**
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **The limits are CHECK constraints, not only route schemas** (FR-337).
     *
     * `session_notes` set this precedent in 005 and the argument is unchanged: client-side
     * presentation of a limit is never the enforcement of it, and the column constrains
     * independently of the route that also enforces it precisely in case a second write path
     * ever appears. The editor surfaces each limit as it is approached (FR-337) and the route
     * refuses beyond it, so reaching one of these constraints means something bypassed both.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    check(
      'attendee_profiles_company_length',
      boundedOptionalText('company', PROFILE_LIMITS.company),
    ),
    check('attendee_profiles_role_length', boundedOptionalText('role', PROFILE_LIMITS.role)),
    check(
      'attendee_profiles_headline_length',
      boundedOptionalText('headline', PROFILE_LIMITS.headline),
    ),
    check('attendee_profiles_networking_intent', oneOf('networking_intent', NETWORKING_INTENTS)),
    check('attendee_profiles_availability', oneOf('availability', AVAILABILITIES)),
    check('attendee_profiles_sector_length', boundedOptionalText('sector', PROFILE_LIMITS.sector)),
    check(
      'attendee_profiles_subsector_length',
      boundedOptionalText('subsector', PROFILE_LIMITS.subsector),
    ),
    check(
      'attendee_profiles_productive_activity_length',
      boundedOptionalText('productive_activity', PROFILE_LIMITS.productiveActivity),
    ),
  ],
)

/**
 * The attendee's interests, one per row.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A table rather than an array column**, because 006 filters a directory on interests and a
 * join is what makes that an index scan rather than a sequential unnest of every attendee.
 *
 * **T118 (014 tranche 2)** — this comment used to assert, as current fact, that interests are
 * *"a bounded list of short free-text values, not a controlled vocabulary"*, because *"a fixed
 * taxonomy would be an organizer-authored artifact, and Principle III puts that out of
 * scope"*. **That premise was reversed by constitution v4.0.0**, and v5.3.0's tranche delivers
 * the vocabulary (FR-1088) — so the sentence is rewritten rather than left to be quietly
 * contradicted, because in this codebase the comment is the record.
 *
 * What holds now: a **new** interest is chosen from the product-wide vocabulary in
 * `schema/vocabulary.ts` (authored at platform tier), while every value an attendee already
 * holds — retained free text from before the change, and retired vocabulary values alike — is
 * **kept, displayed, ranked and re-acceptable on their own writes** (FR-1095, FR-1095b).
 * Membership is enforced at the write in `queries/profiles.ts`, never by a foreign key: the
 * vocabulary ships empty, so on day one there is nothing to reference, and the mapping
 * migration a foreign key would need is an administrative write to attendee records, which
 * FR-1093 forbids (R18). **This table is otherwise untouched** — same text column, same
 * composite primary key, same index, same length CHECK.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const attendeeInterests = pgTable(
  'attendee_interests',
  {
    attendeeId: uuid('attendee_id')
      .notNull()
      .references(() => attendees.id, { onDelete: 'cascade' }),

    interest: text('interest').notNull(),
  },
  (table) => [
    /**
     * **Idempotent by construction** — adding the same interest twice cannot produce a second
     * row. The same argument `saved_sessions` makes: the address *is* the pairing, so
     * duplication is impossible rather than merely prevented by a handler that remembers to
     * check.
     */
    primaryKey({ columns: [table.attendeeId, table.interest] }),

    /**
     * T015 (006) — the interest filter, and the overlap join that computes the ranking.
     *
     * The primary key above leads with `attendee_id`, which serves "this attendee's interests"
     * — every read 004 makes. 006 reads the other way: *which attendees hold this interest*,
     * both for the `interest` filter and for the `LEFT JOIN` that counts overlap with the
     * reader's own set (research D12). A composite index cannot serve a search on its second
     * column, so this is the index that turns the ranking join into a scan of matching rows
     * rather than of the whole table. It is the collection on 004's own note above, which
     * records that this is a table rather than an array column precisely so 006 could index it.
     */
    index('attendee_interests_interest_idx').on(table.interest),

    // Length only. The count bound lives where the set is written — see PROFILE_LIMITS above
    // for why a per-row CHECK cannot express it.
    check(
      'attendee_interests_length',
      sql.raw(`(length("interest") > 0 AND length("interest") <= ${PROFILE_LIMITS.interest})`),
    ),
  ],
)

export type AttendeeProfile = typeof attendeeProfiles.$inferSelect
export type AttendeeInterest = typeof attendeeInterests.$inferSelect
