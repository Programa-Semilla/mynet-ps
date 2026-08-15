import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { loadConfig } from '../config.js'
import * as schema from './schema/index.js'

export type Database = PostgresJsDatabase<typeof schema>

let sql: postgres.Sql | undefined
let database: Database | undefined

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **016 — HOW LONG A REQUEST MAY WAIT ON A LOCK, ON A STATEMENT, AND INSIDE AN OPEN TRANSACTION.**
 *
 * `migrate.ts` sets `lock_timeout` on its own `max: 1` connection and its header says why it is
 * *"on its own connection, **not the application pool**"*: **"a `lock_timeout` on ordinary request
 * traffic would turn contention into user-visible 500s, which is a different decision nobody has
 * made."** That decision is made here, deliberately, and the two remain different decisions rather
 * than one looking like an oversight — different values, different reasons, different failure to
 * prefer.
 *
 * **What forced it is 016's deadlock fix.** `shareCard` used to let two attendees sharing with each
 * other at the same instant take the two `(sharer_id, recipient_id)` unique-index locks in opposite
 * orders; PostgreSQL detected the cycle, aborted one transaction with **40P01**, and one perfectly
 * ordinary share answered 500. Sorting the pair fixed it — and it fixed it by converting a **fast
 * abort into a wait**. With no timeout anywhere on this pool, that wait has no ceiling.
 *
 * That is worse than the defect it replaced, because it is not confined to sharing.
 * `shareCard` holds one of **ten** pooled connections across five round trips inside one
 * transaction. A share that stalls parks every other share for that pair behind it, each holding a
 * pool slot; **ten stalled requests exhaust `max: 10` and the entire API stops answering — every
 * route shares this pool.** The `card_share` throttle does not bound it, because ten *different*
 * attendees is enough, and Fastify's `requestTimeout` bounds request **receipt**, never handler
 * execution, so nothing above the driver aborts a handler parked on a lock.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE VALUES, AND WHAT THEY WERE CHECKED AGAINST — NOT ROUND NUMBERS PICKED FOR LOOKING SAFE.**
 *
 *   * **`lock_timeout` 3s.** The longest *deliberate* lock wait anywhere in this codebase is
 *     `questions-withdraw.test.ts`, which holds an uncommitted vote's `FOR KEY SHARE` while the
 *     withdrawal's `SELECT … FOR UPDATE` waits on it: the test asserts the request is still pending
 *     at 750ms and then releases, so the real wait is ~1s. Three seconds is ~3× that, and it is far
 *     beyond anything an uncontended request does — every other lock this product takes is a row
 *     lock held for the length of one short transaction. FR-714's mechanism therefore still works,
 *     and a wait that reaches three seconds is contention nobody designed.
 *   * **`statement_timeout` 10s**, and it is deliberately **larger than `lock_timeout`** so a
 *     statement blocked on a lock always fails as **`55P03` lock_not_available** rather than as an
 *     anonymous `57014` query_canceled — the first names the cause in the log, the second does not.
 *     Checked against the slowest legitimate statements here, none of which is close: the directory
 *     query is keyset-bounded to one page, the throttle's counter reads at most
 *     `ATTEMPT_SCAN_LIMIT` rows on an index range, the contacts and thread reads are bounded by
 *     acts a human performed, the hourly retention sweeps delete from tables their own windows keep
 *     small, and the seed runs as many small statements rather than one large one.
 *   * **`idle_in_transaction_session_timeout` 15s.** This one is not about slow SQL at all: it is
 *     the backstop for a transaction left open by a `BEGIN` whose Node continuation never resumes —
 *     an unawaited promise, a swallowed rejection, an exception between statements. Such a session
 *     holds its locks and its pool slot **forever**, and no query timeout can see it because no
 *     query is running. Every transaction in this product is a handful of statements with no
 *     network call and no user input between them; the longest one deliberately held is the ~1s in
 *     the test above.
 *
 * **Migrations keep their own, larger, lock timeout and NO statement timeout**, which is the whole
 * reason they run on a separate pool: an `ALTER TABLE` that rewrites a table may legitimately take
 * minutes, and it is a single operator-run operation whose failure stops a deploy rather than a
 * conference. Request traffic is the opposite in both halves — failing fast is the desired outcome,
 * and the cost of waiting is paid by everybody at once.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **HOW A TIMEOUT SURFACES, WHICH IS THE HALF THAT COULD GO WRONG QUIETLY.**
 *
 * A `lock_timeout` raises a driver error out of the query layer. It is **not** an `AppError` and
 * carries no numeric `statusCode`, so `plugins/errors.ts` answers **500 `internal_error` with a
 * correlation id** and logs the cause — which is exactly right, and it is right because of what it
 * is *not*:
 *
 *   * It must never be folded into `POST /cards`'s **reasonless 409** (`contactRefused`) or its
 *     uniform **404** (`unreachable`). Both of those are statements *about the two attendees* —
 *     somebody blocked somebody, or the recipient is not reachable — and a lock timeout says
 *     nothing about either. Telling an attendee their exchange was refused when the server never
 *     decided anything is a lie the client would render as a settled outcome.
 *   * It must never be swallowed into a success. The transaction is rolled back, so **nothing was
 *     written**, and `recordCard`'s `ON CONFLICT (sharer_id, recipient_id) DO NOTHING` makes the
 *     attendee's natural response — press it again — safe and idempotent.
 *
 * `shareCard` does not catch it, and nothing in `routes/cards.ts` classifies it, which is what
 * keeps the above true by construction: the outcome union has no member for "we do not know", and
 * the only way to report that is to let the error reach the boundary.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
const APPLICATION_LOCK_TIMEOUT_MS = 3_000
const APPLICATION_STATEMENT_TIMEOUT_MS = 10_000
const APPLICATION_IDLE_IN_TRANSACTION_TIMEOUT_MS = 15_000

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
    // Startup parameters rather than a `SET` the pool would have to remember to send: they are in
    // force for the **first** statement on every connection, including one the driver replaces
    // mid-run. Unitless, which Postgres reads as milliseconds. See the block above for the values.
    connection: {
      lock_timeout: APPLICATION_LOCK_TIMEOUT_MS,
      statement_timeout: APPLICATION_STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: APPLICATION_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
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
