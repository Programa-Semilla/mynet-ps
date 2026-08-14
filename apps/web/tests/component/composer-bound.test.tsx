import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderMessages } from '../support/messages.js'

/**
 * T005 (016) — **the composer grows to a bound and stops there** (FR-1001, FR-1004, FR-1005).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE ASSERTS THE RULE; `e2e/responsive.spec.ts` ASSERTS THE CONSEQUENCE.**
 *
 * jsdom lays nothing out. It has no viewport, resolves no `dvh`, and reports `0` for every
 * measured height — so a component test **cannot** observe that a field stopped growing, and one
 * written as though it could would pass against an unbounded composer.
 *
 * What is checkable here is that the field carries the three properties the bound is made of,
 * and — more usefully — that the send control is **not inside the bounded element**, which is the
 * structural fact FR-1003 rests on. Whether the control is actually on screen at 390×844 is
 * measured in a real browser by `e2e/responsive.spec.ts`, because this project has twice shipped
 * a layout defect past a full suite of behavioural tests.
 *
 * **The one exception is FR-1001's growth, and it earned the exception by having no assertion at
 * all.** The *cap* is CSS and genuinely unobservable here; the *growth* is a line of JavaScript
 * driven by a single measurement, and stubbing that measurement makes it checkable without
 * pretending jsdom lays anything out. See `stubMeasurement` below for why the stub reproduces the
 * browser's rule rather than the convenient half of it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const NEW_THREAD = '/messages/new/11111111-1111-4111-8111-111111111111'

const composer = async (): Promise<HTMLTextAreaElement> =>
  (await screen.findByRole('textbox', { name: /message/i })) as HTMLTextAreaElement

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE MEASUREMENT jsdom CANNOT PROVIDE, STUBBED FAITHFULLY RATHER THAN CONVENIENTLY.**
 *
 * `Composer.tsx` sets `height = 'auto'`, then overwrites it **only** `if (scrollHeight > 0)` —
 * and jsdom reports `0` for every element it has never laid out. So the growth this file used to
 * assert could not be observed at all: `expect(field.style.height).not.toBe('0px')` passed on
 * `'auto'`, and passed identically on `''` with the entire effect deleted. **FR-1001 had no
 * executable assertion anywhere** — the e2e in `responsive.spec.ts` measures the *send control's*
 * box, which is in the viewport whether or not the field grew.
 *
 * The stub below is deliberately not `value.length * 4`. A content-only stub would make the
 * shrink assertion pass against a composer that **never reset to `auto`**, which is the half of
 * the mechanism most likely to be "tidied" away — the effect's own comment says so: `scrollHeight`
 * includes the height already set, so measuring without clearing it first reports the *current*
 * height whenever content shrinks, and deleting a long message leaves the box tall and empty.
 *
 * So this reproduces the browser's actual rule — **`scrollHeight` is at least the element's own
 * set height** — by reading `style.height` back. `'auto'` and `''` parse to `NaN`, which is the
 * reset doing its job. Remove the reset and the shrink case fails; remove the whole effect and
 * both cases fail, because `style.height` never becomes a pixel value at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** An empty composer still occupies its two `rows`, so the floor is not zero. */
const EMPTY_HEIGHT = 40
const PER_CHARACTER = 4

const stubMeasurement = (): void => {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement): number {
      const content = EMPTY_HEIGHT + this.value.length * PER_CHARACTER
      const alreadySet = Number.parseInt(this.style.height, 10)
      return Number.isNaN(alreadySet) ? content : Math.max(content, alreadySet)
    },
  })
}

/**
 * Deletes the **own** property, restoring `Element.prototype`'s inherited getter.
 *
 * `restoreMocks` does not reach a `defineProperty` on a DOM prototype, and a stub left behind
 * would follow every later file in this project into a shared jsdom environment — a global whose
 * effect appears somewhere else entirely is the worst kind of test to debug.
 */
const restoreMeasurement = (): void => {
  delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight
}

describe('the composer’s height', () => {
  it('is capped as a proportion of the visible viewport, never as a fixed height (FR-1002)', async () => {
    renderMessages({ at: NEW_THREAD })

    expect(
      (await composer()).className,
      'FR-1002 requires a proportion of the visible area, and forbids a fixed height and a line ' +
        'count. `dvh` rather than `vh` is deliberate: `vh` measures the viewport with browser ' +
        'chrome retracted, so it is taller than what the attendee can see on a phone.',
    ).toMatch(/max-h-\[\d+dvh\]/)
  })

  it('scrolls its content rather than growing past the cap (FR-1004)', async () => {
    renderMessages({ at: NEW_THREAD })

    expect((await composer()).className).toContain('overflow-y-auto')
  })

  it('cannot be resized by direct manipulation (FR-1005)', async () => {
    renderMessages({ at: NEW_THREAD })

    const field = await composer()

    expect(
      field.className,
      'A reader-chosen height violates FR-1003 whatever the bound says — dragging the handle ' +
        'past the ceiling put the send control off screen with every other rule satisfied. This ' +
        'was `resize-y` and that was half the original defect.',
    ).toContain('resize-none')
    expect(field.className).not.toContain('resize-y')
  })

  describe('with the measurement jsdom cannot make (FR-1001)', () => {
    beforeEach(stubMeasurement)
    afterEach(restoreMeasurement)

    it('grows with what is typed, and shrinks back when it is deleted', async () => {
      const user = userEvent.setup()
      renderMessages({ at: NEW_THREAD })

      const field = await composer()

      const atRest = Number.parseInt(field.style.height, 10)
      expect(
        atRest,
        'The height is not a pixel value at rest, so the growth effect never ran. FR-1001 is ' +
          'driven from a measurement — a textarea does not grow with its content on its own.',
      ).toBe(EMPTY_HEIGHT)

      const message = 'A message long enough to need a second line in a narrow composer.'
      await user.type(field, message)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **The height TRACKS the content, rather than merely being non-zero.** The assertion this
      // replaced compared against `'0px'`, which `'auto'` satisfies — and so does `''`, which is
      // what the attribute holds if the effect is deleted outright.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect(
        field.style.height,
        'The composer did not grow with what was typed. This is the defect the owner reported: ' +
          'a long message written on a phone becomes unwritable, because a textarea scrolls its ' +
          'content instead of expanding to fit it.',
      ).toBe(`${EMPTY_HEIGHT + message.length * PER_CHARACTER}px`)

      await user.clear(field)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Shrinking is what catches the removal of `height = 'auto'`.** Growth alone passes
      // without it, because a measurement taken while the element is already tall reports the
      // taller of the two. Without the reset this assertion reads back the grown height and
      // fails — which is the whole reason it is here rather than a second growth case.
      // ─────────────────────────────────────────────────────────────────────────────────────
      expect(
        field.style.height,
        'The composer stayed tall after its content was deleted. `Composer.tsx` resets the ' +
          'height to `auto` before measuring for exactly this reason: `scrollHeight` includes ' +
          'the height already set, so a composer that only ever measures can only ever grow.',
      ).toBe(`${EMPTY_HEIGHT}px`)
    })
  })

  it('leaves the send control OUTSIDE the bounded element, which is what FR-1003 rests on', async () => {
    renderMessages({ at: NEW_THREAD })

    const field = await composer()
    const send = screen.getByRole('button', { name: /send message/i })

    expect(
      field.contains(send),
      'The bound is on the field alone, so growth moves that element’s own bottom edge and ' +
        'nothing else. A send control inside the bounded region — or a bound applied to the row ' +
        'containing both — would make reachability depend on the proportion staying correct, ' +
        'which is the arrangement FR-1002 exists to avoid.',
    ).toBe(false)
  })
})
