import type { Session } from '@mynet/data'
import { describe, expect, it } from 'vitest'

import { groupByVenueDay, nextSession, restOfVenueDay } from '../../src/app/sessions.js'
import { trackClassesFor } from '../../src/app/track-colors.js'

/**
 * Reading a programme against the venue's clock (FR-137, FR-140, research D6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Added after a deep review found `restOfVenueDay` and `groupByVenueDay` had **no test at all**
 * — the Rest-of-day card was never once rendered with sessions in it, and the only grouping
 * coverage put both sessions comfortably mid-day, so the venue-midnight boundary the function
 * exists to get right was never crossed.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const MADRID = 'Europe/Madrid' // UTC+2 in September

const session = (id: string, startsAt: string, endsAt: string): Session => ({
  id,
  title: `Session ${id}`,
  summary: null,
  startsAt,
  endsAt,
  track: { id: 't', name: 'Track', colorToken: 'track-design' },
  room: { id: 'r', name: 'Room' },
  speakers: [],
})

// Venue-local times on 14 September (UTC+2).
const NINE_AM = session('a', '2026-09-14T07:00:00Z', '2026-09-14T08:00:00Z')
const TWO_PM = session('b', '2026-09-14T12:00:00Z', '2026-09-14T13:00:00Z')
const FIVE_PM = session('c', '2026-09-14T15:00:00Z', '2026-09-14T16:00:00Z')
const TOMORROW_NINE = session('d', '2026-09-15T07:00:00Z', '2026-09-15T08:00:00Z')

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **The venue's date, not UTC's** (FR-120) — the case every other fixture in this file misses.
 *
 * The instants used elsewhere sit at times where the UTC date and the Madrid date coincide, so
 * they would all still pass if `venueDateOf` were changed to format in UTC. This one cannot:
 * `2026-09-14T22:30:00Z` is **23:30 on the 14th in UTC but 00:30 on the 15th in Madrid**, so
 * the two answers differ and only the venue's is correct.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the venue clock decides the day, not UTC (FR-120)', () => {
  /** 00:30 on the 15th in Madrid; still the 14th in UTC. */
  const AFTER_VENUE_MIDNIGHT = new Date('2026-09-14T22:30:00Z')

  it('treats a session at 09:00 on the 15th as TODAY once the venue has passed midnight', () => {
    // Under a UTC computation "today" would be the 14th and this would be excluded.
    expect(nextSession([TOMORROW_NINE], AFTER_VENUE_MIDNIGHT, MADRID)?.id).toBe('d')
  })

  it('treats the 14th’s evening sessions as YESTERDAY once the venue has passed midnight', () => {
    expect(
      restOfVenueDay([FIVE_PM, TOMORROW_NINE], AFTER_VENUE_MIDNIGHT, MADRID).map((s) => s.id),
    ).toEqual(['d'])
  })

  it('groups a session by the venue date, which can differ from its UTC date', () => {
    // 22:30Z on the 14th is 00:30 on the 15th at the venue, so it belongs to the 15th.
    const justAfterMidnight = session('m', '2026-09-14T22:30:00Z', '2026-09-14T23:30:00Z')
    expect(groupByVenueDay([justAfterMidnight], MADRID)[0]?.date).toBe('2026-09-15')
  })
})

describe('nextSession', () => {
  it('returns the soonest session still to come today', () => {
    const at = new Date('2026-09-14T08:30:00Z') // 10:30 at the venue
    expect(nextSession([FIVE_PM, TWO_PM, NINE_AM], at, MADRID)?.id).toBe('b')
  })

  it('returns null once today is over, even when the conference continues tomorrow', () => {
    const at = new Date('2026-09-14T20:00:00Z') // 22:00 at the venue
    expect(nextSession([NINE_AM, TWO_PM, FIVE_PM, TOMORROW_NINE], at, MADRID)).toBeNull()
  })

  it('resolves simultaneous starts by id, matching the server’s total order', () => {
    const first = session('aaa', '2026-09-14T12:00:00Z', '2026-09-14T13:00:00Z')
    const second = session('bbb', '2026-09-14T12:00:00Z', '2026-09-14T13:00:00Z')
    const at = new Date('2026-09-14T07:00:00Z')

    // Same answer whichever order the server happened to list them in.
    expect(nextSession([first, second], at, MADRID)?.id).toBe('aaa')
    expect(nextSession([second, first], at, MADRID)?.id).toBe('aaa')
  })

  it('uses the venue’s day boundary, not the reader’s', () => {
    // 23:30 in Madrid on the 14th is already the 15th in Tokyo. The venue decides.
    const at = new Date('2026-09-14T21:30:00Z')
    expect(nextSession([TOMORROW_NINE], at, MADRID)).toBeNull()
  })
})

describe('restOfVenueDay', () => {
  it('lists what remains of today, in order', () => {
    const at = new Date('2026-09-14T08:00:00Z') // 10:00 at the venue
    expect(restOfVenueDay([FIVE_PM, TWO_PM], at, MADRID).map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('excludes the session already shown as up next (FR-164 without coupling the cards)', () => {
    const at = new Date('2026-09-14T08:00:00Z')
    expect(restOfVenueDay([TWO_PM, FIVE_PM], at, MADRID, 'b').map((s) => s.id)).toEqual(['c'])
  })

  it('drops sessions that have already started', () => {
    const at = new Date('2026-09-14T13:00:00Z') // 15:00 at the venue
    expect(restOfVenueDay([NINE_AM, TWO_PM, FIVE_PM], at, MADRID).map((s) => s.id)).toEqual(['c'])
  })

  it('never spills into tomorrow, even late in the evening', () => {
    const at = new Date('2026-09-14T21:00:00Z') // 23:00 at the venue
    expect(restOfVenueDay([TOMORROW_NINE], at, MADRID)).toEqual([])
  })
})

describe('groupByVenueDay', () => {
  it('groups into venue-local days in chronological order', () => {
    const days = groupByVenueDay([TOMORROW_NINE, TWO_PM, NINE_AM], MADRID)

    expect(days.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-15'])
    expect(days[0]?.sessions.map((s) => s.id)).toEqual(['a', 'b'])
    expect(days[1]?.sessions.map((s) => s.id)).toEqual(['d'])
  })

  it('puts a session crossing venue midnight under the day it STARTS (research D6)', () => {
    // 23:30 on the 14th at the venue, ending 00:30 on the 15th.
    const crossing = session('late', '2026-09-14T21:30:00Z', '2026-09-14T22:30:00Z')
    const days = groupByVenueDay([crossing], MADRID)

    expect(days).toHaveLength(1)
    expect(days[0]?.date).toBe('2026-09-14')
  })

  it('labels each day in the venue’s terms', () => {
    expect(groupByVenueDay([NINE_AM], MADRID)[0]?.label).toMatch(/Monday 14 September/)
  })
})

/**
 * FR-136, research D7 — an unrecognised track token degrades to a defined neutral rather than
 * rendering unstyled. Previously untested, including the fallback its own comment calls "the one
 * place an unknown token is handled".
 */
describe('trackClassesFor', () => {
  it.each(['track-design', 'track-product', 'track-tech', 'track-keynote'])(
    'maps %s to its own classes',
    (token) => {
      expect(trackClassesFor(token)).not.toBe(trackClassesFor('track-nonsense'))
      expect(trackClassesFor(token)).toContain('bg-')
    },
  )

  it('degrades an unrecognised token to the defined neutral, never to nothing', () => {
    const fallback = trackClassesFor('track-desgin') // a plausible seed typo
    expect(fallback).toBeTruthy()
    expect(fallback).toContain('track-unknown')
  })
})
