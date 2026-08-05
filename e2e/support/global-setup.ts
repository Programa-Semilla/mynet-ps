/**
 * Global setup for the end-to-end run: a migrated, freshly seeded database and a running API.
 *
 * Migration and seeding go through the same `pnpm db:migrate` and `pnpm db:seed` commands the
 * quickstart tells a reviewer to run, rather than importing the API's internals. If those
 * commands break, this breaks — which is the point (SC-014).
 */
import { execFile } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'

import { startApi, stopApi } from './api-process.js'
import { API_ORIGIN } from './env.js'

const run = promisify(execFile)
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

export default async (): Promise<void> => {
  if (!process.env['DATABASE_URL']) {
    throw new Error(
      'DATABASE_URL is not set. End-to-end tests run against a real database and a real API ' +
        '(FR-068), and MUST NOT be skipped when it is missing — a skipped end-to-end check ' +
        'reporting success is the failure FR-064 and FR-071 exist to prevent.\n\n' +
        'Copy .env.example to .env and fill it in, or start one locally:\n' +
        '  docker run --name mynet-pg -e POSTGRES_PASSWORD=mynet -e POSTGRES_USER=mynet \\\n' +
        '    -e POSTGRES_DB=mynet_dev -p 5432:5432 -d postgres:17',
    )
  }

  await run('pnpm', ['db:migrate'], { cwd: ROOT, env: process.env })
  await run('pnpm', ['db:seed'], { cwd: ROOT, env: process.env })

  // A server left over from an earlier run holds the port and may be running older code.
  // Replace it rather than reusing it, so what is tested is what is committed.
  await stopApi()
  await startApi()

  console.warn(`API ready at ${API_ORIGIN}`)
}
