import type { ConversationRepository, ConversationSummary } from '@mynet/data'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aConversation, renderMessages } from '../support/messages.js'

/**
 * T010 (016) — **the conversation list refreshes itself while somebody is looking at it**
 * (FR-1007, FR-1011, FR-1012).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DESTINATION USED TO READ ONCE ON MOUNT AND NEVER AGAIN.**
 *
 * That is wider than the defect as reported. The owner noticed a *newly created* conversation
 * missing from the list, but the same single read meant the list was stale for **every**
 * conversation while Messages was open — unread indicators and last-message previews included.
 * The thread beside it polled every three seconds, so the product showed a live conversation
 * next to a frozen list of conversations.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Fake timers throughout, because the interval is ten seconds and a test that waited for one
 * would be a ten-second test. The poll is jittered by ±20%, so every advance here clears the
 * upper bound rather than the nominal interval — an advance of exactly `intervalMs` would pass
 * or fail depending on `Math.random`, which is the shape of flake that gets a test deleted.
 */

const INTERVAL_MS = 10_000
/** Comfortably past the jittered upper bound of one tick. */
const PAST_ONE_TICK_MS = INTERVAL_MS * 1.5
/**
 * Comfortably past the jittered upper bound of the **first backoff**, which is double the
 * interval because one read has already failed. Clearing `PAST_ONE_TICK_MS` would not fire it.
 */
const PAST_FIRST_BACKOFF_MS = INTERVAL_MS * 2 * 1.5

/** A repository that counts reads and can be re-pointed at new rows between ticks. */
const countingRepository = (initial: ConversationSummary[]) => {
  const state = { rows: initial, reads: 0 }

  const repository: Pick<ConversationRepository, 'list' | 'hasUnread' | 'openWith' | 'markRead'> = {
    list: async () => {
      state.reads += 1
      return state.rows
    },
    hasUnread: async () => state.rows.some((row) => row.unread),
    openWith: async () => ({
      conversationId: '33333333-3333-4333-8333-333333333333',
      messageId: '44444444-4444-4444-8444-444444444444',
      sentAt: '2026-09-14T10:00:00.000Z',
    }),
    markRead: async () => {},
  }

  return { state, repository }
}

/**
 * A list that fails, then holds its next read open, then answers with fresh rows.
 *
 * Three behaviours in call order rather than three doubles, because **the ordering is the
 * property under test**: the read issued second has to resolve first, and the one issued first
 * has to apply nothing when it finally lands.
 */
const racingRepository = (fresh: ConversationSummary[], stale: ConversationSummary[]) => {
  const state = { reads: 0 }

  let land: (rows: ConversationSummary[]) => void = () => {}
  const held = new Promise<ConversationSummary[]>((resolve) => {
    land = resolve
  })

  const repository: Pick<ConversationRepository, 'list' | 'hasUnread' | 'openWith' | 'markRead'> = {
    list: async () => {
      state.reads += 1
      // 1 — the initial read. It fails, which is the only way the retry control is rendered.
      if (state.reads === 1) throw new Error('the initial read fails')
      // 2 — the poll tick, still waiting on the network when the reader presses Try again.
      if (state.reads === 2) return held
      // 3 — the retry, which answers straight away and so overtakes the tick.
      return fresh
    },
    hasUnread: async () => false,
    openWith: async () => ({
      conversationId: '33333333-3333-4333-8333-333333333333',
      messageId: '44444444-4444-4444-8444-444444444444',
      sentAt: '2026-09-14T10:00:00.000Z',
    }),
    markRead: async () => {},
  }

  return { state, repository, landStaleTick: () => land(stale) }
}

describe('the conversation list refreshes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads again on its interval, not only on mount (FR-1007)', async () => {
    const { state, repository } = countingRepository([aConversation()])

    renderMessages({ overrides: { conversations: repository } })

    await waitFor(() => expect(state.reads).toBe(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(
      state.reads,
      'The list read once and never again. That is the defect: it was stale for every ' +
        'conversation while Messages was open, beside a thread refreshing every three seconds.',
    ).toBeGreaterThan(1)
  })

  it('shows what arrived, without the reader navigating (SC-1002, SC-1003)', async () => {
    const { state, repository } = countingRepository([
      aConversation({
        counterpart: { attendeeId: 'a-1', displayName: 'Sofía Muñoz', avatar: null },
      }),
    ])

    renderMessages({ overrides: { conversations: repository } })

    await screen.findByText('Sofía Muñoz')
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument()

    // A second conversation arrives at the server between ticks.
    state.rows = [
      ...state.rows,
      aConversation({
        conversationId: '66666666-6666-4666-8666-666666666666',
        counterpart: { attendeeId: 'a-2', displayName: 'Grace Hopper', avatar: null },
        unread: true,
      }),
    ]

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A refresh must not take the reader's focus** (FR-1011).
   *
   * The list re-renders under somebody who may be tabbing through it, and a refresh that
   * replaced the focused node would drop focus to `<body>` — which is silent for a sighted
   * reader and completely disorienting with a screen reader. Rows are keyed on the conversation
   * id, so an unchanged row is *moved* rather than unmounted, and focus is lost only when a node
   * is unmounted. 009 records the same reasoning for its question list.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('preserves keyboard focus across a refresh (FR-1011)', async () => {
    const { repository } = countingRepository([
      aConversation({
        counterpart: { attendeeId: 'a-1', displayName: 'Sofía Muñoz', avatar: null },
      }),
    ])

    renderMessages({ overrides: { conversations: repository } })

    const row = await screen.findByRole('link', { name: /Sofía Muñoz/ })
    row.focus()
    expect(row).toHaveFocus()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(
      row,
      'A refresh moved focus. The reader was on a conversation and is now on nothing — silent ' +
        'for a sighted reader, and disorienting with a screen reader.',
    ).toHaveFocus()
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A response that lands after the reader has gone must not change the screen** (FR-1012).
   *
   * Asserted by unmounting, which is what navigating away from the destination does. A refresh
   * still in flight then resolves into a component that no longer exists — React warns about a
   * state update on an unmounted component, and in the worst case a slow response overwrites
   * whatever the reader navigated *to*.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('does not write into a destination the reader has left (FR-1012)', async () => {
    const { state, repository } = countingRepository([aConversation()])

    const { unmount } = renderMessages({ overrides: { conversations: repository } })
    await waitFor(() => expect(state.reads).toBe(1))

    const readsAtUnmount = state.reads
    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS * 3)
    })

    expect(
      state.reads,
      'The poll kept running after the destination unmounted. Its timer must be cleared on ' +
        'teardown, or every visit to Messages leaves a request loop behind it.',
    ).toBe(readsAtUnmount)
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **A SUPERSEDED READ APPLIES NOTHING** (FR-1012) — the retry-overtakes-a-tick race.
   *
   * The test above covers the half of FR-1012 that unmounting expresses. This covers the half
   * `usePoll` **cannot** prevent. Ticks are chained through `.finally`, so two of *them* never
   * overlap — but `retry` calls `read` **directly**, from a handler, and it does so exactly when
   * a tick is most likely to be outstanding, because the retry control is only on screen once a
   * read has already failed.
   *
   * Without the `issued`/`newest` guard the slower response wins: the retry succeeds, the reader
   * watches the list populate, and then the earlier tick's stale rows land on top of it.
   *
   * **A first attempt at this drove the overlap through two poll ticks and proved nothing**,
   * because ticks cannot overlap — it timed out instead. The path has to be
   * *failure → tick in flight → retry pressed*, which is why the double answers by call number.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('does not let a tick in flight overwrite the retry that overtook it (FR-1012)', async () => {
    const fresh = [
      aConversation({
        conversationId: '77777777-7777-4777-8777-777777777777',
        counterpart: { attendeeId: 'a-1', displayName: 'Grace Hopper', avatar: null },
      }),
    ]
    const stale = [
      aConversation({
        conversationId: '66666666-6666-4666-8666-666666666666',
        counterpart: { attendeeId: 'a-2', displayName: 'Sofía Muñoz', avatar: null },
      }),
    ]

    const { state, repository, landStaleTick } = racingRepository(fresh, stale)

    renderMessages({ overrides: { conversations: repository } })

    // The initial read failed, so the reader has a retry control in front of them.
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(state.reads).toBe(1)

    // A tick fires and hangs. It never settles, so `usePoll` schedules nothing after it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_FIRST_BACKOFF_MS)
    })
    expect(
      state.reads,
      'No tick fired, so nothing was in flight and the race this test exists for never happened.',
    ).toBe(2)

    // The reader presses Try again while that tick is still waiting on the network.
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()

    // Only now does the earlier tick answer, carrying rows read before the retry's.
    await act(async () => {
      landStaleTick()
      await Promise.resolve()
    })

    expect(
      screen.queryByText('Sofía Muñoz'),
      'The read issued FIRST landed LAST and replaced what the retry had just put on screen. ' +
        'A superseded read must apply nothing.',
    ).not.toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
  })
})
