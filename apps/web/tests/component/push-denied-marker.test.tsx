import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MORNING, PROGRAMME, renderAgenda } from '../support/agenda.js'
import { notificationsDouble, storageDouble } from '../support/notifications.js'
import { devicesWith } from '../support/services.js'

/**
 * T067 (014) — **an attendee who refused notifications still finds out** (FR-1032, SC-1005).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE MARKER IS NOT A FALLBACK FOR THE NOTIFICATION. IT IS THE PRIMARY RECORD, AND THE
 * NOTIFICATION IS THE INTERRUPTION.**
 *
 * That ordering is what makes v5.2.0's second trigger safe to grant. A design where the push is
 * the delivery and the marker is a consolation prize would make permission effectively mandatory
 * — decline it and the product stops telling you your session moved — which is the attrition
 * FR-1032 forbids and which 007 already refused once for messages (*"denial is a complete
 * outcome, not a degraded one"*).
 *
 * So the marker is computed **server-side from two timestamps** the attendee's own agenda read
 * already carries (`logistics_changed_at > viewed_at`, research R7). It has no dependency on the
 * notification path at all: no permission, no subscription, no service worker, no device
 * capability. This file is what proves that independence rather than asserting it — the agenda is
 * rendered with `NotificationService.permission` at `'denied'` and the marker still arrives.
 *
 * **The second half is the one that rots quietly.** 007's `push-denied-fallback.test.tsx` re-runs
 * the Messages surfaces under denial because a product that grows a nag banner for the attendee
 * who said no has made the permission mandatory by attrition. 014 adds a new reason to nag — *"you
 * will not be told when your sessions change"* — attached to a screen 007 never covered. So the
 * absence of that banner is asserted here, on Agenda, where it would be added in good faith.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The whole point: notifications refused, at the device capability. */
const denied = () => ({
  devices: devicesWith({
    notifications: notificationsDouble({ permission: 'denied' }).service,
    secureStorage: storageDouble(),
  }),
})

describe('the change marker with notification permission denied (FR-1032, SC-1005)', () => {
  it('renders the marker on the saved row (FR-1030)', async () => {
    const user = userEvent.setup()

    renderAgenda({
      saved: [MORNING.id],
      changed: [MORNING.id],
      services: denied(),
    })

    await user.click(await screen.findByRole('radio', { name: 'Saved' }))

    const row = (await screen.findByRole('link', { name: 'Opening Keynote' })).closest('li')
    expect(row).not.toBeNull()
    expect(
      within(row as HTMLElement).getByText('Changed'),
      'The marker is missing with permission denied. It is computed server-side from two ' +
        'timestamps on the attendee’s own agenda read (R7) and has no dependency on the ' +
        'notification path — if it can go missing here, permission has become mandatory by ' +
        'attrition (FR-1032).',
    ).toBeInTheDocument()
  })

  it('marks only the session that changed, not every saved row', async () => {
    const user = userEvent.setup()

    renderAgenda({
      sessions: PROGRAMME,
      saved: [MORNING.id, PROGRAMME[1]?.id as string],
      changed: [MORNING.id],
      services: denied(),
    })

    await user.click(await screen.findByRole('radio', { name: 'Saved' }))
    await screen.findByRole('link', { name: 'Opening Keynote' })

    // One marker, on one row. Two would mean the marker is a screen-level state rather than
    // per-row — the shape FR-1031 forbids, arrived at by accident.
    expect(screen.getAllByText('Changed')).toHaveLength(1)
  })

  it('says it in text, so a refused permission does not also mean a missed colour', async () => {
    const user = userEvent.setup()

    renderAgenda({ saved: [MORNING.id], changed: [MORNING.id], services: denied() })
    await user.click(await screen.findByRole('radio', { name: 'Saved' }))

    // `getByText` reads the accessible text. A dot, a border colour or a background would fail
    // here and would be invisible to a screen reader and in high contrast — for the attendee who
    // is *already* not getting the interruption.
    expect(await screen.findByText('Changed')).toBeInTheDocument()
  })

  it('shows no banner, warning or prompt about the refused permission (FR-1032)', async () => {
    const user = userEvent.setup()

    renderAgenda({ saved: [MORNING.id], changed: [MORNING.id], services: denied() })
    await user.click(await screen.findByRole('radio', { name: 'Saved' }))
    await screen.findByText('Changed')

    // The nag 014 gives somebody a new reason to write. A denial is a complete outcome.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/turn on notifications/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/enable notifications/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/you will not be told|miss(ing)? out|won’t be notified/i),
    ).not.toBeInTheDocument()
  })

  it('leaves the rest of Agenda identical — the programme, the filter and the save control', async () => {
    const user = userEvent.setup()

    const rendered = renderAgenda({
      saved: [MORNING.id],
      changed: [MORNING.id],
      services: denied(),
    })

    // The whole programme, its filter, and a working write. 007's rule applied to this screen:
    // the only difference permission may make is that no notification arrives.
    expect(await screen.findByText('Opening Keynote')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All sessions' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: /save open studio to your agenda/i }))
    expect(rendered.saved.calls).toContainEqual({
      op: 'save',
      sessionId: PROGRAMME[1]?.id as string,
    })
  })

  it('clears the marker when the attendee opens the session, with permission still denied', async () => {
    const user = userEvent.setup()

    const rendered = renderAgenda({
      saved: [MORNING.id],
      changed: [MORNING.id],
      services: denied(),
    })

    await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))
    await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })

    // Looking at it is what clears it (FR-1030) — the same mechanism whether or not a
    // notification ever arrived, because `viewed_at` is written by the reader rather than by the
    // notification being activated.
    expect(rendered.saved.calls).toContainEqual({ op: 'viewed', sessionId: MORNING.id })
    expect(rendered.saved.unviewed.has(MORNING.id)).toBe(false)
  })
})
