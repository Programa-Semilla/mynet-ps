/**
 * T025 — the migration runner, wired to `pnpm db:migrate`.
 *
 * Applies every committed migration in order (FR-037). This is the only path by which a
 * schema change reaches any database — local, preview, or production. `drizzle-kit push` is
 * prohibited everywhere precisely so that local and production schemas are reached the same
 * reviewed way (research.md D6).
 */
import { fileURLToPath, URL } from 'node:url'

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { closeDb, getDb } from './client.js'

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

export const runMigrations = async (): Promise<void> => {
  const db = getDb()
  await migrate(db, { migrationsFolder })
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
