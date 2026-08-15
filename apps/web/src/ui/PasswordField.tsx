import { Eye, EyeOff } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'

/**
 * T004, T023 (016) — **a password field you can check before you submit it**
 * (FR-1014, FR-1015, FR-1016).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PRIMARY CONTEXT FOR THIS PRODUCT IS A PHONE, WHICH IS WHERE MASKED ENTRY FAILS.**
 *
 * Touch keyboards mistype and autocorrect interferes, and a masked field gives the reader no way
 * to find out until the server refuses them. The cost lands hardest on the two screens that
 * *set* a credential: an attendee who mistypes at sign-up has locked themselves out of an
 * account whose only recovery path is email they may not be able to reach at a venue.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **REVEALED STATE IS COMPONENT STATE AND IS NEVER PERSISTED** (FR-1015).
 *
 * It lives in this component's own `useState`, so it resets on unmount, on navigation, on
 * reload and on restart — by construction rather than by anybody remembering to clear it. A
 * device that was locked with a password on screen shows a masked field when it comes back.
 *
 * There is deliberately nothing here that writes to storage. `SecureStorage` exists and would
 * accept it; a revealed-by-default preference is precisely the convenience that turns a shoulder
 * into a credential disclosure.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Autofill is safe and needs no special handling** (spec edge case). Revealing requires
 * activating the control, so a credential the browser filled and the reader never typed is not
 * exposed by merely arriving at the screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS COMPONENT IS DUPLICATED IN `apps/admin`, DELIBERATELY.** See that copy's header for
 * the argument. The short version: `apps/admin` depends on `@mynet/data` and `@mynet/config`
 * only, there is no shared UI package, and creating one to hold a single control would give the
 * administrative site its first dependency on shared *presentation* — the coupling v4.0.0 kept
 * out on purpose. **What keeps the two from diverging is the test, not the code**: the same
 * behavioural assertions run against both, so a drift fails a build.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

export interface PasswordFieldProps {
  readonly id: string
  readonly name?: string
  readonly value: string
  readonly onChange: (value: string) => void
  /**
   * Required rather than optional, because getting it wrong is invisible and costly: a
   * `new-password` field announced as `current-password` makes a password manager offer the old
   * credential on the screen that replaces it.
   */
  readonly autoComplete: 'current-password' | 'new-password'
  readonly required?: boolean
  /** Classes for the input itself. The two products style their forms differently. */
  readonly className?: string
  readonly describedBy?: string
  readonly invalid?: boolean
}

export const PasswordField = ({
  id,
  name,
  value,
  onChange,
  autoComplete,
  required,
  className = '',
  describedBy,
  invalid,
}: PasswordFieldProps) => {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        {...(name ? { name } : {})}
        type={revealed ? 'text' : 'password'}
        autoComplete={autoComplete}
        {...(required ? { required: true } : {})}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...(invalid ? { 'aria-invalid': true } : {})}
        // `pr-12` reserves the control's own width, so a long value runs under the label rather
        // than under the button — the field is still readable at 320px with the toggle present.
        className={`${className} pr-12`}
      />

      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        **An ordinary `<button>`, which is the whole of FR-1016's keyboard requirement.**

        `type="button"` is load-bearing: a button inside a form defaults to `submit`, so without
        it revealing the password would submit the sign-in form. That is the defect this control
        would most plausibly ship with, because it is invisible to a mouse-driven check — the
        click reveals *and* submits, and the submission looks like the reader pressing enter.

        The accessible name states the **action** and `aria-pressed` states the **current
        state**, which is what FR-1016 asks for. A screen reader announces "Show password, toggle
        button, not pressed", and both halves change together.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      <button
        type="button"
        onClick={() => setRevealed((shown) => !shown)}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-pressed={revealed}
        aria-controls={id}
        className="focus-ring absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-sm text-text-muted"
      >
        {revealed ? (
          <EyeOff aria-hidden="true" className="size-5" />
        ) : (
          <Eye aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  )
}
