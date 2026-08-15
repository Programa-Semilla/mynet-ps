import { ApiError } from '@mynet/data/http'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AdminRoutes } from '../../src/app/routes.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { stubServices } from '../support/services.js'

/**
 * T021a (016) — **the administrative confirmation, held to MyNet's rule** (FR-1018, FR-1050).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE TWIN OF `apps/web/tests/component/password-confirm.test.tsx`, AND THE TWINNING
 * IS THE REQUIREMENT RATHER THAN A CONVENIENCE.**
 *
 * FR-1050: *"The administrative credential-replacement screen's existing confirmation field MUST
 * behave identically to MyNet's new ones, so that one behaviour is described in one place rather
 * than two implementations diverging."*
 *
 * The mismatch rule is implemented **three times independently** — `SignUp`, `ResetPassword`, and
 * `ReplaceCredential` here — each deriving `matches`/`mismatch` for itself and each carrying its
 * own copy of the same sentence. There is no shared component to make them one, and there
 * deliberately is not: `apps/admin` depends on `@mynet/data` and `@mynet/config` only, and a
 * `packages/ui` holding this would give the administrative site its first dependency on shared
 * *presentation* — the coupling v4.0.0 kept out on purpose. **What prevents divergence is the
 * test, not the code**, which is the argument the duplicated `PasswordField` records in its own
 * header and the reason this file has to exist at all.
 *
 * **It did not exist**, and that is the finding this file answers. The twin `password-field.test.tsx`
 * pair guards the *reveal control*, which is genuinely equivalent — but FR-1050 is about the
 * *confirmation*. `password-confirm.test.tsx` imported only `SignUp`, this directory had no
 * `ReplaceCredential` test of any kind, and the e2e fills this screen's confirmation while
 * asserting nothing about a mismatch. So the one behaviour FR-1050 names was the one with **no**
 * cross-product guard — on the screen guarding the tier that reads the report queue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **The five properties below are this screen's, assertion for assertion, and they are what
 * "identically" means.** Disable on a mismatch; describe it and *bind* the description; say
 * nothing before there is anything to compare; make no request; enable the moment the two agree.
 * A drift in any of them fails a build in one product or the other.
 *
 * One thing is deliberately **not** claimed identical, because FR-1050 does not name it: MyNet's
 * two forms bind a standing hint to the confirmation ("Type it again, so a typo does not …") and
 * swap its text on a mismatch, while this screen binds nothing until there is a mismatch to
 * describe. Both satisfy the rule — the difference is whether a *hint* is offered, not how the
 * mismatch behaves — and collapsing them would be a copy change on three screens rather than a
 * defect being fixed.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Two passwords that are each individually **valid** against the twelve-character floor, and
 * different from one another.
 *
 * The distinction matters and is the reason the existing e2e coverage proves nothing here: a
 * mismatch built from a short value is disabled by the *length* rule as well, so the assertion
 * would pass against a screen with no mismatch check at all.
 */
const PASSWORD = 'a long enough password'
const DIFFERENT = 'a different long password'

/**
 * Reached the way an operator reaches it: the session provider classifies the
 * `credential_not_replaced` 403 from its own first `/admin/me` and `AdminRoutes` renders this
 * screen instead of an error. Rendering the component directly would assert its form and skip
 * the state that is the only way anybody arrives at it.
 */
const renderScreen = () => {
  const replacements: { currentPassword: string; newPassword: string }[] = []

  const services = stubServices({
    session: {
      me: async () => Promise.reject(new ApiError(403, { code: 'credential_not_replaced' })),
      replaceCredential: async (input: { currentPassword: string; newPassword: string }) => {
        replacements.push(input)
      },
    },
  })

  render(
    <MemoryRouter initialEntries={['/']}>
      <AdminSessionProvider services={services}>
        <AdminRoutes />
      </AdminSessionProvider>
    </MemoryRouter>,
  )

  return { replacements }
}

const currentField = async (): Promise<HTMLElement> => screen.findByLabelText(/^current password$/i)
const passwordField = (): HTMLElement => screen.getByLabelText(/^new password$/i)
const confirmField = (): HTMLElement => screen.getByLabelText(/^confirm new password$/i)
const submitButton = (): HTMLElement => screen.getByRole('button', { name: /save and continue/i })

/** Everything but the two that are under test, so nothing else can be what disables the control. */
const fillTheRest = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.type(await currentField(), 'the bootstrapped credential')
}

describe('the administrative password confirmation (FR-1050)', () => {
  it('exists on the credential-replacement form', async () => {
    renderScreen()
    await currentField()
    expect(confirmField()).toBeInTheDocument()
  })

  it('disables submission while the two differ (FR-1018)', async () => {
    const user = userEvent.setup()
    renderScreen()

    await fillTheRest(user)
    await user.type(passwordField(), PASSWORD)
    await user.type(confirmField(), DIFFERENT)

    expect(
      submitButton(),
      'A mismatch must disable the control rather than be reported after a submission attempt. ' +
        'Both values here are individually valid and the current password is filled, so nothing ' +
        'but the mismatch can be what disables it.',
    ).toBeDisabled()
  })

  it('describes the mismatch, and binds the description to the field (FR-1018)', async () => {
    const user = userEvent.setup()
    renderScreen()

    await fillTheRest(user)
    await user.type(passwordField(), PASSWORD)
    await user.type(confirmField(), DIFFERENT)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **`toHaveAccessibleDescription` rather than "the text appears somewhere"**, exactly as the
    // MyNet twin asserts it. A message rendered beneath the field is connected to it by proximity
    // for a sighted reader and connected to nothing at all for somebody using a screen reader.
    // FR-1018 asks for the mismatch to be *described*, which means associated.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(confirmField()).toHaveAccessibleDescription(/must be the same/i)
    expect(confirmField()).toHaveAttribute('aria-invalid', 'true')
  })

  it('says nothing before there is anything to compare', async () => {
    const user = userEvent.setup()
    renderScreen()

    await fillTheRest(user)
    await user.type(passwordField(), PASSWORD)

    expect(
      confirmField(),
      'An empty confirmation is not a mismatch. Announcing one would greet the first keystroke ' +
        'of a password somebody is about to type correctly — and this screen is the product’s ' +
        'opening interaction for an operator, so a false error is the first thing they see.',
    ).not.toHaveAttribute('aria-invalid')
  })

  it('makes NO request when the two differ (SC-1005)', async () => {
    const user = userEvent.setup()
    const { replacements } = renderScreen()

    await fillTheRest(user)
    await user.type(passwordField(), PASSWORD)
    await user.type(confirmField(), DIFFERENT)

    await user.click(submitButton())

    expect(
      replacements,
      'The form submitted with a mismatched confirmation. Catching it afterwards and rendering ' +
        'the refusal nicely looks the same to a reader and is not what the rule asks for — and ' +
        'here the request would spend the initial credential the operator is replacing.',
    ).toHaveLength(0)
  })

  it('enables submission as soon as the two agree', async () => {
    const user = userEvent.setup()
    renderScreen()

    await fillTheRest(user)
    await user.type(passwordField(), PASSWORD)
    await user.type(confirmField(), PASSWORD)

    expect(submitButton()).toBeEnabled()
  })

  it('sends the new password once, and never the confirmation (FR-1019)', async () => {
    const user = userEvent.setup()
    const { replacements } = renderScreen()

    await fillTheRest(user)
    await user.type(passwordField(), PASSWORD)
    await user.type(confirmField(), PASSWORD)
    await user.click(submitButton())

    expect(replacements).toHaveLength(1)
    expect(
      Object.keys(replacements[0] ?? {}).sort(),
      'The confirmation reached the request. It exists to catch a typing error on this device ' +
        'and is never transmitted or stored — `no-confirmation-field.test.ts` asserts on the ' +
        'other side that no route would accept one.',
    ).toEqual(['currentPassword', 'newPassword'])
  })
})
