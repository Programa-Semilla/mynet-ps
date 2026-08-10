import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderMessages } from '../support/messages.js'

/**
 * T037 (007) — **send is disabled while there is nothing to send** (FR-512).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A DISABLED CONTROL, NOT A POST-SUBMIT ERROR — AND THAT IS A CONSTRAINT, NOT A PREFERENCE.**
 *
 * `requirements.md` lists "invalid empty message or meeting topic" among the required states and
 * specifies the treatment: the confirmation is **disabled**, never an error shown after
 * submission. An attendee who presses send on an empty composer and is told off has been given a
 * failure they could have been prevented from reaching.
 *
 * The server refuses these too — `message-validation.test.ts` asserts that, and the column's
 * CHECK asserts it again — because client-side presentation of a limit is never the enforcement
 * of it. This file asserts the *presentation*, which is the half an integration test cannot see.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Driven through the real composer at the real address, so a component that satisfied this by
 * rendering a different disabled button somewhere would not pass.
 */

const NEW_THREAD = '/messages/new/11111111-1111-4111-8111-111111111111'

describe('the composer', () => {
  const sendButton = () => screen.getByRole('button', { name: /send message/i })

  it('is disabled when the composer is empty', async () => {
    renderMessages({ at: NEW_THREAD })

    expect(await screen.findByRole('textbox', { name: /message/i })).toHaveValue('')
    expect(sendButton()).toBeDisabled()
  })

  it('is disabled when the composer contains only whitespace', async () => {
    const user = userEvent.setup()
    renderMessages({ at: NEW_THREAD })

    await user.type(await screen.findByRole('textbox', { name: /message/i }), '     ')

    expect(
      sendButton(),
      'Whitespace is not a message. The server trims before insert so this would be refused ' +
        'anyway — but being refused after pressing send is the state FR-512 forbids.',
    ).toBeDisabled()
  })

  it('is disabled again when the attendee clears what they typed', async () => {
    const user = userEvent.setup()
    renderMessages({ at: NEW_THREAD })

    const composer = await screen.findByRole('textbox', { name: /message/i })
    await user.type(composer, 'Hello')
    expect(sendButton()).toBeEnabled()

    await user.clear(composer)
    expect(sendButton()).toBeDisabled()
  })

  it('is enabled as soon as there is a non-whitespace character', async () => {
    const user = userEvent.setup()
    renderMessages({ at: NEW_THREAD })

    await user.type(await screen.findByRole('textbox', { name: /message/i }), '  hi  ')

    expect(sendButton()).toBeEnabled()
  })

  it('sends the TRIMMED body, never the padding', async () => {
    const user = userEvent.setup()
    const { messages } = renderMessages({ at: NEW_THREAD })

    await user.type(await screen.findByRole('textbox', { name: /message/i }), '  hello there  ')
    await user.click(sendButton())

    await waitFor(() => expect(messages.opened).toHaveLength(1))
    expect(messages.opened[0]?.body).toBe('hello there')
  })

  it('pressing Enter on an empty composer sends nothing at all', async () => {
    const user = userEvent.setup()
    const { messages } = renderMessages({ at: NEW_THREAD })

    await user.click(await screen.findByRole('textbox', { name: /message/i }))
    await user.keyboard('{Enter}')

    expect(
      messages.opened,
      'A keyboard path that bypasses the disabled button would defeat the requirement while ' +
        'leaving this file green if it only ever clicked (FR-584 makes the keyboard a first-' +
        'class path, so it has to obey the same rule).',
    ).toHaveLength(0)
  })

  it('shows no character counter until the limit is close (FR-517)', async () => {
    const user = userEvent.setup()
    renderMessages({ at: NEW_THREAD })

    await user.type(await screen.findByRole('textbox', { name: /message/i }), 'Short.')

    expect(
      screen.queryByText(/characters remaining/i),
      'A counter present from the first keystroke is noise on every message anybody ever ' +
        'writes. FR-517 asks that the attendee can see they are approaching the limit.',
    ).not.toBeInTheDocument()
  })

  it('clears the composer once the send resolves, and not before', async () => {
    const user = userEvent.setup()
    const { messages } = renderMessages({ at: NEW_THREAD })

    const composer = await screen.findByRole('textbox', { name: /message/i })
    await user.type(composer, 'Confirmed only.')
    await user.click(sendButton())

    await waitFor(() => expect(messages.opened).toHaveLength(1))
    await waitFor(() => expect(composer).toHaveValue(''))
  })

  it('keeps what was typed when the send fails, and never queues it (FR-565)', async () => {
    const user = userEvent.setup()
    const { messages } = renderMessages({ at: NEW_THREAD })
    messages.failSend(new Error('nope'))

    const composer = await screen.findByRole('textbox', { name: /message/i })
    await user.type(composer, 'Worth keeping.')
    await user.click(sendButton())

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      composer,
      'The message stays in the composer so the attendee can retry deliberately. It is not ' +
        'stored, not queued, and not sent later (FR-565).',
    ).toHaveValue('Worth keeping.')
  })
})
