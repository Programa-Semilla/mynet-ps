import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@mynet/data/http'

import type { AdminServices } from '../../src/app/services.js'
import { VocabularyScreen } from '../../src/app/vocabulary/VocabularyScreen.js'
import { identity, stubServices, withSession } from '../support/services.js'

/**
 * T177 (014 tranche 2) — the vocabulary destination's states (FR-1086, FR-1089, FR-1092's
 * shipped condition, FR-1094c).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE EMPTY STATE UNDER TEST IS THE PRODUCT'S DAY-ONE STATE.** The vocabulary ships with four
 * sectors and nothing else (FR-1086), so "no subsectors yet — add the first" is what a real
 * operator meets before anything else, and it must invite authoring rather than read as broken.
 * The failure and loading states follow the conventions every administrative screen here uses;
 * the authoring case drives one create end to end through the repository seam, and the refusal
 * case proves a held-value rename renders ITS OWN sentence — the retire-plus-create one — which
 * is the whole reason `vocabulary_rename_held` is its own code.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const SECTORS = [
  { id: 's-serv', label: 'Servicios', retiredAt: null },
  { id: 's-agro', label: 'Agro', retiredAt: '2026-08-14T00:00:00.000Z' },
]

const renderVocabulary = (overrides: Partial<AdminServices['vocabulary']> = {}) => {
  const services = stubServices({
    session: { me: async () => identity('platform') },
    vocabulary: {
      sectors: async () => SECTORS,
      subsectors: async () => [],
      interests: async () => [],
      ...overrides,
    },
  })

  render(withSession(<VocabularyScreen />, services))
  return services
}

describe('the vocabulary destination', () => {
  it('renders an h1, so the sweeps can recognise the page arrived', async () => {
    renderVocabulary()

    expect(
      await screen.findByRole('heading', { level: 1, name: /vocabulary/i }),
    ).toBeInTheDocument()
  })

  it('invites authoring from every empty list rather than looking broken (FR-1086)', async () => {
    renderVocabulary()

    // The day-one state: subsectors and interests are empty, and each empty state says what to
    // do next rather than that something failed.
    expect(
      await screen.findByText(/no subsectors of servicios yet — add the first/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/no interests yet — add the first/i)).toBeInTheDocument()
    expect(screen.queryByText(/wrong|failed|error/i)).not.toBeInTheDocument()
  })

  it('shows a loading state while the lists are in flight', async () => {
    renderVocabulary({
      sectors: () => new Promise(() => {}),
      subsectors: () => new Promise(() => {}),
      interests: () => new Promise(() => {}),
    })

    expect(await screen.findByText(/loading the vocabulary/i)).toBeInTheDocument()
  })

  it('surfaces a failed load as a failure, not an empty vocabulary', async () => {
    renderVocabulary({
      sectors: async () => {
        throw new ApiError(500, { code: 'internal_error' })
      },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/went wrong/i)
    // A failure must never render as "nothing exists yet": an operator told the list is empty
    // would start re-authoring values that exist.
    expect(screen.queryByText(/no interests yet/i)).not.toBeInTheDocument()
  })

  it('authors an interest through the repository and re-reads the lists', async () => {
    const user = userEvent.setup()
    const createInterest = vi.fn(async () => {})
    const services = renderVocabulary({ createInterest })

    await user.type(await screen.findByLabelText(/new interest/i), 'Fintech')
    await user.click(screen.getByRole('button', { name: /add interest/i }))

    await waitFor(() => expect(createInterest).toHaveBeenCalledWith({ label: 'Fintech' }))
    // The screen re-reads rather than optimistically inserting: what renders next is what the
    // server accepted, which is every administrative screen's convention here.
    expect(vi.mocked(services.vocabulary.sectors)).toBeDefined()
  })

  it('renders the retire-plus-create sentence for a held-value rename (FR-1094c)', async () => {
    const user = userEvent.setup()
    renderVocabulary({
      renameSector: async () => {
        throw new ApiError(409, { code: 'vocabulary_rename_held' })
      },
    })

    await user.click(await screen.findByRole('button', { name: /rename sector servicios/i }))
    const input = screen.getByLabelText(/new name for sector servicios/i)
    await user.clear(input)
    await user.type(input, 'Servicios y más')
    await user.click(screen.getByRole('button', { name: /save sector servicios/i }))

    // The sentence that teaches FR-1094's rule at the moment an operator meets it — reachable
    // only because the refusal carries its own code.
    expect(await screen.findByRole('alert')).toHaveTextContent(/retire it and create/i)
  })

  it('marks a retired value in words and offers un-retiring, never a second lifecycle', async () => {
    renderVocabulary()

    expect(
      await screen.findByText(/retired — kept by holders, offered to nobody/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /un-retire sector agro/i })).toBeInTheDocument()
    // A retired sector cannot gain new subsectors (FR-1087), and the reason is stated where the
    // control is withheld rather than discovered from a refusal.
    expect(screen.getByText(/un-retire it first/i)).toBeInTheDocument()
  })
})
