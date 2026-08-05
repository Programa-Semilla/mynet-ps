/**
 * Ownership of the API process for the end-to-end run.
 *
 * Playwright's own `webServer` starts the client, but **not** the API. The API is started here
 * instead because SC-003 requires proving that attendee data survives *redeployment*, and a
 * server Playwright owns cannot be stopped and restarted from inside a test.
 *
 * The process id is written to a file rather than held in memory because Playwright runs global
 * setup, each worker, and global teardown in separate processes. A file is the only handle all
 * three can share.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { API_ORIGIN } from './env.js'

const API_DIR = fileURLToPath(new URL('../../apps/api', import.meta.url))
const PID_FILE = fileURLToPath(new URL('../../test-results/.api-pid', import.meta.url))

/** Polls `/health` until the API answers, or gives up. */
const waitForHealth = async (timeoutMs = 60_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_ORIGIN}/health`)
      if (response.ok) return
    } catch {
      // Not listening yet. Keep waiting — this is the expected state for the first second or so.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(
    `The API did not become healthy at ${API_ORIGIN}/health within ${timeoutMs}ms. ` +
      'Check that DATABASE_URL points at a reachable database.',
  )
}

/** True when something is already answering on the API origin. */
export const apiIsUp = async (): Promise<boolean> => {
  try {
    return (await fetch(`${API_ORIGIN}/health`)).ok
  } catch {
    return false
  }
}

/**
 * Starts the API and records its process id.
 *
 * `detached` so the child survives the process that spawned it — a worker running the
 * redeployment case must be able to leave a healthy server behind for the specs that follow.
 */
export const startApi = async (): Promise<void> => {
  mkdirSync(dirname(PID_FILE), { recursive: true })

  const child = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
    cwd: API_DIR,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })

  if (child.pid === undefined) {
    throw new Error('Could not start the API process.')
  }

  writeFileSync(PID_FILE, String(child.pid), 'utf8')
  child.unref()

  await waitForHealth()
}

/** Stops the recorded API process, if it is still running. */
export const stopApi = async (): Promise<void> => {
  if (!existsSync(PID_FILE)) return

  const pid = Number(readFileSync(PID_FILE, 'utf8').trim())
  rmSync(PID_FILE, { force: true })
  if (!Number.isInteger(pid)) return

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Already gone. Nothing to stop.
    return
  }

  // Wait for the port to actually free up, so an immediate restart does not race it.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (!(await apiIsUp())) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * A redeployment, as far as the attendee's data is concerned: the process serving the API is
 * replaced by a new one against the same database.
 *
 * If anything an attendee sees were held in the server's memory rather than in PostgreSQL, this
 * is where it would disappear (FR-033, SC-003).
 */
export const redeployApi = async (): Promise<void> => {
  await stopApi()
  await startApi()
}
