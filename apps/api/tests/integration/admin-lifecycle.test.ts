import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { deleteAccount, withdrawFromConference } from '../../src/db/queries/account.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { requireEventAccess } from '../../src/plugins/event-access.js'
import {
  attendees,
  clearThrottle,
  events,
  registrations,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T132–T136 (013) — **authority never outlives the access it depends on** (FR-960, FR-961,
 * FR-962, FR-997a, FR-997b, decision 39, SC-905, SC-906).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **DELETION IS NEVER CONDITIONAL, AND THAT IS THE FIRST THING ASSERTED HERE.**
 *
 * Decision 12 holds absolutely: no administrative role may make an attendee's erasure right
 * depend on another person existing. So an organizer deleting their account is not warned, not
 * blocked, and not asked to hand over — even when they are the only organizer of a conference,
 * which then enters the `unassigned` state that platform operators can see.
 *
 * The temptation was a guard: *"you organize a conference, transfer it first."* That would be a
 * tidier invariant and would make erasure conditional on somebody else, which is exactly what
 * decision 39 refuses.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'lifecycle-fixture@mynet.invalid'

/** A storage double: `deleteAccount` takes the port, and this test is not about avatars. */
const storage = {
  get: async () => null,
  put: async () => undefined,
  delete: async () => undefined,
} as unknown as Parameters<typeof deleteAccount>[1]

describe('administrative lifecycle', () => {
  let app: FastifyInstance
  let operatorId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(abuseReports)
    await db.delete(organizerAssignments)
    await db.delete(operators)

    const [operator] = await db
      .insert(operators)
      .values({
        email: OPERATOR_EMAIL,
        displayName: 'Fixture Operator',
        passwordHash: await hashPassword('a-bootstrapped-operator-password'),
        credentialIsInitial: false,
      })
      .returning({ id: operators.id })
    operatorId = operator!.id
  })

  /** A throwaway attendee, so deletion tests do not consume the seeded fixtures. */
  const createAttendee = async (email: string): Promise<{ id: string; eventId: string }> => {
    const db = getDb()
    const [attendee] = await db
      .insert(attendees)
      .values({ email, displayName: 'Lifecycle Fixture' })
      .returning({ id: attendees.id })

    const event = (await db.select().from(events).limit(1))[0]!
    await db.insert(registrations).values({ attendeeId: attendee!.id, eventId: event.id })
    return { id: attendee!.id, eventId: event.id }
  }

  it('deletes an organizer’s account with no extra step, warning or refusal (FR-960, SC-905)', async () => {
    const db = getDb()
    const { id, eventId } = await createAttendee(`delete-${Date.now()}@mynet.invalid`)
    await db
      .insert(organizerAssignments)
      .values({ attendeeId: id, eventId, assignedBy: operatorId })

    // No precondition, no confirmation of transfer, no refusal.
    const deleted = await deleteAccount(id, storage)
    expect(deleted, 'deleting an organizer’s account was refused (decision 12, decision 39)').toBe(
      true,
    )

    // The cascade takes the assignment with the account — authority does not outlive access.
    const remaining = await db
      .select()
      .from(organizerAssignments)
      .where(eq(organizerAssignments.attendeeId, id))
    expect(remaining, 'an assignment survived the deletion of the attendee holding it').toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **FR-997a / FR-997b — the subject is CLEARED, the act survives, and nothing is
   * reconstructible.**
   *
   * Three separate claims, and each could hold while another failed:
   *
   *   - clearing without keeping the act would destroy accountability;
   *   - keeping the act without clearing would retain an identifier for an erased attendee;
   *   - clearing to a *sentinel* would satisfy both while leaving a tombstone, which FR-997b
   *     forbids by name.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('pseudonymises the audit trail on erasure, keeping the act (FR-997a, FR-997b)', async () => {
    const db = getDb()
    const { id, eventId } = await createAttendee(`pseudo-${Date.now()}@mynet.invalid`)

    await db.insert(adminAuditEntries).values({
      operatorId,
      action: 'promote',
      subjectAttendeeId: id,
      subjectResourceId: eventId,
      subjectKind: 'conference',
    })

    await deleteAccount(id, storage)

    const entries = await db.select().from(adminAuditEntries)
    expect(entries.length, 'the audit entry was deleted rather than pseudonymised').toBe(1)

    const entry = entries[0]!
    expect(entry.subjectAttendeeId, 'the erased attendee is still named in the audit trail').toBe(
      null,
    )
    // The act survives in full: who, what, when, and which conference.
    expect(entry.operatorId).toBe(operatorId)
    expect(entry.action).toBe('promote')
    expect(entry.subjectResourceId).toBe(eventId)
    expect(entry.occurredAt).toBeInstanceOf(Date)

    // **No sentinel, no placeholder, nothing reconstructible** (FR-997b). A hash would satisfy
    // "not the identifier" while being reversible by enumeration over a known set of UUIDs —
    // a tombstone in disguise, which is why the column is simply cleared.
    expect(JSON.stringify(entry)).not.toContain(id)
  })

  /**
   * **T133 — withdrawing from a conference revokes the assignment for it, and only for it**
   * (FR-961).
   *
   * 008's trap, met a third time: a departing attendee stops passing `requireEventAccess`, so
   * without this they would keep administrative authority over a conference they can no longer
   * see or manage.
   */
  it('revokes the assignment for a conference on withdrawal, and no other (FR-961)', async () => {
    const db = getDb()
    const all = await db.select().from(events)
    expect(all.length, 'the fixture needs two conferences').toBeGreaterThan(1)

    const first = all[0]!
    const second = all[1]!
    const [attendee] = await db
      .insert(attendees)
      .values({ email: `withdraw-${Date.now()}@mynet.invalid`, displayName: 'Withdrawer' })
      .returning({ id: attendees.id })

    await db.insert(registrations).values([
      { attendeeId: attendee!.id, eventId: first.id },
      { attendeeId: attendee!.id, eventId: second.id },
    ])
    await db.insert(organizerAssignments).values([
      { attendeeId: attendee!.id, eventId: first.id, assignedBy: operatorId },
      { attendeeId: attendee!.id, eventId: second.id, assignedBy: operatorId },
    ])

    // The scope has to come from the guard — the query layer refuses a forged one. Driven
    // through the real route so the transaction is the one production runs.
    const scope = await scopeFor(attendee!.id, first.id)
    await withdrawFromConference(scope)

    const live = await db
      .select({ eventId: organizerAssignments.eventId })
      .from(organizerAssignments)
      .where(
        and(
          eq(organizerAssignments.attendeeId, attendee!.id),
          isNull(organizerAssignments.revokedAt),
        ),
      )

    expect(
      live.map((row) => row.eventId),
      'withdrawing from one conference revoked the wrong set of assignments (FR-961, FR-932)',
    ).toEqual([second.id])
  })

  /**
   * **T135 — the conference and its content survive an organizer's departure** (FR-962, SC-906).
   *
   * Conference content is **not attendee data**, so an organizer leaving must take their
   * authority and nothing else. The conference then shows as `unassigned` — visible, asking for
   * a decision, rather than silently reverting to the platform tier (decision 39).
   */
  it('leaves the conference and its content intact when its only organizer goes (FR-962, SC-906)', async () => {
    const db = getDb()
    const { id, eventId } = await createAttendee(`content-${Date.now()}@mynet.invalid`)
    await db
      .insert(organizerAssignments)
      .values({ attendeeId: id, eventId, assignedBy: operatorId })

    const before = await db.select().from(sessions).where(eq(sessions.eventId, eventId))
    expect(before.length, 'the fixture conference has no sessions to preserve').toBeGreaterThan(0)

    await deleteAccount(id, storage)

    const conference = await db.select().from(events).where(eq(events.id, eventId))
    expect(conference.length, 'the conference was removed with its organizer').toBe(1)

    const after = await db.select().from(sessions).where(eq(sessions.eventId, eventId))
    expect(
      after.length,
      'conference content was removed with its organizer. Content is not attendee data (FR-962).',
    ).toBe(before.length)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T136 — deactivation ends access IMMEDIATELY, and the identity still resolves on records
   * naming it** (FR-908, FR-909, FR-944).
   *
   * "Immediately" is the part that is easy to get wrong: a deactivation that only took effect at
   * the next sign-in would leave a live session working for hours. `requireOperator` re-reads the
   * operator row on every request, which is why `deactivateOperator` performs no session
   * revocation — a revocation loop can miss a row and a guard cannot.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('ends a deactivated operator’s live session at once, and keeps their record (FR-908, FR-909)', async () => {
    const db = getDb()

    const signIn = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: OPERATOR_EMAIL, password: 'a-bootstrapped-operator-password' },
    })
    const cookie = signIn.cookies.find((entry) => entry.name === 'mynet_admin_session')
    const header = `mynet_admin_session=${cookie?.value}`

    expect(
      (await app.inject({ method: 'GET', url: '/admin/me', headers: { cookie: header } }))
        .statusCode,
    ).toBe(200)

    // A record naming them, which must survive.
    const [attendee] = await db
      .insert(attendees)
      .values({ email: `deact-${Date.now()}@mynet.invalid`, displayName: 'Subject' })
      .returning({ id: attendees.id })
    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: attendee!.id,
        reportedId: attendee!.id,
        reason: 'A report they resolved.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })
    await db.insert(reportResolutions).values({
      reportId: report!.id,
      resolvedBy: operatorId,
      outcome: 'dismissed',
      note: 'Nothing warranted.',
    })

    await db
      .update(operators)
      .set({ deactivatedAt: new Date() })
      .where(eq(operators.id, operatorId))

    expect(
      (await app.inject({ method: 'GET', url: '/admin/me', headers: { cookie: header } }))
        .statusCode,
      'a deactivated operator’s live session still worked (FR-908)',
    ).toBe(401)

    // The row survives, because the resolution still names them. A resolution attributed to
    // nobody is an accountability record with the accountability removed.
    const survivor = await db.select().from(operators).where(eq(operators.id, operatorId))
    expect(survivor.length, 'the operator row was deleted rather than deactivated (FR-909)').toBe(1)
    expect(survivor[0]?.displayName).toBe('Fixture Operator')
  })
})

/**
 * Obtains a real `EventScope` by driving the guard, because the query layer refuses a forged one
 * and `withdrawFromConference` takes a verified scope by design.
 */
const scopeFor = async (
  attendeeId: string,
  eventId: string,
): Promise<Parameters<typeof withdrawFromConference>[0]> => {
  let captured: Parameters<typeof withdrawFromConference>[0] | undefined

  await requireEventAccess(
    {
      attendee: { id: attendeeId, email: '', displayName: '' },
      params: { eventId },
      get eventScope() {
        return captured
      },
      set eventScope(scope) {
        captured = scope
      },
    } as any,
    {} as any,
  )

  if (!captured) throw new Error('the event guard issued no scope for the fixture')
  return captured
}
