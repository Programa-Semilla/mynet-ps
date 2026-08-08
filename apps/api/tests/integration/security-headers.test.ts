import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ADA,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T059 (006) — every declared security header, on every API response (FR-480, FR-481, SC-411).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ASSERTIONS THAT MATTER ARE THE ONES ON THE RESPONSES NOBODY THINKS ABOUT.**
 *
 * A header set on the success path of one route is easy and proves almost nothing. The
 * responses an attacker is actually interested in are the refusals — a 401 from a guard, a 404
 * from the event predicate, a 400 from schema validation — and those are exactly the ones a
 * `preHandler`-based implementation misses, because they are produced before any handler runs.
 *
 * So this file walks a deliberately awkward set: unauthenticated, authenticated, refused,
 * malformed, and a route that does not exist at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The **static document's** headers are Caddy's and are asserted by a deployment smoke check
 * at the end of `deploy/vm/deploy.sh` (SC-411), because nothing in CI serves the built client
 * through a proxy. Research D8
 * records why the split is what makes both halves checkable at all.
 */

/** Header → the property it must have. Named individually so a failure names the header. */
const REQUIRED: readonly [string, RegExp][] = [
  ['content-security-policy', /default-src 'none'/],
  // FR-480 names these two by name, and **`base-uri` does not fall back to `default-src`** —
  // dropping that directive would genuinely weaken the policy against base-tag injection with
  // nothing to notice. Neither was asserted anywhere.
  ['content-security-policy', /object-src 'none'/],
  ['content-security-policy', /base-uri 'none'/],
  ['x-content-type-options', /^nosniff$/],
  ['referrer-policy', /^no-referrer$/],
  ['x-frame-options', /^DENY$/],
  ['permissions-policy', /camera=\(\)/],
]

describe('security response headers (FR-480, SC-411)', () => {
  let app: FastifyInstance
  let ada: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string
  })

  afterAll(async () => {
    await teardown(app)
  })

  const RESPONSES = [
    ['an unauthenticated liveness probe', { method: 'GET' as const, url: '/health' }],
    ['a readiness probe', { method: 'GET' as const, url: '/ready' }],
    ['an authenticated read', { method: 'GET' as const, url: '/auth/me' }],
    ['a 401 refusal', { method: 'GET' as const, url: '/profile' }],
    [
      'a 404 from the event predicate',
      { method: 'GET' as const, url: '/events/00000000-0000-4000-8000-000000000000/attendees' },
    ],
    ['a 404 for a route that does not exist', { method: 'GET' as const, url: '/nope' }],
    [
      'a 400 from schema validation',
      { method: 'POST' as const, url: '/auth/sign-in', payload: { email: 'not-an-email' } },
    ],
  ] as const

  it.each(RESPONSES)('sets every declared header on %s', async (_label, request) => {
    const authenticated = request.url === '/auth/me'
    const response = await app.inject({
      ...request,
      ...(authenticated ? { headers: { cookie: cookieHeader(ada) } } : {}),
    })

    for (const [header, shape] of REQUIRED) {
      expect(
        response.headers[header],
        `${header} is absent from ${request.method} ${request.url} (${response.statusCode}). ` +
          'A header set only on the success path is absent from exactly the responses an ' +
          'attacker is most interested in.',
      ).toBeDefined()
      expect(String(response.headers[header])).toMatch(shape)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **`img-src` MUST PERMIT `data:`, AND THIS IS THE TEST THAT KEEPS IT THERE** (FR-481).
   *
   * FR-456 delivers directory avatars as data URLs inside the listing response — that is what
   * makes a page of twenty-four faces one request instead of twenty-five. A later tightening
   * that dropped `data:` would blank every face in the directory with no error, no failing
   * request, and nothing in the console but a CSP report nobody is collecting.
   *
   * A tightening is a *good instinct*, which is exactly why the reason has to live somewhere a
   * red test will show it.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('permits data: in img-src, because avatars are data URLs (FR-481, FR-456)', async () => {
    const csp = String(
      (await app.inject({ method: 'GET', url: '/health' })).headers['content-security-policy'],
    )

    expect(
      csp,
      'Dropping `data:` here blanks every face in the directory, silently. FR-456 delivers ' +
        'avatars as data URLs so that a page of 24 cards is one request rather than 25.',
    ).toMatch(/img-src [^;]*\bdata:/)
  })

  it("declares connect-src 'self', which one origin makes literally true (FR-476)", async () => {
    const csp = String(
      (await app.inject({ method: 'GET', url: '/health' })).headers['content-security-policy'],
    )

    // Caddy serves the client and proxies /api/*, so there is no second host to name. In the
    // configuration this replaces, this directive would have had to name the API's own domain.
    expect(csp).toMatch(/connect-src 'self'/)
    expect(csp).not.toMatch(/connect-src[^;]*https?:\/\//)
  })

  it('forbids framing, both ways', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(String(response.headers['content-security-policy'])).toMatch(/frame-ancestors 'none'/)
    expect(response.headers['x-frame-options']).toBe('DENY')
  })

  /**
   * HSTS is the one header that is deliberately absent here.
   *
   * It is a promise a browser remembers for its whole max-age and cannot be taken back. Sending
   * it from a test or a development server would pin a developer's browser to HTTPS for every
   * `localhost` port they ever use, including other projects'. Its presence on the deployed
   * environments is asserted by the smoke check at the end of `deploy/vm/deploy.sh`, which
   * curls the served document after every deploy and names any header that is missing.
   */
  it('does NOT send HSTS outside a deployed environment', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(
      response.headers['strict-transport-security'],
      'HSTS from localhost pins a developer’s browser to HTTPS for every localhost port they ' +
        'ever use, including other projects’, and cannot be revoked.',
    ).toBeUndefined()
  })
})
