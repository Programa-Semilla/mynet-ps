import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T013 (006) — **zero unchecked repository casts remain in feature code** (FR-496, SC-414).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS BECAUSE THE DEBT IT GUARDS AGAINST CAME BACK ONCE ALREADY, SILENTLY.**
 *
 * `@mynet/platform`'s registry used to mirror every repository method by hand as
 * `Promise<unknown>`, so that the package took no dependency on `@mynet/data`. Every consumer
 * paid for that with a cast — `(await repository.getOwn()) as OwnProfile` — and each one was a
 * place where a genuine contract change would type-check and then fail at runtime, in feature
 * code, against personal data.
 *
 * The idea inbox counted six of them, from 004 alone. The real total was **fifteen, across
 * thirteen files**, because two more features had each added their own on the way past. Nothing
 * noticed, because a cast is not an error — it is an instruction to stop checking.
 *
 * T009 removed the mirror and every cast with it. This is what stops the next feature adding
 * the sixteenth: casting to a `@mynet/data` type in feature code now fails a gate rather than
 * compiling quietly.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **What is checked, and what deliberately is not.**
 *
 * A cast to a type *this package owns* is ordinary TypeScript and none of this rule's business.
 * What the rule forbids is asserting a value into a shape **`@mynet/data` already declares** —
 * because that is precisely where the compiler was about to do the work for you, and the
 * assertion is a decision to refuse the answer.
 *
 * So the check is: no `as <Type>` in `apps/web/src` where `<Type>` is imported from
 * `@mynet/data`. That covers a cast on a repository *result* (`as OwnProfile`), on an
 * *argument* (`as OwnProfile['availability']`), and on a promise of either
 * (`as Promise<Session[]>`) — all three shapes that were actually present.
 *
 * `src/dev/` is excluded: it is developer instrumentation, stripped from production builds.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const WEB_SRC = fileURLToPath(new URL('../../src', import.meta.url))

/** Developer instrumentation, absent from a production build. Not feature code. */
const EXCLUDED = ['dev']

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return EXCLUDED.includes(entry) ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(entry) ? [path] : []
  })

/**
 * The type names `@mynet/data` exports, read from its own barrels rather than listed here.
 *
 * Listing them would make this test assert against a copy that drifts — the same failure mode
 * `navigation-mirror.test.ts` exists to prevent for destinations. A type added to the package
 * is covered by this rule the moment it exists.
 */
const dataTypeNames = (): Set<string> => {
  const barrels = [
    fileURLToPath(new URL('../../../../packages/data/src/index.ts', import.meta.url)),
    fileURLToPath(new URL('../../../../packages/data/src/interfaces/index.ts', import.meta.url)),
  ]

  const names = new Set<string>()
  for (const barrel of barrels) {
    const source = readFileSync(barrel, 'utf8')
    for (const block of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
      for (const raw of (block[1] ?? '').split(',')) {
        // `A as B` in an export list re-exports under B; the local name is what a consumer writes.
        const name = raw
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.replace(/^type\s+/, '')
          .trim()
        if (name && /^[A-Z]/.test(name)) names.add(name)
      }
    }
  }
  return names
}

describe('zero unchecked repository casts remain in feature code (SC-414)', () => {
  const types = dataTypeNames()

  it('finds the data package to check against', () => {
    // A guard on the guard: if the barrel is ever restructured so the scrape returns nothing,
    // every assertion below would pass vacuously and this gate would silently stop gating.
    expect(types.size).toBeGreaterThan(10)
    expect(types).toContain('OwnProfile')
    expect(types).toContain('Session')
  })

  it('has no `as <@mynet/data type>` anywhere in apps/web/src', () => {
    const offences: string[] = []

    for (const file of sourceFiles(WEB_SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')

      lines.forEach((line, index) => {
        // Comments explain the rule and quote the old casts; they are not code.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')

        for (const match of code.matchAll(/\bas\s+(?:Promise<\s*)?([A-Z][A-Za-z0-9_]*)/g)) {
          const type = match[1]
          if (type && types.has(type)) {
            offences.push(`${relative(WEB_SRC, file)}:${index + 1}  as ${type}   →  ${line.trim()}`)
          }
        }
      })
    }

    expect(
      offences,
      `Repository casts found. The registry carries the real interfaces now (FR-496), so the ` +
        `compiler can check these — an assertion here is a decision to stop it. Fix the type, ` +
        `or narrow with a membership check as \`profile/labels.ts\` does.\n\n${offences.join('\n')}`,
    ).toEqual([])
  })
})
