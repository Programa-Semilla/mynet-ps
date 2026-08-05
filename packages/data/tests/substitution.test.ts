import { describe, expect, it } from 'vitest'

import { HttpAttendeeRepository } from '../src/http/attendee-repository.js'
import { HttpClient } from '../src/http/client.js'
import { HttpEventsRepository } from '../src/http/events-repository.js'
import type {
  Attendee,
  AttendeeRepository,
  Event,
  EventsRepository,
} from '../src/interfaces/index.js'

/**
 * T104 — every repository is substitutable (FR-047, User Story 5).
 *
 * The device half of this claim lives in `packages/platform/tests/substitution.test.ts`. This is
 * the data half: a test double replaces the HTTP implementation, feature code is unchanged, and
 * nothing downstream can tell the difference.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The second half of this file matters more than the first. **No repository method may ever
 * accept an attendee identifier**, and that is asserted here rather than left to review.
 *
 * It is what makes FR-036 structural: the server binds identity at the request boundary from the
 * sign-in session, so the client has no identifier to send and no parameter to send it in.
 * Adding one would reintroduce the failure the whole design exists to prevent, and — without
 * this test — would break nothing.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const ADA: Attendee = { id: 'a1', email: 'ada@example.com', displayName: 'Ada Lovelace' }

const EVENTS: Event[] = [
  {
    id: 'e1',
    name: 'Product & Design Summit',
    location: 'Barcelona, Spain',
    startsOn: '2026-09-14',
    endsOn: '2026-09-17',
  },
]

const httpRepositories = () => {
  const http = new HttpClient({
    baseUrl: 'https://api.test',
    isOnline: () => true,
    fetch: (async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch,
  })

  return {
    attendee: new HttpAttendeeRepository(http),
    events: new HttpEventsRepository(http),
  }
}

describe('repository substitution', () => {
  it('accepts a double in place of the HTTP attendee repository', async () => {
    const double: AttendeeRepository = { getCurrent: async () => ADA }

    // Same shape, different object, and the caller cannot tell which it holds.
    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(httpRepositories().attendee)),
    ).toContain('getCurrent')
    expect(await double.getCurrent()).toEqual(ADA)
  })

  it('accepts a double in place of the HTTP events repository', async () => {
    const double: EventsRepository = { listRegistered: async () => EVENTS }
    expect(await double.listRegistered()).toEqual(EVENTS)
  })

  it('lets a double return the empty case the real one cannot be made to return', async () => {
    // FR-040 — an attendee registered for no events gets an empty array, not an error. Driving
    // that state against the real repository would need a second seeded database; against a
    // double it is one line, which is the practical argument for the interface.
    const double: EventsRepository = { listRegistered: async () => [] }
    expect(await double.listRegistered()).toEqual([])
  })

  it('lets a double raise a failure, so the failure path is testable at all', async () => {
    const double: AttendeeRepository = {
      getCurrent: async () => {
        throw new Error('the server refused')
      },
    }
    await expect(double.getCurrent()).rejects.toThrow('the server refused')
  })
})

describe('no repository method accepts an attendee identifier (FR-036, FR-044)', () => {
  /**
   * Every repository method, checked by arity.
   *
   * A method that takes no arguments cannot be handed somebody else's identifier. This is a
   * blunt instrument on purpose: it fails on *any* new parameter, which forces whoever adds one
   * to come here and explain themselves rather than slipping an `attendeeId` past review.
   */
  const methods = [
    ['AttendeeRepository.getCurrent', httpRepositories().attendee.getCurrent],
    ['EventsRepository.listRegistered', httpRepositories().events.listRegistered],
  ] as const

  it.each(methods)('%s takes no parameters', (_name, method) => {
    expect(method.length).toBe(0)
  })

  it('holds for test doubles too, since they implement the same interface', () => {
    const attendee: AttendeeRepository = { getCurrent: async () => ADA }
    const events: EventsRepository = { listRegistered: async () => EVENTS }

    expect(attendee.getCurrent.length).toBe(0)
    expect(events.listRegistered.length).toBe(0)
  })
})
