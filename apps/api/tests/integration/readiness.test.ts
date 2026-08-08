import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import * as client from '../../src/db/client.js'
import { resetDatabase, setupTestApp, teardown } from './helpers.js'

/**
 * T060, T061 (006) — readiness, and the liveness probe it must not disturb (FR-482, FR-483,
 * SC-412).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FAILURE THIS PREVENTS: A DEPLOY THAT PASSES EVERY CHECK AND THEN FAILS EVERY REQUEST.**
 *
 * `restart: unless-stopped` keeps a container reporting as running, and `/health` answers `ok`
 * from a process that has never successfully reached its database. Without a probe that
 * actually asks, the first attendee to open the product is the monitoring — which is what
 * SC-412 means by "unready before traffic".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('/ready reports whether this process can actually serve (FR-482)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('answers 200 when the database is reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ready' })
  })

  it('needs no session — it is what a deployment gates on', async () => {
    // A readiness probe that required authentication could not be used by the thing that has to
    // call it before any attendee does.
    const response = await app.inject({ method: 'GET', url: '/ready' })
    expect(response.statusCode).not.toBe(401)
  })

  /**
   * The unhealthy half, driven by making the database genuinely unreachable for one call.
   *
   * Substituting `getDb` rather than stopping a container: the property under test is that the
   * route *asks* and reports the answer, and a test that could only run against a torn-down
   * database could not run in CI at all.
   */
  it('answers 503 and names the dependency when the database is unreachable (SC-412)', async () => {
    // `as never` rather than a cast through the real return type: the double implements the one
    // method the probe calls, and naming the full `PostgresJsDatabase` shape here would be a
    // hundred lines of stub to test one `select 1`.
    vi.spyOn(client, 'getDb').mockImplementation(
      () =>
        ({
          execute: async () => {
            throw new Error('ECONNREFUSED 127.0.0.1:5432')
          },
        }) as never,
    )

    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'unavailable', dependency: 'database' })

    // …and it names the dependency without disclosing anything about it. The driver's own
    // message carries a host and a port, which is reconnaissance on an unauthenticated endpoint.
    expect(response.body).not.toContain('127.0.0.1')
    expect(response.body).not.toContain('ECONNREFUSED')

    vi.restoreAllMocks()
  })
})

/**
 * T061 — **`/health` is unchanged, and that is a requirement** (FR-483).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The obvious "improvement" is to make `/health` check the database too, and it is the wrong
 * one: `/health` is unauthenticated, and an unauthenticated endpoint that reports on
 * infrastructure is free reconnaissance. 001 made it minimal deliberately and said so; this
 * file is what stops 006 undoing that while adding the probe that genuinely needs to.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('/health is unchanged by this feature (FR-483)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('reports only that the process is running', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('discloses nothing about dependencies, versions or builds', async () => {
    const body = (await app.inject({ method: 'GET', url: '/health' })).body

    for (const disclosure of ['database', 'version', 'build', 'commit', 'postgres', 'uptime']) {
      expect(
        body.toLowerCase(),
        `/health discloses "${disclosure}". It is unauthenticated, so anything it reports about ` +
          'infrastructure is reconnaissance available to anybody (FR-483).',
      ).not.toContain(disclosure)
    }
  })

  it('still answers when the database is unreachable — that is the whole distinction', async () => {
    vi.spyOn(client, 'getDb').mockImplementation(
      () =>
        ({
          execute: async () => {
            throw new Error('ECONNREFUSED')
          },
        }) as never,
    )

    const health = await app.inject({ method: 'GET', url: '/health' })
    const ready = await app.inject({ method: 'GET', url: '/ready' })

    // Liveness and readiness are different questions, and here they give different answers.
    // If these two ever agree in this scenario, one of them has stopped being useful.
    expect(health.statusCode).toBe(200)
    expect(ready.statusCode).toBe(503)

    vi.restoreAllMocks()
  })
})
