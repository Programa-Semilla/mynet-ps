import type { ConversationRepository } from '@mynet/data'
import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aConversation, renderMessages } from '../support/messages.js'

/**
 * T017 (012) — **`Loading…` is not allowed to be terminal** (FR-1145).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CASE UNDER TEST IS A FIRST READ THAT NEVER SETTLES — NOT ONE THAT FAILS.**
 *
 * Every existing state here rides on the first tick *settling*: a rejection becomes `failed` or
 * `offline`, a resolution becomes the list. A promise that simply never answers took none of
 * those paths, and the destination stood at `Loading…` indefinitely with no retry control on
 * screen — which is exactly how research R5 found Safari behaving, and exactly what no e2e can
 * reproduce, because a live server always answers. So the never-settling read is simulated here,
 * where a promise can honestly be left pending forever.
 *
 * The deadline sits at 25 seconds, deliberately past the transport's own 20-second abort — see
 * `READ_DEADLINE_MS` in `Messages.tsx` — so these tests advance fake time rather than
 * shortening the constant: a configurable deadline would let the test pass at a value the
 * product never uses. **The mechanism is a race inside the tick, not a screen-watching
 * effect**: the tick itself settles at the deadline, so `usePoll`'s chain keeps scheduling and
 * a recovery after failure arrives through the poll's own next tick.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Past `READ_DEADLINE_MS` in `Messages.tsx`, with margin for jittered scheduling. */
const PAST_DEADLINE_MS = 26_000

/** A repository whose `list` hangs forever until `release()` resolves it. */
const stalledRepository = () => {
  let releaseList: (() => void) | undefined

  const repository: Pick<ConversationRepository, 'list' | 'hasUnread' | 'openWith' | 'markRead'> = {
    list: () =>
      new Promise((resolve) => {
        releaseList = () => resolve([aConversation()])
      }),
    hasUnread: async () => false,
    openWith: async () => ({
      conversationId: '33333333-3333-4333-8333-333333333333',
      messageId: '44444444-4444-4444-8444-444444444444',
      sentAt: '2026-09-14T10:00:00.000Z',
    }),
    markRead: async () => {},
  }

  return { repository, release: () => releaseList?.() }
}

describe('a first load that never settles', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('falls to the failure state with a retry control instead of loading forever (FR-1145)', async () => {
    const { repository } = stalledRepository()

    renderMessages({ overrides: { conversations: repository } })
    // `findBy`, not `getBy`: the destination is code-split, so the first paint is the harness's
    // Suspense fallback. The deadline is armed when the component itself mounts, which is what
    // this await pins down before any time is advanced.
    expect(await screen.findByText('Loading your conversations…')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_DEADLINE_MS)
    })

    expect(
      screen.queryByText('Loading your conversations…'),
      'The first read never settled and the destination was still saying Loading — the ' +
        'indefinite spinner FR-1145 exists to forbid.',
    ).not.toBeInTheDocument()
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
    // The way out. A terminal state without one is a dead end, not a state (FR-059).
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('lets a response that finally lands replace the declared failure', async () => {
    const { repository, release } = stalledRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Loading your conversations…')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAST_DEADLINE_MS)
    })
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()

    // The stalled read answers after all. Holding the failure against a good response would be
    // pride, not accuracy — `read` applies its own outcome and `ready` wins.
    await act(async () => {
      release()
    })

    expect(await screen.findByText('Sofía Muñoz')).toBeInTheDocument()
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
  })

  it('does not declare failure while the deadline has not passed', async () => {
    const { repository } = stalledRepository()

    renderMessages({ overrides: { conversations: repository } })
    await screen.findByText('Loading your conversations…')

    // Just short of the deadline: still honestly loading — a slow-but-working first read must
    // not be reported failed while its response may yet arrive.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })

    expect(screen.getByText('Loading your conversations…')).toBeInTheDocument()
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument()
  })
})
