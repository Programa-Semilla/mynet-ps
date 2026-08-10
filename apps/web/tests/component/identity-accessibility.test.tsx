import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Account } from '../../src/app/profile/Account.js'
import { SignUp } from '../../src/app/auth/SignUp.js'
import { JoinConference } from '../../src/app/join/JoinConference.js'
import { ProfileEdit } from '../../src/app/profile/ProfileEdit.js'
import { ActiveEventProvider } from '../../src/app/active-event.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T120 (004) — **every control introduced has an accessible label, keyboard operability, and a
 * disabled confirmation that states WHY** (SC-310, Accessibility declaration).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT A COMPONENT TEST CAN AND CANNOT SAY — the split 005 recorded, applied here.**
 *
 * jsdom applies no stylesheet, so it cannot see a focus ring. **Visible focus is asserted in a
 * real browser** by `e2e/accessibility/`, which runs axe over these surfaces; the global
 * `:focus-visible` rule in `tokens.css` supplies it and nothing here removes an outline.
 *
 * What is decidable without a renderer is the accessibility *tree*, and that is what this file
 * checks: that every control has a name, that every field's help text is bound to it rather
 * than merely adjacent, that a disabled confirmation announces its reason, and that the whole
 * surface can be driven from the keyboard.
 *
 * The last of those is the one the prototype failed outright — `focus:outline-none` on every
 * input, and no key handling on either modal — which the register lists as a **settled
 * requirement**, not an open question.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const renderWith = (element: React.ReactElement) =>
  render(
    <WithServices services={testServices()}>
      <MemoryRouter>
        <ActiveEventProvider>{element}</ActiveEventProvider>
      </MemoryRouter>
    </WithServices>,
  )

describe('accessibility of the surfaces 004 introduces (SC-310)', () => {
  describe('creating an account', () => {
    it('names every control', () => {
      renderWith(<SignUp />)

      // `getByLabelText` fails when a control has no accessible name — which IS the assertion.
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    it('binds the password requirement to the field rather than leaving it adjacent', () => {
      renderWith(<SignUp />)

      const password = screen.getByLabelText(/^password$/i)
      const requirement = screen.getByText(/at least 12 characters/i)

      // Prose that happens to sit near a field is not available to a screen reader as part of
      // that field (Accessibility declaration).
      expect(password).toHaveAttribute('aria-describedby', requirement.id)
    })

    it('is fully operable by keyboard alone', async () => {
      const user = userEvent.setup()
      renderWith(<SignUp />)

      await user.tab()
      expect(screen.getByLabelText(/email address/i)).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText(/display name/i)).toHaveFocus()
      await user.tab()
      expect(screen.getByLabelText(/^password$/i)).toHaveFocus()
    })

    it('announces WHY the confirmation is disabled', () => {
      renderWith(<SignUp />)

      expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled()
      // A live region rather than static text: the reason changes as the person types, and a
      // screen-reader user must hear it change rather than having to go back and re-read it.
      const reason = screen.getByRole('status')
      expect(reason).toHaveAttribute('aria-live', 'polite')
      expect(reason.textContent?.length ?? 0).toBeGreaterThan(0)
    })

    it('announces a failure as an alert rather than only drawing it', async () => {
      const user = userEvent.setup()
      const base = testServices().repositories.identity
      render(
        <WithServices
          services={testServices({
            identity: {
              ...base,
              signUp: async () => {
                throw new Error('boom')
              },
            },
          })}
        >
          <MemoryRouter>
            <SignUp />
          </MemoryRouter>
        </WithServices>,
      )

      await user.type(screen.getByLabelText(/email address/i), 'new@example.com')
      await user.type(screen.getByLabelText(/display name/i), 'New')
      await user.type(screen.getByLabelText(/^password$/i), 'correct-horse-battery-staple')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      const alert = await screen.findByRole('alert')
      expect(alert.textContent?.length ?? 0).toBeGreaterThan(0)
    })
  })

  describe('joining a conference', () => {
    it('names its field and its confirmation, and states why it is disabled', () => {
      renderWith(<JoinConference />)

      expect(screen.getByLabelText(/join code/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /join conference/i })).toBeDisabled()
      expect(screen.getByRole('status')).toHaveTextContent(/join code/i)
    })

    it('does not fight the person over case or spelling', () => {
      renderWith(<JoinConference />)

      // The server trims and lower-cases, so nothing here has to be strict — and autocorrect on
      // a code read off a badge is actively harmful.
      const field = screen.getByLabelText(/join code/i)
      expect(field).toHaveAttribute('autocorrect', 'off')
      expect(field).toHaveAttribute('spellcheck', 'false')
    })
  })

  describe('editing a profile', () => {
    it('names every field', async () => {
      renderWith(<ProfileEdit />)

      expect(await screen.findByLabelText(/^headline$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^company$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^role$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/networking intent/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/availability/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^interests$/i)).toBeInTheDocument()
    })

    it('marks a field over its limit as invalid, not merely coloured', async () => {
      const user = userEvent.setup()
      renderWith(<ProfileEdit />)

      const headline = await screen.findByLabelText(/^headline$/i)
      await user.clear(headline)
      await user.paste('x'.repeat(201))

      // Colour is never the only signal (Accessibility declaration).
      await waitFor(() => expect(headline).toHaveAttribute('aria-invalid', 'true'))
    })
  })

  describe('the account surface', () => {
    it('names the discoverability control and describes its effect', async () => {
      const { container } = renderWith(<Account />)

      const control = await screen.findByLabelText(/let attendees at my conferences find me/i)
      expect(control).toBeInTheDocument()

      // FR-362 — the effect, stated plainly and announced when it changes. Not implied by the
      // switch position, which for an unverified attendee would be actively misleading.
      const described = control.getAttribute('aria-describedby')
      expect(described).toBeTruthy()

      // ───────────────────────────────────────────────────────────────────────────────────────
      // **Looked up by the id the control actually points at**, rather than by asking the page
      // for "the status region".
      //
      // The role query was unambiguous while this surface had exactly one live region. 007 adds
      // the block-management list (FR-541a), whose loading state is legitimately a `status` too —
      // so `getByRole('status')` now finds two and throws. That is the same collision 006
      // recorded on Discover, and the fix is the same: one live region can only be *the* status
      // of a control that names it.
      // ───────────────────────────────────────────────────────────────────────────────────────
      // Found through the rendered container rather than through `document`, because
      // `mynet/no-direct-platform-access` counts a bare DOM global here as it does anywhere else
      // in `apps/web` — and a test is not the place to start making exceptions to SC-008.
      const description = container.querySelector(`#${CSS.escape(described as string)}`)
      expect(description, 'the control points at an element that exists').not.toBeNull()
      expect(description).toHaveAttribute('role', 'status')
      expect(description?.textContent?.length ?? 0).toBeGreaterThan(0)
    })

    it('names the export and deletion controls unambiguously', async () => {
      renderWith(<Account />)

      expect(await screen.findByRole('button', { name: /prepare a copy/i })).toBeInTheDocument()
      // "Delete my account", not "Delete" — a control whose name does not say what it destroys
      // is the one somebody activates by mistake.
      expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument()
    })

    it('opens the deletion confirmation as a dialog, with both exits named', async () => {
      const user = userEvent.setup()
      renderWith(<Account />)

      await user.click(await screen.findByRole('button', { name: /delete my account/i }))

      const dialog = await screen.findByRole('dialog', { hidden: true })
      expect(dialog).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i, hidden: true })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /delete everything/i, hidden: true }),
      ).toBeInTheDocument()
    })

    it('states in the confirmation that it cannot be undone and no copy is kept (FR-367)', async () => {
      const user = userEvent.setup()
      renderWith(<Account />)

      await user.click(await screen.findByRole('button', { name: /delete my account/i }))
      const dialog = await screen.findByRole('dialog', { hidden: true })

      // Both sentences, in those words. Most products keep a copy for thirty days; a person who
      // assumes the usual grace period would be deciding on a false premise.
      expect(dialog).toHaveTextContent(/cannot be undone/i)
      expect(dialog).toHaveTextContent(/no copy is kept/i)
    })
  })
})
