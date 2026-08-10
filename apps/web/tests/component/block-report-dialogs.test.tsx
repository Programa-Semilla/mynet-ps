import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { A_COUNTERPART, aMessage, renderMessages } from '../support/messages.js'

/**
 * T074 (007) — the block and report dialogs (FR-535, FR-539, FR-546, FR-583).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE MODAL OBLIGATIONS ARE SETTLED REQUIREMENTS, NOT PREFERENCES.**
 *
 * The register records that the approved prototype implements neither Escape handling nor visible
 * focus states, and that this is *a defect to fix* rather than an open question (Principle IV).
 * 004 and 005 built the treatment; these dialogs inherit it by reusing `ConfirmDialog` rather than
 * writing a second `<dialog>` — which is itself the point, because a duplicate would be a second
 * place for the focus-restoration ordering to be got wrong.
 *
 * **Focus restoration is the assertion that matters most**, and the ordering it depends on is
 * invisible in the source: while a dialog is modal everything behind it is *inert*, and an inert
 * element cannot take focus — so restoring before closing succeeds silently and leaves a keyboard
 * reader at the top of the document. jsdom does not implement inertness, so this test cannot
 * prove the ordering; what it proves is that focus lands back on the opener at all, which is the
 * half that regresses when somebody forgets the `returnFocusTo` prop entirely.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

const openThread = () =>
  renderMessages({
    at: THREAD,
    pages: [
      {
        messages: [aMessage({ body: 'Something worth reporting.' })],
        nextCursor: null,
        state: 'open',
        counterpart: A_COUNTERPART,
      },
    ],
  })

describe('the block confirmation', () => {
  it('is reached from the thread header, by a control that names the person', async () => {
    const user = userEvent.setup()
    openThread()

    const control = await screen.findByRole('button', { name: /block sofía muñoz/i })
    await user.click(control)

    expect(await screen.findByRole('dialog')).toHaveTextContent(/block sofía muñoz\?/i)
  })

  it('says what blocking does AND what it does not do (FR-535, FR-538)', async () => {
    const user = userEvent.setup()
    openThread()

    await user.click(await screen.findByRole('button', { name: /block sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')

    expect(dialog, 'they are not told').toHaveTextContent(/not told/i)
    expect(
      dialog,
      'A confirmation that only asks "are you sure?" leaves the attendee to guess whether they ' +
        'are about to delete a conversation. They are not.',
    ).toHaveTextContent(/nothing is deleted/i)
  })

  it('DISMISSES ON ESCAPE and returns focus to the control that opened it (FR-583)', async () => {
    const user = userEvent.setup()
    openThread()

    const control = await screen.findByRole('button', { name: /block sofía muñoz/i })
    await user.click(control)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      control,
      'Focus must return to the opener. `<dialog>` does not do it reliably, which is why the ' +
        'treatment restores it explicitly — and why dropping the prop is a silent regression.',
    ).toHaveFocus()
  })

  it('dismisses on the close control, by the same path', async () => {
    const user = userEvent.setup()
    openThread()

    const control = await screen.findByRole('button', { name: /block sofía muñoz/i })
    await user.click(control)

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(control).toHaveFocus()
  })

  it('blocks through the repository when confirmed', async () => {
    const user = userEvent.setup()
    const blocked: string[] = []
    renderMessages({
      at: THREAD,
      pages: [
        { messages: [aMessage()], nextCursor: null, state: 'open', counterpart: A_COUNTERPART },
      ],
      overrides: {
        blocks: {
          list: async () => [],
          block: async (attendeeId: string) => {
            blocked.push(attendeeId)
          },
          unblock: async () => {},
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: /block sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^block$/i }))

    await waitFor(() => expect(blocked).toEqual([A_COUNTERPART.attendeeId]))
  })
})

describe('the report dialog', () => {
  it('DISABLES its confirmation while the reason is empty (FR-546)', async () => {
    const user = userEvent.setup()
    openThread()

    await user.click(await screen.findByRole('button', { name: /report sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')

    expect(
      within(dialog).getByRole('button', { name: /report and block/i }),
      'A disabled confirmation, never an error after submission — `requirements.md` names the ' +
        'treatment, and this is a moment when the attendee is already upset.',
    ).toBeDisabled()
  })

  it('stays disabled for a whitespace-only reason', async () => {
    const user = userEvent.setup()
    openThread()

    await user.click(await screen.findByRole('button', { name: /report sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByRole('textbox', { name: /what happened/i }), '    ')

    expect(within(dialog).getByRole('button', { name: /report and block/i })).toBeDisabled()
  })

  it('enables as soon as there is a reason', async () => {
    const user = userEvent.setup()
    openThread()

    await user.click(await screen.findByRole('button', { name: /report sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')

    await user.type(
      within(dialog).getByRole('textbox', { name: /what happened/i }),
      'They kept messaging after I asked them to stop.',
    )

    expect(within(dialog).getByRole('button', { name: /report and block/i })).toBeEnabled()
  })

  it('says BEFORE the attendee commits that reporting also blocks (FR-544)', async () => {
    const user = userEvent.setup()
    openThread()

    await user.click(await screen.findByRole('button', { name: /report sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')

    expect(
      dialog,
      'A real consequence and a surprising one. Telling them afterwards would be telling them ' +
        'about something they did not choose.',
    ).toHaveTextContent(/also.*blocks them/i)
  })

  it('promises nothing it cannot keep (FR-548)', async () => {
    const user = userEvent.setup()
    openThread()

    await user.click(await screen.findByRole('button', { name: /report sofía muñoz/i }))
    const dialog = await screen.findByRole('dialog')

    expect(dialog).toHaveTextContent(/a person will read this/i)
    expect(
      dialog,
      'No case identifier, no status, nothing to check back on — because there is no route that ' +
        'would answer any of them, and promising a review inside the product would be promising ' +
        'the surface FR-548 forbids building, in copy.',
    ).toHaveTextContent(/nothing to check back on/i)
  })

  it('submits the reason and the messages on screen, and returns focus', async () => {
    const user = userEvent.setup()
    const submitted: { attendeeId: string; reason: string; messageIds: readonly string[] }[] = []

    renderMessages({
      at: THREAD,
      pages: [
        {
          messages: [aMessage({ messageId: 'msg-1', body: 'Something worth reporting.' })],
          nextCursor: null,
          state: 'open',
          counterpart: A_COUNTERPART,
        },
      ],
      overrides: {
        reports: {
          submit: async (report) => {
            submitted.push(report)
          },
        },
      },
    })

    const control = await screen.findByRole('button', { name: /report sofía muñoz/i })
    await user.click(control)

    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByRole('textbox', { name: /what happened/i }),
      '  Unwanted.  ',
    )
    await user.click(within(dialog).getByRole('button', { name: /report and block/i }))

    await waitFor(() => expect(submitted).toHaveLength(1))
    // Trimmed, matching the server, which trims before storing.
    expect(submitted[0]?.reason).toBe('Unwanted.')
    expect(submitted[0]?.attendeeId).toBe(A_COUNTERPART.attendeeId)
    expect(
      submitted[0]?.messageIds,
      'Every message on screen, so the reporter is not asked to select individually at the ' +
        'moment they are reporting conduct.',
    ).toEqual(['msg-1'])

    await waitFor(() => expect(control).toHaveFocus())
  })

  it('dismisses on Escape and returns focus (FR-583)', async () => {
    const user = userEvent.setup()
    openThread()

    const control = await screen.findByRole('button', { name: /report sofía muñoz/i })
    await user.click(control)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(control).toHaveFocus()
  })
})

describe('the blocked composer state (FR-539)', () => {
  const blockedThread = () =>
    renderMessages({
      at: THREAD,
      pages: [
        {
          messages: [aMessage()],
          nextCursor: null,
          state: 'blocked',
          counterpart: A_COUNTERPART,
        },
      ],
    })

  it('replaces the composer with an explanation and an unblock action', async () => {
    blockedThread()

    expect(await screen.findByText(/you blocked sofía muñoz/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /send message/i }),
      'A greyed-out send with no words is exactly what FR-539 forbids.',
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unblock sofía muñoz/i })).toBeInTheDocument()
  })

  it('says that nothing was deleted, which is the question the attendee actually has', async () => {
    blockedThread()

    expect(await screen.findByText(/nothing was deleted/i)).toBeInTheDocument()
  })

  it('unblocks EXACTLY that person, never everybody', async () => {
    const user = userEvent.setup()
    const released: string[] = []

    renderMessages({
      at: THREAD,
      pages: [
        { messages: [aMessage()], nextCursor: null, state: 'blocked', counterpart: A_COUNTERPART },
      ],
      overrides: {
        blocks: {
          list: async () => [],
          block: async () => {},
          unblock: async (attendeeId: string) => {
            released.push(attendeeId)
          },
        },
      },
    })

    await user.click(await screen.findByRole('button', { name: /unblock sofía muñoz/i }))

    await waitFor(() =>
      expect(
        released,
        'Blocks are directional and independent (FR-540). Releasing more than the attendee asked ' +
          'to release would undo refusals they made about other people entirely.',
      ).toEqual([A_COUNTERPART.attendeeId]),
    )
  })
})
