import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { loadConfig } from '../config.js'
import * as schema from './schema/index.js'

export type Database = PostgresJsDatabase<typeof schema>

let sql: postgres.Sql | undefined
let database: Database | undefined

/**
 * T019 — the pooled connection, created once per process.
 *
 * Pooled long-lived connections are one of the reasons D4 chose a conventional Node runtime
 * over an edge runtime: the connection model does not fit a per-request isolate.
 */
export const getDb = (): Database => {
  if (database) return database

  const config = loadConfig()

  sql = postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // The application owns time semantics (sliding expiry, throttle windows). Letting the
    // driver localise timestamps would make those depend on the server's timezone.
    types: {},
    onnotice: () => {},
  })

  database = drizzle(sql, { schema })
  return database
}

/** Closes the pool. Used by tests and by graceful shutdown. */
export const closeDb = async (): Promise<void> => {
  if (sql) {
    await sql.end({ timeout: 5 })
    sql = undefined
    database = undefined
  }
}

export { schema }
