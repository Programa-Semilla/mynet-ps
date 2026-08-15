import { OfflineError, type VisibleProfile } from '@mynet/data'
import { screen, waitFor, within } from '@testing-library/react'
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
  sector: null,
  subsector: null,
  productiveActivity: null,
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

  /**
   * T179 (014 tranche 2) — **an unset taxonomy field is ABSENT, and a set one is present**
   * (FR-1092). Both halves in one file, because the absence half alone is vacuously green
   * against a component that renders nothing at all.
   */
  it('shows no line, placeholder or dash for an unset taxonomy field (FR-1092)', async () => {
    // PROFILE's sector, subsector and productiveActivity are all null.
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('Designer · Peña & Asociados'))

    // No label rendered against nothing, and no placeholder for it either. The em-dash the
    // rule names is checked as a standalone token, because the headline legitimately may
    // contain one inside prose.
    expect(dialog.textContent).not.toMatch(/sector/i)
    expect(dialog.textContent).not.toMatch(/not (set|stated|specified)/i)
    expect(dialog.textContent).not.toMatch(/(^|\s)[—–-](\s|$)/)
  })

  it('shows sector, subsector and the activity description where they are set (FR-1090)', async () => {
    renderDiscover({
      at: `/discover/${ATTENDEE_ID}`,
      overrides: withProfile({
        ...PROFILE,
        sector: 'Servicios',
        subsector: 'Consultoría',
        productiveActivity: 'Asesoría contable para pymes.',
      }),
    })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('Servicios · Consultoría'))
    expect(dialog).toHaveTextContent('Asesoría contable para pymes.')
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
 * T084 (006), amended by T045 (007) — **an action ships only once the phase that owns it has
 * landed** (FR-434, FR-568).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE'S ASSERTION CHANGED, AND THE CHANGE IS THE ARRANGEMENT WORKING RATHER THAN A
 * WEAKENED TEST.**
 *
 * 006 asserted that *no* messaging, card-sharing or scheduling control existed anywhere, because
 * none of those capabilities did. The rule it was enforcing is FR-434's: not
 * present-but-disabled, not present-and-inert, not present-with-a-tooltip — a disabled control is
 * an affordance for a capability that does not exist, and the reader who presses it learns the
 * product is broken rather than that the feature is not built.
 *
 * 007 builds messaging. So the *Message* action is now real, and asserting its absence would
 * assert the opposite of FR-568. What has not changed is the rule: **card-sharing and scheduling
 * are still 008's, and still must not appear in any form** — and the card must still carry
 * exactly one action, because the messaging entry point belongs on the profile rather than on
 * every row of a grid.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('only the actions whose phase has landed ship (FR-434, FR-568)', () => {
  /** 008's, and still forbidden. `message` is deliberately absent from this pattern now. */
  const FORBIDDEN = /share card|business card|schedule|book a meeting|add contact/i

  it('the profile view carries no 008 action, enabled or disabled', async () => {
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('Designer · Peña & Asociados'))

    const controls = [...dialog.querySelectorAll('button'), ...dialog.querySelectorAll('a')]
    const offending = controls
      .map((control) => control.textContent?.trim() ?? '')
      .filter((label) => FORBIDDEN.test(label))

    expect(
      offending,
      '008 builds card-sharing and appointments. Shipping either now — even disabled — is an ' +
        'affordance for a capability that does not exist (FR-434).',
    ).toEqual([])
  })

  it('the profile view DOES carry the message action, and it addresses the new-thread route', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // FR-568, and the other half of FR-434: the action appears now that its owning phase has
    // landed. It is a link rather than a button because the thread is an addressable surface
    // (FR-569), and it points at `new/<attendeeId>` — the address that deliberately creates
    // nothing until a message is actually sent (FR-503a).
    // ───────────────────────────────────────────────────────────────────────────────────────
    renderDiscover({ at: `/discover/${ATTENDEE_ID}`, overrides: withProfile() })

    const dialog = await screen.findByRole('dialog')
    const action = await within(dialog).findByRole('link', { name: /message sofía muñoz/i })

    expect(action).toHaveAttribute('href', `/messages/new/${ATTENDEE_ID}`)
  })

  it('the card carries no action of either kind — including messaging', async () => {
    renderDiscover({ overrides: withProfile() })

    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = heading.closest('li') as HTMLElement

    // The messaging entry point belongs on the profile, not on every row of a grid: one action
    // per card is what keeps a keyboard user at one stop per person (asserted below).
    const offending = [...card.querySelectorAll('button'), ...card.querySelectorAll('a')]
      .map((control) => control.textContent?.trim() ?? '')
      .filter((label) => FORBIDDEN.test(label) || /message/i.test(label))

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
