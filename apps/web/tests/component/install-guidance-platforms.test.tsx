import type { InstallState } from '@mynet/platform'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { InstallGuidance } from '../../src/auth/InstallGuidance.js'
import { devicesWith, testServices, WithServices } from '../support/services.js'

/**
 * T048 (016) — **the two platform halves are asymmetric, and neither is a degraded other**
 * (FR-1033, FR-1034).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **iOS IS NOT A CHROMIUM THAT FAILED TO FIRE AN EVENT.**
 *
 * Chromium fires `beforeinstallprompt` and lets the page present a **real system prompt**. iOS
 * Safari fires nothing and exposes no install API to the page at all — installing is a manual
 * gesture through the share sheet, and no amount of scripting can offer it.
 *
 * The failure this file exists to prevent is the natural one: writing the Chromium path first,
 * then rendering the same control on iOS where it does nothing. **A dead button is worse than
 * written steps**, because it teaches somebody the product is broken — and iPhones are the
 * devices where this guidance matters most, since iOS is the platform whose notification
 * delivery requires installation in the first place.
 *
 * FR-1034 states it directly: where the platform offers no mechanism, give steps the reader
 * performs and **do not present a control that cannot work**.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const renderWith = (state: InstallState) => {
  const services = testServices(
    {},
    {
      devices: devicesWith({
        install: { current: () => state, subscribe: () => () => {} },
      }),
    },
  )

  return render(
    <WithServices services={services}>
      <MemoryRouter>
        <InstallGuidance />
      </MemoryRouter>
    </WithServices>,
  )
}

const installControl = () => screen.queryByRole('button', { name: /install mynet/i })

describe('where the platform offers an install mechanism', () => {
  it('offers a control that invokes the real prompt (FR-1033)', async () => {
    const user = userEvent.setup()
    const promptToInstall = vi.fn(async () => true)

    renderWith({ installed: false, mobile: true, promptToInstall })

    const control = await screen.findByRole('button', { name: /install mynet/i })
    await user.click(control)

    expect(
      promptToInstall,
      'The control did not reach the platform. FR-1033 asks the guidance to *invoke* the ' +
        'mechanism, not to describe it while a system prompt exists.',
    ).toHaveBeenCalledOnce()
  })

  it('does not give manual steps as well, which would be two answers to one question', async () => {
    renderWith({ installed: false, mobile: true, promptToInstall: async () => true })

    await screen.findByRole('button', { name: /install mynet/i })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  /**
   * A declined install is a **complete outcome, not an error** (spec edge case). The reader was
   * asked and said no, which is the mechanism working — so nothing is announced, nothing is
   * retried, and the guidance stays because the reason for it has not changed.
   */
  it('treats a declined install as an outcome rather than a failure', async () => {
    const user = userEvent.setup()

    renderWith({ installed: false, mobile: true, promptToInstall: async () => false })

    await user.click(await screen.findByRole('button', { name: /install mynet/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      installControl(),
      'A declined install removed the guidance. The reader said "not now", which is not the ' +
        'same as "never tell me why my notifications do not arrive".',
    ).toBeInTheDocument()
  })
})

describe('where the platform offers none', () => {
  it('gives steps the reader performs themselves (FR-1034)', async () => {
    renderWith({ installed: false, mobile: true, promptToInstall: null })

    const steps = await screen.findByRole('list')
    expect(steps).toHaveTextContent(/share/i)
    expect(steps).toHaveTextContent(/add to home screen/i)
  })

  it('presents NO control that cannot work (FR-1034)', async () => {
    renderWith({ installed: false, mobile: true, promptToInstall: null })

    await screen.findByRole('list')

    expect(
      installControl(),
      'An install control is rendered on a platform that gives the page no install mechanism. ' +
        'It cannot do anything, and a dead button teaches the reader the product is broken — on ' +
        'exactly the devices this guidance exists for.',
    ).not.toBeInTheDocument()
  })

  it('keeps the ordered steps in the order the reader performs them', async () => {
    renderWith({ installed: false, mobile: true, promptToInstall: null })

    const items = (await screen.findAllByRole('listitem')).map((item) => item.textContent ?? '')

    expect(items).toHaveLength(3)
    expect(items[0]).toMatch(/share/i)
    expect(items[1]).toMatch(/add to home screen/i)
  })
})
