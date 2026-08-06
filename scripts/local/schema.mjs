/**
 * Schema drift: deciding whether the database in front of you matches the branch you are on.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Drizzle records one row per applied migration in `drizzle.__drizzle_migrations`, and its
 * `hash` column is `sha256` of the migration file's raw contents. So the applied sequence and
 * the committed sequence are directly comparable, and the comparison answers the only question
 * that matters after a checkout: can these migrations be applied on top, or is this database
 * describing a history this branch does not have?
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `none` — nothing to do. `ahead` — apply the new migrations. `diverged` — the database
 * describes a history this branch does not have, so it is rebuilt from zero.
 *
 * Divergence is not an error and not a question. Locally it is the ordinary consequence of
 * checking out an older branch, and the only correct repair is to start again.
 */
export const classifyDrift = (committedHashes, appliedHashes) => {
  if (appliedHashes.length > committedHashes.length) return 'diverged'

  for (const [index, applied] of appliedHashes.entries()) {
    if (applied !== committedHashes[index]) return 'diverged'
  }

  return appliedHashes.length === committedHashes.length ? 'none' : 'ahead'
}

/**
 * The journal is the ordering authority, not the directory listing — filenames sort correctly
 * today only because the tags happen to be zero-padded, which is drizzle's convention rather
 * than a guarantee.
 */
export const committedMigrations = (migrationsDir) => {
  const journalPath = join(migrationsDir, 'meta', '_journal.json')
  if (!existsSync(journalPath)) return []

  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))

  return (journal.entries ?? []).map((entry) => {
    const sql = readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8')
    return { tag: entry.tag, hash: createHash('sha256').update(sql).digest('hex') }
  })
}
