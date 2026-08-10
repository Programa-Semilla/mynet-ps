import { OfflineError, type BlockedAttendee } from '@mynet/data'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Blocks } from '../../src/app/profile/Blocks.js'
import { testServices, WithServices } from '../support/services.js'

/**
 * Deep review — **the block-management surface, and every state it declares** (FR-541, FR-541a,
 * FR-581).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS SURFACE HAD NO TEST AT ALL, WHICH IS WORSE THAN A THINLY-TESTED ONE.**
 *
 * Nothing rendered `<Blocks />`; the only coverage was incidental, through `<Account />` in three
 * 004 files asserting unrelated things against the default empty-list double. None of its three
 * **declared** states was asserted — not the loading status, not the empty state, not the failure
 * alert and its retry — and neither was the unblock path or its own failure branch.
 *
 * `messages-states.test.tsx` exists on the reasoning that *"states asserted in passing on the way
 * to testing something else are the ones that come to be nearly covered"*. The block list was not
 * covered even in passing. A regression that swapped the empty state for a blank div, or dropped
 * the retry, would have shipped in silence.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The Principle IX declaration names this surface explicitly: *"Block list: loading; empty —
 * 'you have not blocked anyone'; failure — explanation with retry."* This file is that sentence,
 * asserted.
 */

const A_BLOCK: BlockedAttendee = {
  attendeeId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Sofía Muñoz',
  avatar: null,
  blockedAt: '2026-09-14T10:00:00.000Z',
}

/** A block repository the test drives, recording what it was asked. */
const blocksDouble = ({
  list,
  unblockFails,
}: {
  list: () => Promise<BlockedAttendee[]>
  unblockFails?: Error
}) => {
  const unblocked: string[] = []
  let listCalls = 0

  return {
    unblocked,
    listCalls: () => listCalls,
    repository: {
      list: async () => {
        listCalls += 1
        return list()
      },
      block: async () => {},
      unblock: async (attendeeId: string) => {
        if (unblockFails) throw unblockFails
        unblocked.push(attendeeId)
      },
    },
  }
}

const renderBlocks = (double: ReturnType<typeof blocksDouble>) => {
  render(
    <WithServices services={testServices({ blocks: double.repository })}>
      <Blocks />
    </WithServices>,
  )
  return double
}

describe('the block list: every state it declares (FR-541a, FR-581)', () => {
  it('LOADING: says what it is loading, in a live region', async () => {
    renderBlocks(blocksDouble({ list: () => new Promise(() => {}) }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/loading who you have blocked/i)
  })

  it('EMPTY: reads as fine rather than as nothing-loaded (FR-541a)', async () => {
    renderBlocks(blocksDouble({ list: async () => [] }))

    expect(await screen.findByText(/you have not blocked anyone/i)).toBeInTheDocument()
    // The ordinary state of almost every account is not an error, and must not look like one.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('POPULATED: names each person and offers to release them (FR-541)', async () => {
    renderBlocks(blocksDouble({ list: async () => [A_BLOCK] }))

    expect(await screen.findByText('Sofía Muñoz')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unblock sofía muñoz/i })).toBeInTheDocument()
  })

  it('FAILURE: explains, and the retry actually re-reads', async () => {
    const user = userEvent.setup()
    let attempt = 0

    const double = renderBlocks(
      blocksDouble({
        list: async () => {
          attempt += 1
          if (attempt === 1) throw new Error('boom')
          return [A_BLOCK]
        },
      }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not load who you have blocked/i)
    // FR-059 — says what happened and what to do, with no internal detail.
    expect(alert.textContent).not.toContain('boom')

    await user.click(screen.getByRole('button', { name: /try again/i }))

    // A retry that does not re-read is a button that looks like a recovery and is not one.
    expect(await screen.findByText('Sofía Muñoz')).toBeInTheDocument()
    expect(double.listCalls()).toBe(2)
  })

  it('OFFLINE: worded distinguishably from a fault on our side, and says nothing is stored here', async () => {
    renderBlocks(blocksDouble({ list: async () => Promise.reject(new OfflineError('offline')) }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/need a connection/i)
    // FR-563 — the refusal to cache is stated rather than left to look like data loss.
    expect(alert).toHaveTextContent(/nothing here is stored on this device/i)
  })

  it('UNBLOCK: releases exactly that person, then re-reads the list (FR-540)', async () => {
    const user = userEvent.setup()
    const double = renderBlocks(blocksDouble({ list: async () => [A_BLOCK] }))

    await user.click(await screen.findByRole('button', { name: /unblock sofía muñoz/i }))

    await waitFor(() => expect(double.unblocked).toEqual([A_BLOCK.attendeeId]))
    // Directional, and by identifier — releasing "everyone" or the wrong row is the failure a
    // list of near-identical controls invites.
    await waitFor(() => expect(double.listCalls()).toBe(2))
  })

  it('UNBLOCK FAILURE: says nothing changed, and leaves the person listed', async () => {
    const user = userEvent.setup()
    renderBlocks(blocksDouble({ list: async () => [A_BLOCK], unblockFails: new Error('nope') }))

    await user.click(await screen.findByRole('button', { name: /unblock sofía muñoz/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not be released/i)
    expect(alert).toHaveTextContent(/nothing has changed/i)
    // And the claim is true: they are still on the list.
    expect(screen.getByText('Sofía Muñoz')).toBeInTheDocument()
  })
})
