import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T023a (016) — **every password field in MyNet is a `PasswordField`, and nothing else asserted
 * that** (FR-1014, FR-1016, SC-1004).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWIN COMPONENT TESTS PROVE THE COMPONENT IS CORRECT. THEY PROVE NOTHING ABOUT THE
 * SCREENS.**
 *
 * `password-field.test.tsx` — here and in `apps/admin` — asserts that `PasswordField` reveals,
 * re-masks, never persists the revealed state, and carries a `type="button"` toggle. Both copies
 * run the same assertions, which is what stops the deliberate duplication drifting.
 *
 * None of that is a claim about the **five screens**. SC-1004 is *"every password field across
 * both products"*, and a screen that renders a bare `<input type="password">` satisfies every
 * existing test while defeating it — silently, and most plausibly on the *next* screen somebody
 * adds, because reaching for an `<input>` is what writing a form normally is.
 *
 * So this guard is about the call sites rather than the component: **the string `type="password"`
 * may appear in exactly one file per product, and that file is `PasswordField`.** A new screen
 * either imports it or fails this test, and failing it is the conversation.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This file has a twin: `apps/admin/tests/unit/password-field-usage.test.ts`.** Two products,
 * two `PasswordField` implementations, two guards — the same arrangement, and for the same
 * reason: `apps/admin` depends on `@mynet/data` and `@mynet/config` only, so there is no shared
 * package for either the component or its guard to live in. Neither product's test can see the
 * other's source tree, and a single guard scanning both would have to reach across an app
 * boundary that exists on purpose.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const src = fileURLToPath(new URL('../../src/', import.meta.url))

/** The one file allowed to name the type, relative to `src/`. */
const THE_COMPONENT = join('ui', 'PasswordField.tsx')

const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * Comments stripped, because the pattern below also appears in the prose explaining the rule —
 * in this feature's own component header, and in the note above.
 *
 * 009's absence tests record the trap at length and it is worth repeating here: a guard matching
 * raw text fails on a *correct* implementation, and the natural repair is to weaken the pattern
 * until it stops checking anything.
 */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/**
 * Both spellings a password input can have, because catching only the literal would be a guard
 * somebody walks past by accident.
 *
 * `type="password"` is the obvious one. `type={…'password'…}` is how `PasswordField` itself
 * writes it — the toggle between `'text'` and `'password'` is an expression — so a copy of that
 * component under another name would be invisible to a literal-only match.
 */
const PASSWORD_INPUT = /type\s*=\s*(?:["']password["']|\{[^}]*['"]password['"][^}]*\})/

const namesTheType = (): string[] =>
  sourceFiles(src)
    .filter((path) => PASSWORD_INPUT.test(codeOnly(path)))
    .map((path) => relative(src, path))
    .sort()

describe('MyNet has exactly one password input (SC-1004)', () => {
  it('finds a source tree to scan — a gate that cannot fail is not a gate', () => {
    // 010's review found a check that skipped on every CI run. The cheapest defence is to assert
    // the inputs exist before asserting anything about them.
    expect(sourceFiles(src).length).toBeGreaterThan(20)
  })

  it('names the type in `PasswordField` and nowhere else', () => {
    expect(
      namesTheType(),
      'A password input was rendered outside `ui/PasswordField.tsx`. SC-1004 is "every password ' +
        'field across both products", so a bare <input type="password"> is not a smaller version ' +
        'of the feature — it is a field with no reveal control, no keyboard-operable toggle, and ' +
        'no assertion anywhere that it behaves like the other four. Import `PasswordField` ' +
        'instead; if this screen genuinely cannot, that is a decision and this file is where it ' +
        'gets recorded.',
    ).toEqual([THE_COMPONENT])
  })

  it('still finds it inside `PasswordField`, so the pattern has not stopped matching', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The assertion above passes on an empty list, which is what a pattern quietly weakened to
    // match nothing would produce. This is the half that fails in that case.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(
      codeOnly(join(src, ...THE_COMPONENT.split(sep))),
      'The one file that is supposed to render a password input no longer does. Either the ' +
        'component changed shape or the pattern above has stopped matching anything — and the ' +
        'second failure is invisible from the other assertion.',
    ).toMatch(PASSWORD_INPUT)
  })
})
