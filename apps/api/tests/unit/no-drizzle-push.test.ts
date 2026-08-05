import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T026 — `drizzle-kit push` must not be invoked anywhere, including local development.
 *
 * It applies schema changes directly to a database without producing a migration file, which
 * is the "ad-hoc changes to a live database" the constitution prohibits. research.md D6 makes
 * the prohibition explicit and quickstart.md tells the reader that finding it in a
 * `package.json` script *is* the defect.
 *
 * This is a test rather than a one-time check because "nobody added it yet" and "nobody can
 * add it" are different guarantees. A reviewer will not notice a four-word script addition;
 * this will.
 */

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage'])

const findPackageJsonFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      findPackageJsonFiles(full, found)
    } else if (entry === 'package.json') {
      found.push(full)
    }
  }
  return found
}

describe('drizzle-kit push prohibition (T026, research.md D6)', () => {
  const manifests = findPackageJsonFiles(repoRoot)

  it('finds package manifests to check', () => {
    // Guards against the test silently passing because the search found nothing — the same
    // "a gate that cannot fail is not a gate" failure SC-010 names.
    expect(manifests.length).toBeGreaterThan(0)
  })

  it.each(manifests)('%s declares no script invoking drizzle-kit push', (manifestPath) => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      scripts?: Record<string, string>
    }

    const offending = Object.entries(manifest.scripts ?? {}).filter(([, command]) =>
      /drizzle-kit\s+push/.test(command),
    )

    expect(
      offending,
      `${manifestPath} invokes drizzle-kit push. It changes a database without producing a reviewable migration (FR-037, research.md D6). Use "drizzle-kit generate" and commit the SQL.`,
    ).toEqual([])
  })
})
