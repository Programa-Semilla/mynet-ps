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

const session = (
  id: string,
  startsAt: string,
  endsAt: string,
  // T054, T055 (014) — a session that is happening, unless a test says otherwise. The two
  // functions below disagree about cancelled sessions on purpose, and the parameter is what lets
  // that asymmetry be asserted rather than described.
  cancelled = false,
): Session => ({
  id,
  title: `Session ${id}`,
  summary: null,
  startsAt,
  endsAt,
  cancelled,
  // 014 tranche 2 — defaults matching every pre-tranche session; nothing in this file's two
  // subjects (day scoping and cancellation) reads either field.
  kind: 'mandatory',
  accessLink: null,
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T-review (014) — FR-1022a's ASYMMETRY, ASSERTED AT THE LAYER THAT CLAIMED TO ASSERT IT.**
 *
 * The `cancelled` parameter on the fixture above carries a comment saying it "is what lets that
 * asymmetry be asserted rather than described", and `cancelled-session.test.tsx` states as fact
 * that the unit layer covers it. **Neither was true**: no fixture in this file ever passed the
 * third argument, so every assertion above ran on `cancelled: false` and the filter
 * `nextSession` exists to apply was never exercised. A deep review found the comment and the
 * component test each pointing at the other.
 *
 * The asymmetry is one condition wide and deliberate. FR-1022 marks a cancelled session
 * **everywhere** — the programme, the Agenda row, the panel, the rest-of-day timeline —
 * and FR-1022a omits it from exactly one surface: "Up next", which answers *where do I go now*.
 * `nextSession` and `restOfVenueDay` sit a few lines apart in `sessions.ts` and differ by that
 * single filter, which is precisely the kind of difference a later edit unifies by accident.
 *
 * So both directions are pinned here, and the pairing matters more than either alone: a test
 * that only checked `nextSession` would stay green if somebody "fixed the inconsistency" by
 * adding the filter to `restOfVenueDay` too — which would delete FR-1022 from the timeline.
 * The component layer asserts the same pair over two Home cards reading one programme; this is
 * the layer where the two functions can be compared directly.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a cancelled session and the one surface that omits it (FR-1022, FR-1022a)', () => {
  const at = new Date('2026-09-14T08:30:00Z') // 10:30 at the venue
  const CANCELLED_TWO_PM = session('b', '2026-09-14T12:00:00Z', '2026-09-14T13:00:00Z', true)

  it('skips a cancelled session when answering “where do I go now”', () => {
    expect(
      nextSession([CANCELLED_TWO_PM, FIVE_PM], at, MADRID)?.id,
      'Up next offered a cancelled session. FR-1022a omits it from this one surface because the ' +
        'card answers where to go, and sending somebody to a room for a session that is not ' +
        'happening is the failure the whole trigger exists to prevent.',
    ).toBe('c')
  })

  it('returns null when every remaining session today is cancelled', () => {
    // Not "falls through to tomorrow" and not "shows it anyway": the card's empty state is a
    // complete answer, and FR-140 requires it to be stated rather than shown as nothing.
    expect(nextSession([CANCELLED_TWO_PM], at, MADRID)).toBeNull()
  })

  it('KEEPS the cancelled session in the rest-of-day timeline (FR-1022)', () => {
    expect(
      restOfVenueDay([CANCELLED_TWO_PM, FIVE_PM], at, MADRID).map((one) => one.id),
      'The timeline dropped a cancelled session. It must not: FR-1022 marks cancellation ' +
        'everywhere, and an attendee who saved that session needs to see it struck through — ' +
        'silently removing it is how somebody turns up anyway. Only "Up next" omits it.',
    ).toEqual(['b', 'c'])
  })

  it('carries the flag through, so the row can render the marker', () => {
    // The timeline keeps the session; the *rendering* of it is what says "Cancelled". If the
    // flag were projected away here the row could only show it as an ordinary session.
    expect(restOfVenueDay([CANCELLED_TWO_PM], at, MADRID)[0]?.cancelled).toBe(true)
  })

  it('is exactly ONE condition of difference between the two functions', () => {
    // The strongest form of the requirement: the same programme, the same instant, and the two
    // functions disagree about precisely the cancelled session and nothing else.
    const programme = [CANCELLED_TWO_PM, FIVE_PM]

    const timeline = restOfVenueDay(programme, at, MADRID).map((one) => one.id)
    const upNext = nextSession(programme, at, MADRID)?.id

    expect(timeline).toEqual(['b', 'c'])
    expect(upNext).toBe('c')
    expect(
      timeline.filter((id) => id !== upNext),
      'The two functions differ by more than the cancelled session. They are meant to differ by ' +
        'exactly one condition (FR-1022a); anything else means one of them has grown a rule the ' +
        'other does not have.',
    ).toEqual(['b'])
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
