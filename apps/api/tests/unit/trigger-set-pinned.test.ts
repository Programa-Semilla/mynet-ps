import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { materialChangeOf, type SessionLogistics } from '../../src/db/queries/session-changes.js'

/**
 * T158, T160 (014 tranche 2) — **after the notified population widens, the trigger set is still
 * TWO and the material set is still THREE — asserted over the source, because counting
 * dispatching modules is not sufficient evidence** (FR-1079a, SC-1026).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE GAP THIS CLOSES**: `notification-triggers.test.ts` counts permitted CALLER modules, and
 * `no-session-start-trigger.test.ts` asserts nothing time-driven dispatches. Neither can see a
 * fourth MATERIAL CHANGE added to the predicate — `capacity` admitted to `materialChangeOf`
 * would leave the module count at two and every time-pattern silent, while quietly turning a
 * capacity edit into an interruption. FR-1079a's words: without a source-level pin, the
 * "population, not set" requirement is documentary.
 *
 * So the predicate's INPUT is pinned by name to exactly the three N1 facts — cancelled, start
 * time, room — in the shape the schema-derived engagement guard establishes: a fourth logistics
 * field admitted to `SessionLogistics` fails here BY EXISTING, before any behaviour test could
 * notice what it means.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

describe('the trigger set and the material set, pinned (T158, T160, SC-1026)', () => {
  const source = codeOnly(join(apiSrc, 'db', 'queries', 'session-changes.ts'))

  it('pins MaterialChange to exactly cancelled | time | room | null (N1, FR-1079a)', () => {
    const union = /type MaterialChange\s*=\s*([^\n]+(?:\n\s*\|[^\n]+)*)/.exec(source)?.[1] ?? ''
    expect(union, 'the MaterialChange union could not be located').not.toBe('')

    const members = [...union.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort()
    expect(
      members,
      'The material-change union moved. v5.2.0 N1 enumerates exactly three — cancelled, start ' +
        'time, room — and a fourth is a constitution amendment, not a refactor. Widening the ' +
        'notified POPULATION (FR-1079) licensed nothing about the SET (FR-1079a).',
    ).toEqual(['cancelled', 'room', 'time'])
  })

  it('pins the predicate’s INPUT to exactly the three N1 facts (T160)', () => {
    // The interface is the input surface: a fourth logistics field would have to be declared
    // here for the predicate to read it, so it fails by existing — `engagement-coverage`'s
    // property, applied to a type. Matched over the source because a type is erased at runtime.
    const declared = /interface SessionLogistics\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? ''
    expect(declared, 'SessionLogistics could not be located').not.toBe('')

    const fields = [...declared.matchAll(/readonly\s+(\w+)\s*:/g)].map((match) => match[1]).sort()
    expect(
      fields,
      'The material-change predicate’s input gained a field. The set of session facts it may ' +
        'read is pinned to exactly the three N1 changes; a capacity, offset or access-link ' +
        'fact here is the fourth material change arriving as a type, and it needs an amendment ' +
        '(FR-1079a, SC-1026).',
    ).toEqual(['cancelledAt', 'roomId', 'startsAt'])
  })

  it('derives every outcome from those three facts and nothing else', () => {
    // The runtime half of the pin above: each member of the union is reachable, and reachable
    // from the pinned facts alone. A predicate that stopped consulting one of the three would
    // pass the type pin while silently narrowing the set.
    const before: SessionLogistics = {
      startsAt: new Date('2027-03-01T09:00:00Z'),
      roomId: 'room-1',
      cancelledAt: null,
    }

    expect(materialChangeOf(before, { ...before, cancelledAt: new Date() })).toBe('cancelled')
    expect(
      materialChangeOf(before, { ...before, startsAt: new Date('2027-03-01T10:00:00Z') }),
    ).toBe('time')
    expect(materialChangeOf(before, { ...before, roomId: 'room-2' })).toBe('room')
    // A room APPEARING or DISAPPEARING is a room change too — FR-1049 made the room nullable,
    // and somebody deciding where to go cares about all three directions equally.
    expect(materialChangeOf(before, { ...before, roomId: null })).toBe('room')
    expect(materialChangeOf({ ...before, roomId: null }, { ...before, roomId: 'room-2' })).toBe(
      'room',
    )
    expect(materialChangeOf(before, before)).toBeNull()
    // Reinstatement stays silent (FR-1024).
    expect(
      materialChangeOf({ ...before, cancelledAt: new Date() }, { ...before, cancelledAt: null }),
    ).toBeNull()
  })

  it('keeps the caller list at two route modules (SC-1026’s other half)', () => {
    const triggers = codeOnly(
      fileURLToPath(new URL('./notification-triggers.test.ts', import.meta.url)),
    )
    const declared = /DISPATCH_CALLERS[^=]*=\s*\[([\s\S]*?)\]/.exec(triggers)?.[1] ?? ''
    const callers = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1])

    expect(
      callers,
      'The permitted dispatch callers changed. Two triggers: a received message (v3.1.0) and a ' +
        'material change to a session the attendee has saved OR enrolled in (v5.2.0 N1, ' +
        'population widened by v5.3.0’s tranche). A third caller is an amendment.',
    ).toHaveLength(2)
  })

  it('unions the enrolment population inside the fan-out, not at a second dispatch site (FR-1079)', () => {
    // The widening happened in ONE place — `attendeesToNotify` — so the coalescing, the actor
    // exclusion and the conference bound apply to holders automatically. A second query or a
    // second dispatch call for enrolments would re-implement all three, and the first one it
    // got wrong would be the coalescing (SC-1016a's mixed attendee).
    expect(/session_enrolments|sessionEnrolments/.test(source)).toBe(true)
    const unionCount = [...source.matchAll(/UNION ALL/g)].length
    expect(
      unionCount,
      'The fan-out no longer unions the two commitments in one statement. One population, one ' +
        'grouping, one exclusion — a parallel path for holders is where the mixed-attendee ' +
        'arithmetic (SC-1016a) silently breaks.',
    ).toBe(1)
  })
})
