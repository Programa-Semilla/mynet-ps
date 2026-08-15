/**
 * Instance identity — the mechanism that lets several worktrees run at once.
 *
 * Every value here is a pure function of the directory, so the same directory always resolves
 * to the same database and the same ports. That is the property that makes a bookmark keep
 * working, and it is why nothing here reads the clock, the network, or a random source.
 */
import { createHash } from 'node:crypto'
import { basename } from 'node:path'

/** PostgreSQL truncates identifiers past this, silently. Better to do it deliberately. */
const MAX_IDENTIFIER_LENGTH = 63

/** The band of ports reserved for instances. 200 is far more than anyone will run at once. */
const OFFSET_RANGE = 200

const BASE_WEB_PORT = 5173
const BASE_API_PORT = 3000

/**
 * 011 — the administrative client's port.
 *
 * It carries the offset like the other two, which matters more here than it looks: the
 * administrative site is a **separate origin**, and two worktrees sharing one origin would share
 * its cookie jar and its storage. `apps/admin/vite.config.ts` defaults to 5174 when
 * `MYNET_ADMIN_PORT` is unset, so the bare `pnpm dev:admin` documented in `quickstart.md` keeps
 * working unchanged.
 */
const BASE_ADMIN_PORT = 5174

export const databaseNameFor = (directory) => {
  const sanitised = basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')

  // An identifier may not begin with a digit, and an empty basename is not a name at all.
  const valid = /^[a-z_]/.test(sanitised) ? sanitised : `mynet_${sanitised}`

  return valid.slice(0, MAX_IDENTIFIER_LENGTH)
}

/**
 * The main working tree keeps 5173/3000 so that the committed `.env.example`, every bookmark,
 * and every piece of existing documentation stay correct.
 *
 * A linked worktree hashes its absolute path. `sha256` rather than an ad-hoc arithmetic hash
 * because the value has to be identical across machines and Node versions — an offset that
 * drifts is worse than no offset, since it silently orphans the database the last run created.
 */
export const portOffsetFor = (directory, { isMainWorktree }) => {
  if (isMainWorktree) return 0
  return createHash('sha256').update(directory).digest().readUInt32BE(0) % OFFSET_RANGE
}

export const instanceFor = (directory, { isMainWorktree, overrides = {} }) => {
  const portOffset = overrides.portOffset ?? portOffsetFor(directory, { isMainWorktree })

  return {
    name: basename(directory),
    databaseName: overrides.databaseName ?? databaseNameFor(directory),
    portOffset,
    webPort: BASE_WEB_PORT + portOffset,
    apiPort: BASE_API_PORT + portOffset,
    adminPort: BASE_ADMIN_PORT + portOffset,
  }
}
