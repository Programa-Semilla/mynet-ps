/**
 * The local PostgreSQL container.
 *
 * One container, shared by every instance, holding one database per directory. Published on
 * 55432 rather than 5432 so it cannot collide with a PostgreSQL somebody already runs on this
 * machine — a collision there is confusing in a way that costs an afternoon, because everything
 * connects and the data is simply someone else's.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const CONTAINER = 'mynet-pg'
export const HOST_PORT = 55432
const IMAGE = 'postgres:17'
const USER = 'mynet'
const PASSWORD = 'mynet'

export const databaseUrlFor = (name) =>
  `postgresql://${USER}:${PASSWORD}@localhost:${HOST_PORT}/${name}`

/**
 * FR-007, made structural. Local development must never require access to a store holding real
 * attendee data, and the cheapest way to guarantee that is to refuse to start when the
 * environment points anywhere but this machine.
 */
export const assertLocalDatabaseUrl = (url) => {
  if (!url) return
  const { hostname } = new URL(url)
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(
      `DATABASE_URL in your environment points at ${hostname}, which is not this machine.\n` +
        'pnpm start only ever runs against a local, throwaway database (FR-007).\n' +
        'Unset DATABASE_URL in your shell and let .env.local provide it.',
    )
  }
}

const docker = async (args) => (await run('docker', args)).stdout.trim()

const dockerAvailable = async () => {
  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}'])
    return true
  } catch {
    return false
  }
}

const containerState = async () => {
  try {
    return await docker(['inspect', '-f', '{{.State.Status}}', CONTAINER])
  } catch {
    return 'absent'
  }
}

/**
 * The host port an existing container publishes 5432 on, or undefined.
 *
 * Checked because a container from an earlier convention — this project published 5432
 * directly before instances existed — would otherwise be reused happily while every connection
 * string pointed at 55432 and nothing listened there. Reusing by name alone is not enough.
 */
const publishedPort = async () => {
  try {
    const port = await docker([
      'inspect',
      '-f',
      '{{ (index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort }}',
      CONTAINER,
    ])
    return Number(port)
  } catch {
    return undefined
  }
}

const waitForReady = async (timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      await docker(['exec', CONTAINER, 'pg_isready', '-U', USER])
      return
    } catch {
      // Still starting. Expected for the first second or two.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const logs = await docker(['logs', '--tail', '20', CONTAINER]).catch(() => '(no logs)')
  throw new Error(`PostgreSQL did not become ready within ${timeoutMs}ms.\n\n${logs}`)
}

const create = async () => {
  console.log(`Creating the ${CONTAINER} container on :${HOST_PORT}…`)
  await docker([
    'run',
    '--name',
    CONTAINER,
    '-e',
    `POSTGRES_USER=${USER}`,
    '-e',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    '-e',
    'POSTGRES_DB=postgres',
    '-p',
    `${HOST_PORT}:5432`,
    '-d',
    IMAGE,
  ])
}

export const ensureContainer = async () => {
  if (!(await dockerAvailable())) {
    throw new Error(
      'Docker is not available — it is either not installed or the daemon is not running.\n\n' +
        'Start it, or run PostgreSQL yourself:\n' +
        `  docker run --name ${CONTAINER} -e POSTGRES_PASSWORD=${PASSWORD} ` +
        `-e POSTGRES_USER=${USER} \\\n    -p ${HOST_PORT}:5432 -d ${IMAGE}`,
    )
  }

  const state = await containerState()

  if (state === 'absent') {
    await create()
  } else {
    const port = await publishedPort()
    if (port !== HOST_PORT) {
      // Said out loud rather than done quietly: this discards whatever the old container held.
      // It only ever holds seeded throwaway data, but a silent deletion is still a bad habit.
      console.log(
        `The ${CONTAINER} container publishes :${port}, not :${HOST_PORT} — replacing it. ` +
          'Its databases are discarded; they hold only seed data.',
      )
      await docker(['rm', '-f', CONTAINER])
      await create()
    } else if (state !== 'running') {
      await docker(['start', CONTAINER])
    }
  }

  await waitForReady()
}

/**
 * `CREATE DATABASE` cannot run inside a transaction and has no `IF NOT EXISTS`, so existence is
 * checked first. The container is never recreated to get a database — that would destroy every
 * other instance's data.
 */
export const ensureDatabase = async (name) => {
  const existing = await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    'postgres',
    '-tAc',
    `select 1 from pg_database where datname = '${name}'`,
  ])

  if (existing !== '1') {
    console.log(`Creating database ${name}…`)
    await docker([
      'exec',
      CONTAINER,
      'psql',
      '-U',
      USER,
      '-d',
      'postgres',
      '-c',
      `CREATE DATABASE "${name}"`,
    ])
  }
}

/** Applied migrations, oldest first. Empty when the schema has never been created. */
export const appliedMigrationHashes = async (name) => {
  const out = await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    name,
    '-tAc',
    'select hash from drizzle.__drizzle_migrations order by id',
  ]).catch(() => '')

  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Removes a database outright, connections and all.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `dropSchema` is not a substitute here. It leaves the database itself in place, and with it
 * anything that lives outside `public` and `drizzle` — a role, a setting, or an extension
 * installed into another schema. `pnpm verify:clean` claims to run against a database that has
 * never existed, and "almost never existed" is the claim that lets the `citext` class of bug
 * through: it passes locally and fails on the first genuinely clean database it meets.
 *
 * `WITH (FORCE)` terminates other sessions first (PostgreSQL 13+, and the container is 17).
 * Without it a `vite preview` still holding a pool from a previous run makes the drop fail,
 * which would leave the next run reusing a database it believes it just created.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const dropDatabase = async (name) => {
  await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    'postgres',
    '-c',
    `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
  ])
}

/** The rebuild path. Only ever reached for a local, per-directory database. */
export const dropSchema = async (name) => {
  await docker([
    'exec',
    CONTAINER,
    'psql',
    '-U',
    USER,
    '-d',
    name,
    '-c',
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  ])
}

/**
 * Runs one statement against an instance database and returns `psql`'s output.
 *
 * Everything here already speaks to PostgreSQL through `docker exec psql` rather than a driver,
 * and this keeps that true: the alternative was importing `postgres` into a script that runs
 * before `pnpm install` is guaranteed to have produced anything, in a file whose whole purpose
 * is to work on a fresh clone.
 *
 * **Not for anything taking user input.** The caller composes the statement, so this is a
 * developer tool for fixed SQL, not a query interface.
 */
export const runSql = async (name, statement) =>
  docker(['exec', CONTAINER, 'psql', '-U', USER, '-d', name, '-t', '-A', '-c', statement])
