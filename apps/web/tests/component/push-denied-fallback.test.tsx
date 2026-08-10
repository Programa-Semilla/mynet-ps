import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { A_COUNTERPART, aConversation, aMessage, renderMessages } from '../support/messages.js'
import {
  notificationsDouble,
  pushRepositoryDouble,
  storageDouble,
} from '../support/notifications.js'
import { devicesWith } from '../support/services.js'

/**
 * T107 (007) — **with notification permission denied, every surface behaves identically**
 * (FR-552, SC-504).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **DENIAL IS THE COMMON CASE, NOT THE EDGE CASE**, and the spec's assumptions say so outright.
 * A large share of attendees will decline, and a product that quietly becomes worse for them —
 * a banner that will not go away, a thread that stops updating, a composer that starts warning
 * about missed replies — has made the permission mandatory by attrition.
 *
 * So this file re-runs the User Story 1–4 surfaces with permission denied and asserts the
 * outcome is the *same*: the list renders, a conversation opens, a message sends, the safety
 * controls are reachable. The only difference permitted anywhere in the product is that no
 * notification arrives, which no component test can observe and the integration tests cover.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

const denied = () => {
  const notifications = notificationsDouble({ permission: 'denied' })
  const push = pushRepositoryDouble()
  const storage = storageDouble()

  return {
    notifications,
    push,
    storage,
    services: {
      devices: devicesWith({ notifications: notifications.service, secureStorage: storage }),
    },
  }
}

describe('Denied notification permission: the product is unchanged', () => {
  it('accepts the denial once, records it, and shows nothing further (FR-552)', async () => {
    const user = userEvent.setup()
    const { notifications, push, storage, services } = denied()

    renderMessages({
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services,
    })

    await user.click(await screen.findByRole('button', { name: /turn on notifications/i }))

    await waitFor(() => expect(notifications.prompted).toHaveLength(1))
    // No banner, no warning, no "you are missing out", no error. A denial is a complete outcome.
    await waitFor(() =>
      expect(screen.queryByText(/get told when someone writes to you/i)).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(push.registered).toHaveLength(0)
    await waitFor(() => expect(storage.entries.get('mynet.push.declined')).toBe('true'))
  })

  it('US1: the conversation list renders exactly as it does with permission granted', async () => {
    const { push, services } = denied()

    renderMessages({
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services,
    })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    expect(within(row).getByText('See you there.')).toBeInTheDocument()
  })

  it('US2: a thread opens and renders its messages', async () => {
    const { push, services } = denied()

    renderMessages({
      at: THREAD,
      conversations: [aConversation()],
      pages: [
        {
          messages: [aMessage({ body: 'Are you going to the keynote?' })],
          nextCursor: null,
          state: 'open',
          counterpart: A_COUNTERPART,
        },
      ],
      overrides: { pushSubscriptions: push.repository },
      services,
    })

    expect(await screen.findByText('Are you going to the keynote?')).toBeInTheDocument()
  })

  it('US3: a message still sends, and reaches the repository unchanged', async () => {
    const user = userEvent.setup()
    const { push, services } = denied()

    const { messages } = renderMessages({
      at: THREAD,
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services,
    })

    const box = await screen.findByRole('textbox', { name: /message/i })
    await user.type(box, 'On my way.')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => expect(messages.sent).toHaveLength(1))
    expect(messages.sent[0]?.body).toBe('On my way.')
  })

  it('US4: the safety controls are reachable', async () => {
    const { push, services } = denied()

    renderMessages({
      at: THREAD,
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services,
    })

    expect(await screen.findByRole('button', { name: /block/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
  })
})
