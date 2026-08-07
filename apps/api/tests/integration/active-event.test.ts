import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { resolveActiveEvent } from '../../src/db/queries/active-event.js'
import { activeEventSelections } from '../../src/db/schema/active-event.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { events, registrations } from '../../src/db/schema/events.js'
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
 * T017 (002) — derivation of the active event (FR-102, FR-103, research D4).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Against a real database, because the derivation *is* SQL.**
 *
 * The whole design decision in research D4 is that tiering and ordering share one clock — the
 * database's — rather than straddling the API process's clock and `now()`. A test that
 * reimplemented the tiers in TypeScript would assert the reimplementation, not the query, and
 * would agree with it even if the two clocks disagreed. That is the mistake the inbox entry
 * `throttle-clock-provenance` records from 001, and this file exists partly not to repeat it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The clock is not movable, so **the events move instead**: each case rewrites the seeded
 * dates relative to the database's own `current_date` and asks what derivation returns.
 */
describe('active event derivation', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>
  let adaId: string

  /**
   * Places an event's range relative to the database's today, in the venue's own zone.
   *
   * The offsets are cast explicitly: PostgreSQL cannot choose between the `date + integer` and
   * `date + interval` operators for an untyped parameter, and says so.
   */
  const moveEvent = async (name: string, startOffset: number, endOffset: number): Promise<void> => {
    await getDb()
      .update(events)
      .set({
        startsOn: sql`((now() AT TIME ZONE "events".timezone)::date + ${startOffset}::int)`,
        endsOn: sql`((now() AT TIME ZONE "events".timezone)::date + ${endOffset}::int)`,
      })
      .where(eq(events.name, name))
  }

  /** Ada's registrations only — the other seeded attendee's events must not influence hers. */
  const ADA_EVENTS = ['Product & Design Summit', 'Frontend Horizons'] as const

  const eventNamed = async (name: string): Promise<{ id: string }> => {
    const [row] = await getDb().select().from(events).where(eq(events.name, name))
    if (!row) throw new Error(`Seed did not produce "${name}".`)
    return row
  }

  beforeAll(async () => {
    app = await setupTestApp()
  })

  beforeEach(async () => {
    await resetDatabase()
    const [ada] = await getDb().select().from(attendees).where(eq(attendees.email, ADA))
    if (!ada) throw new Error('Seed did not produce Ada; the test cannot proceed.')
    adaId = ada.id
  })

  afterAll(async () => {
    await teardown(app)
  })

  describe('tiers, in the order FR-102 requires', () => {
    it('prefers a conference in progress today, in the VENUE timezone', async () => {
      await moveEvent('Product & Design Summit', -1, 1)
      await moveEvent('Frontend Horizons', 10, 12)

      const active = await resolveActiveEvent(adaId)

      expect(active?.name).toBe('Product & Design Summit')
    })

    it('falls back to the next conference to start when none is in progress', async () => {
      await moveEvent('Product & Design Summit', 30, 32)
      await moveEvent('Frontend Horizons', 5, 7)

      const active = await resolveActiveEvent(adaId)

      expect(active?.name).toBe('Frontend Horizons')
    })

    it('falls back to the most recently ended when every conference is past', async () => {
      await moveEvent('Product & Design Summit', -30, -28)
      await moveEvent('Frontend Horizons', -10, -8)

      const active = await resolveActiveEvent(adaId)

      expect(active?.name).toBe('Frontend Horizons')
    })

    it('counts the first and last day as in progress, not as past or upcoming', async () => {
      // The boundary is where an inclusive range is usually got wrong, and getting it wrong
      // means an attendee arriving on day one is shown the conference as "upcoming".
      await moveEvent('Product & Design Summit', 0, 0)
      await moveEvent('Frontend Horizons', 20, 22)

      const active = await resolveActiveEvent(adaId)

      expect(active?.name).toBe('Product & Design Summit')
    })
  })

  describe('the total order FR-103 requires', () => {
    it('is stable across repeated reads when two conferences tie exactly', async () => {
      // Identical ranges: the tier cannot separate them, so only the total order can.
      await moveEvent('Product & Design Summit', 5, 7)
      await moveEvent('Frontend Horizons', 5, 7)

      const reads = await Promise.all([
        resolveActiveEvent(adaId),
        resolveActiveEvent(adaId),
        resolveActiveEvent(adaId),
        resolveActiveEvent(adaId),
      ])

      const names = new Set(reads.map((event) => event?.name))
      expect(
        names.size,
        'Two conferences tying on both dates resolved differently across reads. FR-103 requires a ' +
          'total order over a stable, unchanging property — see research D4.',
      ).toBe(1)
    })

    it('breaks a tie on id, not on insertion order', async () => {
      await moveEvent('Product & Design Summit', 5, 7)
      await moveEvent('Frontend Horizons', 5, 7)

      const tied = await getDb()
        .select({ id: events.id, name: events.name })
        .from(events)
        .where(sql`${events.name} in ('Product & Design Summit', 'Frontend Horizons')`)

      const lowestId = [...tied].sort((a, b) => (a.id < b.id ? -1 : 1))[0]
      const active = await resolveActiveEvent(adaId)

      expect(active?.name).toBe(lowestId?.name)
    })
  })

  describe('scoping', () => {
    it('never derives an event the attendee is not registered for', async () => {
      // Grace's event is the nearest in time by a wide margin. If derivation looked at events
      // rather than at *this attendee's registrations*, it would win — which is the bug.
      await moveEvent('Systems & Scale', 0, 1)
      await moveEvent('Product & Design Summit', 40, 42)
      await moveEvent('Frontend Horizons', 50, 52)

      const active = await resolveActiveEvent(adaId)

      expect(ADA_EVENTS).toContain(active?.name)
      expect(active?.name).not.toBe('Systems & Scale')
    })

    it('returns null for an attendee registered for no conferences at all (FR-105)', async () => {
      await getDb().delete(registrations).where(eq(registrations.attendeeId, adaId))

      const active = await resolveActiveEvent(adaId)

      // Null, not an error and not a fabricated event: the client renders an explicit empty
      // state from it.
      expect(active).toBeNull()
    })
  })

  describe('a recorded choice', () => {
    it('is honoured over derivation', async () => {
      await moveEvent('Product & Design Summit', -1, 1) // in progress — derivation would pick it
      await moveEvent('Frontend Horizons', 30, 32)

      const [chosen] = await getDb()
        .select()
        .from(events)
        .where(eq(events.name, 'Frontend Horizons'))
      if (!chosen) throw new Error('Fixture missing.')

      await getDb().insert(activeEventSelections).values({ attendeeId: adaId, eventId: chosen.id })

      const active = await resolveActiveEvent(adaId)

      expect(active?.name).toBe('Frontend Horizons')
    })

    /**
     * T071 (002) — **removing a registration removes the selection** (FR-101, US4 scenario 4).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * This is the composite foreign key's cascade, observed rather than assumed. FR-101 says
     * the active conference may never resolve to an unregistered one *under any sequence of
     * events*, and "the attendee's registration is withdrawn while they have it selected" is
     * the sequence that would otherwise leave a dangling pointer at content they may no longer
     * read.
     *
     * No application logic implements this. If someone later replaced the composite key with a
     * plain reference to `events`, every other test would still pass and this would not.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    it('falls back to derivation when the chosen conference’s registration is removed', async () => {
      const [chosen] = await getDb()
        .select()
        .from(events)
        .where(eq(events.name, 'Frontend Horizons'))
      if (!chosen) throw new Error('Fixture missing.')

      await getDb().insert(activeEventSelections).values({ attendeeId: adaId, eventId: chosen.id })
      expect((await resolveActiveEvent(adaId))?.name).toBe('Frontend Horizons')

      await getDb()
        .delete(registrations)
        .where(and(eq(registrations.attendeeId, adaId), eq(registrations.eventId, chosen.id)))

      // The selection row is gone by cascade, not by anything the application did.
      const remaining = await getDb()
        .select()
        .from(activeEventSelections)
        .where(eq(activeEventSelections.attendeeId, adaId))
      expect(remaining).toHaveLength(0)

      // And the attendee lands on a conference they are still registered for — not an error,
      // and not the conference they just lost access to.
      const active = await resolveActiveEvent(adaId)
      expect(active).not.toBeNull()
      expect(active?.name).toBe('Product & Design Summit')
    })

    it('carries the venue timezone, which day context needs (FR-120)', async () => {
      const active = await resolveActiveEvent(adaId)

      expect(active?.timezone).toBeTruthy()
      // Never the placeholder the migration used before dropping its default (research D11).
      expect(active?.timezone).not.toBe('UTC')
    })
  })

  describe('GET /workspace/active-event', () => {
    const signInAs = async (email: string): Promise<string> => {
      await clearThrottle()
      const response = await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: SEED_PASSWORD },
      })
      const token = sessionCookieFrom(response)
      if (!token) throw new Error(`Sign-in failed for ${email}; the test cannot proceed.`)
      return token
    }

    it('returns the active conference, including its timezone', async () => {
      const cookie = await signInAs(ADA)

      const response = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json() as Record<string, unknown>
      expect(body['timezone']).toBeTruthy()
      // FR-121 — the counter is derived on the client and must never appear on the wire.
      expect(body).not.toHaveProperty('dayNumber')
      expect(body).not.toHaveProperty('totalDays')
    })

    it('answers 204 with no body when registered for no conferences (FR-105)', async () => {
      const cookie = await signInAs(ADA)
      await getDb().delete(registrations).where(eq(registrations.attendeeId, adaId))

      const response = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
      })

      // Not a 404 and not a fabricated event: a valid answer with nothing in it.
      expect(response.statusCode).toBe(204)
      expect(response.body).toBe('')
    })

    it('refuses without a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/workspace/active-event' })

      expect(response.statusCode).toBe(401)
    })

    it('records a choice, and echoes what it recorded (research D9)', async () => {
      const cookie = await signInAs(ADA)
      const horizons = await eventNamed('Frontend Horizons')

      const put = await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
        payload: { eventId: horizons.id },
      })

      expect(put.statusCode).toBe(200)
      expect((put.json() as { id: string }).id).toBe(horizons.id)

      // And it stuck.
      const get = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
      })
      expect((get.json() as { name: string }).name).toBe('Frontend Horizons')
    })

    it('is idempotent — re-selecting the active conference changes nothing observable', async () => {
      const cookie = await signInAs(ADA)
      const horizons = await eventNamed('Frontend Horizons')

      const select = () =>
        app.inject({
          method: 'PUT',
          url: '/workspace/active-event',
          headers: { cookie: cookieHeader(cookie) },
          payload: { eventId: horizons.id },
        })

      const first = await select()
      const second = await select()

      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(200)
      expect(second.json()).toEqual(first.json())
    })

    it('refuses an unregistered conference identically to a nonexistent one (FR-148)', async () => {
      const cookie = await signInAs(ADA)
      // Grace's conference: real, but not Ada's.
      const systems = await eventNamed('Systems & Scale')

      const unregistered = await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
        payload: { eventId: systems.id },
      })

      const nonexistent = await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
        payload: { eventId: '00000000-0000-0000-0000-000000000000' },
      })

      // Identical status AND identical body. Any difference leaks which conferences exist.
      expect(unregistered.statusCode).toBe(nonexistent.statusCode)
      expect(unregistered.json()).toEqual(nonexistent.json())
      expect(unregistered.statusCode).toBe(404)
    })

    it('refuses a malformed identifier the same way, not with a 500', async () => {
      const cookie = await signInAs(ADA)

      const malformed = await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
        payload: { eventId: 'not-a-uuid' },
      })

      expect(malformed.statusCode).toBe(404)
    })

    it('leaves the active conference unchanged after a refused switch', async () => {
      const cookie = await signInAs(ADA)
      const before = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
      })

      const systems = await eventNamed('Systems & Scale')
      await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
        payload: { eventId: systems.id },
      })

      const after = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
      })

      expect(after.json()).toEqual(before.json())
    })

    it('HONOURS AN EXPLICIT CHOICE AFTER ITS CONFERENCE HAS ENDED (FR-104)', async () => {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // The one case that catches the alternative brainstorm #02 rejected. An implementation
      // that re-derives once the chosen conference ends passes every other test in this file:
      // the tiers are right, the ordering is right, the PUT records. Only this notices, which
      // is why it is here and why it is spelled out.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const cookie = await signInAs(ADA)
      const horizons = await eventNamed('Frontend Horizons')

      await app.inject({
        method: 'PUT',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
        payload: { eventId: horizons.id },
      })

      // Now push the chosen conference firmly into the past, and make the other one current.
      await moveEvent('Frontend Horizons', -60, -58)
      await moveEvent('Product & Design Summit', -1, 1)

      const after = await app.inject({
        method: 'GET',
        url: '/workspace/active-event',
        headers: { cookie: cookieHeader(cookie) },
      })

      expect(
        (after.json() as { name: string }).name,
        'A chosen conference must stay active after it ends. Falling back to derivation here is ' +
          'the alternative brainstorm #02 explored and rejected (FR-104).',
      ).toBe('Frontend Horizons')
    })

    it('accepts no attendee identifier by any route (FR-106)', async () => {
      const cookie = await signInAs(ADA)
      const [grace] = await getDb()
        .select()
        .from(attendees)
        .where(eq(attendees.email, 'grace@example.com'))

      const response = await app.inject({
        method: 'GET',
        url: `/workspace/active-event?attendeeId=${grace?.id ?? ''}`,
        headers: { cookie: cookieHeader(cookie), 'x-attendee-id': grace?.id ?? '' },
      })

      // The smuggled identifiers succeed only in being ignored: the answer is Ada's.
      expect(response.statusCode).toBe(200)
      const body = response.json() as { name: string }
      expect(ADA_EVENTS).toContain(body.name)
    })
  })
})
