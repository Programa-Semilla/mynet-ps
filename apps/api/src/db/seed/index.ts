import { loadConfig } from '../../config.js'
import type { Database } from '../client.js'
import { closeDb, getDb } from '../client.js'
import { attendeeSeed, SEED_ATTENDEES, SEED_PASSWORD } from './attendees.js'
import { catalogSeed } from './catalog.js'
import { conversationSeed } from './conversations.js'
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
export const SEED_MODULES: readonly SeedModule[] = [
  attendeeSeed,
  eventSeed,
  catalogSeed,
  // 007 — one conversation between the two seeded accounts, appended **last** because it
  // references attendees and must therefore be cleared before them. See `conversations.ts` for
  // why this is the first attendee-authored content the product seeds, and why it is one
  // conversation rather than several.
  conversationSeed,
]

/**
 * T069b (006) — **the seed refuses to run against anything but a development database**
 * (FR-485, and 001's FR-067 carried forward by v3.0.0).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS GUARD DID NOT EXIST, AND THE FILE HEADER'S CLAIM WAS THEREFORE A HOPE.**
 *
 * The header above has said since 002 that the seed "never runs against an environment holding
 * real attendee data". Nothing enforced it. `seed()` begins by calling every module's `clear`,
 * and `attendeeSeed.clear` is `DELETE FROM attendees` — which cascades to profiles, interests,
 * registrations, saved sessions, notes, tokens and sessions. One `pnpm db:seed` against a
 * deployed environment destroys **every account on it**, in about a second, with no
 * confirmation and no way back except a restore.
 *
 * 006 is the feature that makes that reachable: before it there was nowhere to point a
 * `DATABASE_URL` but a developer's machine. UAT is a real, publicly reachable environment
 * carrying realistically-shaped attendee data, and the specification's own Assumptions say the
 * seeded conference content is used there — so the seed must be *possible* on UAT and must be
 * *impossible by accident*.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The rule, in one sentence: **a non-development environment must name the database it intends
 * to destroy.** An operator seeding UAT for the first time sets
 * `SEED_TARGET_DATABASE=mynet_uat`; a shell that has a deployed `DATABASE_URL` in it for any
 * other reason refuses.
 *
 * The error names the **resolved host and database**, because "refused" is not actionable and
 * "you are pointed at `mynet_prod` on `10.0.0.4`" is.
 */
export const SEED_TARGET_ENV_VAR = 'SEED_TARGET_DATABASE'

/**
 * Database names that belong to a deployed environment, wherever they are reached from.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE GUARD KEYS ON THE TARGET, NOT ON `NODE_ENV` — AND THAT IS THE WHOLE POINT.**
 *
 * It used to return early whenever `config.isDeployed` was false, which is a statement about
 * *the shell the script runs in* rather than about *the database it is pointed at*. `pnpm
 * db:seed` sets no `NODE_ENV`, so it always resolved to `development` and the guard never fired
 * on an operator's own machine — the only machine from which the accident is reachable.
 *
 * And the accident is a **documented, supported workflow**: `deploy/vm/README.md` section 4
 * tells an operator to reach the loopback-only database with
 * `ssh -L 15432:127.0.0.1:5432 …`. That connection presents as `localhost:15432/mynet_prod`,
 * so the host half looks entirely local and only the **database name** can carry the refusal.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Kept in step with `deploy/vm/envs/*.env` by hand. A name added there and not here is a name
 * this guard will not protect, which is why the list is short and stated rather than derived.
 */
const DEPLOYED_DATABASES = ['mynet_uat', 'mynet_prod'] as const

export const assertSeedableTarget = (): void => {
  const config = loadConfig()
  const { host, database } = describeTarget(config.databaseUrl)

  const deployedTarget = (DEPLOYED_DATABASES as readonly string[]).includes(database)
  if (!config.isDeployed && !deployedTarget) return

  const declared = process.env[SEED_TARGET_ENV_VAR]?.trim()

  if (declared && declared === database) return

  throw new Error(
    `Refusing to seed: this points at a DEPLOYED database.\n` +
      `  NODE_ENV:        ${config.nodeEnv}\n` +
      `  resolved target: database "${database}" on host "${host}"\n\n` +
      'The seed DELETES EVERY ATTENDEE before inserting — including their profiles, saved\n' +
      'sessions, notes, registrations and sessions, by cascade. On an environment carrying real\n' +
      'or realistically-shaped attendee data that is unrecoverable without a restore (FR-485).\n\n' +
      'Note that a LOCAL-looking host is not evidence of a local database: an SSH tunnel to a\n' +
      'deployed VM (README section 4) presents as localhost. The database NAME is what decides.\n\n' +
      `If you genuinely mean to, name the database:\n` +
      `  ${SEED_TARGET_ENV_VAR}=${database} pnpm db:seed\n`,
  )
}

/**
 * Host and database name from a connection string, **without the credentials**.
 *
 * Parsed rather than pattern-matched so a URL-encoded password containing an `@` cannot shift
 * the host. Falls back to placeholders rather than throwing: this runs on the refusal path, and
 * a guard that crashed on a malformed URL would report a parse error instead of a refusal.
 */
const describeTarget = (databaseUrl: string): { host: string; database: string } => {
  try {
    const url = new URL(databaseUrl)
    return {
      host: url.hostname || '<no host>',
      database: url.pathname.replace(/^\//, '') || '<no database>',
    }
  } catch {
    return { host: '<unparseable DATABASE_URL>', database: '<unparseable DATABASE_URL>' }
  }
}

export const seed = async (): Promise<void> => {
  // Before `getDb()`, so a refusal opens no connection at all.
  assertSeedableTarget()

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
