import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { THRESHOLDS } from '../../src/auth/throttle.js'

/**
 * T-review (014) — **which route charges which bound** (FR-1039).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **NOTHING BOUND A WRITE ROUTE TO ITS THROTTLE ACTION, AND THE FEATURE SHIPPED WITH ONE WRONG.**
 *
 * Three guards already existed and none of them could see this. `throttle-thresholds.test.ts`
 * asserts the **table** — that the actions exist and that two are tighter than the rest.
 * `throttle-actions.test.ts` asserts the **policy** — which actions may deny. And
 * `throttle-route-audit.test.ts` binds routes to actions for **GET routes only**, because it was
 * written for FR-803a, which is about polls.
 *
 * So every write route in this feature could charge any action in the table, or the wrong one, with
 * all three green. `PATCH /admin/conferences/:eventId` did exactly that: it charged
 * `catalog_write`, the bucket whose own comment says it is for "writing tracks, rooms and
 * speakers", and the review found it by reading rather than by running anything.
 *
 * **The change that matters more is the one nobody has made yet.** Moving `/cancel` from
 * `session_cancel` to `session_write` collapses the tightest bound in the feature — the one
 * standing between an organizer and a push amplifier pointed at every attendee who saved
 * anything — into the loosest, and it is a **one-word diff that reads as tidying**. FR-1039 asks
 * for these actions to be named individually; naming them is worth nothing if no test says which
 * route spends which.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **A SOURCE AUDIT RATHER THAN A BEHAVIOURAL ONE, AND THE REASON IS WHAT IT CAN SEE.**
 *
 * Driving each route until it is refused would assert that *a* bound exists, not *which*: the
 * observable difference between `session_cancel` at ten an hour and `session_write` at 120 is 110
 * requests, and a test that issued them would be asserting the number rather than the binding. The
 * source says which action is charged in one word, and that word is the thing being protected.
 *
 * The route table is read from the **real application** rather than from the source, so a route
 * that is registered under a different path than the one written here fails the first assertion
 * rather than silently going unaudited — the failure mode `event-scope-audit` records as its own
 * worst case, where a guard examines only the routes that happen to match.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../src/routes/admin/catalog.ts', import.meta.url)),
  'utf8',
)

/**
 * Every write route in the authoring module and the action it must charge.
 *
 * **Each entry is a decision, not a transcription.** If one of these fails, the question is not
 * "what does the route do now" — it is whether the new binding is the one the threshold's header
 * argues for. Changing a value here is changing what bounds the act, and the two thresholds that
 * exist for a stated reason are marked.
 */
const EXPECTED: readonly {
  readonly method: string
  readonly path: string
  readonly action: string
}[] = [
  // Tracks, rooms and speakers — one counter for the three, deliberately. They are the same act
  // at the same scale, and nothing distinguishes what a denial on one would cost from another.
  { method: 'POST', path: '/admin/conferences/:eventId/tracks', action: 'catalog_write' },
  { method: 'PATCH', path: '/admin/conferences/:eventId/tracks/:id', action: 'catalog_write' },
  { method: 'DELETE', path: '/admin/conferences/:eventId/tracks/:id', action: 'catalog_write' },
  { method: 'POST', path: '/admin/conferences/:eventId/rooms', action: 'catalog_write' },
  { method: 'PATCH', path: '/admin/conferences/:eventId/rooms/:id', action: 'catalog_write' },
  { method: 'DELETE', path: '/admin/conferences/:eventId/rooms/:id', action: 'catalog_write' },
  { method: 'POST', path: '/admin/conferences/:eventId/speakers', action: 'catalog_write' },
  { method: 'PATCH', path: '/admin/conferences/:eventId/speakers/:id', action: 'catalog_write' },
  { method: 'DELETE', path: '/admin/conferences/:eventId/speakers/:id', action: 'catalog_write' },

  // Sessions. The ordinary edit is generous because building a programme is dozens of writes in
  // one sitting; the acts that reach a phone or destroy a row are not.
  { method: 'POST', path: '/admin/conferences/:eventId/sessions', action: 'session_write' },
  { method: 'PATCH', path: '/admin/conferences/:eventId/sessions/:id', action: 'session_write' },
  {
    method: 'POST',
    path: '/admin/conferences/:eventId/sessions/:id/reinstate',
    action: 'session_write',
  },

  // **The tightest bound in the feature.** Moving this to `session_write` is the one-word diff
  // this file exists to stop.
  {
    method: 'POST',
    path: '/admin/conferences/:eventId/sessions/:id/cancel',
    action: 'session_cancel',
  },
  {
    method: 'DELETE',
    path: '/admin/conferences/:eventId/sessions/:id',
    action: 'session_delete',
  },

  // **The conference itself, and this is the binding the review found wrong.** It rode
  // `catalog_write` — a bucket named for tracks, rooms and speakers — while being the only write
  // that moves the date range (FR-1014) and the gate on FR-1015's timezone freeze.
  { method: 'PATCH', path: '/admin/conferences/:eventId', action: 'conference_write' },

  // The only product-wide capability an organizer holds (v5.2.0 N3).
  { method: 'POST', path: '/admin/conferences', action: 'conference_create' },
]

/**
 * The action charged by each route registration, read from the source.
 *
 * Registrations are located by `app.<method>(` followed by the path literal; the action is the
 * first `throttle(request, '<action>'` appearing before the next registration. A route that charges
 * nothing yields `undefined`, which is a failure rather than a skip — that is the whole point.
 */
const chargedActions = (): Map<string, string | undefined> => {
  const registration = /\n {2}app\.(get|post|patch|delete)\(\s*\n\s*'([^']+)',/g
  const found: { key: string; from: number }[] = []

  let match: RegExpExecArray | null
  while ((match = registration.exec(SOURCE)) !== null) {
    found.push({
      key: `${(match[1] as string).toUpperCase()} ${match[2] as string}`,
      from: match.index,
    })
  }

  const charged = new Map<string, string | undefined>()
  found.forEach((entry, index) => {
    const until = found[index + 1]?.from ?? SOURCE.length
    const block = SOURCE.slice(entry.from, until)
    charged.set(entry.key, /throttle\(request, '([a-z_]+)'/.exec(block)?.[1])
  })

  return charged
}

describe('every authoring write route charges the action it was given (FR-1039)', () => {
  let registered: Set<string>

  beforeAll(async () => {
    registered = new Set()
    const app = await buildApp({
      onRoute: (route: RouteOptions) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method]
        for (const method of methods) registered.add(`${method} ${route.url}`)
      },
    })
    await app.close()
  })

  it('found the registrations to audit', () => {
    // A parser that matched nothing would make every assertion below vacuous, which is the failure
    // mode this repository has already shipped once (010's precache guard).
    const charged = chargedActions()
    expect(charged.size).toBeGreaterThanOrEqual(EXPECTED.length)
  })

  it('audits a route that this application actually registers', () => {
    for (const entry of EXPECTED) {
      expect(
        registered.has(`${entry.method} ${entry.path}`),
        `This file audits \`${entry.method} ${entry.path}\`, which the application does not ` +
          'register. Either the route was renamed and this list was not, or it was removed — and ' +
          'an entry naming nothing audits nothing while reading as though it does.',
      ).toBe(true)
    }
  })

  it.each(EXPECTED)('charges $action on $method $path', ({ method, path, action }) => {
    const charged = chargedActions().get(`${method} ${path}`)

    expect(
      charged,
      `\`${method} ${path}\` charges \`${charged ?? 'nothing'}\` and this audit expects ` +
        `\`${action}\`. FR-1039 names these actions individually so that one act cannot spend ` +
        "another's allowance; a route pointed at the wrong bucket satisfies every other throttle " +
        'test in this repository, because those assert the TABLE and this asserts the BINDING.',
    ).toBe(action)
  })

  /**
   * The two bindings whose value is not merely tidiness, pinned separately.
   *
   * The `it.each` above already covers them — but "the audit covers the act that reaches phones"
   * and "the audit happens to include it in a list" are different claims, and only the first
   * survives somebody editing the table above without reading the thresholds.
   */
  it('keeps cancellation on a strictly tighter bound than an ordinary session edit', () => {
    const cancel = THRESHOLDS.session_cancel.identifier.freeAttempts
    const write = THRESHOLDS.session_write.identifier.freeAttempts

    expect(
      cancel,
      'Cancellation is charged the same or more than an ordinary edit. It is the act most likely ' +
        'to reach every saver’s lock screen, and an unthrottled cancel loop is a push amplifier.',
    ).toBeLessThan(write)
  })

  it('does not let the conference edit share the tracks-rooms-speakers bucket', () => {
    const charged = chargedActions()

    expect(
      charged.get('PATCH /admin/conferences/:eventId'),
      'The conference edit is back on `catalog_write`. That bucket is generous because an ' +
        'organizer creates every room and speaker in one sitting; this route moves the date ' +
        'range, whose refusal names every session it would orphan, and gates the timezone freeze.',
    ).not.toBe(charged.get('POST /admin/conferences/:eventId/tracks'))
  })
})
