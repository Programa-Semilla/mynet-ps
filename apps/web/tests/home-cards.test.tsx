import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HomeShell } from '../src/app/home/HomeShell.js'
import { HOME_CARDS } from '../src/app/home/registry.js'
import { aSession, SUMMIT, testServices, WithServices } from './support/services.js'

/**
 * T078 (002) — **every registered card renders a visible, meaningful state in all four of
 * loading, populated, empty and failed** (SC-109).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * `home-composition.test.tsx` proves the *mechanism* — the shell contains failures, keeps empty
 * cards visible, and splits event- from attendee-scoped. This proves each card actually **uses**
 * it, which is a different claim and the one that rots first: a card added in feature 006 will
 * inherit the mechanism automatically and can still forget to render an empty state.
 *
 * It iterates `HOME_CARDS` rather than naming cards, so a card contributed later is covered the
 * moment it is registered — by the author who registered it, whether or not they read this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Repository behaviours that put every card into the same state at once. */
const SCENARIOS = {
  loading: () => ({
    events: { listRegistered: () => new Promise<never[]>(() => {}) },
    catalog: {
      listSessions: () => new Promise<never[]>(() => {}),
      listTracks: () => new Promise<never[]>(() => {}),
    },
  }),
  populated: () => ({
    events: { listRegistered: async () => [SUMMIT] },
    catalog: {
      listSessions: async () => [
        // Far in the future relative to the fixed clock below, so "up next" has something.
        aSession({ startsAt: '2026-09-14T14:00:00.000Z', endsAt: '2026-09-14T15:00:00.000Z' }),
      ],
      listTracks: async () => [],
    },
  }),
  empty: () => ({
    events: { listRegistered: async () => [] },
    catalog: { listSessions: async () => [], listTracks: async () => [] },
  }),
  failed: () => ({
    events: {
      listRegistered: async () => {
        throw new Error('server fault')
      },
    },
    catalog: {
      listSessions: async () => {
        throw new Error('server fault')
      },
      listTracks: async () => {
        throw new Error('server fault')
      },
    },
  }),
} as const

describe('every Home card in all four states (SC-109)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // 09:00 in Barcelona on day one, so the seeded fixture above is genuinely upcoming.
    vi.setSystemTime(new Date('2026-09-14T07:00:00Z'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('the registry is not empty, or this file proves nothing', () => {
    expect(HOME_CARDS.length).toBeGreaterThan(0)
  })

  const states = Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>

  describe.each(HOME_CARDS.map((card) => [card.id, card] as const))('%s', (_id, card) => {
    it.each(states)('renders something visible and meaningful when %s', async (state) => {
      render(
        <WithServices services={testServices(SCENARIOS[state]())}>
          <HomeShell cards={[card]} activeEvent={{ status: 'ready', event: SUMMIT }} />
        </WithServices>,
      )

      // Settle any resolved promise the card kicked off.
      await vi.advanceTimersByTimeAsync(0)

      const region = screen.getByRole(state === 'failed' ? 'region' : 'region', {
        name: card.title,
      })

      // ─────────────────────────────────────────────────────────────────────────────────────
      // "Visible and meaningful" is the requirement, so an empty box is a failure. Every state
      // must put readable text on screen beyond the card's own heading — that is what stops a
      // card from silently rendering nothing and passing as "handled".
      // ─────────────────────────────────────────────────────────────────────────────────────
      const body = (region.textContent ?? '').replace(card.title, '').trim()
      expect(
        body.length,
        `The "${card.title}" card renders nothing but its heading when ${state}. Every card owns ` +
          'its loading, empty and failure states (constitution: Home is composed, not aggregated).',
      ).toBeGreaterThan(0)
    })
  })
})

/**
 * T079 — **at most one card claims the `lead` slot** (FR-157, research D8).
 *
 * Not a compile-time guarantee, deliberately. Expressing "at most one element of this array has
 * slot 'lead'" in types would mean a tuple or a builder that narrows on each append, and either
 * makes the registry hostile to the single-line append it exists for. The trade is recorded here
 * rather than glossed, alongside the development-mode assertion in `registry.ts`.
 */
describe('the lead slot (FR-157)', () => {
  it('is claimed by at most one registered card', () => {
    const leads = HOME_CARDS.filter((card) => card.slot === 'lead')

    expect(
      leads.map((card) => card.id),
      'More than one card claims the lead slot. The lead card introduces the screen; two of ' +
        'them is a layout question nobody decided, and the grid would silently render both ' +
        'full-width and look plausible.',
    ).toHaveLength(leads.length > 0 ? 1 : 0)
    expect(leads.length).toBeLessThanOrEqual(1)
  })

  it('has a development-mode assertion that actually rejects a second lead', async () => {
    // The assertion is only useful if it fires. A registry with two leads must throw.
    const { assertAtMostOneLead } = await import('../src/app/home/registry.js')
    const lead = HOME_CARDS.find((card) => card.slot === 'lead')
    if (!lead) throw new Error('Expected a lead card to duplicate.')

    expect(() => assertAtMostOneLead([lead, { ...lead, id: 'second-lead' }])).toThrow(/lead/i)
    expect(() => assertAtMostOneLead(HOME_CARDS)).not.toThrow()
  })

  it('gives every card a unique id, since the shell keys regions by it', () => {
    const ids = HOME_CARDS.map((card) => card.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
