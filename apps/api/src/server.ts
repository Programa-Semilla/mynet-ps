/**
 * Process entry point.
 *
 * Kept separate from `app.ts` so tests can build the application with `fastify.inject()`
 * without binding a port (research.md D11).
 */
import { buildApp } from './app.js'
import { loadConfig } from './config.js'

const start = async (): Promise<void> => {
  const config = loadConfig()
  const app = await buildApp()

  // Guarded, because a second signal while the first shutdown is in flight would otherwise run
  // `app.close()` concurrently with itself.
  let shuttingDown = false

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down')

    // A bounded drain. If `app.close()` hangs on a slow query holding a connection, nothing
    // else forces the exit — the platform eventually sends SIGKILL, but by then the pool has
    // been abandoned rather than released. This makes the upper bound ours.
    const forced = setTimeout(() => {
      app.log.error('shutdown timed out, exiting')
      process.exit(1)
    }, 15_000)
    forced.unref()

    try {
      // Closes the database pool too — `buildApp` registers an `onClose` hook for it.
      await app.close()
      process.exit(0)
    } catch (error) {
      app.log.error(error, 'shutdown failed')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  try {
    await app.listen({ host: config.host, port: config.port })
  } catch (error) {
    app.log.error(error, 'failed to start')
    process.exit(1)
  }
}

void start()
