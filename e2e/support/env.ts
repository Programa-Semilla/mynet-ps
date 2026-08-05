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
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url))

let loaded = false

export const loadDotEnv = (): void => {
  if (loaded) return
  loaded = true
  if (existsSync(ENV_FILE)) {
    process.loadEnvFile(ENV_FILE)
  }
}

loadDotEnv()

const port = process.env['API_PORT'] ?? '3000'

/** Where the harness reaches the API. Matches what the client bundle was built against. */
export const API_ORIGIN = process.env['VITE_API_BASE_URL'] ?? `http://localhost:${port}`

/** Where the harness reaches the client. */
export const WEB_ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173'
