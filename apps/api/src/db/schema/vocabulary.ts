import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { check } from 'drizzle-orm/pg-core'

import { PROFILE_LIMITS } from './profiles.js'

/**
 * T112 (014 tranche 2) — the product-wide controlled vocabulary: sectors, subsectors and
 * networking-interest options (FR-1085).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: PRODUCT-WIDE (CROSS-EVENT), FOR EVERY TABLE IN THIS FILE — and the reason is
 * stated rather than inherited** (standing decision 7): a profile describes the person rather
 * than their presence at one conference, so a per-conference vocabulary would make somebody's
 * sector reset when they switch events — the same argument that already puts the profile
 * itself on the cross-event side.
 *
 * **REFERENCE DATA, NOT ATTENDEE DATA** (FR-1085a). These tables name no attendee, cascade
 * from no attendee, and appear in no personal-data export — each carries a `NOT_ATTENDEE_DATA`
 * and `NOT_EXPORTED` entry with this reason, in the shape both coverage guards demand. An
 * attendee's *chosen* sector, subsector and interests are attendee data and live on
 * `attendee_profiles` and `attendee_interests`, which is the other side of that line.
 *
 * **A NEW FILE, DELIBERATELY — NOT `profiles.ts`** (R17). `profiles.ts` declares, for both
 * tables in it, `ON DELETE CASCADE` from `attendees` and export coverage of every column;
 * both are untrue of reference data, so a vocabulary table landing there would make a shipped
 * header false the day it landed. Naming it as reference data rather than a profile surface is
 * also FR-1093a's rule — a path is a promise, and so is a file name.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Authored at platform tier only** (FR-1089): a conference organizer's authority is
 * per-conference, and this is product-wide data no conference owns. **No administrative act
 * writes to any attendee's record through these tables** (FR-1093, FR-1094): membership is
 * enforced at the profile write against the label, never by a foreign key from an attendee
 * table — the interest list ships empty, so on day one there is nothing to reference, and the
 * mapping migration a foreign key would need is the very act FR-1093 forbids (R18).
 *
 * **`retired_at` is the one permitted withdrawal mechanism, and it is not a lifecycle**
 * (FR-1094, FR-1094b). A value is choosable from the moment it exists; setting `retired_at`
 * withdraws it from *future* choice and does nothing else — holders keep it, it keeps
 * displaying, it keeps ranking, and no attendee record is written. Clearing `retired_at`
 * reverses that with no repair, because it never wrote anywhere. Renaming a held value is
 * refused at the write path (FR-1094c); retire-plus-create is the offered alternative.
 *
 * **Ordering is authored, not imposed**: reads present values in creation order (`created_at`,
 * then `id` for stability), so the chooser does not shuffle between reads and no ordering rule
 * is invented by the product.
 */

/**
 * A sector — the top of the taxonomy. Seeded with exactly the client's four (FR-1086):
 * Servicios, Comercio, Industria, Agro. Further values are authored at platform tier.
 */
export const sectors = pgTable(
  'vocabulary_sectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: text('label').notNull().unique(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Bounded by the same constant that bounds the profile column a chosen sector is stored
    // in, so an operator can never author a value no attendee can store (R18's rule).
    check(
      'vocabulary_sectors_label_length',
      sql.raw(`(length("label") > 0 AND length("label") <= ${PROFILE_LIMITS.sector})`),
    ),
  ],
)

/**
 * A subsector. **Belongs to exactly one sector** (FR-1087) — the foreign key is the rule, and
 * an attendee's chosen subsector must belong to their chosen sector, enforced at the profile
 * write because it is a cross-row rule about the attendee's own record.
 *
 * Ships empty (FR-1086): the client's lists do not exist yet, and every surface reading this
 * renders an inviting empty condition rather than an error.
 */
export const subsectors = pgTable(
  'vocabulary_subsectors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id),
    label: text('label').notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Unique within its sector: two sectors may each have a "Logística" subsector, and those
    // are two different refinements — the same argument tracks make per-event.
    unique('vocabulary_subsectors_sector_label_unique').on(table.sectorId, table.label),
    index('vocabulary_subsectors_sector_id_idx').on(table.sectorId),
    check(
      'vocabulary_subsectors_label_length',
      sql.raw(`(length("label") > 0 AND length("label") <= ${PROFILE_LIMITS.subsector})`),
    ),
  ],
)

/**
 * A networking-interest option. Ships empty (FR-1086).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The label length is bounded by `PROFILE_LIMITS.interest`, and that is load-bearing** (R18):
 * a chosen interest is stored on `attendee_interests` as its label, whose column CHECK caps it
 * at that constant — so a longer label here would be a value an operator can author that no
 * attendee can select. Same constant, same place, so they cannot drift.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const interestOptions = pgTable(
  'vocabulary_interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: text('label').notNull().unique(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check(
      'vocabulary_interests_label_length',
      sql.raw(`(length("label") > 0 AND length("label") <= ${PROFILE_LIMITS.interest})`),
    ),
  ],
)

export type Sector = typeof sectors.$inferSelect
export type Subsector = typeof subsectors.$inferSelect
export type InterestOption = typeof interestOptions.$inferSelect
