/**
 * `pnpm verify:clean` — the pipeline's gates, on this machine, against a database that has
 * never existed before.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This is not a faster `pnpm verify`. It is a stricter one.**
 *
 * `pnpm verify` runs every check the pipeline runs, and still cannot reproduce three of the
 * pipeline's properties, because all three are properties of the *environment* rather than of
 * the commands:
 *
 *   1. **A database that has never existed.** Yours is already migrated and already has the
 *      `citext` extension installed. The comment at the top of `0000_initial_schema.sql`
 *      describes exactly the bug that hides behind that: a migration missing its
 *      `CREATE EXTENSION` line passes on your machine forever and fails the first time it meets
 *      a clean database. This script creates one, applies migrations from zero, and applies
 *      them a second time — because a migration that only works once turns the second
 *      deployment of the day into an outage.
 *   2. **An install from the lockfile.** A `node_modules` that drifted can satisfy an import
 *      the lockfile does not.
 *   3. **Isolation from whatever else is running.** Ports and database are derived from this
 *      directory, so a `pnpm start` you left running in another terminal — or in another clone
 *      — neither collides with this run nor is disturbed by it.
 *
 * The database is dropped on the way out, whether the run passed or failed. Nothing it created
 * outlives it, which is what makes it safe to run as often as you like.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * CI remains the record: a reviewer cannot verify "it passed on my machine", and the pipeline
 * additionally deploys the preview. What this removes is the need to *wait* on CI to find out
 * whether you are right.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { instanceFor, portOffsetFor } from './local/instance.mjs'
import {
  assertLocalDatabaseUrl,
  databaseUrlFor,
  dropDatabase,
  ensureContainer,
  ensureDatabase,
} from './local/postgres.mjs'
import { portInUse } from './local/servers.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** PostgreSQL truncates identifiers past this, silently (see `instance.mjs`). */
const MAX_IDENTIFIER_LENGTH = 63

/**
 * A port band of its own, clear of the 5173–5372 / 3000–3199 that instances occupy.
 *
 * A verify run builds and serves the client and starts the API, exactly as `pnpm start` does.
 * Sharing their ports would mean this script could only run when you were not working, which
 * is precisely when you would not think to run it.
 */
const WEB_BASE = 5673
const API_BASE = 3500
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **014 — THE ADMINISTRATIVE SITE IS A SECOND APPLICATION AND THIS SCRIPT DID NOT KNOW.**
 *
 * `verify-clean` predates 013's second product. It allocated a web port and an API port, and the
 * administrative preview therefore fell back to its default 5174 — colliding with a running
 * `pnpm start` — while `ADMIN_ORIGIN` went unset entirely.
 *
 * The second half is the one that actually broke: `app.ts` allows CORS on administrative routes
 * from `config.adminOrigin ?? false`, so an unset value means **the browser** refuses every
 * request the admin client makes. Nothing fails server-side, the API looks healthy, and the specs
 * wait for a response that never arrives — **twelve administrative end-to-end tests time out**,
 * including specs that have nothing to do with the feature under test.
 *
 * CI has supplied `ADMIN_ORIGIN` since 013 and its comment explains why, adding that *"it passed
 * locally only because `pnpm start` writes `ADMIN_ORIGIN` into `.env.local`"*. **That claim is not
 * true** — `.env.local` carries `WEB_ORIGIN` and never carried this — so the local runner has been
 * unable to reproduce a green CI run for as long as the administrative specs have existed. Found
 * by 014's first full local `pnpm verify`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
const ADMIN_BASE = 5873

/**
 * The gates, cheapest first.
 *
 * Order is deliberate and is not CI's. The pipeline runs jobs in parallel and cares about
 * wall-clock; a terminal runs them in sequence and cares about how long you wait to learn you
 * made a typo. So a type error surfaces in seconds rather than after the end-to-end suite.
 *
 * `scripts/verify-clean.test.mjs` reads this list and compares it against the workflow. A gate
 * added to CI and not added here fails that test by name.
 */
export const STEPS = [
  { name: 'install', command: 'pnpm', args: ['install', '--frozen-lockfile'] },
  { name: 'typecheck', command: 'pnpm', args: ['typecheck'] },
  { name: 'lint', command: 'pnpm', args: ['lint'] },
  { name: 'format', command: 'pnpm', args: ['format:check'] },
  { name: 'test:unit', command: 'pnpm', args: ['test:unit'] },
  { name: 'test:component', command: 'pnpm', args: ['test:component'] },
  { name: 'contract', command: 'pnpm', args: ['contract:check'] },
  { name: 'migrate (from zero)', command: 'pnpm', args: ['db:migrate'] },
  // Applying twice proves idempotence, as the pipeline's `migrations` job does.
  { name: 'migrate (idempotent)', command: 'pnpm', args: ['db:migrate'] },
  { name: 'test:integration', command: 'pnpm', args: ['test:integration'] },
  { name: 'build', command: 'pnpm', args: ['build'] },
  { name: 'budget', command: 'pnpm', args: ['budget'] },
  // `--forbid-only` is what CI gets from `forbidOnly: Boolean(process.env.CI)`. Taken directly
  // rather than by setting CI, because CI also turns on retries — and a retry that hides a
  // flaky test is the last thing a local confidence check should do.
  { name: 'test:e2e', command: 'pnpm', args: ['test:e2e', '--forbid-only'] },
]

const label = (index) => `[${String(index + 1).padStart(2)}/${STEPS.length}]`

const elapsed = (startedAt) => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`

/** Output is inherited rather than captured: a silent twelve-minute run reads as a hang. */
const exec = ({ command, args }, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`exited with code ${code}`)),
    )
  })

const main = async () => {
  // Refuse before creating anything, so a shell pointed somewhere real fails in under a second
  // rather than after a database has been dropped.
  assertLocalDatabaseUrl(process.env['DATABASE_URL'])

  const directory = ROOT.replace(/\/$/, '')
  const instance = instanceFor(directory, { isMainWorktree: false })

  // `isMainWorktree: false` forces the directory hash even in the main working tree — every
  // clone is a main working tree, so without it two clones would both pick offset 0 and fight.
  const offset = portOffsetFor(directory, { isMainWorktree: false })
  const webPort = WEB_BASE + offset
  const apiPort = API_BASE + offset
  const adminPort = ADMIN_BASE + offset
  const database = `${instance.databaseName}_verify`.slice(0, MAX_IDENTIFIER_LENGTH)

  for (const [name, port] of [
    ['web', webPort],
    ['API', apiPort],
    ['admin', adminPort],
  ]) {
    if (await portInUse(port)) {
      throw new Error(
        `Port ${port} (${name}) is already in use, so this verify run cannot claim it.\n` +
          'Another verify:clean is probably still running in this directory.',
      )
    }
  }

  await ensureContainer()

  console.log(`\nVerifying ${instance.name} against a clean database: ${database}`)
  console.log(
    `Ports ${webPort} (web), ${adminPort} (admin) and ${apiPort} (API) — your running instance ` +
      'is untouched.\n',
  )

  // Dropped first, not only at the end: a previous run killed midway leaves one behind, and
  // silently reusing it would forfeit the single property this script exists to provide.
  await dropDatabase(database)
  await ensureDatabase(database)

  const env = {
    DATABASE_URL: databaseUrlFor(database),
    API_PORT: String(apiPort),
    MYNET_WEB_PORT: String(webPort),
    WEB_ORIGIN: `http://localhost:${webPort}`,
    // 014 — both halves are required and they do different jobs. `MYNET_ADMIN_PORT` is what the
    // admin Vite config serves on; `ADMIN_ORIGIN` is what the API adds to its CORS allow-list,
    // and without it the browser refuses every administrative request while the server stays
    // silent. See `ADMIN_BASE` above.
    MYNET_ADMIN_PORT: String(adminPort),
    ADMIN_ORIGIN: `http://localhost:${adminPort}`,
    VITE_API_BASE_URL: `http://localhost:${apiPort}`,
  }

  const startedAt = Date.now()

  try {
    for (const [index, step] of STEPS.entries()) {
      const stepStartedAt = Date.now()
      console.log(`\n${label(index)} ${step.name}`)

      try {
        await exec(step, env)
      } catch (error) {
        console.error(`\n${label(index)} ${step.name} FAILED after ${elapsed(stepStartedAt)}.`)
        console.error(`  ${step.command} ${step.args.join(' ')} — ${error.message}`)
        console.error('\nThe database has been removed. Fix, then run pnpm verify:clean again.')
        throw error
      }

      console.log(`${label(index)} ${step.name} ok (${elapsed(stepStartedAt)})`)
    }
  } finally {
    // Always. A failed run that leaves its database behind makes the next run's "clean" a lie.
    await dropDatabase(database)
  }

  console.log(`\nAll ${STEPS.length} gates passed in ${elapsed(startedAt)}.`)
  console.log('CI remains the record — a reviewer cannot verify a local run.\n')
}

// Importable by the parity test without running anything.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
