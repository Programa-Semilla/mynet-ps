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
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { API_ORIGIN } from './env.js'

const API_DIR = fileURLToPath(new URL('../../apps/api', import.meta.url))

/**
 * **Deliberately NOT under `test-results/`, and that placement is a fix.**
 *
 * Playwright wipes its output directory at the start of every run. The pid file lived there, so
 * the handle to a previous run's detached server was destroyed *before* `stopApi()` looked for
 * it — which meant an interrupted run leaked a server that no later run could find or stop. It
 * then held the port, the next run's child died with `EADDRINUSE`, and the health poll was
 * answered by the leaked server. `node_modules/.cache/` is ignored by git and survives the wipe.
 */
const PID_FILE = fileURLToPath(
  new URL('../../node_modules/.cache/mynet-e2e-api.pid', import.meta.url),
)

/**
 * 004 — where the API's output goes, so a spec can read a verification or reset link.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The plaintext of a link exists for exactly one moment, inside one request.** Only its
 * SHA-256 is stored (FR-323, FR-333), which is the property under test — so reading a link out
 * of the database is not an option, because there is nothing there to read.
 *
 * The development mail sink writes each link to the process output, and quickstart.md already
 * tells a reader to look for it there. `stdio` was `'ignore'`, which sent it nowhere; pointing
 * it at a file is what makes that instruction literally true, for the end-to-end suite and for
 * a person following Scenario 2 by hand.
 *
 * It is a *development* path in both senses: `SinkMailService` refuses to construct under
 * `NODE_ENV=production` precisely because a reset link in a log is a credential in a log.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const API_LOG = fileURLToPath(new URL('../../test-results/api.log', import.meta.url))

/**
 * Polls `/ready` until the API can actually serve, or gives up.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **`/ready`, NOT `/health`, AND THIS WAS WAITING ON THE WRONG ONE.**
 *
 * The distinction is one the codebase already makes, in the deployment platform's own words: *a
 * container with an unreachable database answers `/health` perfectly and every attendee request
 * with a failure.* `/health` says the process is listening. `/ready` says the database is
 * reachable, which is the only question a caller about to make a request has.
 *
 * The harness was asking the first and acting on the answer to the second, so `redeployApi()`
 * could return while the new process's pool was still connecting. The very next `page.reload()`
 * would then load a workspace whose reads had failed, and `durability.spec.ts` would fail on a
 * missing greeting — **intermittently**, only in a full-suite run, and never in isolation, which
 * is the signature of exactly this kind of race.
 *
 * It is the same mistake a deployment would make, caught in the harness that exists to prove
 * redeployment is survivable.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const waitForHealth = async (timeoutMs = 60_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_ORIGIN}/ready`)
      if (response.ok) return
    } catch {
      // Not listening yet. Keep waiting — this is the expected state for the first second or so.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(
    `The API did not become ready at ${API_ORIGIN}/ready within ${timeoutMs}ms. ` +
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
  // Both, and separately — they deliberately live in different places now. The pid file sits
  // outside `test-results/` so it survives Playwright's wipe; the log sits inside it because it
  // *should* be truncated per run. Creating one directory used to create the other by accident.
  mkdirSync(dirname(PID_FILE), { recursive: true })
  mkdirSync(dirname(API_LOG), { recursive: true })

  // Truncated per run, so one run's links cannot be read by the next.
  writeFileSync(API_LOG, '', 'utf8')
  const log = openSync(API_LOG, 'a')

  const child = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
    cwd: API_DIR,
    detached: true,
    stdio: ['ignore', log, log],
    env: process.env,
  })

  if (child.pid === undefined) {
    throw new Error('Could not start the API process.')
  }

  writeFileSync(PID_FILE, String(child.pid), 'utf8')

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **A CHILD THAT DIES MUST FAIL THE RUN, BECAUSE `waitForHealth` CANNOT TELL WHOSE SERVER IT
  // IS TALKING TO.**
  //
  // This is the hole that let a whole suite run against a server nobody owned. `startApi` is
  // called after `stopApi`, which kills only the pid it recorded in `test-results/.api-pid` —
  // and **Playwright wipes `test-results/` at the start of every run**, so on the run after any
  // interrupted one there is no pid file, nothing is killed, and a detached server from an
  // earlier run is still holding :3000. The new child then dies instantly with `EADDRINUSE`,
  // `waitForHealth` polls `/ready`, the *stale* server answers `ok`, and global setup reports
  // success. Everything downstream tests a process started from different code with a different
  // environment, which is the exact failure the `stopApi` call above exists to prevent.
  //
  // Racing the health poll against the child's own exit is what closes it: whichever happens
  // first is the truth, and a child that exits before serving is never a healthy start.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const died = new Promise<never>((_resolve, reject) => {
    child.once('error', (error) => reject(error))
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          `The API process exited before it became ready (code ${code}, signal ${signal}).\n` +
            `Its output is in ${API_LOG}.\n\n` +
            'If that says EADDRINUSE, a server from an earlier run is still holding the port. ' +
            'This run would otherwise have tested THAT server rather than this code. Stop it:\n' +
            "  ss -ltnp | grep ':3000'   # then kill the pid it names",
        ),
      )
    })
  })
  // Nothing must be left listening to `died` once the race is settled, or an ordinary shutdown
  // later in the run would reject an unobserved promise and crash the worker.
  died.catch(() => {})

  try {
    await Promise.race([waitForHealth(), died])
  } finally {
    child.removeAllListeners('exit')
    child.removeAllListeners('error')
  }

  child.unref()
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
