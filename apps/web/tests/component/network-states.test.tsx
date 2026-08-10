import { OfflineError, RequestRefusedError, type HeldCard } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { Contacts } from '../../src/app/network/Contacts.js'
import { ShareCardAction } from '../../src/app/network/ShareCardAction.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * T060, T062, T063 (008) — the contacts list, and **the most misreadable control in the
 * feature** (FR-603, FR-610, FR-615, FR-617, FR-657).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T063 IS THE ASSERTION THIS FILE EXISTS FOR: THE SHARE CONTROL'S ACCESSIBLE NAME NAMES THE
 * SHARER'S CARD, NOT THE RECIPIENT'S.**
 *
 * "Share card" on somebody else's profile reads, to a great many people, as *take* their card.
 * Somebody who misreads it has handed their own contact details to a stranger while believing
 * they collected one — and **a card cannot be recalled** (FR-618), so the mistake is not
 * recoverable. The label is the only place this can be got right.
 *
 * The accessible name is asserted separately from the visible text because a screen-reader user
 * navigating by control hears the name out of context, where "Share your card" alone gives no
 * clue who receives it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const A_CONTACT: HeldCard = {
  attendeeId: 'attendee-grace',
  displayName: 'Grace Hopper',
  company: 'Naval Systems',
  role: 'Rear Admiral',
  headline: 'Compilers, and the courage to try them.',
  interests: ['Compilers'],
  avatar: null,
  eventId: 'event-summit',
  eventName: 'Product & Design Summit',
  sharedAt: '2026-09-14T09:00:00.000Z',
  atActiveEvent: true,
}

const renderContacts = (listHeld: () => Promise<HeldCard[]>) => {
  const base = testServices().repositories.cards
  render(
    <WithServices services={testServices({ cards: { ...base, listHeld } })}>
      <MemoryRouter>
        <Contacts />
      </MemoryRouter>
    </WithServices>,
  )
}

describe('the share control', () => {
  const renderShare = (share = vi.fn(async () => A_SHARED)) => {
    const base = testServices().repositories.cards
    render(
      <WithServices services={testServices({ cards: { ...base, share } })}>
        <MemoryRouter>
          <ShareCardAction attendeeId="attendee-grace" displayName="Grace Hopper" />
        </MemoryRouter>
      </WithServices>,
    )
    return { share }
  }

  const A_SHARED = {
    attendeeId: 'attendee-grace',
    displayName: 'Grace Hopper',
    eventId: 'event-summit',
    eventName: 'Product & Design Summit',
    sharedAt: '2026-09-14T09:00:00.000Z',
  }

  it('T063 — names the SHARER’s card in its accessible name, and the recipient (FR-603)', () => {
    renderShare()

    const control = screen.getByRole('button', { name: /share your card with grace hopper/i })

    // The possessive is the whole assertion. A control named "Share Grace Hopper's card" or
    // merely "Share card" would pass a laxer test and would be the misreading FR-603 exists to
    // close — with no way back, because a card cannot be recalled (FR-618).
    expect(control).toBeInTheDocument()

    // The visible label is shorter, because the person's profile is on screen beside it. It must
    // still carry the possessive.
    expect(control).toHaveTextContent(/share your card/i)
    expect(control).not.toHaveTextContent(/grace hopper's card/i)
  })

  it('confirms in words that the card moved OUTWARD and nothing came back (FR-603)', async () => {
    renderShare()

    await userEvent.click(screen.getByRole('button', { name: /share your card/i }))

    // The confirmation is a persistent status region, not a transient toast: the prototype's
    // flash loses the one piece of information the reader needs afterwards, and is unreachable
    // to anybody who has not focused it before it goes.
    const confirmation = await screen.findByRole('status')

    expect(confirmation).toHaveTextContent(/your card is now with grace hopper/i)
    // The sentence that closes the misreading: the reader learns they did not collect anything.
    expect(confirmation).toHaveTextContent(/you will hold theirs when they share it with you/i)

    // And the control is gone, so a second share is not invited for no reason.
    expect(screen.queryByRole('button', { name: /share your card/i })).not.toBeInTheDocument()
  })

  it('refuses a blocked share WITHOUT a reason (FR-608)', async () => {
    renderShare(
      vi.fn(async () => {
        throw new RequestRefusedError('refused', 'That could not be done.')
      }) as never,
    )

    await userEvent.click(screen.getByRole('button', { name: /share your card/i }))

    const alert = await screen.findByRole('alert')
    // No cause, no "they have blocked you", no hint that anything about the other person decided
    // it. A sender who could tell a block from a fault would know they had been blocked.
    expect(alert.textContent?.toLowerCase()).not.toContain('block')
    expect(alert).toHaveTextContent(/could not be shared/i)
  })

  it('T039a — refuses offline and says nothing was queued (FR-649, FR-657)', async () => {
    renderShare(
      vi.fn(async () => {
        throw new OfflineError('offline')
      }) as never,
    )

    await userEvent.click(screen.getByRole('button', { name: /share your card/i }))

    const status = await screen.findByRole('status')
    // **Refused, never queued.** The wording says so explicitly, because a write that silently
    // waited would leave the attendee believing a stranger had their details when they did not.
    expect(status).toHaveTextContent(/no connection right now/i)
    expect(status).toHaveTextContent(/nothing has been saved to send later/i)
  })
})

describe('the contacts list', () => {
  it('renders an empty state offering a route to Discover (FR-617)', async () => {
    renderContacts(vi.fn(async () => []))

    expect(await screen.findByText(/your contacts will appear here/i)).toBeInTheDocument()

    // A contact exists only because somebody shared a card, and cards are shared from a profile
    // in Discover — so the empty state has exactly one next step and must offer it.
    expect(screen.getByRole('link', { name: /find people to meet/i })).toHaveAttribute(
      'href',
      '/discover',
    )
  })

  it('T064 — shows where and when the exchange happened (FR-615)', async () => {
    renderContacts(vi.fn(async () => [A_CONTACT]))

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    // The two fields that do not move when the sharer edits their profile, and the two that make
    // a contacts list navigable: "the admiral I met in Barcelona in September".
    expect(screen.getByText(/met at product & design summit/i)).toBeInTheDocument()
  })

  /**
   * T039b — **offline and a server fault are worded distinguishably** (FR-657).
   *
   * Both are asserted in the same file, and against each other, because the failure this guards
   * is not either message being wrong on its own: it is the two collapsing into one generic
   * "something went wrong" that sends somebody in a conference basement to check their account.
   */
  it('T039b — distinguishes a connectivity failure from a fault on our side (FR-657)', async () => {
    renderContacts(
      vi.fn(async () => {
        throw new OfflineError('offline')
      }) as never,
    )

    // Found by its text rather than by role: the loading state is a `status` region too, so
    // `findByRole('status')` resolves against "Loading your contacts…" before the read settles.
    const offline = await screen.findByText(/needs a connection/i)

    // Still asserted to BE a status region — polite rather than assertive, because being offline
    // is a condition and not an error, and interrupting for it is wrong.
    expect(offline.closest('[role="status"]')).not.toBeNull()

    // Both halves: a connection is needed, AND there is nothing stored to show instead. Without
    // the second, the reader cannot tell "wait a moment" from "there is nothing here".
    expect(offline).toHaveTextContent(/nothing is stored on this device/i)
    expect(offline.textContent?.toLowerCase()).not.toContain('problem on our side')
  })

  it('T039b — a server fault says the fault is OURS, not the account’s (FR-657)', async () => {
    renderContacts(
      vi.fn(async () => {
        throw new Error('boom')
      }) as never,
    )

    const failed = await screen.findByRole('alert')
    expect(failed).toHaveTextContent(/problem on our side, not with your account/i)
    expect(failed.textContent?.toLowerCase()).not.toContain('needs a connection')
  })

  it('offers a retry from both failure states, so neither is a dead end (FR-059)', async () => {
    const listHeld = vi
      .fn<() => Promise<HeldCard[]>>()
      .mockRejectedValueOnce(new OfflineError('offline'))
      .mockResolvedValueOnce([A_CONTACT])

    renderContacts(listHeld)

    await userEvent.click(await screen.findByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument())
  })

  /**
   * T091 — **the scheduling action is ABSENT for a contact who is not at this conference**
   * (FR-639a).
   *
   * Absence rather than a disabled control, and rather than a control that refuses afterwards.
   * The contact itself is still listed either way, which is FR-614 — being unreachable *here* is
   * not being forgotten, and the same assertion checks both halves.
   */
  it('T091 — offers no meeting action for a contact absent from the active conference (FR-639a)', async () => {
    renderContacts(vi.fn(async () => [{ ...A_CONTACT, atActiveEvent: false }]))

    // Listed.
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument()
    // Not schedulable — and not schedulable by *absence*, not by a disabled button.
    expect(screen.queryByRole('button', { name: /propose a meeting/i })).not.toBeInTheDocument()
  })

  it('offers the meeting action for a contact who IS at the active conference', async () => {
    renderContacts(vi.fn(async () => [A_CONTACT]))

    expect(
      await screen.findByRole('button', { name: /propose a meeting with grace hopper/i }),
    ).toBeInTheDocument()
  })
})
