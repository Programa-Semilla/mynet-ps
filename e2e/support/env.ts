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

/**
 * 011 — where the harness reaches the **administrative** client.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **A SECOND ORIGIN, NOT A PATH, AND THE PORT IS STANDING IN FOR A SUBDOMAIN.**
 *
 * In a deployed environment the administrative site is `admin.<host>` (decision 37), served by
 * its own Caddy block. Locally there is no DNS to give it a name, so it is a second port — which
 * is a **different origin** in exactly the way that matters for these tests: separate storage,
 * separate service-worker scope, and a cookie the browser will not send to the other one.
 *
 * What the port does NOT reproduce is `SameSite` evaluation, which is done against the
 * registrable domain — `localhost:5174` and `localhost:5173` are same-site in a way
 * `admin.example.com` and `example.com` also are, so the local topology happens to behave the
 * same for the property these tests care about. That is a coincidence worth naming rather than
 * relying on: the deployed guarantee is asserted by the Caddyfile and by
 * `tests/unit/admin-cookie.test.ts`, not here.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */
export const ADMIN_ORIGIN = process.env['ADMIN_ORIGIN'] ?? 'http://localhost:5174'
