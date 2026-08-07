import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T085 (005) — **SC-206: the complete journey, using only a keyboard.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS EXISTS WHEN T083 ALREADY SWEEPS EVERY CONTROL.**
 *
 * The accessibility sweep scans surfaces and finds controls with no name, no focus indicator,
 * or insufficient contrast. It cannot find a break in the **handoff between two controls** —
 * and that is where a keyboard journey actually fails: focus lost when a dialog opens, focus
 * dropped on the body when it closes, a filter that cannot be reached because the control
 * before it swallows the Tab, a list that re-renders under the cursor and loses the place.
 *
 * Every one of those passes a per-control audit. None of them survives somebody trying to use
 * the product without a mouse.
 *
 * So this drives the whole of SC-206 in one pass — **open the programme → open a session →
 * save it → write a note → close the panel → filter to Saved** — with no pointer at any step,
 * and asserts that focus is visible throughout and correctly restored after the panel closes.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** What currently has focus, described well enough for a failure to be actionable. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement
    if (!active || active === document.body) return { tag: 'none', name: '', visibleRing: false }

    /**
     * The control's accessible name, by the routes a browser actually uses.
     *
     * The `labels` collection matters and was missing: a `<textarea>` carries no `aria-label`
     * and no text content of its own — its name comes from an associated `<label>`, which for
     * the note editor is visually hidden. Without this the focus trail reported the editor as
     * an unnamed `textarea[]` and the journey could not tell it from anything else.
     */
    const labelled = (active as HTMLInputElement).labels?.[0]?.textContent?.trim()

    const name =
      active.getAttribute('aria-label') ??
      labelled ??
      active.getAttribute('placeholder') ??
      active.textContent?.trim().slice(0, 40) ??
      ''

    // ─────────────────────────────────────────────────────────────────────────────────────
    // A visible ring, read from the rendered styles rather than assumed from a class.
    //
    // The control may carry the ring itself, or — for the segmented filter, whose input is
    // transparent and stretched — its label may carry it through `:has(:focus-visible)`. Both
    // are checked, because the *attendee* cannot tell which element drew it and neither should
    // this test.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const ringOn = (element: Element | null): boolean => {
      if (!element) return false
      const style = getComputedStyle(element)
      const width = Number.parseFloat(style.outlineWidth)
      return style.outlineStyle !== 'none' && Number.isFinite(width) && width > 0
    }

    return {
      tag: active.tagName.toLowerCase(),
      name,
      visibleRing: ringOn(active) || ringOn(active.closest('label')),
    }
  })

/** Presses a key and returns where focus landed. */
const press = async (page: Page, key: string) => {
  await page.keyboard.press(key)
  return focused(page)
}

/** Tabs forward until `match` describes the focused element, or gives up with the trail. */
const tabTo = async (page: Page, match: RegExp, limit = 40) => {
  const trail: string[] = []

  for (let step = 0; step < limit; step += 1) {
    const where = await press(page, 'Tab')
    trail.push(`${where.tag}[${where.name}]`)
    if (match.test(where.name)) return where
  }

  throw new Error(`Never reached ${String(match)} by keyboard. Focus trail: ${trail.join(' → ')}`)
}

test('the whole agenda journey is completable with the keyboard alone (SC-206)', async ({
  page,
}) => {
  await page.goto('/')
  await signIn(page, ADA)

  // ── Open the programme, by keyboard ────────────────────────────────────────────────────
  await page.keyboard.press('Tab')
  const agendaLink = await tabTo(page, /^Agenda$/)
  expect(agendaLink.visibleRing, 'the Agenda link must show a visible focus ring').toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()

  const title = (
    (await page.getByRole('heading', { level: 3 }).first().getByRole('link').textContent()) ?? ''
  ).trim()

  // ── Reach the session and open it ──────────────────────────────────────────────────────
  const sessionLink = await tabTo(page, new RegExp(`^${title}`))
  expect(sessionLink.visibleRing, 'the session link must show a visible focus ring').toBe(true)
  await page.keyboard.press('Enter')

  await expect(page.getByRole('dialog')).toBeVisible()

  // ── Focus must be INSIDE the panel, without the attendee having to find it ─────────────
  const onOpen = await focused(page)
  expect(
    ['button', 'textarea', 'dialog'].includes(onOpen.tag),
    `focus went to ${onOpen.tag}[${onOpen.name}] when the panel opened`,
  ).toBe(true)

  // ── Write a note, by keyboard, from inside the panel ───────────────────────────────────
  const editor = await tabTo(page, /private notes|Your private notes/i, 12)
  expect(editor.visibleRing, 'the note editor must show a visible focus ring').toBe(true)
  await page.keyboard.type('Typed without touching a pointer.')
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
    timeout: 15_000,
  })

  // ── Close the panel with Escape, and land back where we started ────────────────────────
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const restored = await focused(page)
  expect(
    restored.name,
    'focus must return to the control that opened the panel — not the body, and not the top of ' +
      'the document. This is the handoff a per-control audit cannot see.',
  ).toContain(title)
  expect(restored.visibleRing, 'the restored focus must be visible').toBe(true)

  // ── Save the session, by keyboard, from where focus now is ─────────────────────────────
  const saveControl = await tabTo(page, new RegExp(`Save ${title}`), 6)
  expect(saveControl.visibleRing, 'the save control must show a visible focus ring').toBe(true)
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: `Remove ${title} from your agenda` })).toBeVisible()

  // Focus survives the row re-rendering under it — otherwise the journey ends here for a
  // keyboard reader, who would be returned to the top of the document mid-list.
  const afterSave = await focused(page)
  expect(afterSave.name, 'focus must stay on the control after saving').toContain(title)

  // ── Filter to Saved, by keyboard ───────────────────────────────────────────────────────
  // Backwards to the filter, which sits above the programme.
  const trail: string[] = []
  let reachedFilter = false
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('Shift+Tab')
    const where = await focused(page)
    trail.push(`${where.tag}[${where.name}]`)
    if (where.tag === 'input') {
      expect(where.visibleRing, `the filter must show a visible focus ring: ${where.name}`).toBe(
        true,
      )
      reachedFilter = true
      break
    }
  }
  expect(reachedFilter, `never reached the filter going backwards: ${trail.join(' → ')}`).toBe(true)

  // Arrow movement within the radio group comes from the platform, which is why the filter is
  // radios rather than a pair of toggle buttons.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Saved' })).toBeChecked()

  // ── The journey is complete: exactly the session just saved is on screen ───────────────
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 3, name: title })).toBeVisible()

  // ── Clean up, still by keyboard ────────────────────────────────────────────────────────
  const remove = await tabTo(page, new RegExp(`Remove ${title}`), 10)
  expect(remove.visibleRing).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.getByText(/nothing saved yet/i)).toBeVisible()

  // And the note, so the suite leaves nothing behind.
  await page.goto('/agenda')
  await page.getByRole('heading', { level: 3, name: title }).getByRole('link').click()
  await page.getByRole('textbox', { name: /private notes/i }).fill('')
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({
    timeout: 15_000,
  })
})
