import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { ChoosableVocabulary, OwnProfile } from '@mynet/data'

import { ProfileEdit } from '../../src/app/profile/ProfileEdit.js'
import { EMPTY_PROFILE, testServices, WithServices } from '../support/services.js'

/**
 * T070 (004) — **a field over its limit leaves confirmation disabled with the reason stated**
 * (FR-337, FR-338).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * The constitution's rule again — *disabled confirmation, never a post-submit error* — applied
 * to the one surface where a person can genuinely write too much.
 *
 * The pair is what makes it work. A disabled control with no explanation is a mystery, and a
 * stated limit with an enabled control lets somebody submit what will be refused. Both halves
 * are asserted together every time below, and the limit is asserted to appear **as it is
 * approached** rather than only once it is exceeded (FR-337).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const HEADLINE_LIMIT = 200
const COMPANY_LIMIT = 120

const renderEditor = (
  saveOwn = vi.fn(async () => EMPTY_PROFILE as OwnProfile),
  overrides: {
    profile?: Partial<OwnProfile>
    vocabulary?: Partial<ChoosableVocabulary>
  } = {},
) => {
  const base = testServices().repositories.profile
  const services = testServices({
    profile: {
      ...base,
      getOwn: async () => ({ ...EMPTY_PROFILE, ...overrides.profile }) as OwnProfile,
      saveOwn,
    },
    ...(overrides.vocabulary
      ? {
          vocabulary: {
            choosable: async () => ({
              sectors: [],
              subsectors: [],
              interests: [],
              ...overrides.vocabulary,
            }),
          },
        }
      : {}),
  })

  render(
    <WithServices services={services}>
      <MemoryRouter>
        <ProfileEdit />
      </MemoryRouter>
    </WithServices>,
  )

  return { saveOwn }
}

const save = () => screen.getByRole('button', { name: /save profile/i })

describe('editing a profile', () => {
  it('enables saving an untouched profile — every field is optional (FR-336)', async () => {
    renderEditor()

    await waitFor(() => expect(save()).toBeEnabled())
  })

  it('says nothing about a limit until the person is near it (FR-337)', async () => {
    const user = userEvent.setup()
    renderEditor()

    const company = await screen.findByLabelText(/^company$/i)
    await user.type(company, 'Short name')

    // A permanent counter on every field is noise, and noise is what people learn to ignore.
    expect(screen.queryByText(/characters left/i)).not.toBeInTheDocument()
  })

  it('surfaces the remaining characters as the limit is approached (FR-337)', async () => {
    const user = userEvent.setup()
    renderEditor()

    const company = await screen.findByLabelText(/^company$/i)
    // Ten from the limit — inside the window where the count starts speaking.
    await user.clear(company)
    await user.paste('x'.repeat(COMPANY_LIMIT - 10))

    expect(await screen.findByText(/10 characters left/i)).toBeInTheDocument()
  })

  it('disables saving when a field is over its limit, and says by how much (FR-338)', async () => {
    const user = userEvent.setup()
    renderEditor()

    const headline = await screen.findByLabelText(/^headline$/i)
    await user.clear(headline)
    await user.paste('x'.repeat(HEADLINE_LIMIT + 5))

    await waitFor(() => expect(save()).toBeDisabled())

    // The reason, in words, and specific enough to act on — "too long" leaves somebody deleting
    // characters one at a time to find out when it stops complaining.
    const reasons = screen.getAllByRole('status').map((element) => element.textContent ?? '')
    expect(reasons.join(' ')).toMatch(/5 characters over the limit of 200/i)
  })

  it('never submits a field the server would refuse', async () => {
    const user = userEvent.setup()
    const { saveOwn } = renderEditor()

    const headline = await screen.findByLabelText(/^headline$/i)
    await user.clear(headline)
    await user.paste('x'.repeat(HEADLINE_LIMIT + 1))
    await user.click(save())

    // The point of a disabled confirmation: the request is never made, so there is no
    // post-submit error to present.
    expect(saveOwn).not.toHaveBeenCalled()
  })

  it('keeps what was typed rather than truncating it', async () => {
    const user = userEvent.setup()
    renderEditor()

    const headline = await screen.findByLabelText(/^headline$/i)
    await user.clear(headline)
    await user.paste('x'.repeat(HEADLINE_LIMIT + 3))

    // Truncating silently discards what somebody wrote and gives them nothing to correct.
    expect(headline).toHaveValue('x'.repeat(HEADLINE_LIMIT + 3))
  })

  it('withholds the add-control at the interest bound, and says why (FR-337, T178)', async () => {
    // The chooser model makes over-the-limit unreachable by adding — the control is withheld at
    // the bound rather than refused after it, which is FR-338's disabled-confirmation rule one
    // step earlier. Twelve held values, all retained free text: the fullest legitimate state.
    renderEditor(undefined, {
      profile: { interests: Array.from({ length: 12 }, (_, i) => `Topic ${i}`) },
      vocabulary: { interests: [{ id: 'i-more', label: 'One more' }] },
    })

    expect(await screen.findByText(/12 interests, which is the limit/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/add an interest/i)).not.toBeInTheDocument()
    // Removal stays available: the bound governs adding, never keeping (FR-1095b).
    expect(screen.getByRole('button', { name: /remove topic 0/i })).toBeInTheDocument()
    await waitFor(() => expect(save()).toBeEnabled())
  })

  it('sends the whole profile, with blanks as null (whole-profile semantics)', async () => {
    const user = userEvent.setup()
    const { saveOwn } = renderEditor(undefined, {
      vocabulary: {
        interests: [
          { id: 'i-compilers', label: 'Compilers' },
          { id: 'i-types', label: 'Type systems' },
        ],
      },
    })

    const company = await screen.findByLabelText(/^company$/i)
    await user.type(company, 'Analytical Engines')
    // T178 — chosen, never typed (FR-1088): each selection adds one value.
    await user.selectOptions(await screen.findByLabelText(/add an interest/i), 'Compilers')
    await user.selectOptions(screen.getByLabelText(/add an interest/i), 'Type systems')
    await user.click(save())

    await waitFor(() =>
      expect(saveOwn).toHaveBeenCalledWith({
        company: 'Analytical Engines',
        // Untouched fields are sent as null rather than omitted: an omitted field clears, so
        // sending a subset would silently erase whatever it left out.
        role: null,
        headline: null,
        sector: null,
        subsector: null,
        productiveActivity: null,
        networkingIntent: null,
        availability: null,
        interests: ['Compilers', 'Type systems'],
      }),
    )
  })

  it('renders an explanatory empty state for an empty interest vocabulary, with NO free entry (FR-1086, FR-1088)', async () => {
    renderEditor(undefined, { vocabulary: { interests: [] } })

    expect(await screen.findByText(/no interests are defined yet/i)).toBeInTheDocument()
    // FR-1088 — new interests are chosen, not typed: no chooser to choose from means no
    // control at all, and specifically not a text input standing in for one.
    expect(screen.queryByLabelText(/add an interest/i)).not.toBeInTheDocument()
    const inputs = screen.queryAllByRole('textbox').map((element) => element.id)
    expect(inputs.some((id) => /interest/i.test(id))).toBe(false)
    // The form is complete and savable without any (FR-1091).
    await waitFor(() => expect(save()).toBeEnabled())
  })

  it('presents a held-but-retired value as present and removable, never dropped (FR-1095b)', async () => {
    const { saveOwn } = renderEditor(undefined, {
      profile: { sector: 'Industria', interests: ['Fintech (retained)'] },
      vocabulary: { sectors: [{ id: 's-serv', label: 'Servicios' }], interests: [] },
    })

    // The held sector is not choosable — and it is still IN the control, marked, because a
    // held value silently missing from the form would be removed by the next save.
    const sector = await screen.findByLabelText(/^sector$/i)
    expect(sector).toHaveValue('Industria')
    expect(
      screen.getByRole('option', { name: /industria \(no longer offered\)/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/cannot be chosen again/i)).toBeInTheDocument()

    // The retained free-text interest renders as a removable chip, like any chosen one.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /remove fintech \(retained\)/i }))
    await user.click(save())

    await waitFor(() =>
      expect(saveOwn).toHaveBeenCalledWith(expect.objectContaining({ interests: [] })),
    )
  })

  it('filters the subsector chooser by the chosen sector, and blocks an unresolved pair (FR-1087)', async () => {
    const user = userEvent.setup()
    const { saveOwn } = renderEditor(undefined, {
      profile: { sector: 'Servicios', subsector: 'Consultoría' },
      vocabulary: {
        sectors: [
          { id: 's-serv', label: 'Servicios' },
          { id: 's-com', label: 'Comercio' },
        ],
        subsectors: [
          { id: 'ss-cons', sectorId: 's-serv', label: 'Consultoría' },
          { id: 'ss-min', sectorId: 's-com', label: 'Minorista' },
        ],
      },
    })

    // Filtered: only the chosen sector's refinements are offered.
    const subsector = await screen.findByLabelText(/^subsector$/i)
    expect(screen.getByRole('option', { name: 'Consultoría' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Minorista' })).not.toBeInTheDocument()

    // Changing sector strands the old subsector, and the save is blocked with the reason
    // stated until the ATTENDEE resolves it — the editor never clears it for them (FR-1087).
    await user.selectOptions(screen.getByLabelText(/^sector$/i), 'Comercio')
    await waitFor(() => expect(save()).toBeDisabled())
    const reasons = screen.getAllByRole('status').map((element) => element.textContent ?? '')
    expect(reasons.join(' ')).toMatch(/belongs to a different sector/i)
    expect(saveOwn).not.toHaveBeenCalled()

    // Resolving it — choosing a refinement of the new sector — re-enables the save.
    await user.selectOptions(subsector, 'Minorista')
    await waitFor(() => expect(save()).toBeEnabled())
  })

  it('keeps every edit on screen when saving fails offline', async () => {
    const user = userEvent.setup()
    const { OfflineError } = await import('@mynet/data')
    renderEditor(vi.fn(async () => Promise.reject(new OfflineError('Saving'))))

    const company = await screen.findByLabelText(/^company$/i)
    await user.type(company, 'Still Here Ltd')
    await user.click(save())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/needs a connection/i)
    // Nothing queued, nothing reported as saved, and nothing lost.
    expect(company).toHaveValue('Still Here Ltd')
  })
})
