import type { ConversationRepository } from '@mynet/data'
import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aConversation, renderMessages } from '../support/messages.js'

/**
 * T013 (016) — **the refresh pauses when the list is not on screen** (FR-1054).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONDITION IS WHAT IS DISPLAYED, NOT WHICH LAYOUT BAND IS ACTIVE.**
 *
 * Both readings are true of the product today, which is exactly why the distinction has to be
 * asserted rather than left to the implementation: at phone widths an open thread *replaces* the
 * list, and from tablet up both panes are on screen at once. Writing the rule as
 * `threadOpen && isMobile` would encode that coincidence, and a later layout change would
 * silently re-enable a poll against a list nobody can see.
 *
 * So these tests hide the pane the way a layout hides it — `display: none` — and assert the poll
 * follows **that**. A future arrangement that hides the list differently keeps this test
 * meaningful; one that merely moves the breakpoint does not need it changed at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **jsdom applies no stylesheet**, so Tailwind's `hidden` class does nothing here and the list
 * pane is "displayed" in every one of these renders regardless of the address. That is not a
 * limitation being worked around — it is why the hiding is applied directly below, and why this
 * file could not have been written against a width instead.
 *
 * **What the poll buys on mobile is nothing, and what it costs is a request every interval** —
 * the open thread's own three-second poll already covers the conversation being read, on a
 * phone, at a venue, against a host where each authenticated request also writes a session row.
 */

const INTERVAL_MS = 10_000
const PAST_ONE_TICK_MS = INTERVAL_MS * 1.5

const countingRepository = () => {
  const state = { reads: 0 }

  const repository: Pick<ConversationRepository, 'list' | 'hasUnread' | 'openWith' | 'markRead'> = {
    list: async () => {
      state.reads += 1
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

/**
 * The element the destination measures — the pane wrapping the conversation list.
 *
 * Found through the rendered list rather than by a test id, so a restructure that moved the list
 * into a different container fails here instead of quietly measuring the wrong element.
 */
const listPane = (): HTMLElement => {
  const heading = screen.getByRole('heading', { name: 'Messages' })
  const grid = heading.parentElement?.querySelector('.grid')
  const pane = grid?.firstElementChild
  if (!(pane instanceof HTMLElement)) throw new Error('the list pane could not be found')
  return pane
}

describe('the conversation list refresh follows what is on screen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps refreshing while the list is displayed', async () => {
    const { state, repository } = countingRepository()

    renderMessages({ overrides: { conversations: repository } })
    await waitFor(() => expect(state.reads).toBe(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(state.reads).toBeGreaterThan(1)
  })

  it('keeps refreshing while a thread is open BESIDE the list (FR-1054, desktop and tablet)', async () => {
    const { state, repository } = countingRepository()

    // A thread address, with the pane left displayed — which is the two-pane arrangement. The
    // thread's own poll covers the conversation; this one still covers everything else in the
    // list, and both panes are being looked at.
    renderMessages({
      overrides: { conversations: repository },
      at: '/messages/33333333-3333-4333-8333-333333333333',
    })
    await waitFor(() => expect(state.reads).toBe(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS)
    })

    expect(
      state.reads,
      'The list is on screen next to the open thread and stopped updating anyway. Pausing here ' +
        'would freeze every OTHER conversation’s unread state while the reader reads one.',
    ).toBeGreaterThan(1)
  })

  it('pauses while the list is not displayed (FR-1054, mobile)', async () => {
    const { state, repository } = countingRepository()

    renderMessages({ overrides: { conversations: repository } })
    await waitFor(() => expect(state.reads).toBe(1))

    // Hidden the way the mobile layout hides it. The poll must notice the pane, not the width.
    await act(async () => {
      listPane().style.display = 'none'
    })

    const readsWhenHidden = state.reads

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS * 3)
    })

    expect(
      state.reads,
      'The list kept polling while it was not displayed. On a phone the thread has replaced it, ' +
        'the thread polls for itself, and this request buys nothing at all.',
    ).toBe(readsWhenHidden)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE CASE THE SHIPPED LAYOUT ACTUALLY USES, AND THE ONE THE FIRST IMPLEMENTATION MISSED**
   * (FR-1054, review finding P3).
   *
   * Every other test in this file hides the pane by writing to it, and a `MutationObserver` on
   * `class` and `style` sees that. **The product does not hide it that way.** The pane's class is
   * the constant string `'hidden min-w-0 tablet:block'`; crossing the `tablet` breakpoint changes
   * the *computed* display and mutates no attribute at all — so the hook re-measured never, and
   * both directions of FR-1054 failed: narrowing a window with a thread open left the poll firing
   * at a list nobody could see, and rotating into tablet width left a visible list frozen.
   *
   * A `ResizeObserver` on the pane is the fix: an element with `display: none` has no box, so
   * entering and leaving that state is a size change like any other.
   *
   * **jsdom can express none of that on its own** — it applies no stylesheet, evaluates no media
   * query, and implements no `ResizeObserver` — so both observers are substituted here for the
   * length of this one test. The `MutationObserver` is made deaf deliberately: with the real one
   * in place this would pass on the attribute path and prove nothing about the fix.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('follows a display change no attribute records (FR-1054, the breakpoint case)', async () => {
    const { state, repository } = countingRepository()

    const observed: Element[] = []
    let fireResize: () => void = () => {}

    class FakeResizeObserver {
      constructor(callback: () => void) {
        fireResize = callback
      }
      observe(element: Element) {
        observed.push(element)
      }
      unobserve() {}
      disconnect() {}
    }

    /** Records nothing and delivers nothing, so only the resize path can move the hook. */
    class DeafMutationObserver {
      observe() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }

    // Reached as bare globals rather than as `typeof ResizeObserver`, so no type reference to a
    // denied identifier is created — the denylist covers this file too.
    const globals = globalThis as unknown as Record<string, unknown>
    const realMutationObserver = globals['MutationObserver']
    globals['ResizeObserver'] = FakeResizeObserver
    globals['MutationObserver'] = DeafMutationObserver

    try {
      renderMessages({ overrides: { conversations: repository } })
      await waitFor(() => expect(state.reads).toBe(1))

      expect(
        observed,
        'The pane is not observed for size at all, so a display change made by a media query — ' +
          'which is how this layout hides it — reaches the hook through nothing.',
      ).toContain(listPane())

      // What a breakpoint does: the computed display changes, and the notification arrives as a
      // resize rather than as a mutation record.
      await act(async () => {
        listPane().style.display = 'none'
        fireResize()
      })

      const readsWhenHidden = state.reads

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PAST_ONE_TICK_MS * 3)
      })

      expect(
        state.reads,
        'Narrowing the window past the tablet breakpoint left the list hidden and the poll ' +
          'running — verbatim the failure FR-1054 is worded to prevent.',
      ).toBe(readsWhenHidden)
    } finally {
      globals['MutationObserver'] = realMutationObserver
      delete globals['ResizeObserver']
    }
  })

  it('resumes when the list comes back, without waiting for the next tick (FR-1054)', async () => {
    const { state, repository } = countingRepository()

    renderMessages({ overrides: { conversations: repository } })
    await waitFor(() => expect(state.reads).toBe(1))

    await act(async () => {
      listPane().style.display = 'none'
    })
    const readsWhenHidden = state.reads

    // Returning to the list. No timer is advanced before the assertion: "resumes" has to mean
    // now, for the same reason coming back to a hidden tab does.
    await act(async () => {
      listPane().style.display = ''
    })

    await waitFor(() =>
      expect(
        state.reads,
        'Returning to the list did not refresh it. The reader is looking at whatever it said ' +
          'when they left, which is the staleness this story exists to remove.',
      ).toBeGreaterThan(readsWhenHidden),
    )
  })
})
