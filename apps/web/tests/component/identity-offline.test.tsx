import { OfflineError } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ActiveEventProvider } from '../../src/app/active-event.js'
import { SignUp } from '../../src/app/auth/SignUp.js'
import { JoinConference } from '../../src/app/join/JoinConference.js'
import { Account } from '../../src/app/profile/Account.js'
import { Profile } from '../../src/app/profile/Profile.js'
import { ProfileEdit } from '../../src/app/profile/ProfileEdit.js'
import { WithdrawConference } from '../../src/app/profile/WithdrawConference.js'
import { EMPTY_PROFILE, testServices, WithServices } from '../support/services.js'

/**
 * T122 (004) — **every action this feature adds is refused offline, explains itself, keeps what
 * was typed, and queues nothing** (Offline behaviour declaration).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOTHING THIS FEATURE STORES WORKS OFFLINE, AND THAT IS A DECLARATION RATHER THAN A GAP.**
 *
 * 005 established the rule and 004 inherits it unchanged: **writes are refused, never queued.**
 * No write queue, no optimistic update, no conflict merging — each of which the constitution
 * requires a *separately recorded decision* for, and this feature takes none.
 *
 * Three properties are asserted for every surface, and the third is the one that gets forgotten:
 *
 *   1. the refusal **distinguishes offline from a server fault**, because they need different
 *      actions from the person reading them;
 *   2. **nothing is reported as having succeeded** — the displayed state is unchanged;
 *   3. **what was typed is still there**, so nothing the attendee entered is lost.
 *
 * The prototype had none of these to lose: it had no network at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const offline = () => Promise.reject(new OfflineError('That action'))

const renderWith = (
  element: React.ReactElement,
  overrides: Parameters<typeof testServices>[0] = {},
) =>
  render(
    <WithServices services={testServices(overrides)}>
      <MemoryRouter>
        <ActiveEventProvider>{element}</ActiveEventProvider>
      </MemoryRouter>
    </WithServices>,
  )

describe('every 004 action is refused offline without losing anything', () => {
  it('sign-up: explains, keeps the details, and creates nothing', async () => {
    const user = userEvent.setup()
    const signUp = vi.fn(offline)
    renderWith(<SignUp />, {
      identity: { ...testServices().repositories.identity, signUp },
    })

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'New Person')
    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    const alert = await screen.findByRole('alert')
    // Distinguishes offline from a server fault: one is solved by reconnecting, the other by
    // trying again, and telling somebody the wrong one sends them to fix the wrong thing.
    expect(alert).toHaveTextContent(/needs a connection/i)
    expect(alert).not.toHaveTextContent(/went wrong/i)

    // Nothing lost — they can reconnect and submit the same form.
    expect(screen.getByLabelText(/display name/i)).toHaveValue('New Person')
    expect(screen.getByLabelText(/email address/i)).toHaveValue('new@example.com')

    // Nothing queued: exactly one attempt was made, and no retry was scheduled behind the
    // scenes for the attendee to be surprised by later.
    expect(signUp).toHaveBeenCalledTimes(1)
  })

  it('joining: explains, keeps the code, and registers nothing', async () => {
    const user = userEvent.setup()
    const joinConference = vi.fn(offline)
    renderWith(<JoinConference />, {
      identity: { ...testServices().repositories.identity, joinConference },
    })

    await user.type(screen.getByLabelText(/join code/i), 'PDS-2026')
    await user.click(screen.getByRole('button', { name: /join conference/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/needs a connection/i)
    expect(screen.getByLabelText(/join code/i)).toHaveValue('PDS-2026')
    expect(joinConference).toHaveBeenCalledTimes(1)
  })

  it('saving a profile: explains, keeps every edit, and saves nothing', async () => {
    const user = userEvent.setup()
    const saveOwn = vi.fn(offline)
    renderWith(<ProfileEdit />, {
      profile: { ...testServices().repositories.profile, saveOwn },
    })

    const company = await screen.findByLabelText(/^company$/i)
    await user.type(company, 'Analytical Engines')
    await user.type(screen.getByLabelText(/^headline$/i), 'A headline worth keeping.')
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/needs a connection/i)
    expect(alert).toHaveTextContent(/still here/i)

    expect(screen.getByLabelText(/^company$/i)).toHaveValue('Analytical Engines')
    expect(screen.getByLabelText(/^headline$/i)).toHaveValue('A headline worth keeping.')
    expect(saveOwn).toHaveBeenCalledTimes(1)
  })

  it('reading a profile: says it is unavailable rather than serving a stale copy', async () => {
    renderWith(<ProfileEdit />, {
      profile: { ...testServices().repositories.profile, getOwn: vi.fn(offline) },
    })

    const alert = await screen.findByRole('alert')
    // **Nothing this feature stores is cached for offline reading**, deliberately: the profile
    // is small, only meaningful when editable, and caching it would put a second copy of
    // personal data on the device for no offline capability worth having.
    expect(alert).toHaveTextContent(/needs a connection/i)
    expect(alert).toHaveTextContent(/not stored on this device/i)
  })

  it('discoverability: explains, and leaves the setting where it was', async () => {
    const user = userEvent.setup()
    const setDiscoverable = vi.fn(offline)
    renderWith(<Account />, {
      profile: {
        ...testServices().repositories.profile,
        getOwn: async () => ({ ...EMPTY_PROFILE, discoverable: true, emailVerified: true }),
        setDiscoverable,
      },
    })

    const control = await screen.findByLabelText(/let attendees at my conferences find me/i)
    expect(control).toBeChecked()

    await user.click(control)

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a connection/i)
    // The displayed state is unchanged: the server's answer is what moves it, and there was no
    // answer. Flipping it locally would be an optimistic update — a separately recorded
    // decision this feature does not take.
    await waitFor(() => expect(control).toBeChecked())
  })

  it('export: explains, and offers no file it does not have', async () => {
    const user = userEvent.setup()
    renderWith(<Account />, {
      identity: { ...testServices().repositories.identity, exportPersonalData: vi.fn(offline) },
    })

    await user.click(await screen.findByRole('button', { name: /prepare a copy/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a connection/i)
    expect(screen.queryByRole('link', { name: /download your data/i })).not.toBeInTheDocument()
  })

  /**
   * The Edge Case the spec names in these words: *"An avatar upload is attempted offline.
   * Refused, with the file not lost from the form."* The second clause is the one a naive
   * `finally { setFile(null) }` would break silently, so it is asserted rather than assumed.
   */
  it('avatar upload: explains, keeps the chosen file, and uploads nothing', async () => {
    const user = userEvent.setup()
    const uploadAvatar = vi.fn(offline)
    renderWith(<Profile />, {
      profile: { ...testServices().repositories.profile, uploadAvatar },
    })

    const file = new File([new Uint8Array([1, 2, 3])], 'face.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText(/photograph/i), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/needs a connection/i)

    // Attempted exactly once. A retry queued for later would be the write queue this feature
    // declares it does not have.
    expect(uploadAvatar).toHaveBeenCalledTimes(1)

    // And the chosen file survives the refusal, so reconnecting does not mean choosing again.
    const input = (await screen.findByLabelText(/photograph/i)) as HTMLInputElement
    expect(input.files?.[0]?.name).toBe('face.png')
  })

  /**
   * FR-317c. Withdrawal had no client-side test of any kind before this — the server route was
   * well covered, which made the client the whole of the exposure.
   */
  it('withdrawal: explains, and leaves the registration in place', async () => {
    const user = userEvent.setup()
    const withdrawFromConference = vi.fn(offline)
    renderWith(<WithdrawConference />, {
      identity: { ...testServices().repositories.identity, withdrawFromConference },
    })

    await user.click(await screen.findByRole('button', { name: /leave .*summit/i }))
    await user.click(
      await screen.findByRole('button', { name: /leave this conference/i, hidden: true }),
    )

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/needs a connection/i)
    expect(withdrawFromConference).toHaveBeenCalledTimes(1)

    // Nothing reported as having succeeded: the conference is still listed.
    expect(await screen.findByRole('button', { name: /leave .*summit/i })).toBeInTheDocument()
  })

  it('deletion: explains, and deletes nothing', async () => {
    const user = userEvent.setup()
    const deleteAccount = vi.fn(offline)
    renderWith(<Account />, {
      identity: { ...testServices().repositories.identity, deleteAccount },
    })

    await user.click(await screen.findByRole('button', { name: /delete my account/i }))
    await user.click(
      await screen.findByRole('button', { name: /delete everything/i, hidden: true }),
    )

    // The one refusal that must be unmistakable: somebody who believes their account is gone
    // and finds it still there has been told something false about an irreversible act.
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/nothing has been deleted/i)
    expect(deleteAccount).toHaveBeenCalledTimes(1)
  })
})
