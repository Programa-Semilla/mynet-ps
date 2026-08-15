import type { PlatformServices } from '@mynet/platform'
import { PlatformProvider } from '@mynet/platform'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
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
    // 007 — see `tests/support/services.tsx`. Nothing on this screen may reach them.
    subscribe: async () => null,
    unsubscribe: async () => {},
    currentSubscription: async () => null,
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
  // 007 — the seventh capability, visible by default. See `tests/support/services.tsx`.
  visibility: { isVisible: () => true, subscribe: () => () => {} },
  // 016 — the eighth capability. Desktop, uninstalled, no prompt: FR-1031 renders no install
  // guidance here, so this screen's existing assertions are about the form and nothing else.
  install: {
    current: () => ({ installed: false, mobile: false, promptToInstall: null }),
    subscribe: () => () => {},
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
      // 005 — signed out, so these reject for the same reason `getCurrent` does. Present
      // because the registry is one object substituted whole (FR-047); absent members would
      // not compile.
      commitments: {
        listSaved: async () => Promise.reject(new Error('not signed in')),
        save: async () => Promise.reject(new Error('not signed in')),
        unsave: async () => Promise.reject(new Error('not signed in')),

        markViewed: async () => {},
        // 014 tranche 2 — enrolment no-ops; `places` rejects so the figure is omitted (FR-1070b).
        enrol: async () => {},
        release: async () => {},
        places: async () => Promise.reject(new Error('places not configured in this test')),
      },
      sessionNotes: {
        listNotes: async () => Promise.reject(new Error('not signed in')),
        writeNote: async () => Promise.reject(new Error('not signed in')),
        deleteNote: async () => Promise.reject(new Error('not signed in')),
      },
      // 004 — signed out. The three unauthenticated methods resolve, because they are exactly
      // the ones reachable from this screen: creating an account and recovering one are what a
      // signed-out person is here to do. Everything else rejects like the rest of the registry.
      identity: {
        signUp: async () => {},
        requestPasswordReset: async () => {},
        resetPassword: async () => {},
        verifyEmail: async () => {},
        joinConference: async () => Promise.reject(new Error('not signed in')),
        withdrawFromConference: async () => Promise.reject(new Error('not signed in')),
        resendVerification: async () => Promise.reject(new Error('not signed in')),
        exportPersonalData: async () => Promise.reject(new Error('not signed in')),
        deleteAccount: async () => Promise.reject(new Error('not signed in')),
      },
      profile: {
        getOwn: async () => Promise.reject(new Error('not signed in')),
        saveOwn: async () => Promise.reject(new Error('not signed in')),
        setDiscoverable: async () => Promise.reject(new Error('not signed in')),
        readOwnAvatar: async () => Promise.reject(new Error('not signed in')),
        uploadAvatar: async () => Promise.reject(new Error('not signed in')),
        removeAvatar: async () => Promise.reject(new Error('not signed in')),
      },
      // 006 — signed out, so the directory rejects like the rest. Discover is behind
      // authentication in every layout; nothing on this screen can reach it.
      directory: {
        list: async () => Promise.reject(new Error('not signed in')),
        get: async () => Promise.reject(new Error('not signed in')),
        readAvatar: async () => Promise.reject(new Error('not signed in')),
      },
      // 007 — signed out, so every one of these rejects. Messages, the safety controls and
      // device registration are all behind authentication; nothing on this screen can reach
      // them, and a resolving double here would let a defect that *did* reach them pass.
      conversations: {
        list: async () => Promise.reject(new Error('not signed in')),
        hasUnread: async () => Promise.reject(new Error('not signed in')),
        openWith: async () => Promise.reject(new Error('not signed in')),
        markRead: async () => Promise.reject(new Error('not signed in')),
      },
      messages: {
        list: async () => Promise.reject(new Error('not signed in')),
        send: async () => Promise.reject(new Error('not signed in')),
      },
      blocks: {
        list: async () => Promise.reject(new Error('not signed in')),
        block: async () => Promise.reject(new Error('not signed in')),
        unblock: async () => Promise.reject(new Error('not signed in')),
      },
      reports: { submit: async () => Promise.reject(new Error('not signed in')) },
      pushSubscriptions: {
        register: async () => Promise.reject(new Error('not signed in')),
        unregister: async () => Promise.reject(new Error('not signed in')),
      },
      // 008 — signed out, so every method rejects like the rest of the registry. Present because
      // the registry is one object substituted whole (FR-047); absent members would not compile,
      // which is the property that makes the substitutability claim testable in a single line.
      cards: {
        share: async () => Promise.reject(new Error('not signed in')),
        listHeld: async () => Promise.reject(new Error('not signed in')),
        getHeld: async () => Promise.reject(new Error('not signed in')),
        listShared: async () => Promise.reject(new Error('not signed in')),
      },
      appointments: {
        slots: async () => Promise.reject(new Error('not signed in')),
        propose: async () => Promise.reject(new Error('not signed in')),
        list: async () => Promise.reject(new Error('not signed in')),
        accept: async () => Promise.reject(new Error('not signed in')),
        decline: async () => Promise.reject(new Error('not signed in')),
        cancel: async () => Promise.reject(new Error('not signed in')),
      },
      // 009 — signed out, so every method rejects like its neighbours. Present because the
      // registry is one object substituted whole (FR-047); an absent member would not compile.
      questions: {
        list: async () => Promise.reject(new Error('not signed in')),
        ask: async () => Promise.reject(new Error('not signed in')),
        withdraw: async () => Promise.reject(new Error('not signed in')),
        vote: async () => Promise.reject(new Error('not signed in')),
        unvote: async () => Promise.reject(new Error('not signed in')),
      },
      // 014 T2 — signed out, so the vocabulary read rejects like its neighbours.
      vocabulary: {
        choosable: async () => Promise.reject(new Error('not signed in')),
      },
    },
    freshness: { lastRetrieved: () => null },
    auth: { signIn, signOut: async () => {} },
    ...overrides,
  }

  render(
    <PlatformProvider services={services}>
      <AuthProvider>
        {/*
          004 — the screen now links to sign-up (T050), so it needs a router context. It had
          none before because it offered no navigation at all: until self sign-up existed there
          was nowhere for a signed-out person to go.
        */}
        <MemoryRouter>
          <SignInScreen />
        </MemoryRouter>
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
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
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

    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')
    expect(submit).toBeEnabled()
  })

  it('is fully operable by keyboard alone (FR-021)', async () => {
    const user = userEvent.setup()
    const { signIn } = renderSignIn()

    await user.tab()
    expect(screen.getByLabelText(/email address/i)).toHaveFocus()
    await user.keyboard('ada@example.com')

    await user.tab()
    expect(screen.getByLabelText(/^password$/i)).toHaveFocus()
    await user.keyboard('correct-horse-battery-staple')

    // 016 — the reveal control sits between the field and the submit, and being reachable here
    // is the requirement rather than an obstacle: SC-1004 asks that every password field can be
    // revealed and re-masked **using the keyboard alone**, which is only true if it is tabbable.
    await user.tab()
    expect(screen.getByRole('button', { name: /show password/i })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(signIn).toHaveBeenCalledOnce())
  })

  it('passes the typed credentials to the gateway, and nothing else', async () => {
    const user = userEvent.setup()
    const { signIn } = renderSignIn()

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')
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
    await user.type(screen.getByLabelText(/^password$/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    // FR-059 — says what happened and what to do, without internal detail.
    expect(alert.textContent).not.toContain('boom')
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **This assertion was inverted by 004, and the inversion is the point of having had it.**
   *
   * It used to read "never renders a password recovery affordance that does not exist" —
   * correct while accounts came from a seed script and there was genuinely nothing behind the
   * link. Offering a recovery flow that did not exist would have been worse than its absence.
   *
   * 004 makes the flow exist, because self sign-up made it mandatory: an account nobody can
   * recover is one forgotten password from being permanently lost, and Principle III leaves no
   * organizer to appeal to. So the affordance appears, and the assertion now checks it goes
   * somewhere real rather than that it is missing.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('offers both exits a signed-out person may need (FR-300, FR-326)', () => {
    renderSignIn()

    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/sign-up',
    )
    expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute(
      'href',
      '/reset-password-request',
    )
  })
})
