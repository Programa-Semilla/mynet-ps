import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { THROTTLED_READ_ROUTES } from '../../src/auth/throttle.js'

/**
 * T015 (010) — **the read-bound enumeration, and the thing that keeps it from going stale**
 * (FR-803a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"AN ENUMERATION THAT A NEW POLL CAN SILENTLY SIT OUTSIDE IS NOT A BOUND."**
 *
 * That sentence is FR-803a, and it is the whole design. `THROTTLED_READ_ROUTES` lists the routes
 * a client requests repeatedly without a person acting. A list like that is correct on the day it
 * is written and wrong the first time somebody adds a poll — and nothing about adding a poll
 * makes anybody open this file.
 *
 * So the audit runs in **both directions**:
 *
 *   1. **Every listed route exists and charges its action.** A route renamed out from under the
 *      list, or one that stopped calling the throttle, leaves an entry that reads as an enforced
 *      bound and enforces nothing.
 *   2. **Every authenticated GET route is classified.** Either it is in the list, or it is in
 *      `UNTHROTTLED_READS` below with a reason written down. **A new GET route fails this build
 *      until somebody says which it is** — the same fail-by-existence discipline
 *      `deletion-coverage` and `export-coverage` apply to tables, and for the same reason: the
 *      alternative is a guard that only ever covers the routes that happened to exist when it
 *      was written.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const ROUTES_DIR = fileURLToPath(new URL('../../src/routes/', import.meta.url))

/**
 * Authenticated GET routes that are deliberately **not** read-bounded, each with the reason.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **DO NOT ADD A ROUTE HERE TO MAKE A FAILURE GO AWAY.** The question this list answers is "does
 * a client request this repeatedly without a person acting?" — not "is this route important?".
 * If the answer is yes, it belongs in `THROTTLED_READ_ROUTES` instead.
 *
 * The costs are asymmetric and worth knowing before choosing. Putting a genuine poll here leaves
 * an unbounded read on a public URL. Putting a person-driven route in the bound list delays
 * somebody who pressed a button, for no defensive gain — which is why "everything is throttled"
 * is not the safe default it sounds like.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const UNTHROTTLED_READS: Record<string, string> = {
  // Liveness and readiness. Unauthenticated by design and consulted by the deployment gate, not
  // by a client (FR-827).
  'GET /health': 'deployment liveness probe; no attendee data, no session',
  'GET /ready': 'deployment readiness gate; no attendee data, no session',

  // One request per navigation or per sign-in. A person acted.
  'GET /auth/me': 'resolved once when the shell mounts, to render the greeting',
  'GET /events': 'the event switcher, read when the shell mounts and when it is opened',
  'GET /workspace/active-event': 'read once on mount; written when a person switches conference',
  'GET /profile': 'the attendee’s own profile view',
  'GET /profile/avatar': 'one image request per profile render, cached by the browser',
  'GET /blocks': 'the block list, read when the safety surface is opened',

  // Conference content and personal state. Requested when a destination is opened, and cached at
  // the repository boundary with a 24-hour lifetime — so repetition is bounded by the cache
  // rather than by a throttle.
  'GET /events/:eventId/sessions': 'the programme; cached for 24 hours at the repository boundary',
  'GET /events/:eventId/tracks': 'the track list; cached alongside the programme',
  'GET /events/:eventId/agenda/saved': 'personal schedule; cached alongside the programme',
  'GET /events/:eventId/agenda/notes': 'personal notes; cached alongside the programme',

  // Opened from a card or a list, one at a time, by a person.
  'GET /events/:eventId/attendees/:attendeeId': 'one profile, opened from the directory',
  'GET /events/:eventId/attendees/:attendeeId/avatar': 'one image, cached by the browser',
  'GET /events/:eventId/sessions/:sessionId/questions':
    'the Q&A list. **Nothing polls it** — 009 asserts that absence in qa-absences.test.ts, and ' +
    'every write returns the re-ordered list so the surface updates without re-reading',
  'GET /events/:eventId/appointments': 'the Network destination’s appointment list',
  'GET /events/:eventId/appointments/slots':
    'the scheduling dialog’s slot grid, read when the dialog opens',
  'GET /cards/held': 'the contacts list, read when Network is opened',
  'GET /cards/held/:attendeeId': 'one held card, opened from the contacts list',
  'GET /cards/shared': 'the cards-given list, read when Network is opened',
  'GET /conversations': 'the conversation list, read when Messages is opened',
  'GET /conversations/unread':
    'Home’s unread indicator. Read once per Home render and **not polled** — verified against ' +
    'apps/web/src: the only intervals in the client are the thread poll and the offline ' +
    'reachability probe. If this ever gains a timer it belongs in THROTTLED_READ_ROUTES.',

  // Already throttled, on its own dedicated action.
  'GET /profile/export':
    'charged to the `export` action, which MAY deny — the most expensive request the product ' +
    'serves. A second read bound on top would be two throttles on one route.',

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **013 — the administrative reads, and the population is the whole argument.**
  //
  // FR-803a bounds reads a *client* issues repeatedly without a person acting, and the harm it
  // names is bulk collection. Neither applies here, for a reason that is structural rather than
  // circumstantial: **neither administrative tier is reachable by self sign-up** (decision 32).
  // The population is a handful of operators seeded as reviewed data, so there is no way to
  // acquire an administrative session at scale — and the one door that *is* unauthenticated,
  // `POST /admin/session`, is bounded on its own `admin_sign_in` action.
  //
  // **Nothing in `apps/admin/src` polls**, verified against the source: there is no interval, no
  // refetch timer, and `ReportDetail.tsx` records why the reporter is given nothing to poll.
  // If a live queue is ever added, these belong in `THROTTLED_READ_ROUTES` instead.
  //
  // **The report reads are additionally covered by something a throttle is not**: reading one
  // report writes an audit entry (FR-995), so bulk reading is *attributable* rather than merely
  // slowed — which is the control decision 38 actually asked for.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  'GET /admin/me': 'the operator’s own identity and tier, resolved once when the shell mounts',
  'GET /admin/conferences': 'the conference list, read when that destination is opened',
  'GET /admin/reports':
    'the report queue, read when the destination is opened. Carries **no content** — that is why ' +
    'reading the list writes no audit entry — so there is no bulk collection to bound.',
  'GET /admin/reports/:reportId':
    'one report, opened from the queue by a person. **Writes an audit entry** (FR-995), which ' +
    'makes repeated reading accountable rather than rate-limited.',

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **014 — the programme editor's one read**, and it inherits the whole administrative
  // argument above: the population is a handful of promoted attendees and seeded operators,
  // neither tier is reachable by self sign-up, and nothing in `apps/admin/src` polls.
  //
  // Worth naming what it carries, because it is the one administrative read that touches
  // attendee state at all: **engagement counts per session** (FR-1025). Counts only — no
  // attendee is identified and no note, question or vote content is disclosed (FR-1042) — so
  // there is no directory to harvest here, which is the harm FR-803a's read bounds exist for.
  //
  // Its **writes** are all bounded, on five dedicated actions (FR-1039), and `session_cancel`
  // is the one that matters: it is the only authoring act that reaches attendees' phones.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  'GET /admin/conferences/:eventId/programme':
    'the programme editor, read when a conference is opened and after each write. Carries ' +
    'engagement COUNTS per session and no attendee identity (FR-1025, FR-1042), so there is ' +
    'nothing here to collect in bulk. Every write on this surface is throttled on its own ' +
    'action instead.',

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **014 tranche 2 — the vocabulary reads.** The administrative three inherit the whole
  // administrative argument above (platform tier only, no self sign-up, nothing in
  // `apps/admin/src` polls); all carry reference-data LABELS and no attendee identity, no
  // count and no roster (FR-1099b), so there is nothing to collect in bulk. Every vocabulary
  // WRITE is throttled on its own `vocabulary_write` action.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  'GET /admin/vocabulary/sectors':
    'the sector list for the vocabulary screen, read when the destination is opened. Labels ' +
    'and retirement stamps only — reference data, no attendee anywhere in it (FR-1085a).',
  'GET /admin/vocabulary/subsectors':
    'the subsector list, read with the sectors. Same reference-data argument.',
  'GET /admin/vocabulary/interests':
    'the interest-option list, read with the sectors. Same reference-data argument.',

  // The attendee-side half. FR-803a's harm is bulk collection of PEOPLE — a directory paged at
  // a hundred faces a request is why `directory_read` exists. This is a closed list of labels
  // the product publishes identically to every signed-in attendee (FR-1096's reasoning: a
  // closed vocabulary is not population data), read once when the profile editor or Discover's
  // filters open, and nothing polls it. A rogue client rereading it collects the same handful
  // of strings forever.
  'GET /vocabulary':
    'the choosable vocabulary: cross-event reference data, identical for every attendee, no ' +
    'personal data to collect. Read when the profile editor opens; nothing polls it.',

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **014 tranche 2 — enrolment's two reads.** Person-driven, one session at a time; the WRITE
  // that matters — taking a place — is bounded on its own `session_enrol` action, which exists
  // to bound the exclusive session-row lock rather than work (research R12).
  // ─────────────────────────────────────────────────────────────────────────────────────────
  'GET /events/:eventId/sessions/:sessionId/places':
    'the remaining-places figure for ONE optional session, read when its detail opens and while ' +
    'a person decides (FR-1070). Live rather than cached because a stale number reads as a ' +
    'promise of a place (FR-1070b) — live is about freshness, not frequency: nothing polls it, ' +
    'no surface aggregates it across sessions (FR-1070a), and it carries a number and a boolean ' +
    'about conference content, with no attendee anywhere in it.',
  'GET /admin/conferences/:eventId/sessions/:id/enrolments':
    'the enrolment roster, opened from one session by an organizer preparing materials — the ' +
    'fourth Principle VIII exception (v5.3.0 O1), names only, bounded to an assigned ' +
    'conference. Inherits the whole administrative argument above: no self sign-up into either ' +
    'tier, and nothing in apps/admin/src polls.',
}

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

/** Every `.ts` under `src/routes/`, concatenated. The audit asks what the routes actually call. */
const routeSources = (dir: string = ROUTES_DIR): string =>
  readdirSync(dir)
    .map((entry) => {
      const path = `${dir}${entry}`
      if (statSync(path).isDirectory()) return routeSources(`${path}/`)
      return path.endsWith('.ts') ? readFileSync(path, 'utf8') : ''
    })
    .join('\n')

describe('read-bound route audit (FR-803a)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate.
    expect(routes.length).toBeGreaterThan(20)
    expect(THROTTLED_READ_ROUTES.length).toBeGreaterThan(0)
  })

  /**
   * Direction 1a: the list does not name routes that do not exist.
   */
  it('every listed route exists in the real route table', () => {
    const declared = new Set(
      routes.flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`)),
    )

    for (const entry of THROTTLED_READ_ROUTES) {
      expect(
        declared.has(`${entry.method} ${entry.path}`),
        `THROTTLED_READ_ROUTES names \`${entry.method} ${entry.path}\`, which is not a route this ` +
          'application registers. Either the route was renamed and the list was not, or the ' +
          'route was removed — and an entry naming nothing reads as an enforced bound while ' +
          'enforcing nothing (FR-803a).',
      ).toBe(true)
    }
  })

  /**
   * Direction 1b: **and the route actually charges the action.**
   *
   * This is the assertion that separates "configured" from "enforced". A threshold entry, a list
   * entry and a registered route can all be perfectly in place while the handler never calls the
   * throttle — which is the exact gap 007's `conversation-create-throttle.test.ts` was written to
   * close for a different action, discovered at a spec-compliance review.
   */
  it('every listed action is actually named in the route sources', () => {
    const source = routeSources()

    for (const entry of THROTTLED_READ_ROUTES) {
      expect(
        source.includes(`'${entry.action}'`),
        `No route under src/routes/ charges the \`${entry.action}\` action. The threshold, the ` +
          'enumeration and the route can all be right while nothing calls the throttle, and ' +
          'every other test in this repository stays green while the bound does nothing.',
      ).toBe(true)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * Direction 2 — **the half that binds a FUTURE feature**, which is the half FR-803a is about.
   *
   * If this failed for a route you just added: decide whether a client requests it repeatedly
   * without a person acting. If it does, add it to `THROTTLED_READ_ROUTES` and give the action a
   * threshold. If it does not, add it to `UNTHROTTLED_READS` above **with the reason** — the
   * reason is the deliverable, because it is what the next reader checks against reality.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('classifies every GET route as bounded or deliberately unbounded', () => {
    const bounded = new Set(THROTTLED_READ_ROUTES.map((entry) => `${entry.method} ${entry.path}`))

    const unclassified = routes
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))
      .filter((key) => key.startsWith('GET '))
      .filter((key) => !bounded.has(key) && !(key in UNTHROTTLED_READS))

    expect(
      unclassified,
      'These GET routes are neither read-bounded nor recorded as deliberately unbounded. ' +
        'FR-803a requires the enumeration to be one a new poll cannot silently sit outside — so ' +
        'a new read route has to be classified before it ships. See UNTHROTTLED_READS in this ' +
        'file for how to record the "no" answer, and say WHY rather than only that.',
    ).toEqual([])
  })

  /**
   * The mirror of the above: an entry in `UNTHROTTLED_READS` for a route that no longer exists is
   * a reason nobody will ever re-check, and it makes the list look more considered than it is.
   */
  it('records no exemption for a route that no longer exists', () => {
    const declared = new Set(
      routes.flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`)),
    )

    const stale = Object.keys(UNTHROTTLED_READS).filter((key) => !declared.has(key))

    expect(stale, 'UNTHROTTLED_READS exempts routes that no longer exist.').toEqual([])
  })

  /**
   * The two routes FR-803 names, pinned individually.
   *
   * The generic assertions above already cover them — but "the audit covers the new routes" and
   * "the audit happens to match a pattern the new routes also match" are different claims, and
   * only the first survives somebody renaming a route.
   */
  it('bounds the message-thread poll and the directory listing, specifically (FR-803)', () => {
    const bounded = new Map(
      THROTTLED_READ_ROUTES.map((entry) => [`${entry.method} ${entry.path}`, entry.action]),
    )

    expect(bounded.get('GET /events/:eventId/attendees')).toBe('directory_read')
    expect(bounded.get('GET /conversations/:conversationId/messages')).toBe('thread_read')
  })
})
