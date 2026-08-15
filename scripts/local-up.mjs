/**
 * `pnpm start` — from any clone or worktree to a running MyNet at a printed URL.
 *
 * Idempotent by construction: every step asks what state it is in before changing anything, so
 * a fresh clone, a run straight after `git checkout`, and a second run in a row all converge on
 * the same place. That property is the feature. Steps that "just do it again" would make a
 * second run destructive, and a command you hesitate to re-run is not one command.
 */
import { execFile } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'

import { ensureAdminCredential, resetOperatorCredential } from './local/admin-credential.mjs'
import { ensureEnvFile, writeEnvLocal } from './local/env-file.mjs'
import { instanceFor } from './local/instance.mjs'
import {
  appliedMigrationHashes,
  assertLocalDatabaseUrl,
  databaseUrlFor,
  dropSchema,
  ensureContainer,
  ensureDatabase,
  HOST_PORT,
  runSql,
} from './local/postgres.mjs'
import { classifyDrift, committedMigrations } from './local/schema.mjs'
import { portInUse, renderBanner, startServers } from './local/servers.mjs'

const run = promisify(execFile)

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = fileURLToPath(new URL('../apps/api/migrations', import.meta.url))

const reset = process.argv.includes('--reset')

/**
 * Puts the administrative credential back to just-seeded so a fresh one is issued and printed.
 *
 * Separate from `--reset` because they answer different questions. `--reset` rebuilds the whole
 * database and costs every attendee, session and note in it; forgetting an administrative
 * password should not require that. Implied by `--reset`, since a rebuilt database has a
 * re-seeded operator anyway.
 */
const resetAdmin = process.argv.includes('--reset-admin')

const git = async (args) => (await run('git', args, { cwd: ROOT })).stdout.trim()

/**
 * A linked worktree's `.git` is a file pointing elsewhere, so `--git-dir` and `--git-common-dir`
 * differ there and are equal in the main working tree. That difference is the whole test.
 */
const isMainWorktree = async () => {
  const [gitDir, commonDir] = await Promise.all([
    git(['rev-parse', '--absolute-git-dir']),
    git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
  ])
  return gitDir === commonDir
}

const currentBranch = async () => (await git(['rev-parse', '--abbrev-ref', 'HEAD'])) || 'detached'

const pnpm = (args, env) => run('pnpm', args, { cwd: ROOT, env: { ...process.env, ...env } })

const main = async () => {
  // Before anything is created, so a misconfigured shell fails in under a second.
  assertLocalDatabaseUrl(process.env['DATABASE_URL'])

  if (ensureEnvFile(ROOT) === 'created') {
    console.log('Created .env from .env.example, with freshly generated secrets.')
  }

  const instance = instanceFor(ROOT.replace(/\/$/, ''), {
    isMainWorktree: await isMainWorktree(),
    overrides: {
      databaseName: process.env['MYNET_DATABASE_NAME'],
      portOffset: process.env['MYNET_PORT_OFFSET']
        ? Number(process.env['MYNET_PORT_OFFSET'])
        : undefined,
    },
  })

  for (const [label, port] of [
    ['web', instance.webPort],
    ['API', instance.apiPort],
    ['admin', instance.adminPort],
  ]) {
    if (await portInUse(port)) {
      throw new Error(
        `Port ${port} (${label}) is already in use.\n` +
          'Another MyNet instance is probably already running — this one, or a separate\n' +
          'clone. Every clone is a main working tree, so every clone claims 5173/3000;\n' +
          'only linked worktrees get their own ports automatically.\n\n' +
          'Stop the other instance, or move this one out of the way:\n' +
          '  MYNET_PORT_OFFSET=10 pnpm start',
      )
    }
  }

  await ensureContainer()
  await ensureDatabase(instance.databaseName)

  const databaseUrl = databaseUrlFor(instance.databaseName)
  writeEnvLocal(ROOT, {
    databaseUrl,
    apiPort: instance.apiPort,
    webOrigin: `http://localhost:${instance.webPort}`,
    apiOrigin: `http://localhost:${instance.apiPort}`,
    adminOrigin: `http://localhost:${instance.adminPort}`,
  })

  // Every child below reads DATABASE_URL from the real environment, which beats both files.
  const env = { DATABASE_URL: databaseUrl }

  const committed = committedMigrations(MIGRATIONS).map((migration) => migration.hash)
  const applied = await appliedMigrationHashes(instance.databaseName)
  const drift = reset ? 'diverged' : classifyDrift(committed, applied)

  if (drift === 'diverged') {
    console.log(
      reset
        ? 'Rebuilding the database from zero (--reset).'
        : 'This database was built from a different migration history — rebuilding it from zero.',
    )
    await dropSchema(instance.databaseName)
  }

  // Each step announces itself before it runs. `pnpm db:migrate` and `pnpm db:seed` have their
  // output captured rather than inherited, so without these lines a first run sits silent for
  // fifteen seconds and reads as a hang — which is the opposite of what one command is for.
  if (drift !== 'none') {
    console.log('Applying migrations…')
    await pnpm(['db:migrate'], env)
  }

  const needsSeed = drift === 'diverged' || applied.length === 0
  if (needsSeed) {
    console.log('Seeding two attendees…')
    await pnpm(['db:seed'], env)
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **The administrative credential, which the seed deliberately does not create** (FR-990).
  //
  // Idempotent like every step above, and idempotent *because* of FR-993 rather than in spite
  // of it: the bootstrap only writes where `credential_is_initial` is still true, so a re-run
  // never overwrites a password an operator chose. That guard is what makes this safe to put in
  // a command people run several times a day.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  if (resetAdmin) {
    const found = await resetOperatorCredential(instance.databaseName, { runSql })
    console.log(
      found
        ? 'Clearing the administrative credential so a fresh one is issued (--reset-admin).'
        : 'No seeded operator to reset — the database will need `pnpm db:seed`.',
    )
  }

  console.log('Issuing an administrative credential…')
  const adminCredential = await ensureAdminCredential({ pnpm, env })

  console.log('Starting the API, MyNet and the administrative site…')
  const { stop } = await startServers({ instance, root: ROOT })

  console.log(
    renderBanner({
      branch: await currentBranch(),
      instance,
      hostPort: HOST_PORT,
      adminCredential,
    }),
  )

  // Leave the container running: starting it again is cheap, and stopping it would only make
  // the next run slower for no benefit.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stop()
      process.exit(0)
    })
  }
}

main().catch((error) => {
  console.error(`\n${error.message}\n`)
  process.exitCode = 1
})
