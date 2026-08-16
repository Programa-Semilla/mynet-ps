import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
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
 * **The pre-filter that made the old shape blind**, kept as a literal so the failure it caused is
 * demonstrable rather than described (FIX-104).
 *
 * Nothing in the assertions uses it. It exists so the test below can show, side by side, that a
 * registration-ending route walks straight past it and is caught by the shape that replaced it.
 */
const NAME_MATCHING_PREFILTER = /attendee|organizers?/i

/**
 * Routes this product must never register, written down **as a table rather than discovered from
 * the route tree** (FIX-104).
 *
 * `missedByName` records whether the retired pre-filter would have examined the route at all. The
 * four that it would not are the whole reason this file changed: **every one of them ends
 * somebody's access without the URL ever saying so.**
 */
const FORBIDDEN: readonly {
  readonly label: string
  readonly missedByName: boolean
  readonly note: string
}[] = [
  {
    label: 'DELETE /admin/conferences/:eventId/registrations/:id',
    missedByName: true,
    note:
      'Ends a registration. This is the exact shape R1 names, and the ground register entry ' +
      '22 was closed on is that it does not exist.',
  },
  {
    label: 'POST /admin/conferences/:eventId/registrations/:id/removal',
    missedByName: true,
    note:
      'The same act spelled as a sub-resource, which is how this codebase already names ' +
      'deactivation and retirement — so it is the likelier of the two, not the exotic one.',
  },
  {
    label: 'DELETE /admin/conferences/:eventId/enrolments/:id',
    missedByName: true,
    note:
      'Releases somebody’s held place. An enrolment is not engagement (decision 51), but ' +
      'that governs DELETING THE SESSION — it does not license a third party taking one ' +
      'person’s place away.',
  },
  {
    label: 'DELETE /admin/conferences/:eventId/participants/:id',
    missedByName: true,
    note:
      'The same act under a third noun. The vocabulary is unbounded, which is why the ' +
      'assertion enumerates what is permitted instead of guessing what is not.',
  },
  {
    label: 'DELETE /admin/attendees/:attendeeId',
    missedByName: false,
    note:
      'Removal on somebody’s behalf. Erasure is the attendee’s OWN right (decision 12) and ' +
      'is never conditional (v4.1.0).',
  },
  {
    label: 'POST /admin/attendees/:attendeeId/suspension',
    missedByName: false,
    note:
      'Suspension — a power with its own governance, none of which is decided. Register ' +
      'entry 19 is what building a capability before the policy looks like.',
  },
]

describe('014 — an operator acts on content, never on a person (FR-1041)', () => {
  let admin: RouteOptions[]

  beforeAll(async () => {
    const routes: RouteOptions[] = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
    admin = routes.filter((route) => /^\/admin(\/|$)/.test(route.url))
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
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('names EVERY administrative write and what it acts on — a new one fails by existing (FR-1041)', () => {
    const writes = admin.flatMap(writeLabelsOf).sort()

    // A gate that cannot fail is not a gate. If `buildApp` stopped registering the administrative
    // plugins, or the `/admin` prefix moved, the comparison below would pass vacuously against an
    // empty set while checking nothing — the same case `deletion-coverage` and the route audits
    // each guard for.
    expect(
      writes.length,
      'No administrative writes were found at all. Either the routes moved off the `/admin` ' +
        'prefix or they are no longer registered — either way this assertion is now checking ' +
        'nothing, which is the state it exists to prevent.',
    ).toBeGreaterThan(20)

    expect(
      unlisted(writes),
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
   * **The two writes whose subject is an attendee, stated by name.**
   *
   * The assertion above covers the concept; this one keeps 014's original claim readable. Both
   * act on AUTHORITY — what somebody may *do* — and neither changes what they *are* or whether
   * they may use MyNet at all. A third entry here is a governance change, not a route addition.
   */
  it('permits exactly two writes whose subject is an attendee, both acting on AUTHORITY (FR-1041)', () => {
    const naming = Object.keys(PERMITTED)
      .filter((label) => NAME_MATCHING_PREFILTER.test(urlOf(label)))
      .sort()

    expect(
      naming,
      'An administrative write names an attendee outside promotion and demotion. Those two act ' +
        'on AUTHORITY, and 013 built nothing that acts on the person; 014 adds authoring, which ' +
        'acts on content (FR-1041).',
    ).toEqual([
      'DELETE /admin/conferences/:eventId/organizers/:attendeeId',
      'POST /admin/conferences/:eventId/organizers',
    ])

    for (const label of naming) {
      expect(
        PERMITTED[label]?.acts,
        `${label} is a write whose subject is an attendee and it is not classified as acting on ` +
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
   * ───────────────────────────────────────────────────────────────────────────────────────────
   */
  it('flags an act on a person’s access whatever the route is called (FIX-104)', () => {
    for (const { label, note } of FORBIDDEN) {
      expect(
        unlisted([label]),
        `${label} was not flagged. ${note}\n\nIf this assertion has started passing because the ` +
          'route was added to PERMITTED, that is the failure — the allow-list is for content and ' +
          'authority, and this is neither.',
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

    for (const { label, note } of missed) {
      expect(
        NAME_MATCHING_PREFILTER.test(urlOf(label)),
        `${label} matches /attendee|organizers?/i, so it is not an example of the blindness this ` +
          'test records. Move it to the `missedByName: false` half of the table.',
      ).toBe(false)

      expect(
        unlisted([label]),
        `${label} names no attendee and no organizer, so the retired pre-filter removed it ` +
          `before the enumeration ever saw it — and it passed all four assertions green. ${note}`,
      ).toEqual([label])
    }
  })

  it('does not flag the content and authority writes this product legitimately has (FIX-104)', () => {
    // Literal strings, deliberately: if one of these routes is renamed this test fails alongside
    // the enumeration, which forces the rename to be re-justified rather than absorbed.
    const legitimate = [
      'POST /admin/conferences',
      'PATCH /admin/conferences/:eventId',
      'POST /admin/conferences/:eventId/sessions',
      'POST /admin/conferences/:eventId/sessions/:id/cancel',
      'DELETE /admin/conferences/:eventId/sessions/:id',
      'POST /admin/conferences/:eventId/organizers',
      'DELETE /admin/conferences/:eventId/organizers/:attendeeId',
      'DELETE /admin/questions/:questionId',
      'PATCH /admin/vocabulary/interests/:id',
      'PUT /admin/session/credential',
    ]

    expect(
      unlisted(legitimate),
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
    const registered = new Set(admin.flatMap(writeLabelsOf))

    for (const label of Object.keys(PERMITTED)) {
      expect(
        registered,
        `${label} is permitted here but is no longer registered. Remove the entry in the change ` +
          'that removed the route, so a later route reusing the name does not inherit an ' +
          'exemption nobody granted it.',
      ).toContain(label)
    }
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
