import { rooms, sessions, sessionSpeakers, speakers, tracks } from '../schema/catalog.js'
import type { SeedContext, SeedModule } from './index.js'

/**
 * T045 (002) — the seeded conference programmes (research D12, SC-107).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TWO FULLY DISJOINT PROGRAMMES, AND ONE CONFERENCE DELIBERATELY LEFT EMPTY.**
 *
 * Disjoint is a testable property, not an aesthetic one. SC-107 requires that no session title,
 * track name, room name or speaker name appears in both programmes, **and** that the session
 * counts differ. That is what makes a switch obviously correct without being told where to
 * look: if any surface still showed the previous conference after switching, it would be
 * showing a name that cannot occur in the new one.
 *
 * The empty conference is not an oversight. It is the fixture FR-139 and US2 scenario 5 need —
 * "this event has no programme" is a state that must render, and without a seeded event that
 * has none, the empty state is untested and quietly rots.
 *
 * `assertDisjoint` below enforces both properties at seed time, so the fixture cannot drift
 * into overlap through a later well-meaning edit.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Seeded content is the only way a programme comes to exist.** There is no write path and no
 * import path at any privilege (FR-132, FR-134) — both would be organizer administration.
 * Adding a conference is a reviewed change to this file.
 */

interface SeedSession {
  readonly title: string
  readonly summary: string | null
  readonly track: string
  readonly room: string
  /** Day offset from the conference's first day, and venue-local wall time. */
  readonly day: number
  readonly startsAt: string
  readonly endsAt: string
  readonly speakers: readonly string[]
}

interface SeedProgramme {
  readonly event: string
  readonly tracks: ReadonlyArray<{ name: string; colorToken: string }>
  readonly rooms: readonly string[]
  readonly speakers: ReadonlyArray<{ name: string; title: string | null; company: string | null }>
  readonly sessions: readonly SeedSession[]
}

/**
 * Barcelona. Six sessions across three days.
 *
 * Track token names must exist in `apps/web/src/theme/tokens.css`; an unrecognised one renders
 * as a defined neutral rather than breaking (research D7), but that is a safety net, not a
 * licence to invent names here.
 */
const SUMMIT: SeedProgramme = {
  event: 'Product & Design Summit',
  tracks: [
    { name: 'Design Systems', colorToken: 'track-design' },
    { name: 'Product Strategy', colorToken: 'track-product' },
    { name: 'Keynote', colorToken: 'track-keynote' },
  ],
  rooms: ['Gaudí Hall', 'Miró Room', 'Dalí Studio'],
  speakers: [
    { name: 'Elena Vasquez', title: 'Head of Design', company: 'Northwind' },
    { name: 'Tomás Ferreira', title: 'Principal PM', company: 'Cobalt' },
    { name: 'Ingrid Halvorsen', title: 'Design Director', company: 'Fjord Labs' },
  ],
  sessions: [
    {
      title: 'Opening Keynote: Designing for Trust',
      summary: 'How design decisions accumulate into something people are willing to rely on.',
      track: 'Keynote',
      room: 'Gaudí Hall',
      day: 0,
      startsAt: '09:00',
      endsAt: '10:00',
      speakers: ['Elena Vasquez'],
    },
    {
      title: 'Tokens Beyond Colour',
      summary: 'Spacing, motion and typography as a system rather than a palette.',
      track: 'Design Systems',
      room: 'Miró Room',
      day: 0,
      startsAt: '10:30',
      endsAt: '11:30',
      speakers: ['Ingrid Halvorsen'],
    },
    {
      // FR-138's fixture: a real session with **no speaker at all**. It must render completely,
      // with no empty speaker area and no placeholder name. Without a seeded example, the
      // no-speaker branch is only ever exercised by a unit test.
      title: 'Open Studio: Critique Hour',
      summary: null,
      track: 'Design Systems',
      room: 'Dalí Studio',
      day: 0,
      startsAt: '14:00',
      endsAt: '15:30',
      speakers: [],
    },
    {
      title: 'Roadmaps That Survive Contact',
      summary: 'Planning that stays useful once the quarter starts.',
      track: 'Product Strategy',
      room: 'Gaudí Hall',
      day: 1,
      startsAt: '09:30',
      endsAt: '10:30',
      speakers: ['Tomás Ferreira'],
    },
    {
      // Two speakers — the panel case a nullable speaker column could not have expressed.
      title: 'Panel: When Design and Product Disagree',
      summary: 'Three practitioners on the arguments worth having.',
      track: 'Product Strategy',
      room: 'Miró Room',
      day: 1,
      startsAt: '11:00',
      endsAt: '12:00',
      speakers: ['Elena Vasquez', 'Tomás Ferreira'],
    },
    {
      title: 'Closing: What We Are Taking Home',
      summary: null,
      track: 'Keynote',
      room: 'Gaudí Hall',
      day: 2,
      startsAt: '16:00',
      endsAt: '17:00',
      speakers: ['Ingrid Halvorsen'],
    },
  ],
}

/**
 * Lisbon. **Four** sessions — a different count from Barcelona's six, which is half of what
 * SC-107 asks for. Nothing below shares a name with anything above.
 */
const HORIZONS: SeedProgramme = {
  event: 'Frontend Horizons',
  tracks: [
    { name: 'Runtime Performance', colorToken: 'track-tech' },
    { name: 'Platform Futures', colorToken: 'track-product' },
  ],
  rooms: ['Tejo Auditorium', 'Alfama Loft'],
  speakers: [
    { name: 'Priya Raghunathan', title: 'Staff Engineer', company: 'Meridian' },
    { name: 'Wouter Bakker', title: null, company: 'Independent' },
  ],
  sessions: [
    {
      title: 'The Cost of a Re-render',
      summary: 'Measuring what actually makes an interface feel slow.',
      track: 'Runtime Performance',
      room: 'Tejo Auditorium',
      day: 0,
      startsAt: '09:00',
      endsAt: '10:00',
      speakers: ['Priya Raghunathan'],
    },
    {
      // Deliberately simultaneous with the one below: two sessions starting at the same instant
      // are what T031's determinism case needs, and a schedule without one cannot exercise it.
      title: 'Shipping Without a Bundler',
      summary: null,
      track: 'Platform Futures',
      room: 'Alfama Loft',
      day: 0,
      startsAt: '11:00',
      endsAt: '12:00',
      speakers: ['Wouter Bakker'],
    },
    {
      title: 'Progressive Enhancement, Revisited',
      summary: 'What the platform now does for free.',
      track: 'Platform Futures',
      room: 'Tejo Auditorium',
      day: 0,
      startsAt: '11:00',
      endsAt: '12:00',
      speakers: [],
    },
    {
      title: 'Rendering on the Edge',
      summary: 'Where the work happens, and what that costs.',
      track: 'Runtime Performance',
      room: 'Tejo Auditorium',
      day: 1,
      startsAt: '14:00',
      endsAt: '15:00',
      speakers: ['Priya Raghunathan', 'Wouter Bakker'],
    },
  ],
}

/**
 * Systems & Scale (Berlin) is **absent from this list on purpose** — it is Grace's conference
 * with no programme, and it is the fixture the empty state is proven against.
 */
const PROGRAMMES: readonly SeedProgramme[] = [SUMMIT, HORIZONS]

/**
 * SC-107, enforced rather than hoped for.
 *
 * A later edit that reused a room name across the two conferences would silently weaken every
 * switching test — "no surface still shows the previous conference" stops being checkable when
 * both conferences contain the same words. Failing the seed is the cheapest place to catch it.
 */
const assertDisjoint = (): void => {
  const [first, second] = PROGRAMMES
  if (!first || !second) throw new Error('Seed: expected exactly two populated programmes.')

  const namesOf = (programme: SeedProgramme): string[] => [
    ...programme.tracks.map((t) => t.name),
    ...programme.rooms,
    ...programme.speakers.map((s) => s.name),
    ...programme.sessions.map((s) => s.title),
  ]

  const overlap = namesOf(first).filter((name) => namesOf(second).includes(name))
  if (overlap.length > 0) {
    throw new Error(
      `Seed: the two programmes share ${overlap.join(', ')}. SC-107 requires them to be fully ` +
        'disjoint, because that is what makes a conference switch verifiable.',
    )
  }

  if (first.sessions.length === second.sessions.length) {
    throw new Error(
      'Seed: the two programmes have the same session count. SC-107 requires them to differ.',
    )
  }
}

/**
 * A venue-local wall time on day N of the conference, as an absolute instant.
 *
 * The programme is authored in the venue's own terms — "day 2, 09:30" — because that is how a
 * conference schedule is actually written. It is stored as `timestamptz` (FR-124), so the
 * conversion happens exactly once, here, using the venue's zone.
 */
const instantAt = (
  startsOn: string,
  timezone: string,
  dayOffset: number,
  wallTime: string,
): Date => {
  const day = new Date(`${startsOn}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + dayOffset)
  const date = day.toISOString().slice(0, 10)

  // ───────────────────────────────────────────────────────────────────────────────────────
  // Find the UTC instant whose venue-local wall time is the one asked for.
  //
  // **Two correction passes, not one.** The offset that matters is the one in force at the
  // *answer*, not at the guess, and those differ when a DST transition falls between them. A
  // single pass gets `2026-03-29 01:00` in Europe/Madrid an hour wrong — it measures +2 at the
  // guess, when the local time it is solving for is still +1 — and the failing window is wider
  // for negative-offset zones. The first pass lands within an hour; the second lands exactly.
  //
  // A wall time inside a skipped hour has no instant at all; it normalises to the nearest real
  // one rather than failing, which is the right behaviour for seed data a human wrote.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const guess = new Date(`${date}T${wallTime}:00Z`)
  const firstPass = new Date(guess.getTime() - zoneOffsetMs(guess, timezone))
  return new Date(guess.getTime() - zoneOffsetMs(firstPass, timezone))
}

/** How far ahead of UTC the zone is at a given instant, in milliseconds. */
const zoneOffsetMs = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00'
  const asUtc = Date.UTC(
    Number(at('year')),
    Number(at('month')) - 1,
    Number(at('day')),
    Number(at('hour')) % 24,
    Number(at('minute')),
    Number(at('second')),
  )
  return asUtc - instant.getTime()
}

export const catalogSeed: SeedModule = {
  name: 'catalog',

  async clear(db) {
    // Reverse dependency order within the catalog: the join table, then sessions, then the
    // things sessions point at.
    await db.delete(sessionSpeakers)
    await db.delete(sessions)
    await db.delete(speakers)
    await db.delete(rooms)
    await db.delete(tracks)
  },

  async run(db, context: SeedContext) {
    assertDisjoint()

    for (const programme of PROGRAMMES) {
      const eventId = context.eventIds.get(programme.event)
      const dates = context.eventDates.get(programme.event)
      if (!eventId || !dates) {
        throw new Error(`Seed: no event "${programme.event}" — check seed/events.ts`)
      }

      const insertedTracks = await db
        .insert(tracks)
        .values(programme.tracks.map((t) => ({ eventId, name: t.name, colorToken: t.colorToken })))
        .returning()
      const trackId = new Map(insertedTracks.map((t) => [t.name, t.id]))

      const insertedRooms = await db
        .insert(rooms)
        .values(programme.rooms.map((name) => ({ eventId, name })))
        .returning()
      const roomId = new Map(insertedRooms.map((r) => [r.name, r.id]))

      const insertedSpeakers = await db
        .insert(speakers)
        .values(
          programme.speakers.map((s) => ({
            eventId,
            name: s.name,
            title: s.title,
            company: s.company,
          })),
        )
        .returning()
      const speakerId = new Map(insertedSpeakers.map((s) => [s.name, s.id]))

      for (const session of programme.sessions) {
        const track = trackId.get(session.track)
        const room = roomId.get(session.room)
        if (!track) throw new Error(`Seed: no track "${session.track}" in ${programme.event}`)
        if (!room) throw new Error(`Seed: no room "${session.room}" in ${programme.event}`)

        const [inserted] = await db
          .insert(sessions)
          .values({
            eventId,
            trackId: track,
            roomId: room,
            title: session.title,
            summary: session.summary,
            startsAt: instantAt(dates.startsOn, dates.timezone, session.day, session.startsAt),
            endsAt: instantAt(dates.startsOn, dates.timezone, session.day, session.endsAt),
          })
          .returning()

        if (!inserted) throw new Error(`Seed: failed to insert "${session.title}".`)

        if (session.speakers.length > 0) {
          await db.insert(sessionSpeakers).values(
            session.speakers.map((name) => {
              const id = speakerId.get(name)
              if (!id) throw new Error(`Seed: no speaker "${name}" in ${programme.event}`)
              return { sessionId: inserted.id, speakerId: id }
            }),
          )
        }
      }
    }
  },
}
