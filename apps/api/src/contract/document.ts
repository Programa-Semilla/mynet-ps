import { fileURLToPath, URL } from 'node:url'

import { buildApp } from '../app.js'
import { closeDb } from '../db/client.js'

export const CONTRACT_PATH = fileURLToPath(
  new URL('../../../../contracts/openapi.json', import.meta.url),
)

/**
 * Builds the application purely to ask it what its contract is.
 *
 * No database is touched — `buildApp` only registers plugins and routes — but the pool is
 * closed anyway so the process can exit rather than hanging on an idle connection.
 *
 * Serialised with two-space indentation and a trailing newline so that a contract change
 * produces a readable line-level diff. A single-line JSON document would technically satisfy
 * FR-044b while making the review it exists for impossible.
 */
export const buildContractDocument = async (): Promise<string> => {
  const app = await buildApp()
  try {
    await app.ready()
    return `${JSON.stringify(app.swagger(), null, 2)}\n`
  } finally {
    await app.close()
    await closeDb()
  }
}
