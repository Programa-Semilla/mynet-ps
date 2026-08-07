import type { Database } from '../client.js'
import { closeDb, getDb } from '../client.js'
import { attendeeSeed, SEED_ATTENDEES, SEED_PASSWORD } from './attendees.js'
import { catalogSeed } from './catalog.js'
import { eventSeed } from './events.js'

/**
 * T003 (002) — the seed registry, replacing the single `db/seed.ts` (FR-182).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ORDER OF `SEED_MODULES` IS LOAD-BEARING, AND IS DECLARED RATHER THAN DISCOVERED.**
 *
 * Foreign keys mean a module can only run once the rows it references exist, and can only be
 * cleared before them. So the registry is walked **forwards to insert and backwards to
 * delete**. A module appended in the wrong position fails on a constraint, which is the
 * intended outcome — a seed that silently produced a partial fixture would surface much later
 * as a test passing for the wrong reason.
 *
 * A feature adding seeded content appends its module here and writes its own file. It does not
 * edit another feature's module (constitution: extension points are append-only registries).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * This never runs against an environment holding real attendee data. It is for local
 * development and per-PR preview branches only (data-model.md, Seed data).
 */

/**
 * What each module records for the ones after it.
 *
 * Keyed by natural name — email for an attendee, name for an event — rather than by insertion
 * position, so that adding a row cannot silently re-point an existing reference.
 */
export interface SeedContext {
  /** Email → attendee id. */
  readonly attendeeIds: Map<string, string>
  /** Event name → event id. */
  readonly eventIds: Map<string, string>
  /**
   * Event name → its first day and venue zone.
   *
   * The catalog authors sessions in venue-local terms — "day 2, 09:30" — and needs both to
   * resolve them to the absolute instants FR-124 requires.
   */
  readonly eventDates: Map<string, { startsOn: string; timezone: string }>
}

export interface SeedModule {
  readonly name: string
  /** Delete this module's rows. Called in **reverse** registry order. */
  clear(db: Database): Promise<void>
  /** Insert this module's rows. Called in registry order; may read earlier modules' output. */
  run(db: Database, context: SeedContext): Promise<void>
}

/** Insert order. Reverse is delete order. Append only. */
export const SEED_MODULES: readonly SeedModule[] = [attendeeSeed, eventSeed, catalogSeed]

export const seed = async (): Promise<void> => {
  const db = getDb()

  const context: SeedContext = {
    attendeeIds: new Map(),
    eventIds: new Map(),
    eventDates: new Map(),
  }

  // Idempotent: re-seeding a local database is routine, and failing on the second run would
  // make quickstart.md's Setup section wrong.
  for (const module of [...SEED_MODULES].reverse()) {
    await module.clear(db)
  }

  for (const module of SEED_MODULES) {
    await module.run(db, context)
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  try {
    await seed()
    console.warn(
      `Seeded ${SEED_ATTENDEES.length} attendees with different registrations.\n` +
        SEED_ATTENDEES.map((a) => `  ${a.email} / ${SEED_PASSWORD}`).join('\n'),
    )
  } catch (error) {
    console.error('Seed failed:', error)
    process.exitCode = 1
  } finally {
    await closeDb()
  }
}
