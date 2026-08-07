import type { PlatformServices } from '@mynet/platform'
import { PlatformProvider } from '@mynet/platform'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SignInScreen } from '../src/auth/SignInScreen.js'
import { AuthProvider } from '../src/auth/useAuth.js'

/**
 * T047 — the sign-in screen: labels, keyboard operability, error presentation.
 *
 * Note what this test does **not** do: mock a module, stub `fetch`, or reach into the
 * component. It substitutes the whole registry in one object — which is the substitutability
 * claim of FR-047 and research.md D10 being exercised incidentally, on the way to testing
 * something else. If that ever became awkward, the abstraction would have failed.
 */

const noopDevices: PlatformServices['devices'] = {
  notifications: {
    isSupported: () => false,
    requestPermission: async () => 'unsupported',
    show: async () => {},
  },
  calendar: { isSupported: () => false, addEvent: async () => {} },
  camera: { isSupported: () => false, capturePhoto: async () => null },
  contactShare: { isSupported: () => false, shareCard: async () => false },
  secureStorage: {
    get: async () => null,
    set: async () => {},
    remove: async () => {},
    clear: async () => {},
  },
  connectivity: {
    isOnline: () => true,
    subscribe: () => () => {},
    reportReachability: () => {},
  },
}

const renderSignIn = (overrides: Partial<PlatformServices> = {}) => {
  const signIn = vi.fn(async () => {})

  const services: PlatformServices = {
    devices: noopDevices,
    repositories: {
      // Signed out: `getCurrent` rejects, which is what puts AuthProvider in 'signed-out'.
      attendee: { getCurrent: async () => Promise.reject(new Error('not signed in')) },
      events: { listRegistered: async () => [] },
      activeEvent: {
        getActive: async () => null,
        setActive: async () => Promise.reject(new Error('not signed in')),
      },
      catalog: { listSessions: async () => [], listTracks: async () => [] },
    },
    auth: { signIn, signOut: async () => {} },
    ...overrides,
  }

  render(
    <PlatformProvider services={services}>
      <AuthProvider>
        <SignInScreen />
      </AuthProvider>
    </PlatformProvider>,
  )

  return { signIn }
}

describe('SignInScreen', () => {
  it('labels every field, so each is reachable by its accessible name (FR-021)', () => {
    renderSignIn()

    // getByLabelText fails if the control has no accessible name — which is the assertion.
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  /**
   * Constitution Principle IV — invalid input produces a **disabled** confirmation, never a
   * post-submit error.
   */
  it('disables submit until both fields are filled, rather than erroring after submission', async () => {
    const user = userEvent.setup()
    renderSignIn()

    const submit = screen.getByRole('button', { name: /sign in/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    expect(submit, 'still incomplete — password is empty').toBeDisabled()

    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery-staple')
    expect(submit).toBeEnabled()
  })

  it('is fully operable by keyboard alone (FR-021)', async () => {
    const user = userEvent.setup()
    const { signIn } = renderSignIn()

    await user.tab()
    expect(screen.getByLabelText(/email address/i)).toHaveFocus()
    await user.keyboard('ada@example.com')

    await user.tab()
    expect(screen.getByLabelText(/password/i)).toHaveFocus()
    await user.keyboard('correct-horse-battery-staple')

    await user.tab()
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(signIn).toHaveBeenCalledOnce())
  })

  it('passes the typed credentials to the gateway, and nothing else', async () => {
    const user = userEvent.setup()
    const { signIn } = renderSignIn()

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'correct-horse-battery-staple',
      }),
    )
  })

  it('announces a failure through an alert, so it is not silently visual', async () => {
    const user = userEvent.setup()
    renderSignIn({
      auth: {
        signIn: async () => {
          throw new Error('boom')
        },
        signOut: async () => {},
      },
    })

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    // FR-059 — says what happened and what to do, without internal detail.
    expect(alert.textContent).not.toContain('boom')
  })

  it('never renders a password recovery affordance that does not exist', () => {
    renderSignIn()
    expect(screen.queryByText(/forgot.*password/i)).not.toBeInTheDocument()
  })
})
