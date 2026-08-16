import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { HTTPMethods, RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T093 (014) — **no route suspends, removes or restricts an attendee** (FR-1041).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **AN OPERATOR ACTS ON CONTENT AND ON AUTHORITY. ACTING ON A PERSON IS A DIFFERENT POWER AND
 * THIS PRODUCT DOES NOT HAVE IT.**
 *
 * 013 asserted this as FR-955 the day the actor was created. 014 is the first feature to widen
 * what an administrator can *do*, and it widens it into the part of the product attendees are
 * attached to — sessions they saved, questions they asked, notes they wrote. That is exactly the
 * context in which "and remove the attendee who keeps doing this" starts to sound like the
 * missing piece, so the absence is re-proved here rather than inherited.
 *
 * Two boundaries, and they are different rules that happen to look alike:
 *
 *   - **No moderation of a person.** An operator may remove one reported question (013, bounded
 *     by the report queue) and may promote or demote an organizer. Suspending, banning, muting or
 *     restricting an attendee is a power with its own governance — who decides, on what standard,
 *     with what appeal — and none of that is decided. Register entry 19 is the live example of
 *     what happens when a capability is built before the policy exists.
 *   - **No deletion on somebody's behalf.** Decision 12 makes erasure the attendee's **own**
 *     right, exercised by them, and v4.1.0 restates that deletion is *never conditional*. An
 *     administrative delete-account route would invert that: the same button, pressed by
 *     somebody else, is removal rather than erasure.
 *
 * **014 has a specific temptation the earlier features did not**: cancellation preserves
 * everybody's engagement (FR-1021), so an organizer facing content they object to cannot remove
 * it by cancelling the session. The gap is real and is answered by the report queue, which
 * already exists — not by a new power over the person.
 *
 * Comments are stripped before matching, as 009's guards do — every verb below appears in the
 * prose above.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **FIX-1 (constitution v5.4.0, R1) — the positive enumeration matches the CONCEPT, not the
 * vocabulary.**
 *
 * As written for 014 it pre-filtered on `/attendee|organizers?/i` before enumerating, so
 * `DELETE /admin/conferences/:eventId/registrations/:id` — the most natural name for a capability
 * 015 might add — passed **all four** assertions green. Three of them select on words a route URL
 * happens to contain, and `registrations` is none of them; the fourth is the strong one and never
 * reached the comparison, because the pre-filter removed the route before it got there.
 *
 * **Ending somebody's registration is an act on their ACCESS, and an act on access is an act on
 * the person however neutrally the URL reads.** That is the boundary FR-1041 draws, and a guard
 * that can only see it when the URL says "attendee" is a guard against a naming convention.
 *
 * So the pre-filter is gone. **Every non-GET route under `/admin` is enumerated and compared
 * against a written allow-list that says, per entry, what the route acts on.** This is
 * `deletion-coverage`'s property applied to routes: a new administrative write **fails by
 * existing**, and adding one requires writing down what it does and why it is not an act on a
 * person. **Register entry 22 was closed as *accepted* on the single ground that no third party
 * can end a registration today, and this assertion is the only thing in the codebase that says
 * so** — R1 states that if any feature grants that power, entry 22 reopens.
 *
 * **The three negative assertions above stay, and must NOT be widened to compensate.** They are
 * documentation of the specific words nobody may use, and a redundant check is worth having; but
 * a keyword list is a list of what somebody remembered, which is what 016's review recorded about
 * the lint denylist. The concept is enforced positively, below, or not at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const label = (path: string): string => path.slice(apiSrc.length)

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const labelsOf = (route: RouteOptions): string[] =>
  methodsOf(route).map((method) => `${method} ${route.url}`)

const urlOf = (label: string): string => label.slice(label.indexOf(' ') + 1)

/**
 * **`HEAD` is a read, and Fastify mints one for every `GET` it is given.**
 *
 * `exposeHeadRoutes` is on by default, so the route table carries a `HEAD` sibling of every
 * administrative read. Treating those as writes would put twelve mirrors of `GET` routes into the
 * allow-list below and teach the next reader that this list is bookkeeping. It is not: **it is the
 * list of every way an administrator changes something.**
 *
 * This is a filter on the METHOD, which is what FIX-101 permits. The thing FIX-101 forbids is a
 * filter on the URL — that is what made the old shape blind, and there is none here.
 */
const READ_METHODS = new Set(['GET', 'HEAD'])

const writeLabelsOf = (route: RouteOptions): string[] =>
  methodsOf(route)
    .filter((method) => !READ_METHODS.has(method))
    .map((method) => `${method} ${route.url}`)

/**
 * **The population, selected by prefix — and the prefix is a convention, not a mechanism.**
 *
 * `apps/api/src/routes/admin/index.ts` registers its nine plugins with **no `{ prefix: '/admin' }`
 * option**: every URL is a hand-written literal inside each module. So this expression is the same
 * dependency on a naming convention that FIX-101 removed one level down — an administrative write
 * registered at a URL not beginning with `/admin` is not *permitted* by the enumeration below, it
 * is **invisible to it**, and the enumeration is what register entry 22 now rests on.
 *
 * It is kept — a prefix is how the product is actually organised, and re-deriving the population
 * from something else would be inventing a second convention. What is added is a guard: the last
 * assertion in this file reads the nine modules and fails if any route literal escapes the prefix,
 * so a route that would disappear from this population fails a test instead.
 */
const ADMIN_PREFIX = /^\/admin(\/|$)/

const adminRoutesOf = (routes: readonly RouteOptions[]): RouteOptions[] =>
  routes.filter((route) => ADMIN_PREFIX.test(route.url))

/**
 * A route object with the two fields this file reads, for driving the derivation from a **table**
 * rather than from the routes that happen to exist (FIX-104).
 *
 * The tables below hand these to `unlistedWrites`, so the stage that was blind in the old shape —
 * turning a route tree into a set of labels — is the stage the tables exercise.
 */
const synthetic = (method: HTTPMethods, url: string): RouteOptions => ({
  method,
  url,
  handler: async () => undefined,
})

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT AN ADMINISTRATIVE WRITE MAY ACT ON. THERE ARE THREE CATEGORIES AND THE MISSING FOURTH
 * IS THE POINT.**
 *
 *   - **`content`** — a conference, a track, a room, a speaker, a session, a reported question, a
 *     vocabulary label. Things the product holds *about the event*. An organizer authors these
 *     (v5.2.0, decision 48) and a platform operator authors them everywhere.
 *   - **`authority`** — who may act, and over which conference. Promotion and demotion change
 *     what somebody may **do**; neither changes what they **are**, and neither touches their
 *     MyNet experience in any observable way (decision 33).
 *   - **`operator-self`** — the requesting operator's own session and own credential. The subject
 *     is the caller and can be nobody else. It is a separate category rather than folded into
 *     `authority` because folding it in would make "an administrative write whose subject is a
 *     person" look like something this product already does.
 *
 * **There is no category for an act on an attendee, on their account, or on their access, and
 * adding one is not an allow-list edit — it is an amendment** (FR-1041, decision 12, v4.1.0).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
type ActsOn = 'content' | 'authority' | 'operator-self'

/**
 * Every non-`GET` route under `/admin`, keyed `METHOD /url`, with **what it acts on**.
 *
 * An entry carrying no stated reasoning is the failure this assertion exists to prevent
 * (FIX-102) — `deletion-coverage` says the same thing about `NOT_ATTENDEE_DATA`, and for the same
 * reason: an allow-list whose entries are bare keys is how the thing it guards eventually joins
 * it. The reasons are asserted to be present and substantive, below.
 */
const PERMITTED: Record<string, { readonly acts: ActsOn; readonly why: string }> = {
  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 013 — the administrative session. The subject of all three is the operator making the call.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'POST /admin/session': {
    acts: 'operator-self',
    why:
      'Administrative sign-in (FR-915). Establishes the caller’s own session on the admin ' +
      'origin, host-only and independent of any MyNet session (decision 37). Names no attendee ' +
      'and reads no attendee row beyond resolving the caller’s own principal.',
  },
  'DELETE /admin/session': {
    acts: 'operator-self',
    why:
      'Administrative sign-out. Ends the caller’s own session and nobody else’s — there is no ' +
      'route that ends another principal’s session, administrative or attendee.',
  },
  'PUT /admin/session/credential': {
    acts: 'operator-self',
    why:
      'The operator sets their OWN password, which is what makes the seeded credential-less ' +
      'operator usable (FR-918a). It cannot address another principal: the target is the ' +
      'session’s own operator, so it is not a credential-reset power over anybody.',
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 013 — moderation. An operator acts on CONTENT that was reported, never on whoever wrote it.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'POST /admin/reports/:reportId/resolution': {
    acts: 'content',
    why:
      'Records how a report was resolved (FR-993). Writes a resolution row and an audit ' +
      'entry; the reporter is still told nothing, and the reported attendee is neither ' +
      'suspended, restricted nor notified — there is no route that could do any of those.',
  },
  'DELETE /admin/questions/:questionId': {
    acts: 'content',
    why:
      'Removes ONE reported question (FR-991), bounded by the report queue. It is the ' +
      'answer to content somebody objects to, and it is deliberately the only one: the ' +
      'alternative an operator does not have is removing the person who asked it.',
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 013 — AUTHORITY. **These two are the only administrative writes whose subject is an
  // attendee**, and both change what that attendee may DO. Promotion grants an organizer
  // assignment; demotion revokes it. Neither reaches their profile, their registration, their
  // saved sessions or their ability to use MyNet at all (decision 33).
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'POST /admin/conferences/:eventId/organizers': {
    acts: 'authority',
    why:
      'Promotion (FR-940). Grants an attendee an organizer assignment over ONE conference. ' +
      'Their attendee experience is unchanged in every observable way, which is asserted ' +
      'separately as an absence.',
  },
  'DELETE /admin/conferences/:eventId/organizers/:attendeeId': {
    acts: 'authority',
    why:
      'Demotion (FR-941). Revokes one assignment. It removes a capability, never access: the ' +
      'demoted attendee keeps their account, their registration and their whole MyNet ' +
      'experience, and the conference they can no longer author is one they can still attend.',
  },
  'POST /admin/operators/:operatorId/deactivation': {
    acts: 'authority',
    why:
      'Ends a platform operator’s access permanently (FR-908). **The subject is an operator, ' +
      'not an attendee** — no `attendees` row, no profile, no MyNet surface (FR-901, FR-903) — ' +
      'so it ends nobody’s ability to use the product. The same act aimed at an attendee is ' +
      'exactly what FR-1041 forbids, and this entry is the closest the product comes to it.',
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 014 tranche 1 and 2 — conference authoring. All CONTENT. The one to read twice is the
  // session delete: it is refused outright when anybody has engaged with the session
  // (decision 49), which is why a cancel route exists beside it.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'POST /admin/conferences': {
    acts: 'content',
    why:
      'Creates a conference (FR-1000, decision 47). The creator is assigned to what they ' +
      'create; it grants no platform capability and no route to promote anybody.',
  },
  'PATCH /admin/conferences/:eventId': {
    acts: 'content',
    why:
      'Edits conference content — name, venue, dates, modality, format, access link ' +
      '(FR-1046, FR-1047). Nothing here names an attendee or touches a registration.',
  },
  'POST /admin/conferences/:eventId/tracks': {
    acts: 'content',
    why: 'Creates a track — a session category, visually coded. Conference content (002).',
  },
  'PATCH /admin/conferences/:eventId/tracks/:id': {
    acts: 'content',
    why: 'Edits a track. Conference content; no attendee row is read or written.',
  },
  'DELETE /admin/conferences/:eventId/tracks/:id': {
    acts: 'content',
    why: 'Deletes a track, refused while sessions reference it. Conference content.',
  },
  'POST /admin/conferences/:eventId/rooms': {
    acts: 'content',
    why: 'Creates a room. Conference content — a place, not a person.',
  },
  'PATCH /admin/conferences/:eventId/rooms/:id': {
    acts: 'content',
    why:
      'Edits a room. A room change on a saved session dispatches the second notification ' +
      'trigger (v5.2.0 N1); the attendee is informed, never acted upon.',
  },
  'DELETE /admin/conferences/:eventId/rooms/:id': {
    acts: 'content',
    why: 'Deletes a room, refused while sessions reference it. Conference content.',
  },
  'POST /admin/conferences/:eventId/speakers': {
    acts: 'content',
    why:
      'Creates a speaker. A speaker is data the attendee READS, not a user of the system ' +
      '(002) — and register entry 30 is open about what that means for a real person who never ' +
      'signed up. It is still not an act on an attendee, which is what FR-1041 governs.',
  },
  'PATCH /admin/conferences/:eventId/speakers/:id': {
    acts: 'content',
    why:
      'Edits a speaker record. Conference content; see the creation entry above for why a ' +
      'speaker is not an attendee, and register entry 30 for what is open about it.',
  },
  'DELETE /admin/conferences/:eventId/speakers/:id': {
    acts: 'content',
    why:
      'Deletes a speaker record. Conference content — it removes a listing, not a person’s ' +
      'access to anything, because a speaker has none to remove.',
  },
  'POST /admin/conferences/:eventId/sessions': {
    acts: 'content',
    why:
      'Creates a session, optionally with a capacity and a closing offset (FR-1060). ' +
      'Conference content.',
  },
  'PATCH /admin/conferences/:eventId/sessions/:id': {
    acts: 'content',
    why:
      'Edits a session. A start-time or room change dispatches the second notification ' +
      'trigger (v5.2.0 N1); a capacity edit takes the enrolment lock (R12). Neither reads nor ' +
      'writes an attendee row beyond the commitment rows the session itself owns.',
  },
  'POST /admin/conferences/:eventId/sessions/:id/cancel': {
    acts: 'content',
    why:
      'Cancels a session (FR-1021, decision 49). **Preserves every saved session, note, ' +
      'question and vote** — which is what stops an organizer using the authoring tools to ' +
      'remove content they object to, and leaves the report queue as the answer.',
  },
  'POST /admin/conferences/:eventId/sessions/:id/reinstate': {
    acts: 'content',
    why:
      'Reverses a cancellation. Cancellation is stored state rather than derived, so ' +
      'un-setting it is an ordinary content edit.',
  },
  'DELETE /admin/conferences/:eventId/sessions/:id': {
    acts: 'content',
    why:
      'Deletes a session, **refused under lock when anybody has engaged with it** ' +
      '(decision 49). Held places are outside that set by decision 51 and are lost silently, ' +
      'which is register entry 31 — an open question about a notification, not a power over ' +
      'the enrolled: nobody’s account, registration or access is touched either way.',
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 014 tranche 2 — the profile taxonomy. Product-wide reference data, authored at platform
  // tier. Retiring or deleting a label **must never write to an attendee record** (FR-1094):
  // an attendee's CHOSEN sector and interests are theirs, and this vocabulary is the product's.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  'POST /admin/vocabulary/sectors': {
    acts: 'content',
    why: 'Creates a sector label. Product-wide reference data (FR-1085a), naming no attendee.',
  },
  'PATCH /admin/vocabulary/sectors/:id': {
    acts: 'content',
    why: 'Renames a sector label. Reference data; no attendee record is edited (FR-1094).',
  },
  'POST /admin/vocabulary/sectors/:id/retirement': {
    acts: 'content',
    why:
      'Retires a sector — it stops being offered and existing selections survive. The ' +
      'asymmetry is deliberate and is the opposite of an act on the people who chose it.',
  },
  'DELETE /admin/vocabulary/sectors/:id/retirement': {
    acts: 'content',
    why: 'Un-retires a sector, offering the label again. Reference data.',
  },
  'DELETE /admin/vocabulary/sectors/:id': {
    acts: 'content',
    why:
      'Deletes a sector label, refused while anything references it. Reference data — it ' +
      'never edits an attendee’s selection to make itself possible (FR-1094).',
  },
  'POST /admin/vocabulary/subsectors': {
    acts: 'content',
    why: 'Creates a subsector label. Product-wide reference data (FR-1085a).',
  },
  'PATCH /admin/vocabulary/subsectors/:id': {
    acts: 'content',
    why: 'Renames a subsector label. Reference data; no attendee record is edited (FR-1094).',
  },
  'POST /admin/vocabulary/subsectors/:id/retirement': {
    acts: 'content',
    why: 'Retires a subsector. Existing selections survive; nothing is written to an attendee.',
  },
  'DELETE /admin/vocabulary/subsectors/:id/retirement': {
    acts: 'content',
    why: 'Un-retires a subsector, offering the label again. Reference data.',
  },
  'DELETE /admin/vocabulary/subsectors/:id': {
    acts: 'content',
    why: 'Deletes a subsector label, refused while anything references it. Reference data.',
  },
  'POST /admin/vocabulary/interests': {
    acts: 'content',
    why: 'Creates an interest label. Product-wide reference data (FR-1085a).',
  },
  'PATCH /admin/vocabulary/interests/:id': {
    acts: 'content',
    why: 'Renames an interest label. Reference data; no attendee record is edited (FR-1094).',
  },
  'POST /admin/vocabulary/interests/:id/retirement': {
    acts: 'content',
    why: 'Retires an interest. Existing selections survive; nothing is written to an attendee.',
  },
  'DELETE /admin/vocabulary/interests/:id/retirement': {
    acts: 'content',
    why: 'Un-retires an interest, offering the label again. Reference data.',
  },
  'DELETE /admin/vocabulary/interests/:id': {
    acts: 'content',
    why:
      'Deletes an interest label, refused while anything references it. Reference data — ' +
      '`attendee_interests` rows are the attendee’s and are never rewritten to permit this.',
  },
}

/**
 * The predicate the widened assertion is built on, **exported from the assertion so it can be
 * driven by a table** (FIX-104).
 *
 * A guard exercised only by the routes that happen to exist stops guarding when they change —
 * 009 recorded exactly this about the event audit's conference-content predicate, and narrowed it
 * against a table of paths that must still be caught rather than against the routes of the day.
 */
const unlisted = (labels: readonly string[]): string[] =>
  labels.filter((label) => !(label in PERMITTED)).sort()

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE WHOLE DERIVATION, AS ONE NAMED FUNCTION — BECAUSE THE DERIVATION IS THE STAGE THAT WAS
 * BLIND** (FIX-104).
 *
 * The old shape did not fail because `label in PERMITTED` was wrong; it failed because the label
 * set handed to it had already had the interesting route removed. A table that calls `unlisted`
 * with pre-formed label strings therefore exercises the half that was never broken, and leaves
 * `routes → labels` covered by nothing but the routes of the day — which is the exact condition
 * FIX-104 exists to remove.
 *
 * So `filter`, `writeLabelsOf` and `unlisted` are composed here, the live assertion calls this,
 * and **both tables below drive this with synthetic route objects**. Re-introducing a URL filter
 * at any stage — `routes.filter((r) => !/registrations/.test(r.url))` is the natural one — now
 * fails the forbidden table rather than passing green.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
const adminWriteLabels = (routes: readonly RouteOptions[]): string[] =>
  adminRoutesOf(routes).flatMap(writeLabelsOf).sort()

const unlistedWrites = (routes: readonly RouteOptions[]): string[] =>
  unlisted(adminWriteLabels(routes))

/**
 * **The pre-filter that made the old shape blind**, kept as a literal so the failure it caused is
 * demonstrable rather than described (FIX-104).
 *
 * **No enumeration filters on it — that is what FIX-101 removed, and removing it is the fix.** It
 * survives as the *subject* of two assertions rather than as a step in any of them: one selects the
 * permitted writes whose URL happens to name an attendee or an organizer and pins that set at two,
 * and one asserts that the forbidden routes below do **not** match it, which is what makes the
 * blindness demonstrable side by side rather than described in prose.
 *
 * **The first of those is deliberately weaker than it reads**, and that is the reason it is not the
 * guard: it can only speak about routes whose URL contains one of these two words, so a permitted
 * route named `.../registrations/:id` would satisfy it by never being selected. **The enumeration
 * is what covers routes whose URL names neither word**, and this regular expression must never be
 * moved back in front of it.
 */
const NAME_MATCHING_PREFILTER = /attendee|organizers?/i

/**
 * Routes this product must never register, written down **as a table rather than discovered from
 * the route tree** (FIX-104), and driven through `unlistedWrites` as synthetic routes so the
 * derivation is what the table exercises.
 *
 * `missedByName` records whether the retired pre-filter would have examined the route at all. The
 * four that it would not are the whole reason this file changed: **every one of them ends
 * somebody's access without the URL ever saying so.**
 */
const FORBIDDEN: readonly {
  readonly method: HTTPMethods
  readonly url: string
  readonly missedByName: boolean
  readonly note: string
}[] = [
  {
    method: 'DELETE',
    url: '/admin/conferences/:eventId/registrations/:id',
    missedByName: true,
    note:
      'Ends a registration. This is the exact shape R1 names, and the ground register entry ' +
      '22 was closed on is that it does not exist.',
  },
  {
    method: 'POST',
    url: '/admin/conferences/:eventId/registrations/:id/removal',
    missedByName: true,
    note:
      'The same act spelled as a sub-resource, which is how this codebase already names ' +
      'deactivation and retirement — so it is the likelier of the two, not the exotic one.',
  },
  {
    method: 'DELETE',
    url: '/admin/conferences/:eventId/enrolments/:id',
    missedByName: true,
    note:
      'Releases somebody’s held place. An enrolment is not engagement (decision 51), but ' +
      'that governs DELETING THE SESSION — it does not license a third party taking one ' +
      'person’s place away.',
  },
  {
    method: 'DELETE',
    url: '/admin/conferences/:eventId/participants/:id',
    missedByName: true,
    note:
      'The same act under a third noun. The vocabulary is unbounded, which is why the ' +
      'assertion enumerates what is permitted instead of guessing what is not.',
  },
  {
    method: 'DELETE',
    url: '/admin/attendees/:attendeeId',
    missedByName: false,
    note:
      'Removal on somebody’s behalf. Erasure is the attendee’s OWN right (decision 12) and ' +
      'is never conditional (v4.1.0).',
  },
  {
    method: 'POST',
    url: '/admin/attendees/:attendeeId/suspension',
    missedByName: false,
    note:
      'Suspension — a power with its own governance, none of which is decided. Register ' +
      'entry 19 is what building a capability before the policy looks like.',
  },
]

describe('014 — an operator acts on content, never on a person (FR-1041)', () => {
  /** Every route the application registers, unfiltered — the input the derivation takes. */
  let registered: RouteOptions[]
  let admin: RouteOptions[]

  beforeAll(async () => {
    const routes: RouteOptions[] = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
    registered = routes
    admin = adminRoutesOf(routes)
  })

  it('found administrative routes to audit', () => {
    expect(admin.length).toBeGreaterThan(5)
  })

  it('registers no route that suspends, bans, mutes or restricts an attendee (FR-1041)', () => {
    const acting = admin
      .filter((route) => /suspend|ban\b|mute|restrict|disable|block|silence/i.test(route.url))
      .flatMap(labelsOf)

    expect(
      acting,
      'An administrative route acts on an attendee as a person. That power has its own ' +
        'governance — who decides, on what standard, with what appeal — and none of it is ' +
        'decided (FR-1041). Register entry 19 is what building a capability before the policy ' +
        'looks like.',
    ).toEqual([])
  })

  it('registers no route that deletes or deactivates an attendee account (FR-1041, decision 12)', () => {
    const removing = admin
      .filter((route) => methodsOf(route).some((method) => ['DELETE', 'POST'].includes(method)))
      .filter((route) => /attendees?/i.test(route.url))
      .filter((route) => /delete|remove|deactivat|close/i.test(route.url))
      .flatMap(labelsOf)

    expect(
      removing,
      'An administrative route removes an attendee. Erasure is the attendee’s OWN right ' +
        '(decision 12) and is never conditional (v4.1.0) — the same act performed by somebody ' +
        'else is removal, not erasure.',
    ).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE STRONG ASSERTION: EVERY ADMINISTRATIVE WRITE IS NAMED, AND A NEW ONE FAILS BY
   * EXISTING** (FIX-101, FIX-102).
   *
   * Enumerating what is *permitted* is what stops the negative patterns above being satisfied by
   * a route with an innocuous name. It only does that if it enumerates **everything**: as written
   * for 014 this filtered on `/attendee|organizers?/i` first, so it enumerated the routes that
   * already say what they act on and was blind to the ones that do not.
   *
   * There is no URL filter here now. Method only — and `HEAD` is a read, for the reason given at
   * `READ_METHODS`.
   *
   * **It runs the same `unlistedWrites` the tables below drive**, taking the *unfiltered* route
   * list, so selecting the population is part of what the tables exercise rather than a stage
   * reachable only by the routes that happen to exist (FIX-104).
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('names EVERY administrative write and what it acts on — a new one fails by existing (FR-1041)', () => {
    const writes = adminWriteLabels(registered)

    // A gate that cannot fail is not a gate. If `buildApp` stopped registering the administrative
    // plugins, or the `/admin` prefix moved, the comparison below would pass vacuously against an
    // empty set while checking nothing — the same case `deletion-coverage` and the route audits
    // each guard for.
    //
    // It is a floor rather than the tripwire, and deliberately so: a floor cannot catch a filter
    // that removes SOME routes. Two other assertions do that — every entry in PERMITTED must still
    // be found in this derived set, and the forbidden table must still come back flagged from it —
    // so a partial filter fails 39 named comparisons rather than one count.
    expect(
      writes.length,
      'No administrative writes were found at all. Either the routes moved off the `/admin` ' +
        'prefix or they are no longer registered — either way this assertion is now checking ' +
        'nothing, which is the state it exists to prevent.',
    ).toBeGreaterThan(20)

    expect(
      unlistedWrites(registered),
      'An administrative write is registered that this file has never been told about.\n\n' +
        'Every non-GET route under /admin must appear in PERMITTED, with what it acts on: ' +
        'CONTENT (a conference, track, room, speaker, session, reported question or vocabulary ' +
        'label), AUTHORITY (who may act, and over which conference), or OPERATOR-SELF (the ' +
        'caller’s own session or credential). **There is no fourth category, and the missing one ' +
        'is the point.**\n\n' +
        '**FR-1041 forbids an administrative act on a PERSON, and a person means their ACCESS — ' +
        'not only their account row.** A route that ends somebody’s registration, releases their ' +
        'place, or removes them from a conference deletes no account and reads perfectly ' +
        'innocuous in a URL, and it is exactly as forbidden as a delete-account route: the ' +
        'attendee can no longer get in, and somebody else decided that. Suspension, banning, ' +
        'muting and restriction are the same act under other names, and each has its own ' +
        'governance — who decides, on what standard, with what appeal — none of which is ' +
        'decided. Register entry 19 is what building a capability before the policy looks like.\n\n' +
        '**Register entry 22 depends on this assertion and on nothing else.** Constitution ' +
        'v5.4.0 (R1) closed it as ACCEPTED on a single ground: no third party can end a ' +
        'registration today, so a conference cached for up to 24 hours can only outlive a ' +
        'registration the attendee themselves withdrew. R1 states the consequence plainly — if ' +
        'any feature gives a third party that power, entry 22 REOPENS, and this test is what has ' +
        'to say so rather than a green build saying nothing.\n\n' +
        'So: if the route acts on content or on authority, add it to PERMITTED with a stated ' +
        'reason — that is the work, and it is meant to be. If it acts on a person or on their ' +
        'access, it does not belong in this product without an amendment (decision 12, v4.1.0, ' +
        'FR-1041). Do not add it here to make this pass.',
    ).toEqual([])
  })

  /**
   * **The two permitted writes whose URL NAMES an attendee or an organizer, stated by name.**
   *
   * The assertion above covers the concept; this one keeps 014's original claim readable. Both
   * act on AUTHORITY — what somebody may *do* — and neither changes what they *are* or whether
   * they may use MyNet at all. A third entry here is a governance change, not a route addition.
   *
   * **Its title says "URL names" rather than "subject is" because its selector cannot reach the
   * stronger claim.** It selects with `NAME_MATCHING_PREFILTER`, so a permitted write acting on a
   * person under a URL saying neither word — `.../registrations/:id` — would satisfy it by never
   * being selected. That is the blindness FIX-101 removed from the enumeration, kept here where it
   * is harmless because the enumeration above already covers the whole population. Do not restate
   * the title as a claim about subjects: it would be a sentence this test cannot support.
   */
  it('permits exactly two writes whose URL NAMES an attendee or organizer, both acting on AUTHORITY (FR-1041)', () => {
    const naming = Object.keys(PERMITTED)
      .filter((label) => NAME_MATCHING_PREFILTER.test(urlOf(label)))
      .sort()

    expect(
      naming,
      'A permitted administrative write names an attendee or an organizer in its URL outside ' +
        'promotion and demotion. Those two act on AUTHORITY, and 013 built nothing that acts on ' +
        'the person; 014 adds authoring, which acts on content (FR-1041). Note this selects on ' +
        'the URL alone — a route acting on a person under a neutral name is caught by the ' +
        'enumeration above, not here.',
    ).toEqual([
      'DELETE /admin/conferences/:eventId/organizers/:attendeeId',
      'POST /admin/conferences/:eventId/organizers',
    ])

    for (const label of naming) {
      expect(
        PERMITTED[label]?.acts,
        `${label} names an attendee or an organizer and it is not classified as acting on ` +
          'AUTHORITY. Promotion and demotion are the only two, and reclassifying one is how a ' +
          'power over the person would enter wearing a familiar label.',
      ).toBe('authority')
    }
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────────
   * **FIX-104 — the predicate is driven by a TABLE, not by the routes that happen to exist.**
   *
   * A guard exercised only by today's routes stops guarding when they change. 009 recorded this
   * about the event audit's conference-content predicate and fixed it the same way: a written
   * table of paths that must still be caught, checked on every run.
   *
   * **Every case below is handed to `unlistedWrites` as a synthetic ROUTE, never as a pre-formed
   * label.** A table calling `unlisted('DELETE /admin/…/registrations/:id')` directly would prove
   * only that a string absent from an object literal is reported absent — while the stage that was
   * actually blind, turning routes into labels, went on being covered by the routes of the day.
   * Driven this way, re-introducing a URL filter anywhere in the derivation fails here.
   * ───────────────────────────────────────────────────────────────────────────────────────────
   */
  it('flags an act on a person’s access whatever the route is called (FIX-104)', () => {
    for (const { method, url, note } of FORBIDDEN) {
      const label = `${method} ${url}`

      expect(
        unlistedWrites([synthetic(method, url)]),
        `${label} was not flagged. ${note}\n\nIf this assertion has started passing because the ` +
          'route was added to PERMITTED, that is the failure — the allow-list is for content and ' +
          'authority, and this is neither. If it has started passing because the derivation ' +
          'stopped producing a label for it — a filter on the URL, or on the `/admin` prefix ' +
          'this route carries — that is the ORIGINAL failure returning, and the route is now ' +
          'invisible rather than permitted.',
      ).toEqual([label])
    }
  })

  it('catches what the name-matching shape it replaced walked past (FIX-104)', () => {
    const missed = FORBIDDEN.filter((shape) => shape.missedByName)

    expect(
      missed.length,
      'The table no longer carries any route the old pre-filter would have missed, so this test ' +
        'no longer demonstrates why the shape changed.',
    ).toBeGreaterThan(2)

    for (const { method, url, note } of missed) {
      const label = `${method} ${url}`

      expect(
        NAME_MATCHING_PREFILTER.test(url),
        `${label} matches /attendee|organizers?/i, so it is not an example of the blindness this ` +
          'test records. Move it to the `missedByName: false` half of the table.',
      ).toBe(false)

      expect(
        unlistedWrites([synthetic(method, url)]),
        `${label} names no attendee and no organizer, so the retired pre-filter removed it ` +
          `before the enumeration ever saw it — and it passed all four assertions green. ${note}`,
      ).toEqual([label])
    }
  })

  /**
   * **The method filter is the only filter, and this pins that it is a filter on the METHOD.**
   *
   * `READ_METHODS` is what keeps twelve `HEAD` mirrors out of the allow-list, and it is the one
   * exclusion FIX-101 permits. Stated against the *most* forbidden URL in the file: asked for as a
   * read it is out of scope for this assertion entirely, asked for as a write it is flagged. If
   * somebody ever narrows the population by URL again and reaches for `READ_METHODS` as the
   * precedent, this is the difference.
   */
  it('excludes reads by METHOD and not by URL, on the same forbidden path (FIX-101)', () => {
    const url = '/admin/conferences/:eventId/registrations/:id'

    expect(
      unlistedWrites([synthetic('GET', url), synthetic('HEAD', url)]),
      'A GET or HEAD under /admin was reported as an unlisted write. Reads are excluded so the ' +
        'allow-list stays the list of every way an administrator CHANGES something; if this is ' +
        'failing, the method filter has moved rather than the URL rule.',
    ).toEqual([])

    expect(
      unlistedWrites([synthetic('DELETE', url)]),
      'The SAME url is not flagged when it arrives as a DELETE, which means something other than ' +
        'the method excluded it — a URL filter has been re-introduced into the derivation, and ' +
        'that is precisely what FIX-101 removed.',
    ).toEqual([`DELETE ${url}`])
  })

  it('does not flag the content and authority writes this product legitimately has (FIX-104)', () => {
    // Literal strings, deliberately: if one of these routes is renamed this test fails alongside
    // the enumeration, which forces the rename to be re-justified rather than absorbed. Handed to
    // the derivation as routes, like the forbidden table, so "flags nothing" cannot be satisfied
    // by a derivation that produces nothing.
    const legitimate: readonly { readonly method: HTTPMethods; readonly url: string }[] = [
      { method: 'POST', url: '/admin/conferences' },
      { method: 'PATCH', url: '/admin/conferences/:eventId' },
      { method: 'POST', url: '/admin/conferences/:eventId/sessions' },
      { method: 'POST', url: '/admin/conferences/:eventId/sessions/:id/cancel' },
      { method: 'DELETE', url: '/admin/conferences/:eventId/sessions/:id' },
      { method: 'POST', url: '/admin/conferences/:eventId/organizers' },
      { method: 'DELETE', url: '/admin/conferences/:eventId/organizers/:attendeeId' },
      { method: 'DELETE', url: '/admin/questions/:questionId' },
      { method: 'PATCH', url: '/admin/vocabulary/interests/:id' },
      { method: 'PUT', url: '/admin/session/credential' },
    ]

    const routes = legitimate.map(({ method, url }) => synthetic(method, url))

    // The half that stops this being a tautology: the derivation must have PRODUCED a label for
    // every one of them. Without this, a filter that removed them all would satisfy the assertion
    // below by handing it an empty set — an over-flagging guard and a blind one look identical
    // once the comparison is against `[]`.
    expect(
      adminWriteLabels(routes),
      'The derivation did not produce a label for every legitimate write it was given. It has ' +
        'started dropping administrative routes before they reach the allow-list, which is how a ' +
        'route becomes invisible to this file rather than permitted by it.',
    ).toEqual(legitimate.map(({ method, url }) => `${method} ${url}`).sort())

    expect(
      unlistedWrites(routes),
      'A guard that flags everything is as useless as one that flags nothing, and it is the ' +
        'shape a widened guard decays into: the next author weakens it until it stops ' +
        'complaining. These are authoring, moderation, promotion, demotion and the operator’s ' +
        'own credential — none of them is an act on a person.',
    ).toEqual([])
  })

  /**
   * The demand `deletion-coverage` makes of its own allow-lists, made here (FIX-102).
   *
   * An entry with no stated reasoning is a route somebody added to make a build pass, and it is
   * indistinguishable in a diff from one that was thought about.
   */
  it('states, per entry, what the route acts on and why that is not a person (FIX-102)', () => {
    for (const [label, entry] of Object.entries(PERMITTED)) {
      expect(
        entry.why.trim().length,
        `${label} is permitted with no reasoning stated. Say what it acts on and why that is ` +
          'not an act on an attendee — the writing is the check.',
      ).toBeGreaterThan(40)
    }
  })

  /**
   * An allow-list that outlives its routes is how a **new** route quietly inherits an old
   * exemption by sharing a name. `deletion-coverage` makes the same assertion about tables, and
   * the route audits about paths, for the same reason.
   */
  it('keeps every permitted entry pointing at a route that is still registered (FIX-102)', () => {
    // Through the same named derivation, deliberately: this is the assertion that turns a
    // partially-blind derivation into 39 named failures rather than a count that still clears its
    // floor. A filter dropping `registrations` alone would leave the floor green and this red.
    const derived = new Set(adminWriteLabels(registered))

    for (const label of Object.keys(PERMITTED)) {
      expect(
        derived,
        `${label} is permitted here but is no longer registered. Remove the entry in the change ` +
          'that removed the route, so a later route reusing the name does not inherit an ' +
          'exemption nobody granted it.',
      ).toContain(label)
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **THE POPULATION IS SELECTED BY A NAMING CONVENTION, AND THIS IS THE ASSERTION THAT MAKES IT
   * ONE.**
   *
   * Everything above enumerates *the routes beginning `/admin`*. FIX-101 removed a URL filter one
   * level down and this is the same dependency one level up: `routes/admin/index.ts` registers its
   * plugins with **no `{ prefix: '/admin' }` option**, so each URL is a hand-written literal inside
   * each module and nothing makes the prefix true. An administrative write registered at
   * `/conferences/:eventId/registrations/:id` would not be *permitted* by the enumeration — it
   * would be **absent from the population the enumeration reads**, and register entry 22's only
   * evidence would disappear in a green build, which is exactly the failure this branch exists to
   * correct.
   *
   * So the convention is asserted rather than assumed. Three claims, and each one closes a
   * different way out:
   *
   *   - **Every route literal in every module begins `/admin/`** — a route escaping the prefix
   *     fails here rather than vanishing.
   *   - **The literals found in source are exactly the URLs the application registered** — which is
   *     what stops a parsing failure passing as an empty, compliant set, and stops an
   *     administrative route being registered from a module this scan never reads.
   *   - **`index.ts` composes siblings of this directory and every sibling is composed** — so a
   *     tenth module fails by existing, and a plugin pulled in from elsewhere fails by not being
   *     one.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('registers every administrative route under the /admin prefix it is selected by (FIX-101)', () => {
    const adminDir = join(apiSrc, 'routes', 'admin')
    const modules = readdirSync(adminDir)
      .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
      .sort()

    const composed = [...codeOnly(join(adminDir, 'index.ts')).matchAll(/from\s+'([^']+)'/g)]
      .map((match) => match[1] ?? '')
      .filter((specifier) => specifier.startsWith('.'))

    expect(
      composed.filter((specifier) => !/^\.\/[a-z-]+\.js$/.test(specifier)).sort(),
      'The administrative route group composes a plugin from outside its own directory. The scan ' +
        'below reads this directory, so a plugin registered from anywhere else declares routes ' +
        'nothing in this file has ever looked at.',
    ).toEqual([])

    expect(
      composed.map((specifier) => specifier.replace(/^\.\//, '').replace(/\.js$/, '.ts')).sort(),
      'The modules in src/routes/admin/ and the modules index.ts composes are not the same set. ' +
        'A module in this directory that nothing registers is dead code; a module registered ' +
        'from elsewhere is routes this scan cannot see.',
    ).toEqual(modules)

    const declared = modules.flatMap((file) =>
      [
        ...codeOnly(join(adminDir, file)).matchAll(
          /\bapp\.(get|post|put|patch|delete)\s*\(\s*'([^']*)'/g,
        ),
      ].map((match) => ({ file, url: match[2] ?? '' })),
    )

    // The parse must have found something, or the two assertions below are vacuous — the same
    // floor the enumeration carries, for the same reason.
    expect(
      declared.length,
      'No route literals were found in src/routes/admin/ at all. Either the registration shape ' +
        'changed — `app.route({ … })`, a template literal, a constant — or this scan has stopped ' +
        'reading the modules, and either way it is now asserting nothing about the prefix.',
    ).toBeGreaterThanOrEqual(Object.keys(PERMITTED).length)

    expect(
      declared
        .filter(({ url }) => !url.startsWith('/admin/'))
        .map(({ file, url }) => `${file}: ${url}`),
      'An administrative route is registered at a URL that does not begin with /admin/. Every ' +
        'assertion in this file selects its population with that prefix, and this route is not ' +
        'permitted by them — it is INVISIBLE to them. **Register entry 22 was closed as accepted ' +
        'on the single ground that no third party can end a registration, and this file is the ' +
        'only thing in the codebase that says so**; a route outside the prefix removes that ' +
        'evidence while every test stays green. Register it under /admin/, or — if the group is ' +
        'genuinely moving — change the prefix here and in ADMIN_PREFIX in the same commit, ' +
        'deliberately.',
    ).toEqual([])

    expect(
      [...new Set(declared.map(({ url }) => url))].sort(),
      'The route URLs written in src/routes/admin/ and the administrative URLs the application ' +
        'actually registered are not the same set. Either a route is registered in a form this ' +
        'scan cannot read — so the prefix claim above covers less than it appears to — or an ' +
        'administrative route is registered from a module outside this directory.',
    ).toEqual([...new Set(admin.map((route) => route.url))].sort())
  })

  it('writes no attendee row from the authoring surface (FR-1041)', () => {
    // The layer below: an update to `attendees` from an authoring module would restrict somebody
    // without any route being named for it.
    const authoring = [
      join(apiSrc, 'routes', 'admin', 'catalog.ts'),
      join(apiSrc, 'db', 'queries', 'admin-catalog.ts'),
    ]

    const writing = authoring
      .filter((path) => {
        const code = codeOnly(path)
        return /\.update\(\s*attendees\s*\)|\.delete\(\s*attendees\s*\)/.test(code)
      })
      .map(label)

    expect(
      writing,
      'The authoring surface writes to an attendee row. An organizer authors CONTENT; the people ' +
        'attached to it are not theirs to change (FR-1041, decision 33).',
    ).toEqual([])
  })

  /**
   * **Cancellation is the answer to the temptation**, asserted so the reasoning stays attached.
   *
   * FR-1021 preserves everybody's engagement through a cancellation, which means an organizer
   * cannot use the authoring tools to remove content they object to. That is deliberate, and the
   * available answer is the report queue rather than a power over the person.
   */
  it('preserves engagement through cancellation, leaving the report queue as the answer (FR-1021)', () => {
    const catalog = codeOnly(join(apiSrc, 'db', 'queries', 'admin-catalog.ts'))
    const cancel = /export const cancelSession[\s\S]{0,1500}?\n\}/.exec(catalog)?.[0] ?? ''

    expect(cancel, 'cancelSession could not be located').not.toBe('')
    expect(
      /\.delete\(|DELETE\s+FROM/i.test(cancel),
      'Cancellation deletes something. It must preserve every saved session, note, question and ' +
        'vote (FR-1021) — which is exactly what stops an organizer using the authoring tools to ' +
        'remove content they object to, and leaves the report queue as the answer.',
    ).toBe(false)
  })
})
