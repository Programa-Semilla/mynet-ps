import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SessionForm } from '../../src/app/conferences/SessionForm.js'
import { adminSession, programme } from '../support/services.js'

/**
 * T141, T192 (014 tranche 2) — the session form's conditional fields (FR-1050a, FR-1053,
 * FR-1055, FR-1062a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **WHICH FIELDS EXIST IS THE ASSERTION, IN BOTH DIRECTIONS.**
 *
 * FR-1062a says a mandatory session carries neither a capacity nor a closing offset "and
 * neither MUST be presented on it" — a field that is meaningless on the kind being edited is a
 * field somebody will fill in. FR-1050a's forbidding half has the same presentation: an
 * in-person conference's form has NO joining-link field at all, and a virtual conference's has
 * no room. A test that only found the fields present on the permitting side would pass against
 * a form that rendered everything always, which is exactly the drift these rules forbid.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const renderForm = (
  over: Parameters<typeof programme>[0] = {},
  session: Parameters<typeof SessionForm>[0]['session'] = null,
) => {
  const onSubmit = vi.fn()
  render(
    <SessionForm
      programme={programme(over)}
      session={session}
      busy={false}
      failure={null}
      warnings={[]}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  )
  return { onSubmit }
}

describe('capacity and closing offset render only on an optional session (T141, FR-1062a)', () => {
  it('presents neither bound while the kind is mandatory', () => {
    renderForm()

    expect(screen.getByLabelText('Kind')).toHaveValue('mandatory')
    expect(screen.queryByLabelText(/maximum places/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/enrolment closes/i)).not.toBeInTheDocument()
  })

  it('presents both bounds once the kind is optional, and blocks until they are whole numbers', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.selectOptions(screen.getByLabelText('Kind'), 'optional')

    const capacity = screen.getByLabelText(/maximum places/i)
    const offset = screen.getByLabelText(/enrolment closes/i)
    expect(capacity).toBeInTheDocument()
    expect(offset).toBeInTheDocument()

    // The mirror of the server's `capacity_invalid` and `closing_offset_invalid`: a disabled
    // control with the reason beside it, never a post-submit error.
    await user.type(screen.getByLabelText('Title'), 'Bounded Workshop')
    expect(screen.getByRole('button', { name: /add session/i })).toBeDisabled()
    expect(screen.getByText(/maximum number of places/i)).toBeInTheDocument()

    await user.type(capacity, '12')
    await user.type(offset, '2')
    expect(screen.getByRole('button', { name: /add session/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /add session/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'optional', capacity: 12, enrolmentClosingOffsetHours: 2 }),
    )
  })

  it('sends NO bounds after switching back to mandatory, whatever the fields held', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText('Title'), 'Changed My Mind')
    await user.selectOptions(screen.getByLabelText('Kind'), 'optional')
    await user.type(screen.getByLabelText(/maximum places/i), '12')
    await user.type(screen.getByLabelText(/enrolment closes/i), '2')
    await user.selectOptions(screen.getByLabelText('Kind'), 'mandatory')

    await user.click(screen.getByRole('button', { name: /add session/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'mandatory',
        capacity: null,
        enrolmentClosingOffsetHours: null,
      }),
    )
  })
})

describe('the room and the joining link follow the modality (T192, FR-1050a)', () => {
  it('offers NO joining-link field on an in-person conference — the absence is the rule', () => {
    renderForm({ conference: { modality: 'in-person' } })

    expect(screen.getByLabelText('Room')).toBeInTheDocument()
    expect(screen.queryByLabelText(/joining link/i)).not.toBeInTheDocument()
  })

  it('offers NO room on a virtual conference, requires the link, and submits with roomId null', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({
      conference: { modality: 'virtual' },
      rooms: [],
    })

    expect(screen.queryByLabelText('Room')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Title'), 'Remote Keynote')
    // Blocked with the reason beside the control, mirroring `session_needs_room_or_link`.
    expect(screen.getByRole('button', { name: /add session/i })).toBeDisabled()
    expect(screen.getByText(/this conference is virtual/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/joining link/i), 'https://meet.example.com/keynote')
    await user.click(screen.getByRole('button', { name: /add session/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: null, accessLink: 'https://meet.example.com/keynote' }),
    )
  })

  it('offers both on a hybrid conference, with an explicit no-room choice, requiring at least one', async () => {
    const user = userEvent.setup()
    renderForm({ conference: { modality: 'hybrid' } })

    expect(screen.getByLabelText(/joining link/i)).toBeInTheDocument()
    const room = screen.getByLabelText('Room')
    expect(screen.getByRole('option', { name: /no room/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Title'), 'Streamed Panel')
    await user.selectOptions(room, '')
    // Neither a room nor a link: FR-1050's one modality-independent refusal, mirrored.
    expect(screen.getByRole('button', { name: /add session/i })).toBeDisabled()
    expect(screen.getByText(/nobody can attend/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/joining link/i), 'https://meet.example.com/panel')
    expect(screen.getByRole('button', { name: /add session/i })).toBeEnabled()
  })

  it('mirrors the https:-only rule and blocks a javascript: link (FR-1053)', async () => {
    const user = userEvent.setup()
    renderForm({ conference: { modality: 'virtual' }, rooms: [] })

    await user.type(screen.getByLabelText('Title'), 'Remote Keynote')
    await user.type(screen.getByLabelText(/joining link/i), 'javascript:alert(1)')

    expect(screen.getByRole('button', { name: /add session/i })).toBeDisabled()
    expect(screen.getByText(/complete https:\/\/ address/i)).toBeInTheDocument()
  })

  /**
   * T192 (FR-1055) — the disclosure lives where the organizer types, as helper text rather
   * than a dialog: a joining link reads like something private and is not, and there is no
   * draft state between writing and publishing (N4).
   */
  it('tells the organizer the link is published immediately to everyone holding the join code', () => {
    renderForm({ conference: { modality: 'hybrid' } })

    const disclosure = screen.getByText(/published immediately/i)
    expect(disclosure).toHaveTextContent(/join code/i)
    // Attached to the field itself, so assistive technology reads it with the input.
    expect(screen.getByLabelText(/joining link/i)).toHaveAccessibleDescription(
      /published immediately/i,
    )
  })

  it('initialises from the session being edited, link included', () => {
    renderForm(
      { conference: { modality: 'hybrid' } },
      adminSession({ roomId: null, accessLink: 'https://meet.example.com/old' }),
    )

    expect(screen.getByLabelText(/joining link/i)).toHaveValue('https://meet.example.com/old')
    expect(screen.getByLabelText('Room')).toHaveValue('')
  })
})
