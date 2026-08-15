import { asc, eq, sql } from 'drizzle-orm'

import { assertVerifiedOperator, type PlatformScope } from '../../admin/scope.js'
import { getDb } from '../client.js'
import { interestOptions, sectors, subsectors } from '../schema/vocabulary.js'
import { appendAuditEntry } from './admin-audit.js'

/**
 * T172, T173, T175 (014 tranche 2) — **authoring the product-wide vocabulary: sectors,
 * subsectors and networking-interest options** (FR-1085, FR-1089, FR-1089a, FR-1094, FR-1094a,
 * FR-1094b, FR-1094c).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EVERY FUNCTION HERE TAKES A `PlatformScope`, NEVER AN `OperatorScope` AND NEVER A BARE
 * STRING** (FR-1089, R20).
 *
 * The vocabulary is product-wide reference data no conference owns, so a conference organizer —
 * whose authority reaches only the conferences they are assigned (decision 32) — may not touch
 * it. `requireConferenceAuthority` cannot express that: it reads `:eventId` from the path and
 * refuses without one, because its whole predicate is per-conference. `requirePlatformOperator`
 * is the guard, and demanding its branded output here means a handler that skipped it cannot
 * call anything in this file — it does not compile.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **NO FUNCTION IN THIS MODULE WRITES TO ANY ATTENDEE RECORD, AND THE ONE READ IT MAKES OF ONE
 * ANSWERS YES OR NO** (FR-1093, FR-1094, FR-1099b).
 *
 * Retiring a value withdraws it from *future* choice by stamping `retired_at` on the value's own
 * row — holders keep it, it keeps displaying, it keeps ranking, and un-retiring needs no repair
 * because nothing was ever written anywhere else (FR-1094, FR-1094b). Renaming or deleting a
 * value attendees hold is **refused**: a rename would change what every holder's profile asserts
 * about them without writing to any attendee record, which is FR-1093's forbidden outcome by a
 * route that looks like editing content (FR-1094c), and a deletion would erase part of what they
 * said about themselves (FR-1094).
 *
 * The holder check behind both refusals is an `EXISTS` against the label — a SELECT, which the
 * FR-1093 guard permits (a `WHERE` is not a `SELECT` of an identity, D14's narrowing) — and it
 * deliberately answers **existence, never a count and never a name**. "How many attendees are in
 * Servicios" is a per-value census, which FR-1099b forbids the administrative product from ever
 * answering; the refusals say *that* attendees hold the value and stop there.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **EVERY WRITE TAKES A REQUIRED `tx` AND APPENDS ITS AUDIT ENTRY INSIDE IT** (FR-1089a,
 * FR-994's rule). `admin-catalog.ts` carries the full argument — 013 shipped `appendAuditEntry`
 * with an executor no caller passed, and a failing entry left the act committed and unrecorded —
 * and `authoring-audit-transactional.test.ts` audits this module's call sites alongside the
 * catalog's. The `tx` is required, not defaulted, so the unsafe call is not the shorter one.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** A transaction. Required by every write here — see the header. */
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

/**
 * Why a vocabulary write was refused. Its own union rather than `admin-catalog.ts`'s
 * `WriteRefusal`, because the two modules answer to different guards and none of these refusals
 * means anything on a conference's content — and every value maps to its own `ErrorCode` at the
 * route, never to a shared one (this feature's recorded lesson, twice over).
 */
export type VocabularyRefusal =
  | 'not-found'
  /** The label already names a value in this list (or in this sector, for a subsector). */
  | 'label-taken'
  /** FR-1094c — attendees hold this value, so its wording may not be changed under them. */
  | 'rename-held'
  /** FR-1094 — attendees hold this value, so it may be retired and not deleted. */
  | 'delete-held'
  /** FR-1087 — a new subsector under a retired sector: not on offer, so not refinable. */
  | 'sector-retired'
  /** A sector still refined by subsectors. Move or delete those first. */
  | 'sector-has-subsectors'

export type VocabularyResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: VocabularyRefusal }

const refused = <T>(refusal: VocabularyRefusal): VocabularyResult<T> => ({ ok: false, refusal })
const ok = <T>(value: T): VocabularyResult<T> => ({ ok: true, value })

/** The three lists, named once so subject kinds in the audit trail cannot drift. */
export type VocabularyKind = 'sector' | 'subsector' | 'interest'

export interface VocabularyRow {
  readonly id: string
  readonly label: string
  readonly retiredAt: Date | null
}

export interface SubsectorRow extends VocabularyRow {
  readonly sectorId: string
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Reads. Creation order (`created_at`, then `id` for stability), so the list does not shuffle
// between reads and the product imposes no ordering of its own — the schema's stated rule.
// Retired values are LISTED here: the administrative screen is where retirement is reversed, so
// hiding a retired value would make un-retiring unreachable. The attendee-side read in
// `vocabulary.ts` is the one that offers only the choosable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const listSectors = async (unverified: PlatformScope): Promise<VocabularyRow[]> => {
  assertVerifiedOperator(unverified)
  return getDb()
    .select({ id: sectors.id, label: sectors.label, retiredAt: sectors.retiredAt })
    .from(sectors)
    .orderBy(asc(sectors.createdAt), asc(sectors.id))
}

export const listSubsectors = async (unverified: PlatformScope): Promise<SubsectorRow[]> => {
  assertVerifiedOperator(unverified)
  return getDb()
    .select({
      id: subsectors.id,
      sectorId: subsectors.sectorId,
      label: subsectors.label,
      retiredAt: subsectors.retiredAt,
    })
    .from(subsectors)
    .orderBy(asc(subsectors.createdAt), asc(subsectors.id))
}

export const listInterestOptions = async (unverified: PlatformScope): Promise<VocabularyRow[]> => {
  assertVerifiedOperator(unverified)
  return getDb()
    .select({
      id: interestOptions.id,
      label: interestOptions.label,
      retiredAt: interestOptions.retiredAt,
    })
    .from(interestOptions)
    .orderBy(asc(interestOptions.createdAt), asc(interestOptions.id))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The holder checks (FR-1094, FR-1094c) — existence only, per the header.
//
// A subsector is held by its (sector, subsector) label PAIR, not by its label alone: two sectors
// may each carry a "Logística", and those are two different refinements. An attendee whose row
// says (Servicios, Logística) holds Servicios' subsector and nobody else's.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const sectorHeld = async (tx: Tx, label: string): Promise<boolean> => {
  const rows = await tx.execute<{ held: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM attendee_profiles WHERE sector = ${label}) AS held
  `)
  return rows[0]?.held === true
}

const subsectorHeld = async (tx: Tx, sectorLabel: string, label: string): Promise<boolean> => {
  const rows = await tx.execute<{ held: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM attendee_profiles WHERE sector = ${sectorLabel} AND subsector = ${label}
    ) AS held
  `)
  return rows[0]?.held === true
}

const interestHeld = async (tx: Tx, label: string): Promise<boolean> => {
  const rows = await tx.execute<{ held: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM attendee_interests WHERE interest = ${label}) AS held
  `)
  return rows[0]?.held === true
}

/** The audit entry every act here writes, inside the act's own transaction (FR-1089a). */
const recordVocabularyAct = async (
  scope: PlatformScope,
  action: 'write_vocabulary' | 'retire_vocabulary_value' | 'delete_vocabulary_value',
  resourceId: string,
  kind: VocabularyKind,
  tx: Tx,
): Promise<void> => {
  await appendAuditEntry(
    {
      operatorId: scope.operatorId,
      action,
      subjectResourceId: resourceId,
      subjectKind: kind,
      // No `subjectEventId`: the vocabulary is product-wide (FR-1085), so there is no
      // conference to name — the same absence 013's six platform-tier acts carry by nature.
    },
    tx,
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sectors.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const createSector = async (
  unverified: PlatformScope,
  label: string,
  tx: Tx,
): Promise<VocabularyResult<{ id: string }>> => {
  const scope = assertVerifiedOperator(unverified)

  // The unique constraint decides; `DO NOTHING` turns the violation into zero rows rather than
  // a thrown driver error — `resolveReport`'s pattern, so the conflict stays a domain outcome.
  const [row] = await tx
    .insert(sectors)
    .values({ label })
    .onConflictDoNothing({ target: sectors.label })
    .returning({ id: sectors.id })

  if (!row) return refused('label-taken')
  await recordVocabularyAct(scope, 'write_vocabulary', row.id, 'sector', tx)
  return ok(row)
}

export const renameSector = async (
  unverified: PlatformScope,
  id: string,
  label: string,
  tx: Tx,
): Promise<VocabularyResult<{ id: string }>> => {
  const scope = assertVerifiedOperator(unverified)

  const [existing] = await tx
    .select({ id: sectors.id, label: sectors.label })
    .from(sectors)
    .where(eq(sectors.id, id))
    .limit(1)
  if (!existing) return refused('not-found')

  // FR-1094c — the refusal, checked against the CURRENT label: the thing being protected is
  // what holders' profiles currently assert. Correcting spelling in a value nobody holds stays
  // permitted, which is the asymmetry's other half.
  if (await sectorHeld(tx, existing.label)) return refused('rename-held')

  const [row] = await tx
    .update(sectors)
    .set({ label })
    .where(eq(sectors.id, id))
    .returning({ id: sectors.id })
    .catch((error: unknown) => {
      // The unique constraint on the new label. Postgres names it 23505; anything else is a
      // genuine fault and rethrows.
      if ((error as { code?: string }).code === '23505') return []
      throw error
    })

  if (!row) return refused('label-taken')
  await recordVocabularyAct(scope, 'write_vocabulary', row.id, 'sector', tx)
  return ok(row)
}

/**
 * Retires or un-retires a sector (FR-1094, FR-1094b). One function for both directions because
 * they are one act reversed: a stamp set or cleared on the value's own row, writing nowhere
 * else. Idempotent — retiring the retired re-stamps nothing observable — and recorded either
 * way, because reversing an act is itself an act the trail must answer for.
 */
export const setSectorRetired = async (
  unverified: PlatformScope,
  id: string,
  retired: boolean,
  tx: Tx,
): Promise<VocabularyResult<null>> => {
  const scope = assertVerifiedOperator(unverified)

  const [row] = await tx
    .update(sectors)
    .set({ retiredAt: retired ? sql`coalesce(${sectors.retiredAt}, now())` : null })
    .where(eq(sectors.id, id))
    .returning({ id: sectors.id })

  if (!row) return refused('not-found')
  await recordVocabularyAct(scope, 'retire_vocabulary_value', row.id, 'sector', tx)
  return ok(null)
}

export const deleteSector = async (
  unverified: PlatformScope,
  id: string,
  tx: Tx,
): Promise<VocabularyResult<null>> => {
  const scope = assertVerifiedOperator(unverified)

  const [existing] = await tx
    .select({ id: sectors.id, label: sectors.label })
    .from(sectors)
    .where(eq(sectors.id, id))
    .limit(1)
  if (!existing) return refused('not-found')

  // Refined sectors are protected the way a referenced track is (FR-1017's shape): the foreign
  // key would refuse this too, as a 500 naming a constraint, which is a refusal the operator
  // cannot act on.
  const [refining] = await tx
    .select({ id: subsectors.id })
    .from(subsectors)
    .where(eq(subsectors.sectorId, id))
    .limit(1)
  if (refining) return refused('sector-has-subsectors')

  // FR-1094 — deletion is available only while nobody holds the value; retirement is the
  // mechanism for everything else, because it writes to no attendee record.
  if (await sectorHeld(tx, existing.label)) return refused('delete-held')

  await tx.delete(sectors).where(eq(sectors.id, id))
  await recordVocabularyAct(scope, 'delete_vocabulary_value', id, 'sector', tx)
  return ok(null)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Subsectors. Everything above, plus FR-1087: every subsector belongs to exactly one sector,
// and a new one may only refine a sector that is itself still on offer.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const createSubsector = async (
  unverified: PlatformScope,
  input: { sectorId: string; label: string },
  tx: Tx,
): Promise<VocabularyResult<{ id: string }>> => {
  const scope = assertVerifiedOperator(unverified)

  const [parent] = await tx
    .select({ id: sectors.id, retiredAt: sectors.retiredAt })
    .from(sectors)
    .where(eq(sectors.id, input.sectorId))
    .limit(1)
  if (!parent) return refused('not-found')
  // A retired sector is not on offer as a new choice (FR-1094a), so a new refinement of it
  // would be a value nobody could ever legitimately select alongside its own sector.
  if (parent.retiredAt !== null) return refused('sector-retired')

  const [row] = await tx
    .insert(subsectors)
    .values({ sectorId: input.sectorId, label: input.label })
    .onConflictDoNothing()
    .returning({ id: subsectors.id })

  if (!row) return refused('label-taken')
  await recordVocabularyAct(scope, 'write_vocabulary', row.id, 'subsector', tx)
  return ok(row)
}

export const renameSubsector = async (
  unverified: PlatformScope,
  id: string,
  label: string,
  tx: Tx,
): Promise<VocabularyResult<{ id: string }>> => {
  const scope = assertVerifiedOperator(unverified)

  const [existing] = await tx
    .select({ id: subsectors.id, label: subsectors.label, sectorLabel: sectors.label })
    .from(subsectors)
    .innerJoin(sectors, eq(sectors.id, subsectors.sectorId))
    .where(eq(subsectors.id, id))
    .limit(1)
  if (!existing) return refused('not-found')

  if (await subsectorHeld(tx, existing.sectorLabel, existing.label)) {
    return refused('rename-held')
  }

  const [row] = await tx
    .update(subsectors)
    .set({ label })
    .where(eq(subsectors.id, id))
    .returning({ id: subsectors.id })
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505') return []
      throw error
    })

  if (!row) return refused('label-taken')
  await recordVocabularyAct(scope, 'write_vocabulary', row.id, 'subsector', tx)
  return ok(row)
}

export const setSubsectorRetired = async (
  unverified: PlatformScope,
  id: string,
  retired: boolean,
  tx: Tx,
): Promise<VocabularyResult<null>> => {
  const scope = assertVerifiedOperator(unverified)

  const [row] = await tx
    .update(subsectors)
    .set({ retiredAt: retired ? sql`coalesce(${subsectors.retiredAt}, now())` : null })
    .where(eq(subsectors.id, id))
    .returning({ id: subsectors.id })

  if (!row) return refused('not-found')
  await recordVocabularyAct(scope, 'retire_vocabulary_value', row.id, 'subsector', tx)
  return ok(null)
}

export const deleteSubsector = async (
  unverified: PlatformScope,
  id: string,
  tx: Tx,
): Promise<VocabularyResult<null>> => {
  const scope = assertVerifiedOperator(unverified)

  const [existing] = await tx
    .select({ id: subsectors.id, label: subsectors.label, sectorLabel: sectors.label })
    .from(subsectors)
    .innerJoin(sectors, eq(sectors.id, subsectors.sectorId))
    .where(eq(subsectors.id, id))
    .limit(1)
  if (!existing) return refused('not-found')

  if (await subsectorHeld(tx, existing.sectorLabel, existing.label)) {
    return refused('delete-held')
  }

  await tx.delete(subsectors).where(eq(subsectors.id, id))
  await recordVocabularyAct(scope, 'delete_vocabulary_value', id, 'subsector', tx)
  return ok(null)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Interest options.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const createInterestOption = async (
  unverified: PlatformScope,
  label: string,
  tx: Tx,
): Promise<VocabularyResult<{ id: string }>> => {
  const scope = assertVerifiedOperator(unverified)

  const [row] = await tx
    .insert(interestOptions)
    .values({ label })
    .onConflictDoNothing({ target: interestOptions.label })
    .returning({ id: interestOptions.id })

  if (!row) return refused('label-taken')
  await recordVocabularyAct(scope, 'write_vocabulary', row.id, 'interest', tx)
  return ok(row)
}

export const renameInterestOption = async (
  unverified: PlatformScope,
  id: string,
  label: string,
  tx: Tx,
): Promise<VocabularyResult<{ id: string }>> => {
  const scope = assertVerifiedOperator(unverified)

  const [existing] = await tx
    .select({ id: interestOptions.id, label: interestOptions.label })
    .from(interestOptions)
    .where(eq(interestOptions.id, id))
    .limit(1)
  if (!existing) return refused('not-found')

  // The label-match here is what protects a retained free-text value too: an attendee who wrote
  // "Fintech" before the vocabulary listed it holds the label, and renaming the option would
  // put a choosable value and their held one out of step (FR-1094c, FR-1095).
  if (await interestHeld(tx, existing.label)) return refused('rename-held')

  const [row] = await tx
    .update(interestOptions)
    .set({ label })
    .where(eq(interestOptions.id, id))
    .returning({ id: interestOptions.id })
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === '23505') return []
      throw error
    })

  if (!row) return refused('label-taken')
  await recordVocabularyAct(scope, 'write_vocabulary', row.id, 'interest', tx)
  return ok(row)
}

export const setInterestOptionRetired = async (
  unverified: PlatformScope,
  id: string,
  retired: boolean,
  tx: Tx,
): Promise<VocabularyResult<null>> => {
  const scope = assertVerifiedOperator(unverified)

  const [row] = await tx
    .update(interestOptions)
    .set({ retiredAt: retired ? sql`coalesce(${interestOptions.retiredAt}, now())` : null })
    .where(eq(interestOptions.id, id))
    .returning({ id: interestOptions.id })

  if (!row) return refused('not-found')
  await recordVocabularyAct(scope, 'retire_vocabulary_value', row.id, 'interest', tx)
  return ok(null)
}

export const deleteInterestOption = async (
  unverified: PlatformScope,
  id: string,
  tx: Tx,
): Promise<VocabularyResult<null>> => {
  const scope = assertVerifiedOperator(unverified)

  const [existing] = await tx
    .select({ id: interestOptions.id, label: interestOptions.label })
    .from(interestOptions)
    .where(eq(interestOptions.id, id))
    .limit(1)
  if (!existing) return refused('not-found')

  if (await interestHeld(tx, existing.label)) return refused('delete-held')

  await tx.delete(interestOptions).where(eq(interestOptions.id, id))
  await recordVocabularyAct(scope, 'delete_vocabulary_value', id, 'interest', tx)
  return ok(null)
}
