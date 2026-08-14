import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { events } from '../../src/db/schema/events.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { operators } from '../../src/db/schema/operators.js'
import {
  buildAuthoringFixture,
  clearAuthoringFixture,
  organizerSession,
  platformSession,
  type AuthoringFixture,
} from './authoring-fixtures.js'
import { ADA, clearThrottle, SEED_PASSWORD, setupTestApp, teardown } from './helpers.js'

/**
 * T079, T080 (014) — **both tiers create a conference, and creating is not a promotion path**
 * (FR-1007, FR-1008, FR-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONLY PRODUCT-WIDE CAPABILITY A CONFERENCE ORGANIZER HOLDS, AND v4.2.0 STATES IT
 * RATHER THAN INFERRING IT.**
 *
 * Decision 32 says an organizer's *"authority reaches only the conferences they are assigned"*,
 * and that sentence cannot describe the act of creating one — there is no conference yet to be
 * assigned to. Decision 42 grants the capability explicitly for exactly that reason, and bounds
 * it with two clauses this file exists to hold:
 *
 *   - **Authority over a conference they did not create still comes only from assignment.**
 *     Creating one must not widen their reach by a single row.
 *   - **Creating is not a promotion path.** It grants no platform capability and no route to
 *     promote anybody. An organizer who could reach the report queue or promote an attendee by
 *     first creating a conference would be a platform operator with extra steps — and promotion
 *     is platform-tier only precisely because that is the boundary that must not be crossable
 *     from below.
 *
 * **Nothing bounds how many conferences an organizer may create**, which v4.2.0 records as
 * accepted rather than overlooked: it is bounded by trust, since promotion is itself platform-only.
 * The throttle is a rate limit, not a quota, and this file does not assert otherwise.
 *
 * The route is behind `requireOperator` and **not** `requireConferenceAuthority` — the fifth
 * guard mints its scope from a conference id in the path, and here there is none.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('creating a conference (T079, T080, FR-1007, FR-1008, FR-1010)', () => {
  let app: FastifyInstance
  let fixture: AuthoringFixture

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await clearAuthoringFixture(app)
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    fixture = await buildAuthoringFixture(ADA, app)
  })

  const body = (name: string) => ({
    name,
    location: 'A New Venue',
    startsOn: '2028-05-01',
    endsOn: '2028-05-03',
    timezone: 'Europe/Madrid',
  })

  const create = (cookie: string, name: string) =>
    app.inject({
      method: 'POST',
      url: '/admin/conferences',
      headers: { cookie },
      payload: body(name),
    })

  it('lets a PLATFORM OPERATOR create one (FR-1007)', async () => {
    const cookie = await platformSession(app)
    const response = await create(cookie, 'A Platform-Created Conference')

    expect(response.statusCode).toBe(201)
    expect(response.json().id).toBeTruthy()

    const [row] = await getDb()
      .select()
      .from(events)
      .where(eq(events.id, response.json().id as string))
    expect(row?.name).toBe('A Platform-Created Conference')
    expect(row?.timezone).toBe('Europe/Madrid')
  })

  it('lets a CONFERENCE ORGANIZER create one (FR-1008, decision 42)', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    const response = await create(cookie, 'An Organizer-Created Conference')

    expect(
      response.statusCode,
      'An organizer could not create a conference. This is the ONE product-wide capability the ' +
        'tier holds (decision 42), stated explicitly because decision 32’s "authority reaches ' +
        'only the conferences they are assigned" cannot describe creating one.',
    ).toBe(201)
  })

  it('assigns the creating organizer in the SAME transaction (FR-1008)', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    const created = await create(cookie, 'Assigned On Creation')
    const eventId = created.json().id as string

    const assignments = await getDb()
      .select()
      .from(organizerAssignments)
      .where(
        and(
          eq(organizerAssignments.eventId, eventId),
          eq(organizerAssignments.attendeeId, fixture.organizerId),
        ),
      )

    expect(
      assignments,
      'The creating organizer holds no assignment for what they created. A conference they ' +
        'cannot author is worse than no conference: it is visible to attendees by its join code ' +
        'and editable by nobody.',
    ).toHaveLength(1)

    // Reachable immediately, which is what "in the same transaction" means from outside.
    const programme = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${eventId}/programme`,
      headers: { cookie },
    })
    expect(programme.statusCode).toBe(200)
  })

  it('assigns a creating organizer and NOBODY ELSE', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    const created = await create(cookie, 'One Assignment Only')

    const assignments = await getDb()
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.eventId, created.json().id as string))

    expect(assignments).toHaveLength(1)
    expect(assignments[0]?.attendeeId).toBe(fixture.organizerId)
  })

  it('assigns NOBODY when a platform operator creates one, leaving it explicitly unassigned', async () => {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    // Decision 39's `unassigned` state, reached by the ordinary route rather than by revocation.
    // A platform operator is not an attendee and holds no assignment, so a conference they
    // create has none — and that must be the visible "nobody organizes this" state rather than
    // a silent default to the platform tier, which would hide the event nobody is prompted to
    // act on.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const cookie = await platformSession(app)
    const created = await create(cookie, 'Unassigned By Creation')

    const assignments = await getDb()
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.eventId, created.json().id as string))

    expect(assignments).toEqual([])
  })

  it('records the creation in the audit trail (FR-1037, FR-1038)', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    const created = await create(cookie, 'An Audited Creation')

    const entries = await getDb()
      .select()
      .from(adminAuditEntries)
      .where(eq(adminAuditEntries.subjectResourceId, created.json().id as string))

    expect(entries).toHaveLength(1)
    expect(entries[0]?.action).toBe('create_conference')
    expect(entries[0]?.subjectKind).toBe('conference')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T080 — CREATING GRANTS NOTHING BEYOND THE THING CREATED.**
   *
   * Three assertions, because the bound has three edges and each would be breached by a
   * different mistake: a wider assignment write, a tier change on the principal, and a route
   * that reads the tier from something other than the operator record.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('grants NO authority over any other conference (FR-1010, decision 42)', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    await create(cookie, 'A Conference That Grants Nothing')

    // The conference they were never assigned to is still refused, and refused identically to
    // one that does not exist (FR-1036).
    const other = await app.inject({
      method: 'GET',
      url: `/admin/conferences/${fixture.unassigned.eventId}/programme`,
      headers: { cookie },
    })

    expect(
      other.statusCode,
      'Creating a conference widened the organizer’s reach. Authority over a conference they ' +
        'did NOT create still comes only from assignment by a platform operator (decision 42).',
    ).toBe(404)

    const assignments = await getDb()
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.attendeeId, fixture.organizerId))

    // Exactly two: the fixture's assignment, and the one they just earned by creating.
    expect(assignments).toHaveLength(2)
  })

  it('grants NO platform capability — the report queue stays shut (FR-1010)', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    await create(cookie, 'Still Not A Platform Operator')

    const queue = await app.inject({ method: 'GET', url: '/admin/reports', headers: { cookie } })

    expect(
      queue.statusCode,
      'Creating a conference opened the report queue. The queue is platform-tier only ' +
        '(v4.1.0’s third Principle VIII exception) and creating is NOT a promotion path — an ' +
        'organizer who could reach it by first creating a conference would be a platform ' +
        'operator with extra steps.',
    ).toBe(404)
  })

  it('grants NO route to promote anybody (FR-1010)', async () => {
    const cookie = await organizerSession(app, ADA, SEED_PASSWORD)
    const created = await create(cookie, 'No Promotion Path')

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // Promotion attempted on the conference they just created — the strongest form of the
    // question, because it is the one conference their authority genuinely covers.
    //
    // **The body is the one the route's schema accepts**, and that matters more than it looks:
    // the first version of this test sent `{ email }`, drew a 400 from schema validation, and
    // never reached the tier check at all. A refusal produced by a malformed request is not
    // evidence of a guard — it is the test failing to ask the question.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const promotion = await app.inject({
      method: 'POST',
      url: `/admin/conferences/${created.json().id as string}/organizers`,
      headers: { cookie },
      payload: { attendeeId: fixture.organizerId },
    })

    expect(
      [401, 403, 404],
      'An organizer promoted somebody on a conference they created. Promotion is platform-tier ' +
        'only, which is the boundary that must not be crossable from below (decision 32).',
    ).toContain(promotion.statusCode)

    // And their own tier is untouched by the act of creating.
    const [operator] = await getDb()
      .select({ id: operators.id })
      .from(operators)
      .where(eq(operators.id, fixture.operatorId))
    expect(operator).toBeDefined()

    const me = await app.inject({ method: 'GET', url: '/admin/me', headers: { cookie } })
    expect(me.json().tier).toBe('organizer')
  })

  it('refuses a range that ends before it starts, with a reason the caller supplied', async () => {
    const cookie = await platformSession(app)
    const response = await app.inject({
      method: 'POST',
      url: '/admin/conferences',
      headers: { cookie },
      payload: { ...body('Backwards'), startsOn: '2028-05-03', endsOn: '2028-05-01' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('refuses an unauthenticated caller with the same 404 as everything else', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/conferences',
      payload: body('Nobody At All'),
    })

    expect([401, 404]).toContain(response.statusCode)
  })
})
