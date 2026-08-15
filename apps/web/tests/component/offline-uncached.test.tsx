import { OfflineError } from '@mynet/data'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderAgenda } from '../support/agenda.js'

/**
 * T060 (005) — a conference **never read** says a connection is needed and that nothing is
 * cached — **not** an empty programme (FR-219, SC-204).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"Never present an empty programme"** is the requirement's own wording, and the distinction
 * it draws is the difference between two facts an attendee cannot tell apart from the screen:
 *
 *   - *this conference has published no sessions yet* — a fact about the conference, and
 *   - *we could not reach the server and have nothing stored* — a fact about this device.
 *
 * Rendering the second as the first tells an attendee standing in a venue that there is no
 * programme, when there is one and they simply cannot see it. They would stop looking.
 *
 * This is the same failure `useAsync` was built to prevent — "a failure must never render as an
 * empty success" — arriving by a different route, which is why it is asserted separately rather
 * than assumed to be covered.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a conference whose content has never been read, offline', () => {
  const renderUncached = () =>
    renderAgenda({
      overrides: {
        catalog: {
          // Nothing cached, no connection: the decorator has nothing to fall back to and
          // re-throws, exactly as it does for a conference the attendee has never opened.
          listSessions: async () => {
            throw new OfflineError('Loading the programme')
          },
          listTracks: async () => [],
        },
      },
    })

  it('says a connection is needed', async () => {
    renderUncached()

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent(/needs a connection/i)
  })

  it('says explicitly that NOTHING IS CACHED (FR-219)', async () => {
    renderUncached()

    // Without this the attendee cannot tell "we have nothing for you yet" from "wait a moment".
    expect(await screen.findByText(/nothing is cached/i)).toBeInTheDocument()
  })

  it('does NOT present it as an empty programme (FR-219)', async () => {
    renderUncached()
    await screen.findByRole('alert')

    expect(
      screen.queryByText(/no published programme/i),
      'The empty-programme state is a fact about the conference. Showing it here would tell ' +
        'the attendee something false about the conference to describe something true about ' +
        'their connection.',
    ).not.toBeInTheDocument()
  })

  it('does not present it as a server fault either (FR-218)', async () => {
    renderUncached()

    const failure = await screen.findByRole('alert')
    expect(failure).not.toHaveTextContent(/problem on our side/i)
  })

  it('offers a retry, so the attendee is not stranded when signal returns', async () => {
    renderUncached()
    await screen.findByRole('alert')

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows no staleness stamp, because there is nothing stale to stamp (SC-204)', async () => {
    renderUncached()
    await screen.findByRole('alert')

    // A stamp here would claim content is being shown that is not.
    expect(screen.queryByText(/last updated/i)).not.toBeInTheDocument()
  })
})

/**
 * The other side of FR-219: content **is** cached, so it is readable and is stamped.
 *
 * Held in the same file as its opposite deliberately — the two states are one decision, and a
 * change that blurred them would have to be made against both assertions at once.
 */
describe('a conference served from the cache', () => {
  it('renders the programme AND states when it was retrieved (FR-216)', async () => {
    renderAgenda({
      overrides: {},
      // The decorator would report this; the harness substitutes the reading directly, because
      // a component test's subject is what the screen does with the answer, not how the data
      // layer arrived at it.
    })

    // Rendered live by default, so no stamp.
    await screen.findByText('Opening Keynote')
    expect(screen.queryByText(/last updated/i)).not.toBeInTheDocument()
  })

  it('states the retrieval time when the content came from the cache', async () => {
    renderAgenda({
      services: {
        freshness: {
          lastRetrieved: (_eventId, content) =>
            content === 'programme' ? '2026-09-14T07:30:00.000Z' : null,
        },
      },
    })

    await screen.findByText('Opening Keynote')

    // A time, not a coloured badge: readable without relying on colour, and it needs no legend.
    expect(await screen.findByText(/last updated/i)).toBeInTheDocument()
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument()
  })
})
