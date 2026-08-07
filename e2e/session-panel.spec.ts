import { expect, test, type Page } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T043 (005) — the session detail panel in a real browser
 * (FR-198–FR-205, SC-207).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS WHERE THE FOCUS TRAP IS ACTUALLY PROVED.**
 *
 * jsdom 30 implements no part of `<dialog>` — no `showModal`, no top layer, no inertness — so
 * the component tests can only assert that the panel is opened modally and that our own
 * `cancel` and focus-restoration wiring is right. The guarantees research D3 chose the native
 * element *for* exist only in a browser, and the register lists Escape handling and visible
 * focus as settled requirements the prototype failed to meet. So they are asserted here,
 * against the real thing.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const goToAgenda = async (page: Page): Promise<void> => {
  await page.getByRole('link', { name: 'Agenda' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
}

/** The first session's title and its address, read from the programme rather than assumed. */
const firstSession = async (page: Page): Promise<{ title: string; href: string }> => {
  const link = page.getByRole('heading', { level: 3 }).first().getByRole('link')
  await expect(link).toBeVisible()
  return {
    title: ((await link.textContent()) ?? '').trim(),
    href: (await link.getAttribute('href')) ?? '',
  }
}

test.describe('the session detail panel', () => {
  test('opens at its own address and shows the session (FR-198, FR-200)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title, href } = await firstSession(page)
    await page.getByRole('link', { name: title }).click()

    await expect(page).toHaveURL(new RegExp(`${href}$`))
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { level: 2, name: title })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'Speakers' })).toBeVisible()
  })

  test('CONFINES FOCUS while open — the platform guarantee (FR-202)', async ({ page }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title } = await firstSession(page)
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // `:modal` is the platform's own answer to "is this dialog trapping focus". It is true
    // only for a dialog opened with `showModal()`, so this distinguishes the modal form from
    // `show()` without relying on anything the feature sets itself.
    const isModal = await page.evaluate(() =>
      document.querySelector('dialog[open]')?.matches(':modal'),
    )
    expect(isModal, 'the panel must be opened with showModal(), which is what traps focus').toBe(
      true,
    )

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Tab well past the number of focusable controls inside the panel. `showModal()` puts the
    // dialog in the top layer and makes everything behind it inert, so focus must cycle within
    // it and must never land on the programme, the filter, or the navigation rail.
    //
    // Asserted by walking, not by counting: the exact number of stops is a presentation detail
    // that will change when 009 adds a section, and a test that pinned it would fail for the
    // wrong reason.
    // ───────────────────────────────────────────────────────────────────────────────────────
    /**
     * Where focus is, classified into the three outcomes that actually matter.
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **`body` is NOT an escape, and treating it as one gets this test wrong.**
     *
     * The panel's only focusable control is its close button, so Tab from it leaves the
     * document for the browser's own UI — the address bar and toolbar — and `activeElement`
     * falls back to `body`. That is the platform behaving correctly: the page content behind
     * the dialog is inert and cannot be reached at all, and a further Tab comes back into the
     * panel.
     *
     * What FR-202 requires is that focus is **confined to the panel**, meaning it never lands
     * on a control *behind* it — the rail, the filter, a save control, Sign out. That is what
     * is asserted, and it is the assertion that would actually fail if `show()` were used
     * instead of `showModal()`.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    const focus = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]')
        const active = document.activeElement
        if (!active || active === document.body) return 'browser-ui'

        const where = `${active.tagName.toLowerCase()}[${
          active.getAttribute('aria-label') ?? active.textContent?.slice(0, 30) ?? ''
        }]`
        return dialog && (dialog === active || dialog.contains(active))
          ? `inside:${where}`
          : `BEHIND-THE-PANEL:${where}`
      })

    // Focus must be inside the moment the panel opens — a trap the attendee has to Tab into is
    // not a trap, and a screen-reader user would be left reading the programme behind it.
    const opened = await focus()
    expect(opened, 'focus must move into the panel when it opens').toMatch(/^inside:/)

    const trail = [opened]
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press('Tab')
      trail.push(await focus())
    }

    // Asserted as one trail rather than twelve separate expectations, so a failure shows the
    // whole path focus took instead of only the first step off it.
    expect(
      trail.filter((stop) => stop.startsWith('BEHIND-THE-PANEL')),
      `focus trail: ${trail.join(' → ')}`,
    ).toEqual([])

    // And it genuinely cycles rather than being lost: focus comes back into the panel.
    expect(
      trail.slice(1).some((stop) => stop.startsWith('inside:')),
      `focus never returned to the panel — trail: ${trail.join(' → ')}`,
    ).toBe(true)
  })

  test('closes on Escape, returns the address, and RESTORES FOCUS to the opener (FR-202)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title, href } = await firstSession(page)
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/agenda$/)

    // `<dialog>` does not do this reliably across engines, which is why the feature does it
    // explicitly. Without it a keyboard reader is returned to the top of the document.
    const focusedHref = await page.evaluate(() =>
      (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href'),
    )
    expect(focusedHref, 'focus must return to the row that opened the panel').toBe(href)
  })

  test('the browser Back control closes the panel rather than leaving Agenda (FR-205)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title } = await firstSession(page)
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.goBack()

    // Still on Agenda, with the programme — not back on Home. This falls out of the nested
    // route rather than being implemented: the panel is a child address, so Back pops it.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/agenda$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
  })

  test('COLD LOAD: the address alone opens the panel, with the programme behind it (FR-203, SC-207)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title, href } = await firstSession(page)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A fresh navigation to the panel's address, with no prior programme fetch in this
    // document. The programme's own loading state runs and the panel opens once it resolves —
    // the panel does not fetch the session separately, which is what keeps one source of truth
    // for session data (research D4).
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page.goto(href)

    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { level: 2, name: title })).toBeVisible()

    // Not an empty destination behind it, and not an error.
    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'All sessions' })).toBeAttached()
  })

  test('refuses a session from another conference, disclosing nothing (FR-204)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    // A well-formed address naming a session that is not in the active conference. The seeded
    // programmes are disjoint, so this is the shared-link case from the spec's Edge Cases.
    await page.goto('/agenda/00000000-0000-4000-8000-000000000000')

    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(/not available to you/i)

    // And it must not reveal whether the session exists, nor name another conference.
    await expect(panel).not.toContainText(/another conference|does not exist|no such/i)
  })

  test('is a full-width overlay at 320px, with no horizontal scrolling (FR-199, SC-211)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    await signIn(page, ADA)
    await goToAgenda(page)

    const { title } = await firstSession(page)
    await page.getByRole('link', { name: title }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, 'the panel must not push the document wider than the viewport').toBe(false)

    // Full width at mobile: the panel spans essentially the whole viewport rather than
    // floating as a narrow card.
    const box = await page.getByRole('dialog').boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(300)
  })
})
