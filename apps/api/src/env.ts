/**
 * Local `.env` loading — the "no undocumented steps" half of FR-006 and FR-007.
 *
 * A clean clone must be able to run `pnpm db:migrate`, `pnpm dev`, and `pnpm test:integration`
 * after copying `.env.example` to `.env` and filling it in. Without this, every one of those
 * commands additionally requires the reader to know to export the file into their shell first
 * — a step SC-014 says the README must not need to describe, because it should not exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The real environment wins.** `process.loadEnvFile` does not overwrite a variable that is
 * already set, so a stray local `.env` cannot override a secret the pipeline injected. That
 * ordering matters for FR-041 and FR-067: CI points the API at the pull request's own
 * ephemeral database branch, and a developer's leftover file must never be able to redirect it
 * at anything else.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Imported for its side effect by `config.ts`, which every entry point already goes through —
 * the server, the migration runner, the seed script, and the integration harness. There is
 * deliberately no `dotenv` dependency: Node has done this natively since 20.12, and FR-003
 * bars dependencies an actual requirement does not justify.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/** Repository root, from `apps/api/src/`. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Load order is reverse precedence, and that is not a mistake.**
 *
 * `process.loadEnvFile` does not overwrite a variable that is already set. So the file loaded
 * *first* wins, and the real process environment — set before any of this runs — beats every
 * file. `.env.local` therefore goes first: it is generated per directory by `pnpm start` and
 * must override the committed defaults in `.env`, while never being able to override what the
 * pipeline injected (FR-067).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const FILES = ['.env.local', '.env'] as const

let loaded = false

/** Exported with an explicit root so the precedence rule is testable rather than asserted. */
export const loadEnvFiles = (root: string): void => {
  for (const file of FILES) {
    const path = `${root}${file}`
    if (existsSync(path)) {
      process.loadEnvFile(path)
    }
  }
}

/**
 * Loads the repository-root env files if they exist. Absent is not an error: a deployed API is
 * configured by its host, and a pipeline job is configured by its secrets. Neither has a file.
 */
export const loadDotEnv = (): void => {
  if (loaded) return
  loaded = true
  loadEnvFiles(ROOT)
}

loadDotEnv()
