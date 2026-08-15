import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { anAttendee, renderDiscover } from '../support/discover.js'

/**
 * T058 (006) — Discover's accessibility obligations (Principle IV).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FOUR THINGS THAT ARE EASY TO GET WRONG HERE, EACH ASSERTED BY NAME.**
 *
 *   1. the search field has a real `<label>`, not a placeholder standing in for one;
 *   2. both filters expose their state and how many are applied;
 *   3. **the result count is announced when it changes** — a sighted reader watches the grid
 *      shrink as they type; without a live region a screen-reader user is told nothing at all
 *      and the page silently becomes a different page;
 *   4. intent and availability are never colour-only.
 *
 * The axe sweep in `e2e/accessibility.spec.ts` covers the mechanical rules. None of these four
 * is mechanical: a placeholder-only field, a colour-only status and a silent live update all
 * pass an automated audit and fail a person.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

describe('Discover: labelling and announcement', () => {
  /**
   * A placeholder is not an accessible name in every browser and screen-reader combination, it
   * disappears the moment somebody types, and it fails contrast at the size it is usually drawn
   * at. This is the most-used control on the destination.
   */
  it('labels the search field with a real <label>, not only a placeholder', async () => {
    renderDiscover()
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    const field = screen.getByRole('searchbox', {
      name: /search attendees/i,
    }) as HTMLInputElement

    // `labels` is the DOM's own answer to "which <label> elements name this control", so it is
    // exactly the question being asked — and it is empty when the name came from a placeholder
    // or an `aria-label` instead.
    expect(
      [...(field.labels ?? [])],
      'the accessible name must come from a <label>, not from `placeholder` or `aria-label`',
    ).not.toHaveLength(0)
    expect(field).toHaveAccessibleName('Search attendees')

    // The placeholder stays, as an example of *what* to type — which is what a placeholder is
    // actually for.
    expect(field).toHaveAttribute('placeholder')
  })

  /**
   * T214 (014 tranche 2) — the interest options come from the CHOOSABLE VOCABULARY now, not
   * from the attendees on screen (FR-1096), so these two tests supply one. "Accessibility" is
   * deliberately a value the rendered attendee does not need to hold: every choosable value is
   * offered whether or not anybody at the conference holds it — an option list that shrinks to
   * what exists is population data again, which is the bound the relaxation rests on.
   */
  const CHOOSABLE_INTEREST = {
    vocabulary: {
      choosable: async () => ({
        sectors: [],
        subsectors: [],
        interests: [{ id: 'interest-a11y', label: 'Accessibility' }],
      }),
    },
  }

  it('labels both filters, and each exposes its own selected state', async () => {
    const user = userEvent.setup()
    renderDiscover({ overrides: CHOOSABLE_INTEREST })
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    const role = screen.getByRole('combobox', { name: /^role$/i })
    const interest = screen.getByRole('combobox', { name: /^interest$/i })

    expect(role).toHaveValue('')
    await user.selectOptions(role, 'Designer')
    expect(role).toHaveValue('Designer')

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Accessibility' })).toBeInTheDocument(),
    )
    await user.selectOptions(interest, 'Accessibility')
    expect(interest).toHaveValue('Accessibility')
  })

  it('states how many narrowings are applied, and offers one control that clears them all', async () => {
    const user = userEvent.setup()
    renderDiscover({ overrides: CHOOSABLE_INTEREST })
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    // Absent while nothing is set, rather than present and disabled: a permanently disabled
    // control is an affordance for something that cannot be done.
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /^role$/i }), 'Designer')
    expect(await screen.findByText('1 filter applied')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: /^interest$/i }), 'Accessibility')
    expect(await screen.findByText('2 filters applied')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear all/i }))
    await waitFor(() => expect(screen.queryByText(/filters? applied/)).not.toBeInTheDocument())
  })

  /**
   * The announcement. Asserted as a live region *containing the count*, because both halves are
   * needed: a live region that never changes announces nothing, and a count that is not in one
   * changes silently.
   */
  it('announces the result count, and the search field points at it', async () => {
    const user = userEvent.setup()
    renderDiscover({
      pages: (query) => ({
        attendees: query.q ? [] : [anAttendee()],
        nextCursor: null,
      }),
    })
    await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })

    const field = screen.getByRole('searchbox', { name: /search attendees/i })
    const countId = field.getAttribute('aria-describedby') as string
    // Scoped to the destination rather than reached through a DOM global — `no-direct-platform-access`
    // applies to tests too, and the region is the honest scope for a query about this surface.
    const count = screen
      .getByRole('region', { name: 'Discover' })
      .querySelector(`#${CSS.escape(countId)}`) as HTMLElement

    expect(count).toHaveAttribute('aria-live', 'polite')
    expect(count).toHaveTextContent('1 person to meet')

    await user.type(field, 'zzz')

    await waitFor(() => expect(count).toHaveTextContent(/no attendees matched/i))
  })
})

/**
 * The filters must remain **usable** once one is applied.
 *
 * The options are derived from what is on screen rather than from a second endpoint — see
 * `Discover.tsx` for why. The naive form of that derivation shrinks the option list to the
 * results the current filter produced, so selecting `Designer` leaves `Designer` as the only
 * role on offer and the reader cannot switch to another without first clearing.
 */
describe('Discover: the filter options survive being used', () => {
  it('still offers the other roles after one has been selected', async () => {
    const user = userEvent.setup()
    renderDiscover({
      pages: (query) => ({
        attendees: [
          anAttendee({
            attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111',
            displayName: 'Ada',
            role: 'Designer',
          }),
          anAttendee({
            attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222',
            displayName: 'Bea',
            role: 'Researcher',
          }),
        ].filter((a) => !query.role || a.role === query.role),
        nextCursor: null,
      }),
    })
    await screen.findByText('Ada')

    const role = screen.getByRole('combobox', { name: /^role$/i })
    expect([...role.querySelectorAll('option')].map((o) => o.textContent)).toContain('Researcher')

    await user.selectOptions(role, 'Designer')
    await waitFor(() => expect(screen.queryByText('Bea')).not.toBeInTheDocument())

    expect(
      [...role.querySelectorAll('option')].map((o) => o.textContent),
      'a filter that removes every other option from its own control cannot be changed, only ' +
        'cleared — the reader has to guess that clearing is the way to switch.',
    ).toContain('Researcher')
  })
})

describe('Discover: status is never colour-only', () => {
  /**
   * The prototype shows availability as a coloured dot. A dot alone is unreadable to anyone who
   * cannot distinguish the two colours and invisible to a screen reader entirely — and
   * "available" versus "busy" is exactly the kind of status a reader acts on.
   */
  it('writes out availability and intent as words, with the colour only as an extra cue', async () => {
    renderDiscover({
      attendees: [anAttendee({ availability: 'busy', networkingIntent: 'not_networking' })],
    })
    const heading = await screen.findByRole('heading', { level: 3, name: 'Sofía Muñoz' })
    const card = heading.closest('li') as HTMLElement

    expect(card).toHaveTextContent('Busy')
    expect(card).toHaveTextContent('Not looking to network right now')

    // The dot itself is decorative and must not be announced — the word beside it is the fact.
    const dot = card.querySelector('[aria-hidden="true"]')
    expect(dot).not.toBeNull()
  })

  it('keeps the card to one keyboard stop, in the order it reads', async () => {
    const user = userEvent.setup()
    renderDiscover({
      attendees: [
        anAttendee({ attendeeId: 'aaaaaaaa-1111-4111-8111-111111111111', displayName: 'Ada' }),
        anAttendee({ attendeeId: 'bbbbbbbb-2222-4222-8222-222222222222', displayName: 'Bea' }),
      ],
    })
    await screen.findByText('Ada')

    // Tab order follows document order with no `tabindex` of ours, so reading order and
    // keyboard order are the same by construction rather than by arrangement.
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Ada', 'Bea'])
    for (const link of links) {
      expect(link).not.toHaveAttribute('tabindex')
    }

    await user.tab()
    // The first stop is the search field — the control a reader arriving at Discover most often
    // wants — rather than the first card.
    expect(screen.getByRole('searchbox', { name: /search attendees/i })).toHaveFocus()
  })
})
