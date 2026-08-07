import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

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

const renderEditor = (saveOwn = vi.fn(async () => EMPTY_PROFILE)) => {
  const base = testServices().repositories.profile
  const services = testServices({ profile: { ...base, saveOwn } })

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

  it('disables saving when there are too many interests, and counts them', async () => {
    const user = userEvent.setup()
    renderEditor()

    const interests = await screen.findByLabelText(/^interests$/i)
    await user.clear(interests)
    await user.paste(Array.from({ length: 13 }, (_, i) => `Topic ${i}`).join(', '))

    await waitFor(() => expect(save()).toBeDisabled())
    const reasons = screen.getAllByRole('status').map((element) => element.textContent ?? '')
    expect(reasons.join(' ')).toMatch(/13 interests.*limit is 12/i)
  })

  it('sends the whole profile, with blanks as null (whole-profile semantics)', async () => {
    const user = userEvent.setup()
    const { saveOwn } = renderEditor()

    const company = await screen.findByLabelText(/^company$/i)
    await user.type(company, 'Analytical Engines')
    await user.type(await screen.findByLabelText(/^interests$/i), 'Compilers, Type systems')
    await user.click(save())

    await waitFor(() =>
      expect(saveOwn).toHaveBeenCalledWith({
        company: 'Analytical Engines',
        // Untouched fields are sent as null rather than omitted: an omitted field clears, so
        // sending a subset would silently erase whatever it left out.
        role: null,
        headline: null,
        networkingIntent: null,
        availability: null,
        interests: ['Compilers', 'Type systems'],
      }),
    )
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
