import { Eye, EyeOff } from 'lucide-react'
import { useState, type ChangeEvent } from 'react'

/**
 * T024 (016) — **the administrative password field** (FR-1049, FR-1050).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS A DELIBERATE DUPLICATE OF `apps/web/src/ui/PasswordField.tsx`, AND THE DUPLICATION
 * IS THE DECISION RATHER THAN THE SHORTCUT.**
 *
 * FR-1050 asks that *"one behaviour is described in one place rather than two implementations
 * diverging"*, and there is nowhere in this repository that satisfies that literally.
 * `packages/` holds `config`, `data` and `platform`; `apps/admin` depends on **`@mynet/data` and
 * `@mynet/config` only**, and deliberately not on `@mynet/platform`, because 013 established
 * that the administrative site needs none of the device capabilities and that its absences are
 * *"structural rather than configured"*.
 *
 * **Creating `packages/ui` to hold one control was considered and rejected.** It would be a
 * package whose only member is a password field, and — the part that matters — it would give the
 * administrative site its **first dependency on shared presentation**, which is precisely the
 * coupling that keeps the two products' information architectures independent. `apps/admin`
 * shares no destination, no Home card and no navigation contract with MyNet, and that is what
 * v4.0.0 bought by making administration a separate product rather than a second surface.
 * Revisit when a *second* shared control appears: two members make it a package rather than a
 * wrapper, and the argument changes with the number.
 *
 * **WHAT KEEPS THE TWO FROM DIVERGING IS THE TEST, NOT THE CODE.** The same behavioural
 * assertions run against both — `apps/web/tests/component/password-field.test.tsx` and
 * `apps/admin/tests/component/password-field.test.tsx` — so a drift **fails a build** rather
 * than being noticed by somebody comparing files. That is the same mechanism this project uses
 * for absences, and it is stronger here than shared code would be: shared code guarantees the
 * implementations match, while the tests guarantee the *behaviour* does, which is what FR-1050
 * is actually about.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The reveal state lives in `useState` and is never persisted (FR-1015) — see the MyNet copy for
 * why that is by construction rather than by remembering to clear it.
 */

export interface PasswordFieldProps {
  readonly id: string
  readonly name?: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly autoComplete: 'current-password' | 'new-password'
  readonly required?: boolean
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
        className={`${className} pr-12`}
      />

      {/*
        `type="button"` is load-bearing: a button inside a form defaults to `submit`, so without
        it revealing the credential would submit the form. Invisible to a mouse-driven check,
        because the click both reveals and submits.

        The accessible name states the action and `aria-pressed` states the current state, which
        is FR-1016 — and FR-1049 requires this screen to behave exactly as MyNet's does.
      */}
      <button
        type="button"
        onClick={() => setRevealed((shown) => !shown)}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        aria-pressed={revealed}
        aria-controls={id}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-lg text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500"
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
