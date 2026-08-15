import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ProgrammeEditor } from '../../src/app/conferences/ProgrammeEditor.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { identity, programme, stubServices } from '../support/services.js'

/**
 * **FR-1001's UPDATE verb, which had no surface at all until the deep review.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE REPOSITORY MEMBERS EXISTED, THE API EXISTED, AND NOTHING CALLED THEM.**
 *
 * FR-1001 requires an organizer to *"create, read, **update** and delete tracks, rooms, speakers
 * and sessions"*. Sessions had a form; the other three had create and delete only. `updateTrack`,
 * `updateRoom` and `updateSpeaker` were declared on `AdminCatalogRepository`, routed, and tested
 * server-side — and `tests/support/services.tsx` marked all three `unexpected(...)`, so **calling
 * one failed a test**. That is how certain the suite was that no screen did.
 *
 * The consequence was not theoretical. A mistyped room name was **uncorrectable**: renaming was
 * unreachable, and FR-1017 refuses deletion while any session references the room, so the only
 * remedy was to move every session elsewhere, delete, recreate, and move them all back.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THIS ASSERTS THE CALL AND NOT JUST THE CONTROL.**
 *
 * A test that only found an "Edit" button would pass against a button that opened an editor and
 * saved nothing — which is the same defect one layer up. So each case drives the whole path: open
 * the editor, change the field, save, and assert the repository received the edited value under
 * the right id. The stub is what makes that possible: every member throws by default, so a screen
 * calling something this test did not name fails loudly rather than silently.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const EVENT_ID = 'event-1'

const renderEditor = (services: ReturnType<typeof stubServices>) =>
  render(
    <MemoryRouter initialEntries={[`/conferences/${EVENT_ID}/programme`]}>
      <AdminSessionProvider services={services}>
        <Routes>
          <Route path="/conferences/:eventId/programme" element={<ProgrammeEditor />} />
        </Routes>
      </AdminSessionProvider>
    </MemoryRouter>,
  )

describe('FR-1001 — tracks, rooms and speakers can be edited, not only created and removed', () => {
  it('renames a ROOM, which was the uncorrectable one (FR-1001, FR-1017)', async () => {
    const updateRoom = vi.fn().mockResolvedValue(undefined)
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: vi
          .fn()
          .mockResolvedValue(programme({ rooms: [{ id: 'room-1', name: 'Hal A' }] })),
        updateRoom,
      },
    })

    renderEditor(services)

    // The control names its subject, because a list of these otherwise announces as
    // "Edit, Edit, Edit" to a screen reader.
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hal A' }))

    const editor = screen.getByRole('group', { name: 'Edit Hal A' })
    const nameField = within(editor).getByLabelText('Name')

    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Hall A')
    await userEvent.click(within(editor).getByRole('button', { name: 'Save Hal A' }))

    expect(
      updateRoom,
      'The rename control did not reach the repository. FR-1001 requires the update verb, and a ' +
        'control that opens an editor and saves nothing is the same gap one layer up.',
    ).toHaveBeenCalledWith(EVENT_ID, 'room-1', { name: 'Hall A' })
  })

  it('renames a TRACK, carrying its colour token through unchanged (FR-1004)', async () => {
    const updateTrack = vi.fn().mockResolvedValue(undefined)
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { programme: vi.fn().mockResolvedValue(programme()), updateTrack },
    })

    renderEditor(services)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Design' }))
    const editor = screen.getByRole('group', { name: 'Edit Design' })

    const nameField = within(editor).getByLabelText('Name')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'Craft')
    await userEvent.click(within(editor).getByRole('button', { name: 'Save Design' }))

    // The token travels unedited: FR-1004 makes it a closed set, so a rename must not be a way to
    // put an arbitrary string in the column the palette is keyed on.
    expect(updateTrack).toHaveBeenCalledWith(EVENT_ID, 'track-1', {
      name: 'Craft',
      colorToken: 'track-design',
    })
  })

  it('renames a SPEAKER, and sends a blank title as null rather than an empty string', async () => {
    const updateSpeaker = vi.fn().mockResolvedValue(undefined)
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: vi.fn().mockResolvedValue(
          programme({
            speakers: [{ id: 'speaker-1', name: 'Ada Lovelace', title: 'Analyst', company: null }],
          }),
        ),
        updateSpeaker,
      },
    })

    renderEditor(services)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Ada Lovelace' }))
    const editor = screen.getByRole('group', { name: 'Edit Ada Lovelace' })

    // Clearing an optional field means "absent", which is what the column holds. An empty string
    // would be a third state nothing reads.
    await userEvent.clear(within(editor).getByLabelText('Title'))
    await userEvent.click(within(editor).getByRole('button', { name: 'Save Ada Lovelace' }))

    expect(updateSpeaker).toHaveBeenCalledWith(EVENT_ID, 'speaker-1', {
      name: 'Ada Lovelace',
      title: null,
      company: null,
    })
  })

  it('disables Save while a required field is blank, rather than refusing afterwards', async () => {
    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: {
        programme: vi.fn().mockResolvedValue(programme()),
        // Deliberately not stubbed: `unexpected` throws, so if the disabled control were somehow
        // activated this test fails loudly rather than passing on a no-op.
      },
    })

    renderEditor(services)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Design' }))
    const editor = screen.getByRole('group', { name: 'Edit Design' })

    await userEvent.clear(within(editor).getByLabelText('Name'))

    expect(
      within(editor).getByRole('button', { name: 'Save Design' }),
      'A blank required field must disable the confirmation, never produce a post-submit error — ' +
        "`requirements.md`'s treatment for the empty meeting topic, applied here.",
    ).toBeDisabled()
  })

  it('closes the editor on success and leaves it open on refusal', async () => {
    const updateRoom = vi
      .fn()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce(undefined)

    const services = stubServices({
      session: { me: async () => identity('organizer') },
      catalog: { programme: vi.fn().mockResolvedValue(programme()), updateRoom },
    })

    renderEditor(services)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hall A' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Hall A' }))

    // Still open: the organizer's edit is still on screen to correct or abandon. Closing on a
    // refusal is the defect the deep review found in the cancel dialog, in the other direction.
    expect(screen.getByRole('group', { name: 'Edit Hall A' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save Hall A' }))
    expect(screen.queryByRole('group', { name: 'Edit Hall A' })).not.toBeInTheDocument()
  })
})
