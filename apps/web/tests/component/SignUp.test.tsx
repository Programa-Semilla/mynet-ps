import { RequestRefusedError } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { SignUp } from '../../src/app/auth/SignUp.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T042 (004) — **the confirmation stays disabled until the password policy is met, and the
 * reason is stated** (FR-304).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * This is the constitution's rule, not a preference: *disabled confirmation, never a
 * post-submit error*. It already governs an empty message and an empty meeting topic; FR-304
 * applies it to the password, which is the first field in this product where the requirement is
 * something the person cannot guess.
 *
 * **The second half matters as much as the first.** A disabled control with no explanation
 * replaces a post-submit error with a mystery — the person is left looking at a grey button
 * with no idea what is missing, and a screen-reader user is left with nothing at all. So the
 * reason is asserted alongside the disabled state, every time.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const renderSignUp = (signUp = vi.fn(async () => {})) => {
  const services = testServices({
    identity: { ...testServices().repositories.identity, signUp },
  })

  render(
    <WithServices services={services}>
      <MemoryRouter>
        <SignUp />
      </MemoryRouter>
    </WithServices>,
  )

  return { signUp }
}

const confirm = () => screen.getByRole('button', { name: /create account/i })

describe('creating an account', () => {
  it('starts with confirmation disabled and says what is missing', () => {
    renderSignUp()

    expect(confirm()).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/email address/i)
  })

  it('keeps confirmation disabled while the password is too short, stating the requirement', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'New Person')
    await user.type(screen.getByLabelText(/^password$/i), 'short')

    expect(confirm()).toBeDisabled()

    // The reason, in words, and it counts for them — a bare "too short" leaves the person
    // guessing how much more is needed.
    const reason = screen.getByRole('status')
    expect(reason).toHaveTextContent(/at least 12 characters/i)
    expect(reason).toHaveTextContent(/you have 5/i)
  })

  it('states the requirement before anything is typed, bound to the field', () => {
    renderSignUp()

    // FR-304 — stated BEFORE submission. `aria-describedby` binds it to the input, so it is
    // part of the field for a screen reader rather than prose that happens to sit nearby.
    const password = screen.getByLabelText(/^password$/i)
    const requirement = screen.getByText(/at least 12 characters/i)

    // The binding, not merely the presence: prose that happens to sit near a field is not
    // available to a screen reader as part of that field.
    expect(password).toHaveAttribute('aria-describedby', requirement.id)
  })

  it('enables confirmation once every requirement is met', async () => {
    const user = userEvent.setup()
    renderSignUp()

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'New Person')
    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')

    expect(confirm()).toBeEnabled()
    // Nothing left to say, so nothing is said. A permanent status line would be noise.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('never submits a password the policy would refuse', async () => {
    const user = userEvent.setup()
    const { signUp } = renderSignUp()

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'New Person')
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.click(confirm())

    // The point of a disabled confirmation: the request is never made, so there is no
    // post-submit error to show.
    expect(signUp).not.toHaveBeenCalled()
  })

  it('submits what the person typed, once, when everything is valid', async () => {
    const user = userEvent.setup()
    const { signUp } = renderSignUp()

    await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'New Person')
    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')
    await user.click(confirm())

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: 'new@example.com',
        displayName: 'New Person',
        password: 'correct-horse-battery-staple',
      }),
    )
  })

  it("shows the server's refusal verbatim, and keeps what was typed (FR-303)", async () => {
    const user = userEvent.setup()
    const refusal = new RequestRefusedError(
      'address_registered',
      'That email address already has an account. Sign in instead, or reset your password if you have forgotten it.',
    )
    const { signUp } = renderSignUp(vi.fn(async () => Promise.reject(refusal)))

    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'Ada')
    await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')
    await user.click(confirm())

    await waitFor(() => expect(signUp).toHaveBeenCalled())

    // Verbatim, because the server's wording offers both exits and is written to be
    // attendee-facing (FR-059). Rewording it here would risk losing one of them.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/already has an account/i)
    expect(alert).toHaveTextContent(/sign in/i)
    expect(alert).toHaveTextContent(/reset/i)

    // Nothing the person entered is lost — they can correct the address and try again without
    // retyping the rest.
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Ada')
  })

  it('offers a way back to signing in', () => {
    renderSignUp()

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/')
  })
})
