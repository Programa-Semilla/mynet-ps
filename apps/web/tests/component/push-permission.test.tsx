import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  A_SUBSCRIPTION,
  notificationsDouble,
  pushRepositoryDouble,
  storageDouble,
} from '../support/notifications.js'
import { aConversation, renderMessages } from '../support/messages.js'
import { devicesWith } from '../support/services.js'

/**
 * T106 (007) — **the attendee is told what notifications are for before any browser prompt**
 * (FR-551), and the surface stays absent whenever it has nothing to ask (FR-560).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE LOAD-BEARING ASSERTION IS A NEGATIVE ONE.** Every test here that renders the explanation
 * also asserts `prompted` is still empty. That is the requirement: not that an explanation exists
 * somewhere, but that the browser has not been asked *yet*. An implementation that showed the
 * paragraph and requested permission in the same effect would satisfy a naive "is the text there"
 * test perfectly, and would be exactly the unbidden prompt FR-551 exists to prevent.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const withPush = (options: Parameters<typeof notificationsDouble>[0] = {}) => {
  const notifications = notificationsDouble(options)
  const push = pushRepositoryDouble()
  const storage = storageDouble()

  const view = renderMessages({
    conversations: [aConversation()],
    overrides: { pushSubscriptions: push.repository },
    services: {
      devices: devicesWith({ notifications: notifications.service, secureStorage: storage }),
    },
  })

  return { ...view, notifications, push, storage }
}

describe('Notification permission: explained before it is requested', () => {
  it('explains what notifications are for, and asks the browser nothing (FR-551)', async () => {
    const { notifications } = withPush()

    expect(await screen.findByText(/get told when someone writes to you/i)).toBeInTheDocument()
    // What it will do, and — the sentence FR-561 makes true on the server — what it will not.
    expect(screen.getByText(/only thing mynet will ever notify you about/i)).toBeInTheDocument()

    // The assertion this file exists for.
    expect(notifications.prompted, 'the browser must not be prompted on render').toHaveLength(0)
  })

  it('requests permission only from the attendee pressing the button', async () => {
    const user = userEvent.setup()
    const { notifications, push, storage } = withPush()

    await user.click(await screen.findByRole('button', { name: /turn on notifications/i }))

    await waitFor(() => expect(notifications.prompted).toHaveLength(1))
    // Granted → the device is registered through the repository (T121, FR-555), and the endpoint
    // is remembered so it can be surrendered later (FR-556).
    await waitFor(() => expect(push.registered).toEqual([A_SUBSCRIPTION]))
    await waitFor(() =>
      expect(storage.entries.get('mynet.push.endpoint')).toBe(A_SUBSCRIPTION.endpoint),
    )

    expect(await screen.findByText(/notifications are on for this device/i)).toBeInTheDocument()
  })

  it('takes "Not now" for an answer, and does not ask the browser at all', async () => {
    const user = userEvent.setup()
    const { notifications, storage } = withPush()

    await user.click(await screen.findByRole('button', { name: /not now/i }))

    expect(screen.queryByText(/get told when someone writes to you/i)).not.toBeInTheDocument()
    expect(notifications.prompted).toHaveLength(0)
    // Remembered, so the next visit does not ask again. Nagging is how a product implies the
    // answer was wrong.
    await waitFor(() => expect(storage.entries.get('mynet.push.declined')).toBe('true'))
  })

  it('never re-asks somebody who already declined', async () => {
    const notifications = notificationsDouble()
    const push = pushRepositoryDouble()

    renderMessages({
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services: {
        devices: devicesWith({
          notifications: notifications.service,
          secureStorage: storageDouble({ 'mynet.push.declined': 'true' }),
        }),
      },
    })

    // The list still arrives — which is how we know the absence below is the prompt's own
    // decision rather than a screen that never rendered.
    expect(await screen.findByRole('link', { name: /sofía muñoz/i })).toBeInTheDocument()
    expect(screen.queryByText(/get told when someone writes to you/i)).not.toBeInTheDocument()
    expect(notifications.prompted).toHaveLength(0)
  })

  it('renders nothing where the browser cannot deliver at all (FR-560)', async () => {
    const { notifications } = withPush({ supported: false })

    expect(await screen.findByRole('link', { name: /sofía muñoz/i })).toBeInTheDocument()
    expect(screen.queryByText(/get told when someone writes to you/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on notifications/i })).not.toBeInTheDocument()
    expect(notifications.prompted).toHaveLength(0)
  })

  /**
   * T121 — the reconciliation, in both directions. The browser is authoritative; the server is
   * repaired to match it.
   */
  it('registers a subscription the browser already holds, without asking again', async () => {
    const { notifications, push } = withPush({ existing: A_SUBSCRIPTION })

    await waitFor(() => expect(push.registered).toEqual([A_SUBSCRIPTION]))
    expect(notifications.prompted).toHaveLength(0)
    // Already registered — so there is nothing to ask and nothing to say.
    expect(screen.queryByText(/get told when someone writes to you/i)).not.toBeInTheDocument()
  })

  it('surrenders a registration the browser has discarded (FR-556)', async () => {
    const notifications = notificationsDouble({ existing: null })
    const push = pushRepositoryDouble()
    const storage = storageDouble({ 'mynet.push.endpoint': A_SUBSCRIPTION.endpoint })

    renderMessages({
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services: {
        devices: devicesWith({ notifications: notifications.service, secureStorage: storage }),
      },
    })

    // Permission revoked in the browser's own settings: the subscription is gone from the device,
    // so the row it left behind on the server is one nothing could ever deliver to.
    await waitFor(() => expect(push.unregistered).toEqual([A_SUBSCRIPTION.endpoint]))
    await waitFor(() => expect(storage.entries.has('mynet.push.endpoint')).toBe(false))
  })

  it('offers a retry when permission was granted but registration could not finish', async () => {
    const user = userEvent.setup()
    const notifications = notificationsDouble({ issues: null })
    const push = pushRepositoryDouble()

    renderMessages({
      conversations: [aConversation()],
      overrides: { pushSubscriptions: push.repository },
      services: {
        devices: devicesWith({
          notifications: notifications.service,
          secureStorage: storageDouble(),
        }),
      },
    })

    await user.click(await screen.findByRole('button', { name: /turn on notifications/i }))

    // Distinguished from a denial on purpose: a push service that refused is retryable, and a
    // person who said no is not being asked again.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn’t set up notifications/i)

    // **The private-window sentence is the assertion, not decoration.** A private or incognito
    // window cannot hold a push subscription, so permission succeeds and the subscribe after it
    // fails — and the old wording ("you can try again") invited somebody to retry a thing that
    // can never work. That is exactly how this feature was first mis-diagnosed as broken.
    expect(
      alert,
      'The most common cause of this state is permanent, and the message has to say so.',
    ).toHaveTextContent(/private or incognito window/i)

    // Still honest about the other half: a push service can simply have a bad minute.
    expect(alert).toHaveTextContent(/try again/i)
    expect(alert).toHaveTextContent(/messages work normally/i)
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(push.registered).toHaveLength(0)
  })
})
