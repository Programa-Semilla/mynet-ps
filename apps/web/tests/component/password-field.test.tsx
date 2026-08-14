import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { PasswordField } from '../../src/ui/PasswordField.js'

/**
 * T020 (016) — **the reveal control's behavioural contract, MyNet's half**
 * (FR-1014, FR-1015, FR-1016, SC-1004).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE AND ITS ADMINISTRATIVE TWIN ARE WHAT KEEP TWO IMPLEMENTATIONS FROM DIVERGING.**
 *
 * The control is implemented **twice**, once per product, because `apps/admin` depends on
 * `@mynet/data` and `@mynet/config` only — deliberately not on `@mynet/platform` — and there is
 * no shared UI package. FR-1050 asks for *"one behaviour described in one place"*, and with no
 * shared code to describe it in, **the description is this test**.
 *
 * So `apps/admin/tests/component/password-field.test.tsx` asserts the same things against the
 * other implementation, and a drift **fails a build** rather than being noticed by somebody
 * comparing files. Changing behaviour here means changing it there, which is the point: the two
 * files are the contract.
 *
 * **Keep them in step.** A case added here without its twin is a divergence with a test in front
 * of it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A host, because the field is controlled and a test needs somewhere for its value to live. */
const Host = ({ initial = '' }: { initial?: string }) => {
  const [value, setValue] = useState(initial)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setValue('SUBMITTED')
      }}
    >
      <label htmlFor="pw">Password</label>
      <PasswordField id="pw" value={value} onChange={setValue} autoComplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
  )
}

const field = (): HTMLInputElement => screen.getByLabelText('Password') as HTMLInputElement
const toggle = () => screen.getByRole('button', { name: /show password|hide password/i })

describe('the password reveal control', () => {
  it('masks the value until the control is activated (FR-1014)', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.type(field(), 'correct horse')
    expect(field().type).toBe('password')

    await user.click(toggle())
    expect(field().type).toBe('text')
    expect(field().value).toBe('correct horse')
  })

  it('re-masks when activated again (FR-1014)', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.click(toggle())
    expect(field().type).toBe('text')

    await user.click(toggle())
    expect(field().type).toBe('password')
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The revealed state is never remembered** (FR-1015).
   *
   * Unmounting stands in for navigating away, reloading, and the application restarting — all
   * of which discard component state. A device that was locked with a password on screen shows
   * a masked field when it comes back, because nothing wrote the preference anywhere.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('does not remember being revealed across a remount (FR-1015)', async () => {
    const user = userEvent.setup()
    const first = render(<Host />)

    await user.click(toggle())
    expect(field().type).toBe('text')

    first.unmount()
    render(<Host />)

    expect(
      field().type,
      'The revealed state survived a remount, so it is stored somewhere. FR-1015 forbids it ' +
        'persisting across navigation, reload or restart — a revealed-by-default preference ' +
        'turns a glance over a shoulder into a credential disclosure.',
    ).toBe('password')
  })

  it('announces both what it does and the current state (FR-1016)', async () => {
    const user = userEvent.setup()
    render(<Host />)

    expect(toggle()).toHaveAccessibleName('Show password')
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle())

    expect(toggle()).toHaveAccessibleName('Hide password')
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('is operable by keyboard alone (FR-1016, SC-1004)', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.tab() // into the field
    expect(field()).toHaveFocus()

    await user.tab() // onto the reveal control
    expect(toggle()).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(field().type).toBe('text')

    await user.keyboard(' ')
    expect(field().type).toBe('password')
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Revealing must not submit the form.**
   *
   * A `<button>` inside a form defaults to `type="submit"`, so the control ships broken unless
   * it says otherwise — and the failure is invisible to a mouse-driven check, because the click
   * reveals *and* submits and the submission looks like the reader pressing enter. On a sign-in
   * screen that means one tap on "show" spends an attempt against the throttle.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('does not submit the form it sits in', async () => {
    const user = userEvent.setup()
    render(<Host initial="typed" />)

    await user.click(toggle())

    expect(
      field().value,
      'Activating the reveal control submitted the form. The control needs `type="button"` — ' +
        'without it, showing a password on a sign-in screen spends a throttle attempt.',
    ).toBe('typed')
  })

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Toggling changes the input's `type`; it must not replace the input.**
   *
   * Rendering two conditional `<input>` elements is the obvious alternative implementation and
   * it is subtly wrong: React would unmount one and mount the other, so the reader loses their
   * cursor position mid-password and — depending on how the value is held — possibly the value
   * itself. Node identity is the assertion, because "it still has the right value" would pass
   * against the broken version for a controlled field.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  it('keeps the same input element across a toggle, rather than swapping it', async () => {
    const user = userEvent.setup()
    render(<Host />)

    await user.type(field(), 'secret value')
    const before = field()

    await user.click(toggle())

    expect(
      field(),
      'The input was replaced rather than re-typed. Two conditional inputs lose the reader’s ' +
        'cursor position in the middle of typing a password.',
    ).toBe(before)
    expect(field().value).toBe('secret value')
  })
})
