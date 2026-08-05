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

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    process.exit(0)
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
