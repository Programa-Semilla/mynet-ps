/**
 * Starting both dev servers, and the banner.
 *
 * The banner is printed only once both ports actually answer. A URL that is not yet serving is
 * worse than no URL — it gets clicked, fails, and teaches you to distrust the output.
 */
import { spawn } from 'node:child_process'
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

  const stop = () => {
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
