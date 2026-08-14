import type { InstallState, PlatformServices } from '@mynet/platform'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { InstallGuidance } from '../../src/auth/InstallGuidance.js'
import { SignInScreen } from '../../src/auth/SignInScreen.js'
import { AuthProvider } from '../../src/auth/useAuth.js'
import { devicesWith, testServices, WithServices } from '../support/services.js'

/**
 * T049 (016) — **dismissible, quiet, and never in the way** (FR-1035, FR-1036, FR-1037).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DISMISSAL IS REMEMBERED PER DEVICE, AND IT HAS TO BE.**
 *
 * Not per account, and the reason is structural rather than a preference: **this renders before
 * anybody has signed in**, so there is no account to key it by. It is also a fact about the
 * device — whether *this phone* has the application installed — which no account should carry
 * between phones. It stores a boolean and nothing about a person.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **AND IT NEVER ASKS FOR NOTIFICATION PERMISSION** (FR-1036).
 *
 * The guidance is *about* notifications, which makes requesting permission the obvious next
 * thought and the wrong one. 007 established that permission is explained before it is requested
 * and that `NotificationPrompt.tsx` is the **only** caller of `requestPermission` in the client.
 * A second caller here would erode that quietly — and would ask a person who has not signed in
 * for permission to send them messages they cannot yet receive.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Storage that behaves like the real thing: what was set is what comes back. */
const rememberingStorage = (initial: Record<string, string> = {}) => {
  const store = new Map(Object.entries(initial))
  return {
    store,
    service: {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        store.set(key, value)
      },
      remove: async (key: string) => {
        store.delete(key)
      },
      clear: async () => store.clear(),
    },
  }
}

const MOBILE_UNINSTALLED: InstallState = {
  installed: false,
  mobile: true,
  promptToInstall: null,
}

const servicesWith = (
  storage: ReturnType<typeof rememberingStorage>,
  requestPermission = vi.fn(async () => 'granted' as const),
): PlatformServices =>
  testServices(
    {},
    {
      devices: devicesWith({
        install: { current: () => MOBILE_UNINSTALLED, subscribe: () => () => {} },
        secureStorage: storage.service,
        notifications: {
          isSupported: () => true,
          requestPermission,
          show: async () => {},
          subscribe: async () => null,
          unsubscribe: async () => {},
          currentSubscription: async () => null,
        },
      }),
    },
  )

const renderGuidance = (services: PlatformServices) =>
  render(
    <WithServices services={services}>
      <MemoryRouter>
        <InstallGuidance />
      </MemoryRouter>
    </WithServices>,
  )

describe('dismissing the install guidance', () => {
  it('hides it, and remembers that per device (FR-1035)', async () => {
    const user = userEvent.setup()
    const storage = rememberingStorage()

    const first = renderGuidance(servicesWith(storage))

    await user.click(await screen.findByRole('button', { name: /dismiss install guidance/i }))
    expect(screen.queryByRole('heading', { name: /home screen/i })).not.toBeInTheDocument()

    await waitFor(() => expect(storage.store.size).toBe(1))
    first.unmount()

    // A fresh visit, same device. The stored answer is honoured.
    renderGuidance(servicesWith(storage))

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /home screen/i }),
        'The guidance came back after being dismissed. FR-1035 asks for the dismissal to be ' +
          'remembered — a notice that reappears is one somebody has to dismiss forever.',
      ).not.toBeInTheDocument(),
    )
  })

  it('stores a boolean and nothing about a person (FR-1035)', async () => {
    const user = userEvent.setup()
    const storage = rememberingStorage()

    renderGuidance(servicesWith(storage))
    await user.click(await screen.findByRole('button', { name: /dismiss install guidance/i }))

    await waitFor(() => expect(storage.store.size).toBe(1))

    const [key, value] = [...storage.store.entries()][0]!
    expect(key).not.toMatch(/attendee|account|email|user/i)
    expect(value).toBe('true')
  })

  it('is dismissible by keyboard alone', async () => {
    const user = userEvent.setup()
    const storage = rememberingStorage()

    renderGuidance(servicesWith(storage))

    const dismiss = await screen.findByRole('button', { name: /dismiss install guidance/i })
    dismiss.focus()
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('heading', { name: /home screen/i })).not.toBeInTheDocument()
  })

  it('never requests notification permission (FR-1036)', async () => {
    const user = userEvent.setup()
    const storage = rememberingStorage()
    const requestPermission = vi.fn(async () => 'granted' as const)

    renderGuidance(servicesWith(storage, requestPermission))
    await screen.findByRole('heading', { name: /home screen/i })

    // Including after the reader interacts with it, which is where a "while we're here" call
    // would most plausibly be added.
    await user.click(await screen.findByRole('button', { name: /dismiss install guidance/i }))

    expect(
      requestPermission,
      'The install guidance asked for notification permission. `NotificationPrompt.tsx` is the ' +
        'only caller in this client (FR-1036, 007), and nobody has even signed in here.',
    ).not.toHaveBeenCalled()
  })
})

describe('the guidance on the sign-in screen', () => {
  /**
   * FR-1037 — **it must not block, obscure or delay signing in.**
   *
   * Asserted by driving the form to a submittable state with the guidance present. A modal, an
   * interstitial or anything that took focus would make this impossible rather than merely ugly.
   */
  it('leaves the sign-in form fully usable (FR-1037)', async () => {
    const user = userEvent.setup()
    const storage = rememberingStorage()

    render(
      <WithServices services={servicesWith(storage)}>
        <MemoryRouter>
          <AuthProvider>
            <SignInScreen />
          </AuthProvider>
        </MemoryRouter>
      </WithServices>,
    )

    await screen.findByRole('heading', { name: /home screen/i })

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')

    expect(
      screen.getByRole('button', { name: /^sign in$/i }),
      'The sign-in control is not usable with the install guidance on screen. It is a notice ' +
        'below the form, not something to get past (FR-1037).',
    ).toBeEnabled()
  })

  it('renders after the form, so nothing is reached through it', async () => {
    const storage = rememberingStorage()

    render(
      <WithServices services={servicesWith(storage)}>
        <MemoryRouter>
          <AuthProvider>
            <SignInScreen />
          </AuthProvider>
        </MemoryRouter>
      </WithServices>,
    )

    const heading = await screen.findByRole('heading', { name: /home screen/i })
    const submit = screen.getByRole('button', { name: /^sign in$/i })

    // `DOCUMENT_POSITION_FOLLOWING` — the guidance comes after the submit control in document
    // order, which is what makes it last in both reading order and tab order.
    expect(submit.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
