import type { ConversationRepository } from '@mynet/data'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aConversation, renderMessages } from '../support/messages.js'

/**
 * T012 (016) — **a failing refresh slows down, and eventually says so** (FR-1009, FR-1010).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **DURING AN INCIDENT THE LOAD HAS TO DROP, NOT HOLD STEADY.**
 *
 * A fixed interval with no backoff is the worst possible shape for a single small VM trying to
 * recover: every client with Messages open keeps issuing six requests a minute indefinitely, and
 * because they all share one period, recovery arrives as a synchronised burst rather than a ramp.
 * 007 found exactly this in the thread's poll and fixed it there; this is the same mechanism, so
 * it is asserted rather than assumed to have come along for the ride.
 *
 * **And the failure has to be visible.** Otherwise somebody sits in front of a list that stopped
 * updating ten minutes ago and looks precisely like one that is current — which quietly undoes
 * the freshness the whole story is about.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Three failures before the notice, not one** (FR-1010). A single missed tick on a train is
 * ordinary and self-correcting, and announcing it would train people to ignore the notice — so
 * the threshold is part of the requirement rather than a tuning choice.
 */

const INTERVAL_MS = 10_000
const PAST_ONE_TICK_MS = INTERVAL_MS * 1.5

/** `MAX_POLL_INTERVAL_MS` in `usePoll.ts` — the ceiling the doubling is not allowed to pass. */
const CEILING_MS = 60_000

const flakyRepository = () => {
  const state = { reads: 0, failing: false }

  const repository: Pick<ConversationRepository, 'list' | 'hasUnread' | 'openWith' | 'markRead'> = {
    list: async () => {
      state.reads += 1
      if (state.failing) throw new Error('the server is having a moment')
      return [aConversation()]
    },
    hasUnread: async () => false,
    openWith: async () => ({
      conversationId: '33333333-3333-4333-8333-333333333333',
      messageId: '44444444-4444-4444-8444-444444444444',
      sentAt: '2026-09-14T10:00:00.000Z',
    }),
    markRead: async () => {},
  }

  return { state, repository }
}

const staleNotice = () => screen.queryByText(/stopped updating/i)

describe('a conversation list whose refresh keeps failing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the conversations on screen rather than blanking them', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Sofía Muñoz')

    state.failing = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(
      screen.queryByText('Sofía Muñoz'),
      'A refresh that missed deleted the list from under the reader. A tunnel must not blank ' +
        'conversations somebody is looking at — only a FIRST read that fails owns the screen.',
    ).toBeInTheDocument()
  })

  it('says nothing after a single missed tick (FR-1010)', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Sofía Muñoz')

    state.failing = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(
      staleNotice(),
      'One missed tick is ordinary and self-correcting. Announcing it would train people to ' +
        'ignore the notice, which costs more than the notice is worth.',
    ).not.toBeInTheDocument()
  })

  it('tells the reader once failures have gone on long enough to mean it (FR-1010)', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Sofía Muñoz')

    state.failing = true

    // Well past three failures, allowing for the backoff lengthening each gap.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 20)
    })

    expect(await screen.findByText(/stopped updating/i)).toBeInTheDocument()
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Worded distinguishably from being offline** (FR-1010).
   *
   * Three states share this pane and they ask different things of the reader: offline means
   * nothing can be shown at all and they should wait; `failed` means the list never loaded and
   * they should retry; this means the list **is** real and has merely stopped updating itself.
   * A notice that read like the offline one would send somebody looking at their signal.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('does not word the notice as being offline (FR-1010)', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Sofía Muñoz')

    state.failing = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 20)
    })

    const notice = await screen.findByText(/stopped updating/i)
    expect(notice.textContent?.toLowerCase()).not.toContain('offline')
  })

  it('recovers on its own when the service does, with no reload (FR-1009)', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Sofía Muñoz')

    state.failing = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 20)
    })
    expect(await screen.findByText(/stopped updating/i)).toBeInTheDocument()

    // The service comes back. Nothing is pressed and nothing is reloaded.
    state.failing = false
    await act(async () => {
      // Generous, because the backoff has lengthened the gap by now — which is the point of it.
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 20)
    })

    await waitFor(() =>
      expect(
        staleNotice(),
        'The list caught up but still says it has not. Recovery must clear the notice, or the ' +
          'reader is told something false until they reload — which FR-1009 forbids requiring.',
      ).not.toBeInTheDocument(),
    )
  })

  it('slows down rather than hammering a service that is already struggling (FR-1009)', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await waitFor(() => expect(state.reads).toBe(1))

    state.failing = true

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10)
    })

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Ten intervals of wall-clock. At a *fixed* rate that is ten reads; doubling each time it
    // fails, it is roughly four. The assertion is deliberately loose on the exact figure and
    // strict on the shape — jitter makes any precise count a flake, and what matters is that the
    // rate fell rather than by exactly how much.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(
      state.reads,
      'The interval did not grow. During an incident every client keeps issuing requests at the ' +
        'same rate, which is the load shape a two-vCPU host recovers from worst.',
    ).toBeLessThan(8)
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **THE BACKOFF HAS A CEILING, AND WITHOUT THIS NOTHING FAILED IF IT LOST ONE** (FR-1009,
   * review finding T-m12).
   *
   * The test above asserts only that the rate *fell*. Delete `Math.min(…, MAX_POLL_INTERVAL_MS)`
   * and it still passes — an unbounded doubling falls faster, not slower. But FR-1009 says "up
   * to a ceiling" for a reason that is about recovery rather than about load: after a long
   * outage an uncapped interval is hours wide, so the service comes back and the reader sits in
   * front of a list that will not notice **within the sitting**. "Recovers on its own, with no
   * reload" becomes false while every other assertion here stays green.
   *
   * So this fails a lost ceiling **by arithmetic**. Twenty minutes of failure is about twenty
   * capped gaps but only six uncapped ones, which leaves the next uncapped attempt roughly ten
   * minutes away; the service is then restored and the window is four ceilings wide. Capped,
   * that window must contain several reads — the first of them succeeds and resets the interval,
   * so the count climbs from there. Uncapped, it contains **none**.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('stops doubling at the ceiling, so recovery arrives within the sitting (FR-1009)', async () => {
    const { state, repository } = flakyRepository()

    renderMessages({ overrides: { conversations: repository } })
    await waitFor(() => expect(state.reads).toBe(1))

    state.failing = true

    // Long enough that an uncapped interval has run away from a capped one by two orders of
    // magnitude: ~20 gaps of a minute against ~6 gaps doubling 10s, 20s, 40s, 80s, 160s, 320s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL_MS * 120)
    })

    const readsWhileFailing = state.reads
    state.failing = false

    // Four ceilings. Every capped gap is at most `CEILING_MS × 1.2`, so at least three reads must
    // land in here; the uncapped interval at this point is ten minutes and none can.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CEILING_MS * 4)
    })

    expect(
      state.reads - readsWhileFailing,
      'The interval kept doubling past the ceiling. The service came back and the list did not ' +
        'notice — FR-1009 requires recovery without a reload, and an unbounded backoff makes ' +
        'that true only in principle and never within a sitting.',
    ).toBeGreaterThanOrEqual(3)

    // And the reader is told the truth again, which is the half a read count cannot see.
    await waitFor(() => expect(staleNotice()).not.toBeInTheDocument())
  })
})
