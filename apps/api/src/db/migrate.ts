/**
 * T025 — the migration runner, wired to `pnpm db:migrate`.
 *
 * Applies every committed migration in order (FR-037). This is the only path by which a
 * schema change reaches any database — local, preview, or production. `drizzle-kit push` is
 * prohibited everywhere precisely so that local and production schemas are reached the same
 * reviewed way (research.md D6).
 */
import { fileURLToPath, URL } from 'node:url'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { loadConfig } from '../config.js'
import { closeDb } from './client.js'

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **HOW LONG A MIGRATION MAY WAIT FOR A LOCK BEFORE GIVING UP.**
 *
 * `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` takes a `SHARE ROW EXCLUSIVE` lock on **both**
 * tables, and `ALTER TABLE … ADD COLUMN` with a volatile default rewrites the table under an
 * `ACCESS EXCLUSIVE` one. Without a timeout, either statement **queues behind an open transaction
 * and then blocks every subsequent query on that table** — including reads, because a pending
 * `ACCESS EXCLUSIVE` request stops new lock acquisitions from jumping the queue. A migration that
 * waits is not the failure; a migration that waits *silently while the product stops answering*
 * is.
 *
 * Ten seconds — expressed in milliseconds, which is how Postgres reads a unitless value — then
 * the statement fails and the migration aborts with a lock error naming the table. That is the
 * outcome to want: a deploy that stops with a diagnosable message beats one that takes the site
 * down and looks like it is still working.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **SET HERE RATHER THAN IN THE MIGRATION FILES, FOR TWO REASONS.**
 *
 * Every `.sql` under `migrations/` is written by `drizzle-kit generate`, and a hand-added
 * `SET lock_timeout` line is erased the next time a feature regenerates — a protection that
 * disappears without anybody deciding to remove it. Setting it on the connection also applies it
 * to **every** migration, including `0003`, whose missing timeout is a recorded unclaimed defect
 * from 004's review: it rewrites `events` under a volatile default and could not be fixed without
 * regenerating a snapshot the migration README warns against touching casually.
 *
 * **On its own connection, not the application pool.** `max: 1` because migrations are strictly
 * sequential and the setting must hold for all of them — a pooled connection that the driver
 * replaces mid-run would silently lose it.
 *
 * **That decision HAS since been made, differently, and the two are not in conflict** — this
 * paragraph used to say a `lock_timeout` on request traffic "is a different decision nobody has
 * made". 016's deep review made it: `db/client.ts` now sets a **shorter** `lock_timeout` plus a
 * `statement_timeout` on the application pool, because the mutual card exchange holds one of ten
 * pooled connections across five round trips, and an unbounded wait there exhausts the pool and
 * stops **every** route rather than turning one contended request into a 500. Read the two headers
 * together: different values, different reasons, and a different failure each prefers. A migration
 * prefers to **abort loudly**; a request prefers to **fail one caller fast**.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
const MIGRATION_LOCK_TIMEOUT_MS = 10_000

export const runMigrations = async (): Promise<void> => {
  const config = loadConfig()

  const sql = postgres(config.databaseUrl, {
    max: 1,
    connect_timeout: 10,
    types: {},
    onnotice: () => {},
    // Applied as a startup parameter, so it is in force for the first statement rather than
    // after one the runner remembered to send. Unitless, which Postgres reads as milliseconds.
    connection: { lock_timeout: MIGRATION_LOCK_TIMEOUT_MS },
  })

  try {
    await migrate(drizzle(sql), { migrationsFolder })
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// Executed directly by `pnpm db:migrate`, and imported by the integration test harness.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  try {
    await runMigrations()
    console.warn('Migrations applied.')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    await closeDb()
  }
}
