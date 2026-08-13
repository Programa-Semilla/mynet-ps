import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { savedSessions, sessionNotes } from '../../src/db/schema/agenda.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { rooms, sessions, sessionSpeakers, speakers, tracks } from '../../src/db/schema/catalog.js'
import { events, registrations } from '../../src/db/schema/events.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { questionVotes, sessionQuestions } from '../../src/db/schema/questions.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { attendees } from './helpers.js'

/**
 * 014 — the shared authoring fixture: **two conferences, two tiers, and one organizer assigned to
 * exactly one of them.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SECOND CONFERENCE IS NOT SCENERY. IT IS WHAT MAKES FR-1035 AND FR-1036 TESTABLE AT ALL.**
 *
 * Every assertion about authority needs a conference the organizer may reach and one they may
 * not, and the two must be **indistinguishable in every observable way except the assignment** —
 * otherwise a test can pass because the second conference was malformed rather than because the
 * guard refused. So both are built by the same helper, and the only difference is the
 * `organizer_assignments` row.
 *
 * The organizer is an **ordinary seeded attendee**, which is the whole of 013's tier model: a
 * conference organizer is not a row in a people table, they are an attendee holding a live
 * assignment. Their MyNet experience must be unchanged, so the fixture never touches their
 * `attendees` row.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export const OPERATOR_EMAIL = 'authoring-fixture@mynet.invalid'
export const OPERATOR_PASSWORD = 'an-authoring-fixture-password'

export interface Conference {
  readonly eventId: string
  readonly trackId: string
  readonly roomId: string
  readonly speakerId: string
}

export interface AuthoringFixture {
  /** The seeded platform operator, who may author every conference (FR-1002). */
  readonly operatorId: string
  /** A seeded attendee promoted for `assigned` and for nothing else. */
  readonly organizerId: string
  /** The conference the organizer is assigned to. */
  readonly assigned: Conference
  /** An identically-built conference they are **not** assigned to (FR-1035, FR-1036). */
  readonly unassigned: Conference
}

/**
 * Clears everything 014 writes and rebuilds the fixture.
 *
 * **Deletion order is foreign keys backwards**, and it is written out rather than left to
 * cascades because two of the references here deliberately do not cascade:
 * `organizer_assignments.event_id` is `NO ACTION` so a surviving assignment refuses
 * `DELETE FROM events` (FR-937), and `assigned_by` is `NO ACTION` so an assignment blocks the
 * operator row. 008 recorded the same trap for `shared_cards`, and the constitution predicted
 * this feature would meet it.
 */
export const buildAuthoringFixture = async (organizerEmail: string): Promise<AuthoringFixture> => {
  await clearAuthoringFixture()

  const db = getDb()
  const [operator] = await db
    .insert(operators)
    .values({
      email: OPERATOR_EMAIL,
      displayName: 'Authoring Operator',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      credentialIsInitial: false,
    })
    .returning({ id: operators.id })

  const organizerRows = await db
    .select({ id: attendees.id })
    .from(attendees)
    .where(eq(attendees.email, organizerEmail))

  const organizerId = organizerRows[0]?.id
  if (!organizerId || !operator) {
    throw new Error('The seeded attendee or operator is absent — this is a fixture failure.')
  }

  const assigned = await createConference('Assigned Conference')
  const unassigned = await createConference('Unassigned Conference')

  await db.insert(organizerAssignments).values({
    attendeeId: organizerId,
    eventId: assigned.eventId,
    assignedBy: operator.id,
  })

  // The organizer is registered for the conference they run, which is ordinary and is what makes
  // FR-1028a testable: an organizer who saved the session they are changing must not be notified.
  await db.insert(registrations).values({ attendeeId: organizerId, eventId: assigned.eventId })

  return { operatorId: operator.id, organizerId, assigned, unassigned }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **CALLED BEFORE EVERY BUILD *AND* IN EACH SUITE'S `afterAll`, AND THE SECOND CALL IS THE ONE
 * THAT MATTERS.**
 *
 * Nothing cascades to `events`: `sessions`, `registrations`, `tracks`, `rooms` and `speakers` all
 * reference it with `NO ACTION`, which is 002's and 008's deliberate choice. So a fixture
 * conference left behind at the end of a file **blocks `DELETE FROM events` in the next file's
 * `seed()`** — and `seed()` clears `attendees` first, so the symptom is a later suite failing with
 * `Cannot read properties of undefined (reading 'id')` while looking for a seeded attendee that a
 * half-applied seed removed.
 *
 * That is exactly the trap 008 recorded for `shared_cards` and the constitution predicted this
 * feature would meet: *"The next feature with a non-cascading reference to seeded content will
 * meet this."* The failure appears in a file that has nothing to do with authoring, which is why
 * cleaning up afterwards is a requirement rather than tidiness.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const clearAuthoringFixture = async (): Promise<void> => {
  const db = getDb()

  await db.delete(questionVotes)
  await db.delete(sessionQuestions)
  await db.delete(sessionNotes)
  await db.delete(savedSessions)
  await db.delete(adminAuditEntries)
  await db.delete(organizerAssignments)
  // A report resolution names the operator who wrote it, `NO ACTION` — 013's rule that an
  // operator is deactivated rather than deleted, so records naming them keep resolving (FR-909).
  // A neighbouring suite's resolutions therefore block `DELETE FROM operators` here, which is the
  // constraint working rather than an obstacle.
  await db.delete(reportResolutions)
  await db.delete(operators)

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **The conferences this fixture built on a previous run, removed by hand.**
  //
  // Nothing cascades to `events` — `sessions`, `tracks`, `rooms`, `speakers` and `registrations`
  // all reference it with `NO ACTION`, which is 002's and 008's deliberate choice — so a fixture
  // that only re-seeds accumulates conferences until the join code collides. That collision is
  // the constraint working: it is exactly what stops two conferences sharing a code and joining
  // resolving to whichever row the planner returned first.
  //
  // Scoped to this fixture's own codes so a re-seed of the three seeded conferences is not
  // affected, and ordered by foreign key backwards.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  await db.execute(sql`
    WITH mine AS (SELECT id FROM events WHERE join_code LIKE 'FIXTURE%')
    DELETE FROM sessions WHERE event_id IN (SELECT id FROM mine)
  `)
  await db.execute(sql`
    WITH mine AS (SELECT id FROM events WHERE join_code LIKE 'FIXTURE%')
    DELETE FROM registrations WHERE event_id IN (SELECT id FROM mine)
  `)
  for (const table of ['tracks', 'rooms', 'speakers']) {
    await db.execute(sql`
      DELETE FROM ${sql.raw(table)}
      WHERE event_id IN (SELECT id FROM events WHERE join_code LIKE 'FIXTURE%')
    `)
  }
  await db.execute(sql`DELETE FROM events WHERE join_code LIKE 'FIXTURE%'`)
}

let codeCounter = 0

/**
 * One conference with one track, one room and one speaker — the minimum a session needs.
 *
 * The date range is fixed and far from today's, deliberately: a range relative to `now()` would
 * make every day-range assertion depend on when the suite ran, and the timezone is `UTC` so a
 * venue-local date is the same as the instant's date. Tests that care about the timezone rule
 * build their own conference.
 */
export const createConference = async (
  name: string,
  options: { startsOn?: string; endsOn?: string; timezone?: string } = {},
): Promise<Conference> => {
  const db = getDb()
  codeCounter += 1

  const [event] = await db
    .insert(events)
    .values({
      name,
      location: 'Test Venue',
      startsOn: options.startsOn ?? '2027-03-01',
      endsOn: options.endsOn ?? '2027-03-03',
      timezone: options.timezone ?? 'UTC',
      joinCode: `FIXTURE${codeCounter}`,
    })
    .returning({ id: events.id })

  if (!event) throw new Error('Could not create the fixture conference.')

  const [track] = await db
    .insert(tracks)
    .values({ eventId: event.id, name: `${name} Track`, colorToken: 'track-design' })
    .returning({ id: tracks.id })

  const [room] = await db
    .insert(rooms)
    .values({ eventId: event.id, name: `${name} Room` })
    .returning({ id: rooms.id })

  const [speaker] = await db
    .insert(speakers)
    .values({ eventId: event.id, name: `${name} Speaker`, title: null, company: null })
    .returning({ id: speakers.id })

  if (!track || !room || !speaker) throw new Error('Could not build the fixture conference.')

  return { eventId: event.id, trackId: track.id, roomId: room.id, speakerId: speaker.id }
}

/** A session body the write path accepts, inside the fixture conference's days. */
export const sessionBody = (
  conference: Conference,
  overrides: Partial<{
    title: string
    summary: string | null
    startsAt: string
    endsAt: string
    trackId: string
    roomId: string
    speakerIds: string[]
  }> = {},
): Record<string, unknown> => ({
  title: 'Opening Keynote',
  summary: null,
  startsAt: '2027-03-01T09:00:00.000Z',
  endsAt: '2027-03-01T10:00:00.000Z',
  trackId: conference.trackId,
  roomId: conference.roomId,
  speakerIds: [conference.speakerId],
  ...overrides,
})

/** Signs in as the seeded platform operator and returns a cookie header. */
export const platformSession = async (app: FastifyInstance): Promise<string> =>
  adminSession(app, OPERATOR_EMAIL, OPERATOR_PASSWORD)

/**
 * Signs in as a conference organizer — **the attendee's own credentials**, which is FR-914: a
 * promoted attendee has one account, and administrative access is a different session on a
 * different cookie rather than a different identity (decision 37).
 */
export const organizerSession = async (
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> => adminSession(app, email, password)

const adminSession = async (
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> => {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/session',
    payload: { email, password },
  })

  const cookie = response.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
  if (!cookie) {
    throw new Error(
      `Administrative sign-in failed for ${email} (${response.statusCode}). This is a fixture ` +
        'failure rather than a defect in what is under test.',
    )
  }

  return `${ADMIN_SESSION_COOKIE}=${cookie.value}`
}

export { adminAuditEntries, savedSessions, sessionNotes, sessions, sessionSpeakers }
export { questionVotes, sessionQuestions, tracks, rooms, speakers, events, organizerAssignments }
