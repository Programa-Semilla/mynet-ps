import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aConversation, aMessage, renderMessages } from '../support/messages.js'

/**
 * T130 (007) — **the empty-and-closed thread shows the closed explanation, never the starter
 * prompt** (FR-519a, FR-573).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CASE FR-519a EXISTS FOR IS NARROW AND EASY TO MISS: THE DEPARTED ATTENDEE WROTE EVERY
 * MESSAGE.**
 *
 * M3's cascade removes an account's messages from every conversation. So a thread in which only
 * the departed person had spoken is left **completely empty** — and a client that chose its empty
 * state on emptiness alone would invite the survivor to "start the conversation" with somebody
 * who no longer exists, on a thread the server will refuse every send into (FR-574).
 *
 * The decision is `state`, never the message count. That is one line in a component and it is the
 * kind of line that gets simplified back to `messages.length === 0 ? <StarterPrompt/>` by somebody
 * tidying up, which is why it has a test that names the requirement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Nothing here renders a placeholder person** (FR-573). `counterpart` is `null` — no name, no
 * avatar, no identifier, because nothing was retained — so the surfaces render what the
 * conversation *now is* rather than inventing a "Deleted user" to stand where somebody was.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

describe('a thread whose counterpart has deleted their account', () => {
  const closedAndEmpty = () =>
    renderMessages({
      at: THREAD,
      // The narrow case: they wrote everything, so the cascade left nothing at all.
      pages: [{ messages: [], nextCursor: null, state: 'one_sided', counterpart: null }],
    })

  it('SHOWS THE CLOSED EXPLANATION, NOT THE STARTER PROMPT (FR-519a)', async () => {
    closedAndEmpty()

    expect(await screen.findByText(/this conversation is closed/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/start the conversation/i),
      'Inviting the survivor to start a conversation they cannot start, with somebody who no ' +
        'longer exists, is the specific failure FR-519a names.',
    ).not.toBeInTheDocument()
  })

  it('says what happened without naming or describing them (FR-573)', async () => {
    closedAndEmpty()

    // Two of them, deliberately: the empty-thread explanation and the composer's replacement.
    // Both say the same thing because both are read in isolation — a reader looking at an empty
    // thread and a reader looking for the missing composer are asking different questions.
    expect((await screen.findAllByText(/deleted their account/i)).length).toBeGreaterThan(0)

    // Nothing invents a person to stand where somebody was.
    for (const invented of [/deleted user/i, /former attendee/i, /unknown/i, /anonymous/i]) {
      expect(screen.queryByText(invented)).not.toBeInTheDocument()
    }
  })

  it('replaces the composer entirely rather than disabling it silently (FR-574)', async () => {
    closedAndEmpty()

    await screen.findByText(/this conversation is closed/i)

    expect(
      screen.queryByRole('button', { name: /send message/i }),
      'A greyed-out send with no words leaves the attendee unable to tell a broken product from ' +
        'one doing what it was asked.',
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(/nothing more can be sent/i).length).toBeGreaterThan(0)
  })

  it('offers no unblock action — there is nobody to unblock', async () => {
    closedAndEmpty()

    await screen.findByText(/this conversation is closed/i)
    expect(
      screen.queryByRole('button', { name: /unblock/i }),
      'One-sided wins over blocked: an unblock control for somebody who no longer exists is an ' +
        'affordance that changes nothing.',
    ).not.toBeInTheDocument()
  })

  it('offers no block or report action either, for the same reason', async () => {
    closedAndEmpty()

    await screen.findByText(/this conversation is closed/i)
    expect(screen.queryByRole('button', { name: /^block/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^report/i })).not.toBeInTheDocument()
  })

  it('STILL SHOWS THE SURVIVOR’S OWN MESSAGES when they wrote some (FR-572)', async () => {
    // The commoner case: both spoke, so the survivor keeps their own half. It is closed, but it
    // is not empty — and the closed explanation belongs at the composer rather than in place of
    // a history that exists.
    renderMessages({
      at: THREAD,
      pages: [
        {
          messages: [aMessage({ body: 'Mine, and still here.', mine: true })],
          nextCursor: null,
          state: 'one_sided',
          counterpart: null,
        },
      ],
    })

    expect(await screen.findByText('Mine, and still here.')).toBeInTheDocument()
    expect(screen.getAllByText(/nothing more can be sent/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
  })

  it('the thread header names no person, because there is none', async () => {
    closedAndEmpty()

    const heading = await screen.findByRole('heading', { level: 2 })
    expect(
      heading.textContent,
      'A header carrying a retained name would be a tombstone in the one place it is most ' +
        'visible.',
    ).toBe('Conversation')
  })
})

describe('the conversation LIST, for a departed counterpart (T135)', () => {
  it('renders the row from `state`, with no placeholder name or avatar', async () => {
    renderMessages({
      conversations: [
        aConversation({ counterpart: null, lastMessage: null, state: 'one_sided', unread: false }),
      ],
    })

    const row = await screen.findByRole('link', { name: /closed conversation/i })

    expect(within(row).getByText(/this conversation is closed/i)).toBeInTheDocument()
    // No image is rendered at all — the fallback draws initials from the *state* wording rather
    // than from a retained name, and there is no `src` to point at a face that no longer exists.
    expect(within(row).queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps the survivor’s own last message as the preview when there is one', async () => {
    renderMessages({
      conversations: [
        aConversation({
          counterpart: null,
          state: 'one_sided',
          lastMessage: {
            body: 'The last thing I said.',
            sentAt: '2026-09-14T09:00:00.000Z',
            mine: true,
          },
        }),
      ],
    })

    const row = await screen.findByRole('link', { name: /closed conversation/i })
    expect(within(row).getByText('You: The last thing I said.')).toBeInTheDocument()
  })
})
