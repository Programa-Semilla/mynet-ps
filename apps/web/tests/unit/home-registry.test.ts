import { describe, expect, it } from 'vitest'

import { assertAtMostOneLead, HOME_CARDS } from '../../src/app/home/registry.js'

/**
 * T077 (005) — the registry's invariants still hold **after** this feature appended to it
 * (FR-157, FR-223, FR-226, SC-208).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FIRST TIME A SECOND CONTRIBUTOR HAS TOUCHED THE CARD REGISTRY.**
 *
 * Home is composed rather than aggregated, and the registry is the one shared file the seven
 * features after 002 all edit. 005 is the first of them, so this file is where the composition
 * contract stops being a design and starts being a property somebody has checked.
 *
 * Everything asserted here is about the *shape* of the append rather than about any card's
 * behaviour — which is the point: a contributor who got this wrong would not have broken their
 * own card, they would have broken somebody else's.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the Home card registry, after 005 and 006 appended to it', () => {
  it('has AT MOST ONE lead card (FR-157)', () => {
    const leads = HOME_CARDS.filter((card) => card.slot === 'lead')

    // Two lead cards would both render full width, look plausible, and be nobody's bug — which
    // is why this is checked rather than left to review.
    expect(leads).toHaveLength(1)
    expect(() => assertAtMostOneLead(HOME_CARDS)).not.toThrow()
  })

  it('still refuses a second lead card, so the check has not been weakened', () => {
    const lead = HOME_CARDS.find((card) => card.slot === 'lead')
    if (!lead) throw new Error('The registry has no lead card at all.')

    // A gate that cannot fail is not a gate.
    expect(() => assertAtMostOneLead([...HOME_CARDS, lead])).toThrow(/lead/i)
  })

  it('contains 005’s card exactly ONCE (FR-223)', () => {
    const contributed = HOME_CARDS.filter((card) => card.id === 'next-saved-session')

    expect(contributed).toHaveLength(1)
    expect(contributed[0]?.scope, 'the card is about a conference, so it is event-scoped').toBe(
      'event',
    )
  })

  it('APPENDED rather than inserted — every 002 card keeps its position (FR-226, SC-208)', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Position is not what the shell sorts by — `order` is — but a feature that *reordered* the
    // array would have edited lines belonging to another feature, which FR-226 forbids outright
    // and which a merge conflict in this file is supposed to be too small to hide.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const ids = HOME_CARDS.map((card) => card.id)

    expect(ids.slice(0, 4)).toEqual([
      'greeting-day-context',
      'up-next',
      'rest-of-day',
      'your-conferences',
    ])
    expect(ids[4], '005’s card follows the four 002 contributed').toBe('next-saved-session')
    // T093 (006) — appended after 005's, not inserted before it. The assertion moved from
    // "005's card is last" to "005's card is fifth" for the obvious reason: a second contributor
    // arrived. What it is actually protecting — that nobody reorders anybody else's line — is
    // unchanged and is now checked over the whole prefix rather than over one position.
    expect(ids.at(-1), '006’s card is last, because it was appended').toBe('people-to-meet')
  })

  /**
   * T093 (006) — the card 006 contributes, checked the same way 005's is.
   *
   * Event-scoped, because a directory is a property of one conference: standing decision 7 names
   * the Discover directory explicitly as conference content, and it swaps entirely on a switch
   * (FR-401a). An attendee-scoped card would keep rendering the previous conference's people.
   */
  it('contains 006’s card exactly ONCE, event-scoped (FR-446)', () => {
    const contributed = HOME_CARDS.filter((card) => card.id === 'people-to-meet')

    expect(contributed).toHaveLength(1)
    expect(contributed[0]?.scope).toBe('event')
    expect(contributed[0]?.slot, 'not the lead card — Home answers "what is next" first').not.toBe(
      'lead',
    )
  })

  it('keeps every card id unique, so React keys and test selectors stay stable', () => {
    const ids = HOME_CARDS.map((card) => card.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not let 005’s card collide with another card’s order within its slot', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Ties are broken by registry position, so a collision is not a crash — it is a silent
    // dependence on array order, which is exactly the coupling the `order` field exists to
    // remove. Two features appending concurrently must not be able to reorder each other's
    // cards by winning a merge.
    // ───────────────────────────────────────────────────────────────────────────────────────
    // T093 (006) — widened from `primary` alone to **every** slot. 005 only ever appended to
    // `primary`, so checking that one was enough then; 006 appends to `aside`, and a check that
    // silently covers only the slot the last feature happened to use is a check that stops
    // working exactly when a new contributor arrives.
    for (const slot of ['lead', 'primary', 'aside'] as const) {
      const orders = HOME_CARDS.filter((card) => card.slot === slot).map((card) => card.order)

      expect(new Set(orders).size, `orders within '${slot}' collide: ${orders.join(', ')}`).toBe(
        orders.length,
      )
    }
  })

  it('gives every card a title, which is what the shell names when a card cannot render', () => {
    // FR-163: the containment region says *which* card is unavailable, and it can only do that
    // because the shell holds the title without needing the card to survive to supply it.
    for (const card of HOME_CARDS) {
      expect(card.title.trim(), card.id).not.toBe('')
    }
  })
})
