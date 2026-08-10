/**
 * Starting both dev servers, and the banner.
 *
 * The banner is printed only once both ports actually answer. A URL that is not yet serving is
 * worse than no URL — it gets clicked, fails, and teaches you to distrust the output.
 */
import { execFileSync, spawn } from 'node:child_process'
import { connect } from 'node:net'

/** Matches `SEED_PASSWORD` in apps/api/src/db/seed/attendees.ts. */
const SEED_PASSWORD = 'correct-horse-battery-staple'

export const renderBanner = ({ branch, instance, hostPort }) => `
  MyNet is running

  →  http://localhost:${instance.webPort}

     branch    ${branch}
     instance  ${instance.name}
     database  ${instance.databaseName} on localhost:${hostPort}
     api       http://localhost:${instance.apiPort}

  Sign in as ada@example.com or grace@example.com
  password: ${SEED_PASSWORD}

  Ctrl-C to stop.
`

/** Resolves once something accepts a TCP connection on the port. */
export const waitForPort = async (port, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
    })

    if (open) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`Nothing is listening on port ${port} after ${timeoutMs}ms.`)
}

/** True when the port is already taken — checked before starting, not after failing. */
export const portInUse = async (port) => {
  try {
    await waitForPort(port, 300)
    return true
  } catch {
    return false
  }
}

export const startServers = async ({ instance, root }) => {
  const env = {
    ...process.env,
    // Read by `apps/web/vite.config.ts`, which is evaluated before Vite loads `.env.local`.
    MYNET_WEB_PORT: String(instance.webPort),
    MYNET_INSTANCE_NAME: instance.name,
    MYNET_DATABASE_NAME: instance.databaseName,
  }

  const children = [
    spawn('pnpm', ['dev:api'], { cwd: root, env, stdio: 'inherit' }),
    spawn('pnpm', ['dev:web'], { cwd: root, env, stdio: 'inherit' }),
  ]

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **SIGNALLING THE DIRECT CHILDREN IS NOT ENOUGH, AND THE LEFTOVER IS A SERVER STILL BOUND
   * TO THE PORT.**
   *
   * `children` are the two `pnpm dev:*` processes, and each one has a chain beneath it:
   *
   *     pnpm dev:api → sh -c → pnpm --filter @mynet/api dev → sh -c → tsx watch → node server
   *
   * `child.kill()` signals only the head of that chain. `pnpm` does not forward the signal
   * down, so the tail survives, is reparented to init, and **keeps listening on 3000 and
   * 5173** — after which the next `pnpm start` fails on a port that is in use, blamed on
   * something else entirely. One was found running fifteen hours after the terminal that
   * started it had closed.
   *
   * **Ctrl-C never had this problem, which is exactly why it went unnoticed.** The terminal
   * delivers SIGINT to every process in the foreground process group, so each descendant is
   * signalled directly and the chain is irrelevant. Every *other* way of stopping — an editor's
   * stop button, `kill <pid>`, a supervisor, and `stop()`'s own use when one server dies during
   * startup — goes through this function, and left the tree behind.
   *
   * So the tree is walked and signalled explicitly. The process group is deliberately **not**
   * changed: spawning `detached` would put each child in its own group and fix this too, but it
   * would also take the descendants out of the terminal's foreground group — trading a path
   * that demonstrably works for one that depends entirely on this handler running. Belt is
   * cheaper than replacing the braces.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  const descendantsOf = (roots) => {
    let listing
    try {
      listing = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
    } catch {
      // No `ps`, or it refused. Fall back to signalling the direct children alone, which is
      // what this did before — degraded, never worse.
      return []
    }

    const byParent = new Map()
    for (const line of listing.split('\n')) {
      const [pid, parent] = line.trim().split(/\s+/).map(Number)
      if (!Number.isInteger(pid) || !Number.isInteger(parent)) continue
      byParent.set(parent, [...(byParent.get(parent) ?? []), pid])
    }

    // Breadth-first, so the result is ordered shallowest-first and can be reversed to signal
    // leaves before the parents that would otherwise outlive them as orphans.
    const found = []
    const queue = [...roots]
    while (queue.length > 0) {
      const pid = queue.shift()
      for (const child of byParent.get(pid) ?? []) {
        found.push(child)
        queue.push(child)
      }
    }
    return found
  }

  const stop = () => {
    const roots = children.map((child) => child.pid).filter((pid) => Number.isInteger(pid))

    // Deepest first. A process that outlives its parent is the orphan this exists to prevent,
    // and signalling the parent first is how you create one.
    for (const pid of descendantsOf(roots).reverse()) {
      // Already gone is the common case and not an error: the tree was read a moment ago and
      // these are shutting down concurrently.
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        /* already exited */
      }
    }

    for (const child of children) child.kill('SIGTERM')
  }

  // A server that dies during startup must not leave the other running and the banner printed.
  for (const child of children) {
    child.once('exit', (code) => {
      if (code !== 0 && code !== null) {
        stop()
        process.exitCode = code
      }
    })
  }

  await Promise.all([waitForPort(instance.apiPort), waitForPort(instance.webPort)])

  return { stop }
}
