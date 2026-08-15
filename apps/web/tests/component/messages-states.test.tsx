import { OfflineError } from '@mynet/data'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { A_COUNTERPART, aConversation, aMessage, renderMessages } from '../support/messages.js'

/**
 * T051 (007) — **every state Messages declares, asserted by name** (FR-518, FR-519, FR-519a,
 * FR-564, Principle IX declaration).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A MATRIX, DELIBERATELY**, on the reasoning 005's `agenda-states.test.tsx` and 006's
 * `discover-states.test.tsx` each record. Each of these is reachable in ordinary use — a new
 * account has messaged nobody, a train goes into a tunnel, somebody deletes their account — and
 * each is the state an attendee is looking at when they form their opinion of the destination.
 *
 * States asserted in passing on the way to testing something else are the ones that come to be
 * *nearly* covered. This file asserts the property the Principle IX declaration actually
 * promises, so a missing state fails by name rather than by nobody noticing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

describe('Messages: the declared list states', () => {
  it('LOADING: says the conversations are loading', async () => {
    const { messages } = renderMessages()
    messages.holdList()

    expect(await screen.findByText(/loading your conversations/i)).toBeInTheDocument()
  })

  it('EMPTY: invites the attendee into Discover rather than apologising (FR-518)', async () => {
    renderMessages({ conversations: [] })

    expect(await screen.findByText(/no conversations yet/i)).toBeInTheDocument()
    // An invitation with somewhere to go. `requirements.md` names this treatment specifically:
    // an attendee who has messaged nobody has nothing to fix, so the state offers the one action
    // that leads somewhere.
    expect(screen.getByRole('link', { name: /find people to meet/i })).toHaveAttribute(
      'href',
      '/discover',
    )
  })

  it('POPULATED: renders a row per conversation with counterpart and preview (FR-509)', async () => {
    renderMessages({ conversations: [aConversation()] })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    expect(within(row).getByText('Sofía Muñoz')).toBeInTheDocument()
    expect(within(row).getByText('See you there.')).toBeInTheDocument()
  })

  it("POPULATED: marks the attendee's own last message as theirs", async () => {
    renderMessages({
      conversations: [
        aConversation({
          lastMessage: { body: 'On my way.', sentAt: '2026-09-14T09:00:00.000Z', mine: true },
        }),
      ],
    })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    expect(within(row).getByText('You: On my way.')).toBeInTheDocument()
  })

  it('OFFLINE: says so, discloses nothing, and offers a retry (FR-564, SC-513)', async () => {
    renderMessages({ conversations: [aConversation()], listFails: new OfflineError('offline') })

    // Found by its words rather than by role: the harness wraps the code-split destination in a
    // Suspense fallback that is itself a `role="status"`, so querying by role alone resolves to
    // the spinner before the offline state has rendered.
    const status = (await screen.findByText(/you are offline/i)).closest(
      '[role="status"]',
    ) as HTMLElement | null
    expect(status).not.toBeNull()
    expect(status).toHaveTextContent(/offline/i)
    // FR-563: nothing is cached, and the state says so rather than leaving the attendee to
    // wonder whether their conversations are lost.
    expect(status).toHaveTextContent(/not stored on this device/i)
    expect(screen.queryByText('Sofía Muñoz')).not.toBeInTheDocument()
    expect(
      within(status as HTMLElement).getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
  })

  it('FAILED: is worded distinguishably from offline, and offers a retry', async () => {
    renderMessages({ listFails: new Error('server fault') })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/problem on our side/i)
    expect(alert).not.toHaveTextContent(/offline/i)
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('FAILED: retrying re-reads and can succeed', async () => {
    const user = userEvent.setup()
    const { messages } = renderMessages({
      conversations: [aConversation()],
      listFails: new Error('server fault'),
    })

    const alert = await screen.findByRole('alert')
    messages.failList(null)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Sofía Muñoz')).toBeInTheDocument()
  })
})

describe('Messages: the declared thread states', () => {
  it('LOADING: says the conversation is loading', async () => {
    const { messages } = renderMessages({ at: THREAD })
    messages.holdThread()

    expect(await screen.findByText(/loading this conversation/i)).toBeInTheDocument()
  })

  it('POPULATED: renders the history oldest first (FR-515)', async () => {
    renderMessages({
      at: THREAD,
      // Newest first over the wire, as the server serves it. The reversal is the client's.
      pages: [
        {
          messages: [
            aMessage({ messageId: 'm2', body: 'Second.', sentAt: '2026-09-14T09:01:00.000Z' }),
            aMessage({ messageId: 'm1', body: 'First.', sentAt: '2026-09-14T09:00:00.000Z' }),
          ],
          nextCursor: null,
          state: 'open',
          counterpart: A_COUNTERPART,
        },
      ],
    })

    await screen.findByText('First.')
    const rendered = screen.getAllByRole('listitem').map((item) => item.textContent ?? '')

    expect(
      rendered.findIndex((text) => text.includes('First.')),
      'oldest first, so a thread reads downward the way a conversation happened',
    ).toBeLessThan(rendered.findIndex((text) => text.includes('Second.')))
  })

  it('EMPTY AND OPEN: shows the conversation-starter prompt (FR-519)', async () => {
    renderMessages({
      at: THREAD,
      pages: [{ messages: [], nextCursor: null, state: 'open', counterpart: A_COUNTERPART }],
    })

    expect(await screen.findByText(/start the conversation/i)).toBeInTheDocument()
  })

  it('EMPTY AND CLOSED: shows the closed explanation, NEVER the starter prompt (FR-519a)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The narrow case FR-519a exists for: the departed attendee wrote every message, so M3's
    // cascade leaves the survivor with an empty thread. Deciding on emptiness alone would invite
    // them to start a conversation with somebody who no longer exists.
    // ───────────────────────────────────────────────────────────────────────────────────────
    renderMessages({
      at: THREAD,
      pages: [{ messages: [], nextCursor: null, state: 'one_sided', counterpart: null }],
    })

    expect(await screen.findByText(/this conversation is closed/i)).toBeInTheDocument()
    expect(screen.queryByText(/start the conversation/i)).not.toBeInTheDocument()
  })

  it('CLOSED: the composer is replaced by an explanation, not disabled silently (FR-574)', async () => {
    renderMessages({
      at: THREAD,
      pages: [{ messages: [], nextCursor: null, state: 'one_sided', counterpart: null }],
    })

    await screen.findByText(/this conversation is closed/i)

    expect(
      screen.queryByRole('button', { name: /send message/i }),
      'A greyed-out send with no words is what FR-539 and FR-574 forbid: the attendee cannot ' +
        'tell a product that is broken from one doing what they asked.',
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(/deleted their account/i).length).toBeGreaterThan(0)
  })

  it('OFFLINE: the thread says so and shows no content', async () => {
    renderMessages({ at: THREAD, threadFails: new OfflineError('offline') })

    // By words, not by role — see the list's offline test for why.
    const status = (await screen.findByText(/this conversation is not stored/i)).closest(
      '[role="status"]',
    ) as HTMLElement | null
    expect(status).not.toBeNull()
    expect(status).toHaveTextContent(/offline/i)
  })

  it('FAILED: the thread is worded distinguishably from offline', async () => {
    renderMessages({ at: THREAD, threadFails: new Error('server fault') })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/problem on our side/i)
    expect(alert).not.toHaveTextContent(/offline/i)
  })

  it('MORE HISTORY: offers to load earlier messages only when there are some', async () => {
    renderMessages({
      at: THREAD,
      pages: [
        {
          messages: [aMessage()],
          nextCursor: 'cursor-1',
          state: 'open',
          counterpart: A_COUNTERPART,
        },
      ],
    })

    expect(
      await screen.findByRole('button', { name: /show earlier messages/i }),
    ).toBeInTheDocument()
  })

  it('MORE HISTORY: offers nothing when the whole conversation is on screen', async () => {
    renderMessages({
      at: THREAD,
      pages: [
        { messages: [aMessage()], nextCursor: null, state: 'open', counterpart: A_COUNTERPART },
      ],
    })

    await screen.findByText(aMessage().body)
    expect(screen.queryByRole('button', { name: /show earlier messages/i })).not.toBeInTheDocument()
  })

  it('a further page failing does NOT discard what is already shown', async () => {
    const user = userEvent.setup()
    const { messages } = renderMessages({
      at: THREAD,
      pages: [
        {
          messages: [aMessage({ body: 'Still here.' })],
          nextCursor: 'cursor-1',
          state: 'open',
          counterpart: A_COUNTERPART,
        },
      ],
    })

    await screen.findByText('Still here.')
    messages.failThread(new Error('server fault'))
    await user.click(screen.getByRole('button', { name: /show earlier messages/i }))

    await waitFor(() =>
      expect(
        screen.getByText('Still here.'),
        'Blanking a conversation because its history could not be extended would lose the ' +
          'reader their place for nothing.',
      ).toBeInTheDocument(),
    )
  })
})
