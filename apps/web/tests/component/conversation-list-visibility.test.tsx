import type { ConversationRepository, ConversationSummary } from '@mynet/data'
import type { VisibilityService } from '@mynet/platform'
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aConversation, renderMessages } from '../support/messages.js'
import { devicesWith } from '../support/services.js'

/**
 * T011 (016) — **nothing is asked for while nobody is looking** (FR-1008).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT SCHEDULED WHILE HIDDEN, RATHER THAN SCHEDULED AND SKIPPED — AND THE DIFFERENCE IS REAL.**
 *
 * A browser throttles a background tab's timers unpredictably, so an interval that "runs" there
 * fires in **bursts** when the tab wakes: several requests at once, for a list nobody was
 * reading, on a phone, at a venue, on cellular data. Skipping inside the callback would leave
 * those wake-up bursts intact and merely make each one cheap.
 *
 * **And it reads immediately on becoming visible, rather than waiting for the next tick.** That
 * is the moment freshness actually matters — somebody has just come back — and a list that made
 * them wait ten seconds to find out what arrived would be honouring the interval while missing
 * the point of it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * `VisibilityService` is the seventh device capability (constitution v3.1.0), added by 007 for
 * exactly this and reached here through the platform rather than by touching `document`. The
 * double below is what makes the transition drivable at all.
 */

const INTERVAL_MS = 10_000
const PAST_ONE_TICK_MS = INTERVAL_MS * 1.5

/** A visibility service a test can flip, notifying subscribers as the real one does. */
const controllableVisibility = () => {
  let visible = true
  const listeners = new Set<(next: boolean) => void>()

  const service: VisibilityService = {
    isVisible: () => visible,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return {
    service,
    set: (next: boolean) => {
      visible = next
      for (const listener of listeners) listener(next)
    },
  }
}

const countingRepository = (initial: ConversationSummary[]) => {
  const state = { rows: initial, reads: 0 }

  const repository: Pick<ConversationRepository, 'list' | 'hasUnread' | 'openWith' | 'markRead'> = {
    list: async () => {
      state.reads += 1
      return state.rows
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

describe('the conversation list refresh follows the tab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops asking while the document is hidden (FR-1008)', async () => {
    const visibility = controllableVisibility()
    const { state, repository } = countingRepository([aConversation()])

    renderMessages({
      overrides: { conversations: repository },
      services: { devices: devicesWith({ visibility: visibility.service }) },
    })

    await waitFor(() => expect(state.reads).toBe(1))

    await act(async () => {
      visibility.set(false)
    })

    const readsWhenHidden = state.reads

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS * 3)
    })

    expect(
      state.reads,
      'The list kept polling a hidden tab. Three intervals passed with nobody looking, which on ' +
        'a phone at a conference is three requests nobody can benefit from.',
    ).toBe(readsWhenHidden)
  })

  it('reads immediately on becoming visible again, not at the next tick (FR-1008)', async () => {
    const visibility = controllableVisibility()
    const { state, repository } = countingRepository([aConversation()])

    renderMessages({
      overrides: { conversations: repository },
      services: { devices: devicesWith({ visibility: visibility.service }) },
    })

    await waitFor(() => expect(state.reads).toBe(1))

    await act(async () => {
      visibility.set(false)
    })
    const readsWhenHidden = state.reads

    // Back to the tab. **No timer is advanced between here and the assertion** — that is the
    // whole point: waiting for the next interval would be the behaviour this forbids.
    await act(async () => {
      visibility.set(true)
    })

    await waitFor(() =>
      expect(
        state.reads,
        'Coming back to the tab did not refresh. The reader is looking at a list that stopped ' +
          'updating when they left, and will keep looking at it until the next interval.',
      ).toBeGreaterThan(readsWhenHidden),
    )
  })
})
