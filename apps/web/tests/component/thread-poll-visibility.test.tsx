import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { A_COUNTERPART, aMessage, renderMessages } from '../support/messages.js'
import { devicesWith } from '../support/services.js'

/**
 * Deep review — **the poll stops while the tab is hidden, and that is why `VisibilityService`
 * exists** (FR-562, research R4, constitution v3.1.0 / standing decision 22).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE BEHAVIOUR THAT JUSTIFIED A SEVENTH DEVICE CAPABILITY HAD NO TEST.**
 *
 * `VisibilityService` was added to Principle V by this feature — a governance-level addition to a
 * list the constitution enumerates — on exactly one argument: *a poll must stop while the tab is
 * hidden, and the only way to ask is a browser API feature code may not call.* The amendment
 * records it. Nothing exercised it.
 *
 * The component harness hardcodes `isVisible: () => true`, no test in `apps/web/tests` used fake
 * timers, and `substitution.test.ts` even builds a `visibilityListeners` fixture specifically so a
 * test could drive visibility changes — which nothing ever did, while the parallel connectivity
 * listeners *are* driven. A dead fixture is direct evidence of an intended test never written.
 *
 * Deleting `|| !visible` from the effect's guard left every test in the repository green while
 * restoring the burst-on-wake behaviour the capability was added to prevent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY BURST-ON-WAKE IS THE HARM, RATHER THAN A FEW WASTED REQUESTS.**
 *
 * A browser throttles a background tab's timers unpredictably and then releases them together. An
 * interval that "runs" while hidden does not tick evenly at three seconds — it fires a clump when
 * the tab wakes, several requests at once, for a conversation nobody was reading. At a conference
 * that is every attendee's phone waking in the same corridor at the same moment.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

/** The poll interval the hook schedules. Read from behaviour, not imported — see the assertions. */
const POLL_MS = 3_000

/**
 * A `VisibilityService` a test can drive, mirroring what `WebVisibilityService` does for real.
 *
 * The registry is substituted whole (FR-047), so this is the entire mechanism: no module mock, no
 * stubbed browser global, no reaching into the component.
 */
const controllableVisibility = () => {
  const listeners = new Set<(visible: boolean) => void>()
  let visible = true

  return {
    service: {
      isVisible: () => visible,
      subscribe: (listener: (value: boolean) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    set: (next: boolean) => {
      visible = next
      for (const listener of [...listeners]) listener(next)
    },
    /** How many subscribers are attached — a leaked listener is a defect this can see. */
    listenerCount: () => listeners.size,
  }
}

/**
 * A page as the **wire** serves it: newest first.
 *
 * The order matters and is easy to get wrong — `useConversation` reverses once for display, and a
 * fixture written oldest-first makes the *oldest* message look like the newest arrival, so an
 * announcement test silently stops observing arrivals. Bodies are given newest-first here.
 */
const page = (bodies: string[]) => ({
  messages: bodies.map((body) => aMessage({ body, messageId: `msg-${body}`, mine: false })),
  nextCursor: null,
  state: 'open' as const,
  counterpart: A_COUNTERPART,
})

describe('the open thread polls only while the tab is visible (FR-562)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const openThread = () => {
    const visibility = controllableVisibility()

    const view = renderMessages({
      at: THREAD,
      pages: Array.from({ length: 40 }, () => page(['Are you going to the keynote?'])),
      services: { devices: devicesWith({ visibility: visibility.service }) },
    })

    return { ...view, visibility }
  }

  it('reads once on open, without waiting for the first interval', async () => {
    const { messages } = openThread()

    await waitFor(() => expect(messages.pageQueries.length).toBeGreaterThanOrEqual(1))
    expect(await screen.findByText('Are you going to the keynote?')).toBeInTheDocument()
  })

  it('KEEPS polling while visible', async () => {
    const { messages } = openThread()
    await waitFor(() => expect(messages.pageQueries.length).toBeGreaterThanOrEqual(1))

    const afterOpen = messages.pageQueries.length
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)

    expect(
      messages.pageQueries.length,
      'A visible thread must keep refreshing — SC-502 gives a reply five seconds to appear.',
    ).toBeGreaterThan(afterOpen)
  })

  it('STOPS entirely while hidden — not "runs and skips" (standing decision 22)', async () => {
    const { messages, visibility } = openThread()
    await waitFor(() => expect(messages.pageQueries.length).toBeGreaterThanOrEqual(1))

    visibility.set(false)

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The measurement starts after the transition settles, and the window is deliberate.**
    //
    // Going hidden re-runs the effect: React re-renders with the new value, the old interval is
    // cleared, and a read already in flight resolves. One read can land in that window — it was
    // issued while the tab was still visible, and cancelling it would discard work already paid
    // for. The property under test is not "never one more request"; it is **"no continuing
    // schedule"**, which is what produces the wake-up burst.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await vi.advanceTimersByTimeAsync(50)
    const whenHidden = messages.pageQueries.length

    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    const hiddenReads = messages.pageQueries.length - whenHidden

    // Compared against what the *same* elapsed time costs while visible, so the assertion is
    // about the schedule rather than about an exact number a timing detail could shift.
    expect(
      hiddenReads,
      `Five poll intervals passed hidden and produced ${hiddenReads} reads. A hidden tab must ` +
        'not keep a schedule: an interval that is scheduled and skipped still wakes, and a ' +
        'browser releases throttled timers in a clump — the burst this capability was added to ' +
        'the constitution to prevent.',
    ).toBeLessThanOrEqual(1)
  })

  it('costs an order of magnitude fewer reads hidden than visible, over the same time', async () => {
    // The comparison the previous test's bound rests on. Stated as its own case so a change that
    // made *both* paths quiet — a poll that silently stopped altogether — cannot pass by making
    // the hidden number small.
    const visible = openThread()
    await waitFor(() => expect(visible.messages.pageQueries.length).toBeGreaterThanOrEqual(1))
    const visibleStart = visible.messages.pageQueries.length
    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    const visibleReads = visible.messages.pageQueries.length - visibleStart
    visible.unmount()

    const hidden = openThread()
    await waitFor(() => expect(hidden.messages.pageQueries.length).toBeGreaterThanOrEqual(1))
    hidden.visibility.set(false)
    await vi.advanceTimersByTimeAsync(50)
    const hiddenStart = hidden.messages.pageQueries.length
    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    const hiddenReads = hidden.messages.pageQueries.length - hiddenStart

    expect(visibleReads, 'a visible thread must actually poll').toBeGreaterThanOrEqual(3)
    expect(
      hiddenReads,
      `Visible cost ${visibleReads} reads over the same window; hidden cost ${hiddenReads}.`,
    ).toBeLessThan(visibleReads)
  })

  it('refetches IMMEDIATELY on becoming visible, without waiting an interval', async () => {
    const { messages, visibility } = openThread()
    await waitFor(() => expect(messages.pageQueries.length).toBeGreaterThanOrEqual(1))

    visibility.set(false)
    await vi.advanceTimersByTimeAsync(POLL_MS * 5)
    const whenHidden = messages.pageQueries.length

    visibility.set(true)

    // No timer advance beyond a tick: coming back is itself the trigger. Waiting three seconds
    // to discover what arrived while you were away is the whole reason this is not just an
    // interval that resumes.
    await waitFor(() => expect(messages.pageQueries.length).toBeGreaterThan(whenHidden))
  })

  it('detaches its listener when the thread goes away', async () => {
    const { messages, visibility, unmount } = openThread()
    await waitFor(() => expect(messages.pageQueries.length).toBeGreaterThanOrEqual(1))

    expect(visibility.listenerCount()).toBeGreaterThan(0)
    unmount()

    expect(
      visibility.listenerCount(),
      'A leaked visibility listener keeps a dead thread polling for the life of the page.',
    ).toBe(0)
  })
})

/**
 * FR-585 — **arriving messages are announced, every time, without moving focus.**
 *
 * The round-1 fix for this had no test, so the defect it corrected could return silently. Two
 * mechanisms are asserted, because two separate bugs combined to make the region fire at most once
 * per mounted thread: the announcement must **change** on each arrival (an `aria-live` region whose
 * text is unchanged is not re-announced), and a thread that opens with nothing from the counterpart
 * must still announce their first message.
 */
describe('new messages are announced to assistive technology (FR-585)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * The announcement element itself, found by its text rather than by reaching for `document`.
   *
   * Returning the **node** is deliberate: the assertion that matters is identity, because a region
   * whose text is unchanged is not re-announced, and only a replaced element proves it changed.
   */
  const liveRegion = (): HTMLElement | null => screen.queryByText(/new message arrived/i)

  it('says nothing on the FIRST read — reading a thread is not an arrival', async () => {
    renderMessages({
      at: THREAD,
      pages: [page(['Already here before you opened it.'])],
    })

    expect(await screen.findByText('Already here before you opened it.')).toBeInTheDocument()
    expect(liveRegion(), 'reading a thread is not an arrival').toBeNull()
  })

  it('announces a message that arrives while the thread is open', async () => {
    const first = page([])
    const second = page(['Are you around this afternoon?'])

    renderMessages({ at: THREAD, advanceOnPoll: true, pages: [first, second] })

    // The thread opened EMPTY — the case the old guard skipped, because a first read with no
    // counterpart message left the "last announced" marker null and the announcement required it
    // to be non-null. The very first message from the other person went unannounced in exactly
    // the thread where it matters most.
    await waitFor(() => expect(liveRegion()).not.toBeNull())
    expect(liveRegion()).toHaveAttribute('aria-live', 'polite')
  })

  it('announces AGAIN on a second arrival — the same sentence twice is heard once', async () => {
    const one = page(['First.'])
    const two = page(['Second.', 'First.'])

    renderMessages({ at: THREAD, advanceOnPoll: true, pages: [page([]), one, two] })

    // Stepped one poll at a time rather than waited on, so each arrival is observed separately.
    // A `waitFor` here can straddle both ticks and see only the final state, which is precisely
    // the state a *broken* implementation also reaches.
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await waitFor(() => expect(liveRegion()).not.toBeNull())
    const afterFirst = liveRegion()

    await vi.advanceTimersByTimeAsync(POLL_MS)
    await waitFor(() => expect(screen.getByText('Second.')).toBeInTheDocument())

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The element is REPLACED, not updated — that is what a screen reader reports.**
    //
    // React bails out of a state update equal by `Object.is`, so an announcement carrying the
    // same string literal produced no DOM mutation at all, and an `aria-live` region that does
    // not change is not spoken again. Identity is therefore the assertion: same text, different
    // node, because the region is keyed on an arrival counter.
    // ─────────────────────────────────────────────────────────────────────────────────────
    expect(
      liveRegion(),
      'The second arrival must replace the region. If this is the same node, the announcement ' +
        'carried an identical value and only the first message was ever spoken.',
    ).not.toBe(afterFirst)
    expect(liveRegion()).not.toBeNull()
  })

  it("never announces the attendee's OWN message", async () => {
    const mine = {
      ...page([]),
      messages: [aMessage({ body: 'Something I said.', messageId: 'mine-1', mine: true })],
    }

    renderMessages({ at: THREAD, advanceOnPoll: true, pages: [page([]), mine] })

    expect(await screen.findByText('Something I said.')).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)

    expect(liveRegion(), 'Announcing your own message tells you something you just did.').toBeNull()
  })
})

/**
 * Deep review — **a poll that keeps failing backs off, and says so** (FR-562).
 *
 * The poll used to be a fixed `setInterval` with no backoff and no jitter, and after the first
 * successful read every failure was swallowed with no state change. Load never fell during an
 * incident, and the reader could not tell a thread that had stopped updating ten minutes ago from
 * one that was current.
 */
describe('a failing poll sheds load and stops pretending (FR-562)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the conversation on screen when a REFRESH fails — a tunnel deletes nothing', async () => {
    const { messages } = renderMessages({ at: THREAD, pages: [page(['Still here.'])] })

    expect(await screen.findByText('Still here.')).toBeInTheDocument()
    messages.failThread(new Error('boom'))
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)

    // The thread stays exactly where it was. This is the property the backoff must not break.
    expect(screen.getByText('Still here.')).toBeInTheDocument()
    expect(screen.queryByText(/could not load this conversation/i)).not.toBeInTheDocument()
  })

  it('tells the reader once failures mean something, not on the first missed tick', async () => {
    const { messages } = renderMessages({ at: THREAD, pages: [page(['Still here.'])] })
    expect(await screen.findByText('Still here.')).toBeInTheDocument()

    messages.failThread(new Error('boom'))

    // One failure is a train going into a tunnel. Announcing it would train people to ignore
    // the notice, so nothing is said yet.
    await vi.advanceTimersByTimeAsync(POLL_MS * 1.5)
    expect(screen.queryByText(/stopped updating/i)).not.toBeInTheDocument()

    // Enough consecutive failures, and it is no longer a blip.
    await vi.advanceTimersByTimeAsync(POLL_MS * 40)
    await waitFor(() => expect(screen.getByText(/stopped updating/i)).toBeInTheDocument())

    // And it promises recovery without asking the reader to do anything.
    expect(screen.getByText(/catch up on its own/i)).toBeInTheDocument()
  })

  it('BACKS OFF — a failing thread costs far fewer requests than a healthy one', async () => {
    const healthy = renderMessages({ at: THREAD, pages: [page(['Fine.'])] })
    await waitFor(() => expect(healthy.messages.pageQueries.length).toBeGreaterThanOrEqual(1))
    const healthyStart = healthy.messages.pageQueries.length
    await vi.advanceTimersByTimeAsync(POLL_MS * 10)
    const healthyReads = healthy.messages.pageQueries.length - healthyStart
    healthy.unmount()

    const failing = renderMessages({ at: THREAD, pages: [page(['Fine.'])] })
    await waitFor(() => expect(failing.messages.pageQueries.length).toBeGreaterThanOrEqual(1))
    failing.messages.failThread(new Error('boom'))
    const failingStart = failing.messages.pageQueries.length
    await vi.advanceTimersByTimeAsync(POLL_MS * 10)
    const failingReads = failing.messages.pageQueries.length - failingStart

    expect(healthyReads, 'a healthy thread must actually poll').toBeGreaterThanOrEqual(3)
    expect(
      failingReads,
      `Over the same window a healthy thread made ${healthyReads} reads and a failing one made ` +
        `${failingReads}. Without backoff they are equal, which is a client that keeps hammering ` +
        'a service that is already struggling — load that never sheds when it most needs to.',
    ).toBeLessThan(healthyReads)
  })

  it('RECOVERS on its own, clearing the notice, without the reader doing anything', async () => {
    const { messages } = renderMessages({ at: THREAD, pages: [page(['Fine.'])] })
    expect(await screen.findByText('Fine.')).toBeInTheDocument()

    messages.failThread(new Error('boom'))
    await vi.advanceTimersByTimeAsync(POLL_MS * 40)
    await waitFor(() => expect(screen.getByText(/stopped updating/i)).toBeInTheDocument())

    messages.failThread(null)

    // The backoff ceiling is a minute, so recovery must arrive without a reload — that is the
    // whole reason it is a ceiling rather than a surrender.
    await vi.advanceTimersByTimeAsync(90_000)
    await waitFor(() => expect(screen.queryByText(/stopped updating/i)).not.toBeInTheDocument())
  })
})
