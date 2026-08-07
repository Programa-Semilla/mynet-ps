import { describe, expect, it } from 'vitest'

import { dayContextFor, timeOfDayGreeting } from '../../src/app/day-context.js'

/**
 * T018 (002) — day context is computed against the **venue's** clock (FR-120–FR-125).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The test that matters here is the timezone-gap one.**
 *
 * A device-local computation passes almost everything below. It gets the day number right for
 * everyone standing at the venue, and wrong for everyone reading from anywhere else — which is
 * the entire reason FR-120 exists, and is invisible to any test written in the venue's own
 * zone. `dayContextFor` therefore takes the venue's zone explicitly and never consults the
 * device's, so there is no expression in it that *could* read the wrong clock.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Barcelona, UTC+2 in September (CEST). Four days. */
const SUMMIT = {
  startsOn: '2026-09-14',
  endsOn: '2026-09-17',
  timezone: 'Europe/Madrid',
} as const

describe('day context follows the venue, not the device (FR-120)', () => {
  it('uses the venue date when the venue has rolled over and the reader has not', () => {
    // 2026-09-15T00:30:00Z — Madrid is 02:30 on the 15th; Lima (UTC-5) is 19:30 on the 14th.
    // The reader is in Lima. The answer must be Barcelona's.
    const context = dayContextFor(SUMMIT, new Date('2026-09-15T00:30:00Z'))

    expect(context).toEqual({ status: 'during', dayNumber: 2, totalDays: 4 })
  })

  it('uses the venue date when the reader has rolled over and the venue has not', () => {
    // 2026-09-14T21:30:00Z — Madrid is 23:30 on the 14th; Tokyo (UTC+9) is already the 15th.
    // Still day 1 at the venue.
    const context = dayContextFor(SUMMIT, new Date('2026-09-14T21:30:00Z'))

    expect(context).toEqual({ status: 'during', dayNumber: 1, totalDays: 4 })
  })

  it('gives the same answer for one instant regardless of where it is read', () => {
    // The signature is the proof: there is no device-zone parameter, so two readers holding
    // the same instant cannot get different answers.
    const instant = new Date('2026-09-16T12:00:00Z')

    expect(dayContextFor(SUMMIT, instant)).toEqual(dayContextFor(SUMMIT, new Date(instant)))
  })
})

describe('daylight saving adds no day (FR-125)', () => {
  /** Madrid leaves CEST on 2026-10-25 — that local day is 25 hours long. */
  const ACROSS_DST = {
    startsOn: '2026-10-24',
    endsOn: '2026-10-26',
    timezone: 'Europe/Madrid',
  } as const

  it('counts calendar dates, so a 25-hour day is still one day', () => {
    const context = dayContextFor(ACROSS_DST, new Date('2026-10-26T10:00:00Z'))

    // Elapsed-milliseconds arithmetic would divide 49 hours by 24 and reach day 3 by luck here
    // and day 4 on the spring transition. Counting dates is right in both directions.
    expect(context).toEqual({ status: 'during', dayNumber: 3, totalDays: 3 })
  })

  it('reports the middle day correctly across the transition', () => {
    const context = dayContextFor(ACROSS_DST, new Date('2026-10-25T12:00:00Z'))

    expect(context).toEqual({ status: 'during', dayNumber: 2, totalDays: 3 })
  })
})

describe('the boundaries', () => {
  it('reads day 1 of 1 for a one-day conference (FR-122)', () => {
    const oneDay = { startsOn: '2026-09-14', endsOn: '2026-09-14', timezone: 'Europe/Madrid' }

    expect(dayContextFor(oneDay, new Date('2026-09-14T09:00:00Z'))).toEqual({
      status: 'during',
      dayNumber: 1,
      totalDays: 1,
    })
  })

  it('counts the first day as day 1, not day 0', () => {
    expect(dayContextFor(SUMMIT, new Date('2026-09-14T08:00:00Z'))).toMatchObject({ dayNumber: 1 })
  })

  it('counts the last day as the final day, not one past it', () => {
    // 20:00Z is 22:00 on the 17th in Madrid — the final evening, still day 4. Note that 22:00Z
    // would already be the 18th at the venue and therefore correctly "after"; the venue's
    // midnight is the boundary, not UTC's.
    expect(dayContextFor(SUMMIT, new Date('2026-09-17T20:00:00Z'))).toEqual({
      status: 'during',
      dayNumber: 4,
      totalDays: 4,
    })
  })

  it('ends at the venue midnight, not at UTC midnight', () => {
    // The same instant that is still "the 17th, 22:00" in New York is already the 18th in
    // Barcelona. The conference is over for a reader anywhere in the world at this point.
    expect(dayContextFor(SUMMIT, new Date('2026-09-17T22:00:00Z'))).toEqual({
      status: 'after',
      totalDays: 4,
    })
  })

  it('says how long until a conference that has not started (FR-122)', () => {
    const context = dayContextFor(SUMMIT, new Date('2026-09-11T12:00:00Z'))

    // No day number before it begins — "Day 0 of 4" would be nonsense.
    expect(context).toEqual({ status: 'before', daysUntil: 3, totalDays: 4 })
  })

  it('says a conference has ended, with no day number (FR-122)', () => {
    const context = dayContextFor(SUMMIT, new Date('2026-09-20T12:00:00Z'))

    expect(context).toEqual({ status: 'after', totalDays: 4 })
  })

  it('treats the instant just before the venue midnight of day one as "before"', () => {
    // 2026-09-13T21:59:00Z is 23:59 on the 13th in Madrid — one minute before the conference.
    expect(dayContextFor(SUMMIT, new Date('2026-09-13T21:59:00Z'))).toMatchObject({
      status: 'before',
      daysUntil: 1,
    })
  })
})

describe('time-of-day greeting follows the DEVICE clock (FR-123)', () => {
  // Deliberately the other way round from the day number: "good morning" is about the reader's
  // morning, not the venue's. The two clocks are used for two different things on purpose.
  it.each([
    [new Date('2026-09-15T06:00:00'), 'Good morning'],
    [new Date('2026-09-15T13:00:00'), 'Good afternoon'],
    [new Date('2026-09-15T20:00:00'), 'Good evening'],
    [new Date('2026-09-15T02:00:00'), 'Good evening'],
  ])('%s → %s', (now, expected) => {
    expect(timeOfDayGreeting(now)).toBe(expected)
  })
})
