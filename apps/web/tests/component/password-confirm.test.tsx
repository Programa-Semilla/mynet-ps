import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ResetPassword } from '../../src/app/auth/ResetPassword.js'
import { SignUp } from '../../src/app/auth/SignUp.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T021 (016) — **a mismatched confirmation is caught before any request** (FR-1018, FR-1050,
 * SC-1005).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A DISABLED CONTROL WITH A REASON, NEVER A POST-SUBMIT ERROR.**
 *
 * `requirements.md` names the treatment for invalid input and the constitution carries it as a
 * required state: the confirmation is **disabled**, and the reader is told why. Both halves
 * matter and only one is obvious. A disabled button beside two filled-in fields, with nothing
 * explaining it, is a dead end somebody can sit in front of indefinitely — and on a sign-up
 * screen the way out of that dead end is to give up on the account.
 *
 * **And nothing is sent.** SC-1005 asks for 100%, which is a claim about the *shape* of the
 * check rather than a rate: validation happens before the call, so there is no case in which a
 * mismatch reaches the server. That is asserted here by counting requests, because a form that
 * submitted and then rendered the refusal nicely would look identical to a reader watching it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE IS ONE OF THREE, AND FR-1050 IS THE REASON IT HAS TO BE.**
 *
 * The mismatch rule is implemented **three times independently** — `SignUp`, `ResetPassword` and
 * `apps/admin`'s `ReplaceCredential` — each deriving `matches`/`mismatch` for itself and each
 * carrying its own copy of the same sentence. FR-1050 requires the administrative screen's
 * confirmation to *behave identically* to MyNet's two, "so that one behaviour is described in one
 * place rather than two implementations diverging". **What prevents the divergence is the test,
 * not the code** — the same argument the duplicated `PasswordField` records in its own header.
 *
 * The trio:
 *
 *   - this file — `SignUp` and `ResetPassword`, run against the identical cases below;
 *   - `apps/admin/tests/component/replace-credential.test.tsx` — the third implementation, whose
 *     assertions are this file's, screen for screen;
 *   - `apps/web/tests/unit/password-field-usage.test.ts` and its admin twin — nothing above
 *     proves a *screen* uses `PasswordField` at all, and a bare `<input type="password">` would
 *     defeat SC-1004 silently.
 *
 * Before this, `password-confirm.test.tsx` imported only `SignUp`, `apps/admin/tests/component/`
 * had no `ReplaceCredential` test of any kind, and the e2e filled the administrative confirmation
 * without asserting anything about a mismatch. **The one behaviour FR-1050 names was the one with
 * no cross-product guard**, on the screen that guards the tier reading the report queue.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Parameterised over the two screens rather than asserted once and assumed twice.**
 *
 * The label text differs between them — "Password"/"Confirm password" against "New password"/
 * "Confirm new password" — which is exactly the kind of difference that makes somebody test one
 * screen and write a comment about the other. This file used to carry that comment: *"`ResetPassword`
 * carries the same pair of fields and the same rule"*, with nothing driving it. The e2e did not
 * cover the gap either — `password-recovery.spec.ts` fills the same short value into **both**
 * fields, so the disabled state it observes comes from the length policy rather than a mismatch.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Two passwords that are each individually **valid**, and different from one another.
 *
 * Both clear the twelve-character floor deliberately: a mismatch built from a too-short value
 * would be disabled by the length rule as well, and the test would pass against a form with no
 * mismatch check at all. That is the defect in the existing e2e coverage.
 */
const PASSWORD = 'a long enough password'
const DIFFERENT = 'a different long password'

interface ConfirmationForm {
  readonly name: string
  /** Renders the form and returns the requests that actually reached the repository. */
  readonly render: () => { readonly requests: readonly unknown[] }
  readonly password: () => HTMLElement
  readonly confirmation: () => HTMLElement
  readonly submit: () => HTMLElement
  /** Anything else the form needs before its control could become enabled. */
  readonly fillTheRest?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>
  /** Asserts the accepted request carried the password once and the confirmation never. */
  readonly assertRequestShape: (request: unknown) => void
}

const SIGN_UP: ConfirmationForm = {
  name: 'sign-up',

  /**
   * Sign-up is where the cost of a mistyped password is highest: it creates an account whose
   * only recovery path is email the attendee may not be able to reach at a venue.
   */
  render: () => {
    const requests: unknown[] = []

    const services = testServices({
      identity: {
        ...testServices().repositories.identity,
        signUp: async (input: Record<string, unknown>) => {
          requests.push(input)
        },
      },
    })

    render(
      <WithServices services={services}>
        <MemoryRouter>
          <SignUp />
        </MemoryRouter>
      </WithServices>,
    )

    return { requests }
  },

  password: () => screen.getByLabelText(/^password$/i),
  confirmation: () => screen.getByLabelText(/^confirm password$/i),
  submit: () => screen.getByRole('button', { name: /create account/i }),

  fillTheRest: async (user) => {
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'Ada Lovelace')
  },

  assertRequestShape: (request) => {
    expect(
      Object.keys((request ?? {}) as object).sort(),
      'The confirmation reached the request. It exists to catch a typing error on this device ' +
        'and is never transmitted or stored (FR-1019).',
    ).toEqual(['displayName', 'email', 'password'])
  },
}

const RESET_PASSWORD: ConfirmationForm = {
  name: 'the reset-password screen',

  /**
   * The stakes arrive from the other direction here: somebody resetting a password has already
   * been locked out once, and a typo locks them out again — with a link that has now been spent.
   */
  render: () => {
    const requests: unknown[] = []

    const services = testServices({
      identity: {
        ...testServices().repositories.identity,
        resetPassword: async (token: string, password: string) => {
          requests.push([token, password])
        },
      },
    })

    render(
      <WithServices services={services}>
        {/* Without a token the screen renders the expired state and no form at all. */}
        <MemoryRouter initialEntries={['/reset-password?token=a-reset-token']}>
          <ResetPassword />
        </MemoryRouter>
      </WithServices>,
    )

    return { requests }
  },

  password: () => screen.getByLabelText(/^new password$/i),
  confirmation: () => screen.getByLabelText(/^confirm new password$/i),
  submit: () => screen.getByRole('button', { name: /set password/i }),

  assertRequestShape: (request) => {
    expect(
      request,
      'The reset carried something other than the token and the new password. The confirmation ' +
        'is never transmitted (FR-1019), and `no-confirmation-field.test.ts` asserts no route ' +
        'would accept one.',
    ).toEqual(['a-reset-token', PASSWORD])
  },
}

describe.each([SIGN_UP, RESET_PASSWORD])(
  'the password confirmation on $name',
  (form: ConfirmationForm) => {
    const fillTheRest = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await form.fillTheRest?.(user)
    }

    it('exists on the form (FR-1017)', () => {
      form.render()
      expect(form.confirmation()).toBeInTheDocument()
    })

    it('disables submission while the two differ (FR-1018)', async () => {
      const user = userEvent.setup()
      form.render()

      await fillTheRest(user)
      await user.type(form.password(), PASSWORD)
      await user.type(form.confirmation(), DIFFERENT)

      expect(
        form.submit(),
        'A mismatch must disable the control rather than be reported after a submission ' +
          'attempt. Both values here are individually valid, so nothing but the mismatch can ' +
          'be what disables it.',
      ).toBeDisabled()
    })

    it('describes the mismatch, and binds the description to the field (FR-1018)', async () => {
      const user = userEvent.setup()
      form.render()

      await fillTheRest(user)
      await user.type(form.password(), PASSWORD)
      await user.type(form.confirmation(), DIFFERENT)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **`toHaveAccessibleDescription` rather than "the text appears somewhere".**
      //
      // A message rendered beneath the field is connected to it by proximity for a sighted reader
      // and connected to nothing at all for somebody using a screen reader. FR-1018 asks for the
      // mismatch to be *described*, which means associated — so the assertion is about the
      // accessibility tree, not about the DOM containing a string.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect(form.confirmation()).toHaveAccessibleDescription(/must be the same/i)
      expect(form.confirmation()).toHaveAttribute('aria-invalid', 'true')
    })

    it('says nothing before there is anything to compare', async () => {
      const user = userEvent.setup()
      form.render()

      await user.type(form.password(), PASSWORD)

      expect(
        form.confirmation(),
        'An empty confirmation is not a mismatch. Announcing one would greet the first keystroke ' +
          'of a password somebody is about to type correctly.',
      ).not.toHaveAttribute('aria-invalid')
    })

    it('makes NO request when the two differ (SC-1005)', async () => {
      const user = userEvent.setup()
      const { requests } = form.render()

      await fillTheRest(user)
      await user.type(form.password(), PASSWORD)
      await user.type(form.confirmation(), DIFFERENT)

      await user.click(form.submit())

      expect(
        requests,
        'The form submitted with a mismatched confirmation. Catching it afterwards and rendering ' +
          'the refusal nicely looks the same to a reader and is not what SC-1005 asks for.',
      ).toHaveLength(0)
    })

    it('enables submission as soon as the two agree', async () => {
      const user = userEvent.setup()
      form.render()

      await fillTheRest(user)
      await user.type(form.password(), PASSWORD)
      await user.type(form.confirmation(), PASSWORD)

      expect(form.submit()).toBeEnabled()
    })

    it('sends the password once, and never the confirmation (FR-1019)', async () => {
      const user = userEvent.setup()
      const { requests } = form.render()

      await fillTheRest(user)
      await user.type(form.password(), PASSWORD)
      await user.type(form.confirmation(), PASSWORD)
      await user.click(form.submit())

      expect(requests).toHaveLength(1)
      form.assertRequestShape(requests[0])
    })
  },
)
