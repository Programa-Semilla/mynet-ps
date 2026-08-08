import { OfflineError, type VisibleProfile } from '@mynet/data'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { anAttendee, renderDiscover } from '../support/discover.js'

/**
 * T083, T084 (006) — the co-attendee profile view (FR-431–FR-434).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **READ THIS BEFORE TRUSTING THE MODALITY ASSERTIONS.**
 *
 * The focus trap and the background inertness are **browser** guarantees that come from
 * `showModal()` putting the dialog in the top layer — and **jsdom implements none of it**.
 * `tests/setup.ts` supplies a shim that deliberately does not emulate the trap, precisely so a
 * component test cannot appear to assert it.
 *
 * So what is asserted here is **our own wiring**: that the dialog is opened with `showModal()`
 * rather than `show()`, that Escape reaches the same close path as the button, and that we
 * restore focus to the opener — which the platform does *not* do reliably and which is
 * therefore genuinely this feature's code. The trap itself is proved in a real browser by
 * `e2e/discover.spec.ts`.
 *
 * **This is a deliberate strengthening of what 004's dialog tests did.** Those used
 * `getByRole('dialog', { hidden: true })`, which proves the element is *mounted* — it passes
 * just as happily against a dialog that was never opened at all, or opened with `show()`. The
 * `data-modal` assertion below is what distinguishes the two, and it is the distinction the
 * whole guarantee rests on.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const ATTENDEE_ID = '11111111-1111-4111-8111-111111111111'

const PROFILE: VisibleProfile = {
  attendeeId: ATTENDEE_ID,
  displayName: 'Sofía Muñoz',
  company: 'Peña & Asociados',
  role: 'Designer',
  headline: 'Design systems for large teams.',
  networkingIntent: 'open_to_meetings',
  availability: 'available',
  interests: ['Design systems', 'Accessibility', 'Typography'],
  hasAvatar: false,
}

const withProfile = (
  profile: VisibleProfile | null = PROFILE,
  extra: { readonly avatar?: string | null; readonly failWith?: Error } = {},
) => ({
  directory: {
    list: async () => ({ attendees: [anAttendee({ attendeeId: ATTENDEE_ID })], nextCursor: null }),
    get: async (): Promise<VisibleProfile | null> => {
      if (extra.failWith) throw extra.failWith
      return profile
    },
    readAvatar: async (): Promise<string | null> => extra.avatar ?? null,
  },
})

describe('the profile view is a real modal (FR-433)', () => {
  const open = async () => {
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })
    await screen.findByRole('heading', { level: 2, name: 'Sofía Muñoz' })
  }

  it('is a real <dialog>, which is what the browser applies the trap to', async () => {
    await open()

    const dialog = screen.getByRole('dialog')
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
  })

  it('was opened with showModal(), not show() — the trap follows from that choice', async () => {
    await open()

    // `show()` renders a non-modal dialog: no top layer, no inertness, and a Tab walks straight
    // out into the directory behind. The distinction is the whole guarantee, and a mounted-only
    // assertion cannot see it.
    expect(screen.getByRole('dialog')).toHaveAttribute('data-modal', 'true')
  })

  it('names itself, so the region is announced when focus enters it', async () => {
    await open()

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Sofía Muñoz')
  })

  it('contains its own focusable close control, so the trap is never a dead end', async () => {
    await open()

    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('button[aria-label="Close profile"]')).not.toBeNull()
  })

  it('dismisses on Escape, leaving the same state the close button does', async () => {
    const user = userEvent.setup()
    await open()

    await user.keyboard('{Escape}')

    // Escape and the button must reach one close path. Without that, Escape would close the
    // dialog while the address still named an attendee — and the next render would re-open it.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('dismisses on the close button', async () => {
    const user = userEvent.setup()
    await open()

    await user.click(screen.getByRole('button', { name: /close profile/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /**
   * FR-433's third clause, and the one the platform does not give.
   *
   * `<dialog>` does not restore focus to the opener reliably across engines, so this feature
   * does it explicitly — and the **order** matters: while the dialog is modal everything behind
   * it is inert, and an inert element cannot take focus. Restoring before closing succeeds
   * silently and leaves a keyboard reader at the top of the document.
   */
  it('restores focus to the card that opened it', async () => {
    const user = userEvent.setup()
    renderDiscover({ overrides: withProfile() })

    const opener = await screen.findByRole('link', { name: 'Sofía Muñoz' })
    await user.click(opener)
    await screen.findByRole('heading', { level: 2, name: 'Sofía Muñoz' })

    await user.click(screen.getByRole('button', { name: /close profile/i }))

    await waitFor(() => expect(opener).toHaveFocus())
  })
})

describe('the profile view renders what 004 authored (FR-432)', () => {
  it('shows the profile fields and the FULL interest set', async () => {
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('Designer · Peña & Asociados'))

    expect(dialog).toHaveTextContent('Design systems for large teams.')
    expect(dialog).toHaveTextContent('Available')
    expect(dialog).toHaveTextContent('Open to meetings')
    // All three, not the subset a card might truncate to.
    for (const interest of PROFILE.interests) {
      expect(dialog).toHaveTextContent(interest)
    }
  })

  it('never shows an email address or verification state (FR-406)', async () => {
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('Designer · Peña & Asociados'))

    expect(dialog.textContent).not.toMatch(/@/)
    expect(dialog.textContent).not.toMatch(/verif/i)
  })

  /**
   * FR-431 — **one refusal for four causes.**
   *
   * The server answers *not registered*, *does not exist*, *not discoverable* and *not verified*
   * identically, so this view has nothing to tell them apart with. The assertion is therefore
   * as much about what is absent as about what is present: a message naming any one cause would
   * be information invented on the client about data the server refused to disclose.
   */
  it('refuses indistinguishably when the attendee is not available (FR-431)', async () => {
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile(null) })

    const refusal = await screen.findByRole('alert')
    expect(refusal).toHaveTextContent(/not available to you/i)
    expect(refusal).not.toHaveTextContent(/discoverab|verif|does not exist|another conference/i)
  })

  it('says a connection is needed, distinguishably from a fault on our side', async () => {
    renderDiscover({
      at: `/discover/${ATTENDEE_ID}`,
      overrides: withProfile(PROFILE, { failWith: new OfflineError('This profile') }),
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/needs a connection/i)
    expect(alert).not.toHaveTextContent(/problem on our side/i)
  })

  it('says a fault is ours, distinguishably from being offline', async () => {
    renderDiscover({
      at: `/discover/${ATTENDEE_ID}`,
      overrides: withProfile(PROFILE, { failWith: new Error('server fault') }),
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/problem on our side/i)
    expect(alert).not.toHaveTextContent(/needs a connection/i)
  })
})

/**
 * T084 — **no 007 or 008 action ships, in any form** (FR-434).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Not present-but-disabled, not present-and-inert, not present-with-a-tooltip. A disabled
 * control is an affordance for a capability that does not exist: the reader presses it and
 * learns the product is broken rather than that the feature is not built yet.
 *
 * The assertion covers both the card and the profile view, because the prototype puts all three
 * actions on the card and it is the card a reviewer looks at first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('no messaging, card-sharing or scheduling control ships (FR-434)', () => {
  const FORBIDDEN = /message|send a message|share card|business card|schedule|book a meeting/i

  it('the profile view carries none of them, enabled or disabled', async () => {
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('Designer · Peña & Asociados'))

    const controls = [...dialog.querySelectorAll('button'), ...dialog.querySelectorAll('a')]
    const offending = controls
      .map((control) => control.textContent?.trim() ?? '')
      .filter((label) => FORBIDDEN.test(label))

    expect(
      offending,
      '007 builds messaging and 008 builds card-sharing and appointments. Shipping any of them ' +
        'now — even disabled — is an affordance for a capability that does not exist (FR-434).',
    ).toEqual([])
  })

  it('the card carries none of them either', async () => {
    renderDiscover({ overrides: withProfile() })

    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = heading.closest('li') as HTMLElement

    const offending = [...card.querySelectorAll('button'), ...card.querySelectorAll('a')]
      .map((control) => control.textContent?.trim() ?? '')
      .filter((label) => FORBIDDEN.test(label))

    expect(offending).toEqual([])
  })

  it('the card offers exactly one action: opening the profile', async () => {
    renderDiscover({ overrides: withProfile() })

    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = heading.closest('li') as HTMLElement

    // One interactive element, so a keyboard user gets one stop per card and a screen-reader
    // user hears the name once rather than twice.
    expect(card.querySelectorAll('a, button')).toHaveLength(1)
    expect(card.querySelector('a')).toHaveAttribute('href', `/discover/${ATTENDEE_ID}`)
  })
})
