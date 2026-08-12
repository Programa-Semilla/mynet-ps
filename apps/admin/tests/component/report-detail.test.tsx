import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { ReportDetail } from '../../src/app/reports/ReportDetail.js'
import { AdminSessionProvider } from '../../src/app/session.js'
import { identity, reportDetail, stubServices } from '../support/services.js'

/**
 * T084 (013) — **`contentAvailable: false` renders as a STATE, not a failure** (FR-941, SC-902).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Reported message and question ids are stored as plain arrays rather than foreign keys
 * *precisely because* the content is usually gone before anybody looks — deleted with an account,
 * or withdrawn by its author while it had no votes.
 *
 * So this is the **expected** case, and a client rendering it as an error has misread the
 * contract. The operator still needs who reported whom, when, and why; and the screen must not
 * suggest anything has gone wrong, because nothing has.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const renderDetail = (services: ReturnType<typeof stubServices>) =>
  render(
    <MemoryRouter>
      <AdminSessionProvider services={services}>
        <ReportDetail reportId="00000000-0000-4000-8000-000000000001" onResolved={() => {}} />
      </AdminSessionProvider>
    </MemoryRouter>,
  )

describe('the report detail', () => {
  it('shows the reported content and the reporter’s own words (FR-940)', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      reports: { detail: async () => reportDetail() },
    })

    renderDetail(services)

    expect(await screen.findByText('The reported question.')).toBeInTheDocument()
    // The reason is disclosed here and **never** in the operator mail (FR-947), which carries
    // identifiers and a timestamp only.
    expect(screen.getByText('What the reporter said.')).toBeInTheDocument()
  })

  it('renders missing content as a state rather than an error (FR-941, SC-902)', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      reports: {
        detail: async () => reportDetail({ contentAvailable: false, content: [] }),
      },
    })

    renderDetail(services)

    const explanation = await screen.findByText(/no longer here/i)
    expect(explanation).toBeInTheDocument()
    // **Says it is usual.** An operator meeting this for the first time must not conclude the
    // product is broken or that the report was empty.
    expect(explanation).toHaveTextContent(/usual/i)

    // Not announced as a failure, and not in the danger palette — this is not an error path.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Everything the operator can still act on survives. Matched on the heading rather than on
    // the words "the reporter", which also appear in the stated reason — a query that matched
    // both would pass whether or not the heading rendered.
    expect(
      screen.getByRole('heading', { name: /the reporter reported the reported/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('What the reporter said.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /record a resolution/i })).toBeInTheDocument()
  })

  /**
   * **FR-953 — removal is offered for a question report and NEVER for a message report.**
   *
   * 007's block at report time is the protective act for messages, and a removal control here
   * would be a second, unreviewed decision about somebody else's correspondence. The server
   * refuses either way (`admin-remove-question.test.ts` asserts no such route exists at all);
   * this is the half that stops an operator being offered a control that cannot work.
   */
  it('offers removal for a question report', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      reports: { detail: async () => reportDetail({ kind: 'questions' }) },
    })

    renderDetail(services)

    expect(await screen.findByRole('button', { name: /remove this question/i })).toBeInTheDocument()
  })

  it('offers NO removal for a message report (FR-953)', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      reports: {
        detail: async () =>
          reportDetail({
            kind: 'messages',
            content: [{ id: '00000000-0000-4000-8000-0000000000bb', body: 'A reported message.' }],
          }),
      },
    })

    renderDetail(services)

    expect(await screen.findByText('A reported message.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /remove/i }),
      'a message report offered a removal control. There is no such route at any tier ' +
        '(FR-953) — the block at report time is the protective act.',
    ).not.toBeInTheDocument()
  })

  it('shows a resolution once one exists, attributed to the operator who made it (FR-944)', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      reports: {
        detail: async () =>
          reportDetail({
            resolution: {
              outcome: 'dismissed',
              note: 'Nothing warranted.',
              resolvedAt: '2026-08-11T10:00:00.000Z',
              resolvedBy: 'Another Operator',
            },
          }),
      },
    })

    renderDetail(services)

    expect(await screen.findByText(/another operator/i)).toBeInTheDocument()
    expect(screen.getByText('Nothing warranted.')).toBeInTheDocument()
    // Already resolved: no second resolution is offered, which is the interface half of FR-945.
    // The server refuses one with a 409 regardless.
    expect(screen.queryByRole('button', { name: /record a resolution/i })).not.toBeInTheDocument()
  })

  /**
   * **Nothing on this screen tells the reporter anything** (FR-946).
   *
   * Decision 35 conditions the whole read on it: the reporter is still promised nothing, so a
   * queue must not become a status they can see. There is no case identifier, no "notified"
   * control, and nothing to poll.
   */
  it('offers no way to tell the reporter anything (FR-946)', async () => {
    const services = stubServices({
      session: { me: async () => identity('platform') },
      reports: { detail: async () => reportDetail() },
    })

    renderDetail(services)
    await screen.findByText('The reported question.')

    for (const forbidden of [/notify/i, /case number/i, /case id/i, /inform the reporter/i]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument()
    }
  })
})
