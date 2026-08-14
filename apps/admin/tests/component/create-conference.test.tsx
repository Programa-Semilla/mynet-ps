import { ApiError } from '@mynet/data/http'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { CreateConferenceDialog } from '../../src/app/conferences/CreateConferenceDialog.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { identity, stubServices } from '../support/services.js'

/**
 * T088 (014) — creating a conference: validation, failure, and the code on success (FR-1007–
 * FR-1009).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE CODE IS SHOWN ONCE, AND THIS IS THE TEST THAT KEEPS IT SHOWN.**
 *
 * 015 owns join-code management — rotating, revoking, viewing — so within 014 this dialog is the
 * **one moment** a newly minted code is presented. A conference nobody can join is a conference
 * nobody attends, and the failure mode is silent: creation succeeds, the dialog closes, and the
 * organizer has a conference with a code they never saw. It is also on the programme editor for
 * exactly that reason, and `programme-editor.test.tsx` asserts it there.
 *
 * The success state is a **second state of the same dialog** rather than a toast, because a toast
 * is dismissible by time — and an eight-character code that vanishes on a timer is a code
 * somebody is going to lose.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE INCOMPLETE FORM DISABLES THE CONFIRMATION; IT DOES NOT ERROR AFTERWARDS.**
 *
 * That is the treatment `requirements.md` names for the empty message and the empty meeting
 * topic, applied here. Presenting the rule is not enforcing it, so the server refuses these
 * too — the client-side rule exists so nobody is told "no" after committing to an action.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const renderDialog = (services: ReturnType<typeof stubServices>, onCreated = vi.fn()) => {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <AdminSessionProvider services={services}>
        <CreateConferenceDialog open onClose={onClose} onCreated={onCreated} />
      </AdminSessionProvider>
    </MemoryRouter>,
  )
  return { onClose, onCreated }
}

/** Fills every field with a valid conference. */
const fillIn = async (
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{ startsOn: string; endsOn: string }> = {},
) => {
  await user.type(screen.getByLabelText('Name'), 'A New Conference')
  await user.type(screen.getByLabelText('Location'), 'A Venue')
  await user.type(screen.getByLabelText('First day'), overrides.startsOn ?? '2028-05-01')
  await user.type(screen.getByLabelText('Last day'), overrides.endsOn ?? '2028-05-03')
}

describe('creating a conference', () => {
  it('disables the confirmation until every field is filled (never an error afterwards)', async () => {
    const user = userEvent.setup()
    const services = stubServices({ session: { me: async () => identity('organizer') } })
    renderDialog(services)

    const create = screen.getByRole('button', { name: 'Create' })
    expect(create).toBeDisabled()

    await user.type(screen.getByLabelText('Name'), 'A New Conference')
    expect(create, 'a name alone is not a conference').toBeDisabled()

    await fillIn(user)
    expect(create).toBeEnabled()
  })

  it('refuses a range that ends before it starts, by disabling rather than by explaining', async () => {
    const user = userEvent.setup()
    const services = stubServices({ session: { me: async () => identity('organizer') } })
    renderDialog(services)

    await fillIn(user, { startsOn: '2028-05-05', endsOn: '2028-05-01' })

    // The server refuses this too (400, `ends-before-start`). The client rule exists so nobody is
    // told "no" after committing to the action, which is the same reason the composer's post
    // control is disabled on an empty question.
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the join code on success, with what it is and is not (FR-1009)', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        createConference: async () => ({ id: 'event-9', joinCode: 'MYNET234' }),
      },
    })
    const { onCreated } = renderDialog(services)

    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('MYNET234')).toBeInTheDocument()

    // Said where somebody would otherwise guess: a join code is not a credential. Holding one
    // gets registration and nothing else, which is why it is committed in a public repository's
    // seed and printed here in plain text.
    expect(screen.getByText(/not a password/i)).toBeInTheDocument()

    // The list behind the dialog is told to re-read, or the new conference is invisible until a
    // reload — a conference that exists and cannot be seen is the worst of the outcomes here.
    expect(onCreated).toHaveBeenCalled()
  })

  it('does not close on success — the code would go with it', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { createConference: async () => ({ id: 'event-9', joinCode: 'MYNET234' }) },
    })
    const { onClose } = renderDialog(services)

    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText('MYNET234')

    expect(
      onClose,
      'The dialog closed on success. This is the one moment 014 presents the minted code — 015 ' +
        'owns viewing it — so closing here means the organizer has a conference with a code ' +
        'they never saw.',
    ).not.toHaveBeenCalled()

    // And it closes when they say so, having read it.
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces a refusal as an alert and keeps what was typed', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        createConference: async () => {
          throw new ApiError(429, { code: 'too_many_attempts', retryAfterSeconds: 3 })
        },
      },
    })
    renderDialog(services)

    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Create' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/too many attempts/i)

    // The form survives the refusal. Clearing it would make a throttled attempt cost the
    // organizer everything they typed — 009's defect 3, in a different form.
    expect(screen.getByLabelText('Name')).toHaveValue('A New Conference')
    expect(screen.getByLabelText('Location')).toHaveValue('A Venue')
    expect(screen.queryByText('MYNET234')).not.toBeInTheDocument()
  })

  it('renders no join code when creation failed', async () => {
    const user = userEvent.setup()
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        createConference: async () => {
          throw new ApiError(404, { code: 'not_found' })
        },
      },
    })
    const { onCreated } = renderDialog(services)

    await fillIn(user)
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await screen.findByRole('alert')
    // Still the form, not the success state — and the list is not told to re-read for a
    // conference that does not exist.
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('warns that the timezone freezes, before the first refusal rather than after (FR-1015)', () => {
    const services = stubServices({ session: { me: async () => identity('organizer') } })
    renderDialog(services)

    expect(
      screen.getByText(/only be changed while the conference has no sessions/i),
    ).toBeInTheDocument()
  })
})
