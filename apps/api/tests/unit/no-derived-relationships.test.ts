import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T090 (014) — **no contact, conversation or appointment comes out of an authoring act**
 * (FR-1044).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE RULE IS OLDER THAN THIS FEATURE AND THIS FEATURE IS THE FIRST PLACE IT COULD BE BROKEN
 * FROM ABOVE.**
 *
 * Constitution v3.2.0's N1: *contacts must never be derived from conversations or appointments*.
 * The reasoning was 007's open send — a conversation is unilateral, so deriving a contact from
 * one would let a stranger insert themselves into somebody's Network by sending a single message.
 * A relationship in this product is created by **an act of the two people in it**, and by nothing
 * else.
 *
 * 014 introduces a party with authority over content those people are attached to, and three
 * derivations become individually plausible:
 *
 *   - **Contact.** An organizer authors the session you saved, so you are "connected" to them.
 *     No: a contact is somebody whose digital business card you hold (decision 24), given by a
 *     one-directional act of sharing. Authority over a programme is not an introduction.
 *   - **Conversation.** A cancellation would be friendlier with a note from the organizer, so
 *     open a thread. No: that is a message nobody chose to receive, from somebody with authority
 *     over them, and it would also make the organizer's real name and profile reachable from an
 *     administrative act.
 *   - **Appointment.** A speaker on a session becomes a meeting slot with the speaker. No:
 *     a speaker is conference content describing a person who may hold no account at all
 *     (register entry 28), and an appointment claims a slot of somebody's time.
 *
 * Each would be a *feature*, not a bug, to whoever added it — which is exactly why it is asserted
 * as an absence with the reasoning attached rather than left to review.
 *
 * Comments are stripped before matching, as 009's guards do.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const label = (path: string): string => path.slice(apiSrc.length)

/**
 * The **authoring** surface: 014's own modules. An authoring act can only create a relationship
 * from code that runs during one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **`routes/admin/reports.ts` IS DELIBERATELY OUT OF SCOPE, AND THE FIRST DRAFT OF THIS FILE
 * CAUGHT IT.**
 *
 * 013's report queue reads reported **messages** under v4.1.0's third Principle VIII exception —
 * bounded to what was reported, in the queue, to the platform tier, with its own guards. That is
 * a read of content somebody complained about, not a relationship written on somebody's behalf,
 * and scanning it here would either fail on correct code or force an exemption wide enough to
 * cover the thing this file exists to catch.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
const authoringSurface = [
  join(apiSrc, 'routes', 'admin', 'catalog.ts'),
  join(apiSrc, 'db', 'queries', 'admin-catalog.ts'),
  join(apiSrc, 'db', 'queries', 'session-changes.ts'),
]

describe('014 — no relationship is derived from an authoring act (FR-1044)', () => {
  it('found the authoring surface to audit', () => {
    expect(authoringSurface).toHaveLength(3)
    // And it is genuinely the authoring code: if this stopped matching, the scan below would
    // pass over an empty set.
    expect(
      authoringSurface.some((path) => /admin-catalog\.ts$/.test(path)),
      'the authoring query layer is missing from the scan',
    ).toBe(true)
  })

  it.each([
    ['a contact or shared card', /\bsharedCards\b|\bshared_cards\b|\bshareCard\b/],
    ['a conversation or message', /\bconversations\b|\bmessages\b|\bstartConversation\b/],
    ['an appointment or meeting slot', /\bappointments\b|\bmeetingSlots\b|\bmeeting_slots\b/],
  ])('creates no %s from an authoring act (FR-1044, v3.2.0 N1)', (_label, pattern) => {
    const deriving = authoringSurface.filter((path) => pattern.test(codeOnly(path))).map(label)

    expect(
      deriving,
      'An authoring module reaches a relationship table. A relationship in this product is ' +
        'created by an act of the two people in it and by nothing else (v3.2.0 N1) — an ' +
        'organizer’s authority over content is not an introduction to the people attached to it.',
    ).toEqual([])
  })

  /**
   * **The speaker is the one that would look most reasonable**, so it gets its own assertion.
   *
   * A speaker record names a real person, and the obvious helpfulness is to link it to their
   * attendee account when one exists — then a session's speaker becomes somebody you can message
   * or schedule with. FR-1006 already forbids a route from a speaker to a profile; this forbids
   * the join that would make one possible.
   */
  it('joins no speaker to an attendee account (FR-1006, FR-1044)', () => {
    const joining = authoringSurface
      .filter((path) => {
        const code = codeOnly(path)
        return /speakers[\s\S]{0,200}\battendees\b/.test(code) || /\bspeakerAttendeeId\b/.test(code)
      })
      .map(label)

    expect(
      joining,
      'A speaker is joined to an attendee account. A speaker is conference content describing a ' +
        'person who may hold no account at all (register entry 28); resolving them to one would ' +
        'make a programme edit into a route to somebody’s profile.',
    ).toEqual([])
  })

  /**
   * **The fan-out reads attendees and must write no relationship**, which is the subtlest case.
   *
   * `attendeesToNotify` legitimately resolves who saved a changed session — a notification cannot
   * be addressed otherwise. That is the one place in 014 holding a set of attendee identifiers
   * during an organizer's act, so it is the one place a relationship could be written cheaply.
   */
  it('writes nothing relational from the notification fan-out (FR-1044)', () => {
    const changes = codeOnly(join(apiSrc, 'db', 'queries', 'session-changes.ts'))

    expect(
      /\.insert\(|INSERT\s+INTO/i.test(changes),
      'The fan-out writes. It resolves WHO to notify and nothing else — it is the one place in ' +
        '014 holding a set of attendee identifiers during an organizer’s act, which makes it the ' +
        'cheapest place to derive a relationship nobody asked for (FR-1044).',
    ).toBe(false)
  })
})
