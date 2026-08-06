/**
 * `.env` loading for the end-to-end harness.
 *
 * The API has its own copy of this in `apps/api/src/env.ts` rather than importing this one.
 * That is deliberate: `@mynet/config` is a development dependency, and the API's production
 * build must not reach into it. Ten lines of duplication is the cheaper of the two mistakes.
 *
 * As there, the real environment wins over the file — the pipeline points these tests at the
 * pull request's own ephemeral database branch, and a developer's leftover `.env` must never be
 * able to redirect them somewhere else (FR-067).
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/** Repository root, from `e2e/support/`. */
const ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Same reverse-precedence rule as `apps/api/src/env.ts`: `process.loadEnvFile` will not
// overwrite an already-set variable, so the file loaded first wins and the real process
// environment beats both. `.env.local` is generated per directory by `pnpm start`.
const FILES = ['.env.local', '.env'] as const

let loaded = false

export const loadDotEnv = (): void => {
  if (loaded) return
  loaded = true
  for (const file of FILES) {
    const path = `${ROOT}${file}`
    if (existsSync(path)) {
      process.loadEnvFile(path)
    }
  }
}

loadDotEnv()

const port = process.env['API_PORT'] ?? '3000'

/** Where the harness reaches the API. Matches what the client bundle was built against. */
export const API_ORIGIN = process.env['VITE_API_BASE_URL'] ?? `http://localhost:${port}`

/** Where the harness reaches the client. */
export const WEB_ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173'
